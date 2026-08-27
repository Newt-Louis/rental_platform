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
    if (activeMallId) {
      where.mallAccess = { some: { mallId: activeMallId, isActive: true } };
    }

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

  async stats() {
    const [total, active, locked, admins] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null, isActive: true } }),
      this.prisma.user.count({ where: { deletedAt: null, isActive: false } }),
      this.prisma.user.count({ where: { deletedAt: null, isActive: true, role: Role.ADMIN } }),
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
    const current = await this.findOne(id);

    if (id === actorId && dto.isActive === false) {
      throw new ForbiddenException('You cannot lock your own account');
    }
    const removesAdmin = current.role === Role.ADMIN &&
      (dto.isActive === false || (dto.role !== undefined && dto.role !== Role.ADMIN));
    if (removesAdmin) await this.ensureAnotherActiveAdmin(id);

    const updated = await this.prisma.user.update({
      where: { id },
      data: dto,
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

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');
    const hashed = await bcrypt.hash(dto.password, 10);
    const created = await this.prisma.user.create({
      data: { ...dto, password: hashed, role: dto.role ?? Role.LEASING_EXECUTIVE },
      select: { id: true, email: true, fullName: true, role: true, department: true, isActive: true, tenantId: true },
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
