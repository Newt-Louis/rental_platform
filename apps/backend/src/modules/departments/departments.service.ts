import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  CreateDepartmentDto,
  ListDepartmentsDto,
  UpdateDepartmentDto,
} from "./dto/department.dto";

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findMalls(mallIds?: string[]) {
    return this.prisma.mall.findMany({
      where: {
        isActive: true,
        ...(mallIds ? { id: { in: mallIds } } : {}),
      },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    });
  }

  async resolveMallId(id: string): Promise<string> {
    const department = await this.prisma.department.findUnique({
      where: { id },
      select: { mallId: true },
    });
    if (!department) throw new NotFoundException("Department not found");
    return department.mallId;
  }

  async findAll(query: ListDepartmentsDto) {
    const { mallId, search, page = 1, limit = 20 } = query;
    const where: Prisma.DepartmentWhereInput = {
      mallId,
      ...(search?.trim()
        ? { name: { contains: search.trim(), mode: "insensitive" } }
        : {}),
    };

    const [departments, total] = await Promise.all([
      this.prisma.department.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          mall: { select: { id: true, name: true, code: true } },
          parent: { select: { id: true, name: true } },
          _count: { select: { children: true } },
        },
        orderBy: [{ parentId: "asc" }, { name: "asc" }],
      }),
      this.prisma.department.count({ where }),
    ]);

    return {
      data: departments,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOptions(mallId: string) {
    return this.prisma.department.findMany({
      where: { mallId },
      select: { id: true, mallId: true, name: true, parentId: true },
      orderBy: [{ parentId: "asc" }, { name: "asc" }],
    });
  }

  async findOne(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: {
        mall: { select: { id: true, name: true, code: true } },
        parent: { select: { id: true, name: true } },
        children: {
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        },
      },
    });
    if (!department) throw new NotFoundException("Department not found");
    return department;
  }

  async create(dto: CreateDepartmentDto) {
    if (dto.parentId) {
      await this.validateParent(dto.mallId, dto.parentId);
    }

    return this.prisma.department.create({
      data: {
        mallId: dto.mallId,
        name: dto.name,
        description: dto.description || null,
        parentId: dto.parentId || null,
      },
      include: {
        mall: { select: { id: true, name: true, code: true } },
        parent: { select: { id: true, name: true } },
        _count: { select: { children: true } },
      },
    });
  }

  async update(id: string, dto: UpdateDepartmentDto) {
    const current = await this.prisma.department.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("Department not found");

    if (dto.parentId) {
      await this.validateParent(current.mallId, dto.parentId, id);
    }

    return this.prisma.department.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description || null }
          : {}),
        ...(dto.parentId !== undefined
          ? { parentId: dto.parentId || null }
          : {}),
      },
      include: {
        mall: { select: { id: true, name: true, code: true } },
        parent: { select: { id: true, name: true } },
        _count: { select: { children: true } },
      },
    });
  }

  async remove(id: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const department = await tx.department.findUnique({
          where: { id },
          select: { id: true, children: { take: 1, select: { id: true } } },
        });
        if (!department) throw new NotFoundException("Department not found");
        if (department.children.length > 0) {
          throw new ConflictException({
            code: "DEPARTMENT_HAS_CHILDREN",
            message: "Department has child departments and cannot be deleted",
          });
        }

        const cleared = await tx.user.updateMany({
          where: { department: id },
          data: { department: null },
        });
        await tx.department.delete({ where: { id } });

        return { deleted: true, clearedUsers: cleared.count };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      ) {
        throw new ConflictException({
          code: "DEPARTMENT_HAS_CHILDREN",
          message: "Department has child departments and cannot be deleted",
        });
      }
      throw error;
    }
  }

  private async validateParent(
    mallId: string,
    parentId: string,
    departmentId?: string,
  ) {
    if (parentId === departmentId) {
      throw new BadRequestException({
        code: "DEPARTMENT_SELF_PARENT",
        message: "Department cannot be its own parent",
      });
    }

    const visited = new Set<string>();
    let currentId: string | null = parentId;
    while (currentId) {
      if (currentId === departmentId) {
        throw new BadRequestException({
          code: "DEPARTMENT_HIERARCHY_CYCLE",
          message:
            "Parent Department cannot be a descendant of this Department",
        });
      }
      if (visited.has(currentId)) {
        throw new BadRequestException({
          code: "DEPARTMENT_HIERARCHY_CYCLE",
          message: "Department hierarchy contains a cycle",
        });
      }
      visited.add(currentId);

      const current = await this.prisma.department.findUnique({
        where: { id: currentId },
        select: { mallId: true, parentId: true },
      });
      if (!current) throw new NotFoundException("Parent Department not found");
      if (current.mallId !== mallId) {
        throw new BadRequestException({
          code: "DEPARTMENT_PARENT_MALL_MISMATCH",
          message: "Parent Department must belong to the same Mall",
        });
      }
      currentId = current.parentId;
    }
  }
}
