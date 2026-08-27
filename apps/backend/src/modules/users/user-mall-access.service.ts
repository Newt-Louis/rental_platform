import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class UserMallAccessService {
  constructor(private prisma: PrismaService) {}

  private static readonly GRANTABLE_ROLES = new Set<Role>([
    Role.MALL_DIRECTOR,
    Role.LEASING_MANAGER,
    Role.LEASING_EXECUTIVE,
    Role.FINANCE,
    Role.LEGAL,
    Role.OPERATION,
  ]);

  async listForUser(userId: string) {
    return this.prisma.userMallAccess.findMany({
      where: { userId, isActive: true },
      include: { mall: { select: { id: true, name: true, code: true } } },
    });
  }

  async listForMall(mallId: string) {
    return this.prisma.userMallAccess.findMany({
      where: { mallId, isActive: true },
      include: { user: { select: { id: true, fullName: true, email: true, role: true } } },
    });
  }

  async grantAccess(dto: { userId: string; mallId: string; role: Role }, grantedById: string) {
    const [user, mall] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: dto.userId } }),
      this.prisma.mall.findUnique({ where: { id: dto.mallId } }),
    ]);
    if (!user) throw new NotFoundException('User not found');
    if (!user.isActive) throw new BadRequestException('Cannot grant mall access to an inactive user');
    if (!mall) throw new NotFoundException('Mall not found');
    if (!UserMallAccessService.GRANTABLE_ROLES.has(dto.role)) {
      throw new BadRequestException('Role is not valid for mall access');
    }

    return this.prisma.userMallAccess.upsert({
      where: { userId_mallId: { userId: dto.userId, mallId: dto.mallId } },
      create: {
        userId: dto.userId,
        mallId: dto.mallId,
        role: dto.role,
        grantedById,
        isActive: true,
      },
      update: {
        role: dto.role,
        grantedById,
        isActive: true,
      },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        mall: { select: { id: true, name: true } },
      },
    });
  }

  async revokeAccess(userId: string, mallId: string) {
    const access = await this.prisma.userMallAccess.findUnique({
      where: { userId_mallId: { userId, mallId } },
    });
    if (!access) throw new NotFoundException('Access grant not found');

    return this.prisma.userMallAccess.update({
      where: { userId_mallId: { userId, mallId } },
      data: { isActive: false },
    });
  }

  async getUsersForMall(mallId: string) {
    const accesses = await this.prisma.userMallAccess.findMany({
      where: { mallId, isActive: true },
      include: { user: { select: { id: true, fullName: true, email: true, role: true, isActive: true } } },
    });
    return accesses.map((a) => ({ ...a.user, mallRole: a.role, grantedAt: a.createdAt }));
  }

  async getMallsForUser(userId: string) {
    const accesses = await this.prisma.userMallAccess.findMany({
      where: { userId, isActive: true },
      include: {
        mall: { select: { id: true, name: true, code: true, address: true, city: true } },
      },
    });
    return accesses.map((a) => ({ ...a.mall, role: a.role }));
  }
}
