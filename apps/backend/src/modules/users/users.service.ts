import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: ListUsersDto, activeMallId?: string | null) {
    const { page = 1, limit = 20, search, role, isActive } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      deletedAt: null,
    };

    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive === 'true';
    const mallScope = UsersService.mallScopeFilter(activeMallId);
    if (mallScope) where.AND = [mallScope];

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { department: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          phone: true,
          avatar: true,
          department: true,
          tenantId: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          mallAccess: {
            where: { isActive: true },
            select: { mall: { select: { id: true, name: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: await this.attachDepartmentInfo(users),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async stats(activeMallId?: string | null) {
    // Must use the same visibility rule as findAll, otherwise the summary tiles
    // claim more accounts than the table can ever show.
    const mallScope = UsersService.mallScopeFilter(activeMallId);
    const scoped = (extra: any = {}) => ({
      deletedAt: null,
      ...extra,
      ...(mallScope ? { AND: [mallScope] } : {}),
    });

    const [total, active, locked, admins] = await Promise.all([
      this.prisma.user.count({ where: scoped() }),
      this.prisma.user.count({ where: scoped({ isActive: true }) }),
      this.prisma.user.count({ where: scoped({ isActive: false }) }),
      this.prisma.user.count({ where: scoped({ isActive: true, role: Role.ADMIN }) }),
    ]);
    return { total, active, locked, admins };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id, deletedAt: null },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        phone: true,
        avatar: true,
        department: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) throw new NotFoundException(`User ${id} not found`);
    return this.attachOneDepartmentInfo(user);
  }

  async update(id: string, dto: UpdateUserDto, actorId?: string) {
    const current = await this.prisma.user.findUnique({
      where: { id, deletedAt: null },
      select: { id: true, role: true, isActive: true, department: true },
    });
    if (!current) throw new NotFoundException(`User ${id} not found`);

    if (id === actorId && dto.isActive === false) {
      throw new ForbiddenException('You cannot lock your own account');
    }
    const removesAdmin = current.role === Role.ADMIN &&
      (dto.isActive === false || (dto.role !== undefined && dto.role !== Role.ADMIN));
    if (removesAdmin) await this.ensureAnotherActiveAdmin(id);

    const role = dto.role ?? current.role;
    const data: any = {};
    if (dto.email !== undefined) data.email = UsersService.normalizeEmail(dto.email);
    if (dto.fullName !== undefined) data.fullName = dto.fullName.trim();
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.phone !== undefined) data.phone = UsersService.normalizeOptional(dto.phone);
    if (dto.department !== undefined) {
      data.department = await this.resolveDepartmentId(dto.department, current.department);
    }
    // A tenant link only means anything on a TENANT account: dropping the role
    // must drop the link too, rather than leaving a dangling association.
    if (dto.tenantId !== undefined || (dto.role !== undefined && dto.role !== Role.TENANT)) {
      data.tenantId = await this.resolveTenantId(role, dto.tenantId);
    }

    if (data.email) {
      const clash = await this.prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
      if (clash && clash.id !== id) {
        throw new ConflictException({ message: 'Email already registered', code: 'USER_EMAIL_TAKEN' });
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        phone: true,
        avatar: true,
        department: true,
        isActive: true,
        updatedAt: true,
        tenantId: true,
      },
    });
    return this.attachOneDepartmentInfo(updated);
  }

  async create(dto: CreateUserDto, actorId?: string) {
    const email = UsersService.normalizeEmail(dto.email);
    const role = dto.role ?? Role.LEASING_EXECUTIVE;

    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      throw new ConflictException({ message: 'Email already registered', code: 'USER_EMAIL_TAKEN' });
    }

    // Every optional reference is validated up-front so the caller gets an
    // actionable message instead of a raw foreign-key violation from Prisma.
    const tenantId = await this.resolveTenantId(role, dto.tenantId);
    const department = await this.resolveDepartmentId(dto.department, null);
    const mallGrants = await this.resolveMallGrants(role, dto.mallIds, dto.mallRole);

    const hashed = await bcrypt.hash(dto.password, 10);

    // Account + Mall grants are one unit of work: a half-created account whose
    // Mall scope silently went missing is worse than a failed create.
    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          password: hashed,
          fullName: dto.fullName.trim(),
          role,
          phone: UsersService.normalizeOptional(dto.phone),
          department,
          tenantId,
        },
        select: { id: true, email: true, fullName: true, role: true, department: true, isActive: true, tenantId: true },
      });

      if (mallGrants) {
        await tx.userMallAccess.createMany({
          data: mallGrants.mallIds.map((mallId) => ({
            userId: user.id,
            mallId,
            role: mallGrants.role,
            grantedById: actorId ?? null,
            isActive: true,
          })),
        });
      }

      return user;
    });

    return this.attachOneDepartmentInfo(created);
  }

  async resetPassword(id: string, newPassword: string) {
    await this.findOne(id);
    const hashed = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id }, data: { password: hashed } });
    return { message: 'Password reset successfully' };
  }

  async remove(id: string, actorId?: string) {
    const current = await this.findOne(id);
    if (id === actorId) throw new ForbiddenException('You cannot delete your own account');
    if (current.role === Role.ADMIN && current.isActive) await this.ensureAnotherActiveAdmin(id);

    await this.prisma.user.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
    });

    return { message: 'User deleted successfully' };
  }

  /**
   * Roles whose data visibility is driven by UserMallAccess grants. Every other
   * role is either portfolio-wide (ADMIN/CEO) or scoped by its own Tenant
   * record, so a Mall grant on them would be meaningless.
   */
  private static readonly MALL_SCOPED_ROLES = new Set<Role>([
    Role.MALL_DIRECTOR,
    Role.LEASING_MANAGER,
    Role.LEASING_EXECUTIVE,
    Role.FINANCE,
    Role.LEGAL,
    Role.OPERATION,
  ]);

  private static normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  /** Empty/whitespace form values mean "not set", never an empty foreign key. */
  private static normalizeOptional(value?: string | null): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  /**
   * Users with no active grant are portfolio-wide by design (they see every
   * Mall), so filtering the list by the viewer's active Mall must not hide them
   * -- doing so made freshly created, not-yet-granted accounts look as if the
   * create had failed.
   */
  private static mallScopeFilter(activeMallId?: string | null) {
    if (!activeMallId) return null;
    return {
      OR: [
        { mallAccess: { some: { mallId: activeMallId, isActive: true } } },
        { mallAccess: { none: { isActive: true } } },
      ],
    };
  }

  private async resolveTenantId(role: Role, tenantId?: string | null) {
    const value = UsersService.normalizeOptional(tenantId);
    if (!value) return null;

    if (role !== Role.TENANT) {
      throw new BadRequestException({
        message: 'A linked tenant can only be set on a TENANT account',
        code: 'USER_TENANT_ROLE_MISMATCH',
      });
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: value }, select: { id: true } });
    if (!tenant) {
      throw new BadRequestException({
        message: 'The selected tenant no longer exists',
        code: 'USER_TENANT_NOT_FOUND',
      });
    }
    return value;
  }

  /**
   * `User.department` stays a plain string (CR-114): new assignments hold a
   * Department id, historic free-text labels stay valid. An unchanged legacy
   * value is therefore accepted; anything new must resolve to a real Department.
   */
  private async resolveDepartmentId(department?: string | null, currentValue?: string | null) {
    const value = UsersService.normalizeOptional(department);
    if (!value) return null;
    if (value === currentValue) return value;

    const found = await this.prisma.department.findUnique({ where: { id: value }, select: { id: true } });
    if (!found) {
      throw new BadRequestException({
        message: 'The selected department no longer exists',
        code: 'USER_DEPARTMENT_NOT_FOUND',
      });
    }
    return value;
  }

  private async resolveMallGrants(role: Role, mallIds?: string[], mallRole?: Role) {
    const ids = [...new Set((mallIds ?? []).map((id) => id?.trim()).filter(Boolean) as string[])];
    if (ids.length === 0) return null;

    if (!UsersService.MALL_SCOPED_ROLES.has(role)) {
      throw new BadRequestException({
        message: 'Mall access scope does not apply to this role',
        code: 'USER_MALL_SCOPE_NOT_APPLICABLE',
      });
    }

    const grantRole = mallRole ?? role;
    if (!UsersService.MALL_SCOPED_ROLES.has(grantRole)) {
      throw new BadRequestException({
        message: 'The selected Mall role cannot be granted',
        code: 'USER_MALL_ROLE_NOT_GRANTABLE',
      });
    }

    const malls = await this.prisma.mall.findMany({ where: { id: { in: ids } }, select: { id: true } });
    if (malls.length !== ids.length) {
      throw new BadRequestException({
        message: 'One or more selected Malls no longer exist',
        code: 'USER_MALL_NOT_FOUND',
      });
    }

    return { mallIds: ids, role: grantRole };
  }

  private async ensureAnotherActiveAdmin(excludedId: string) {
    const count = await this.prisma.user.count({
      where: { id: { not: excludedId }, role: Role.ADMIN, isActive: true, deletedAt: null },
    });
    if (count === 0) throw new BadRequestException('At least one active administrator must remain');
  }

  private async attachDepartmentInfo<T extends { department?: string | null }>(users: T[]) {
    const ids = [...new Set(users.map((user) => user.department).filter(Boolean))] as string[];
    if (ids.length === 0) {
      return users.map((user) => ({ ...user, departmentInfo: null }));
    }

    const departments = await this.prisma.department.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        mallId: true,
        mall: { select: { id: true, name: true, code: true } },
      },
    });
    const byId = new Map(departments.map((department) => [department.id, department]));
    return users.map((user) => ({
      ...user,
      departmentInfo: user.department ? byId.get(user.department) ?? null : null,
    }));
  }

  private async attachOneDepartmentInfo<T extends { department?: string | null }>(user: T) {
    const [resolved] = await this.attachDepartmentInfo([user]);
    return resolved;
  }
}
