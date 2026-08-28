import { BadRequestException, ConflictException } from "@nestjs/common";
import { DepartmentsService } from "./departments.service";

describe("DepartmentsService", () => {
  const tx: any = {
    department: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    user: { updateMany: jest.fn() },
  };
  const prisma: any = {
    mall: { findMany: jest.fn() },
    department: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((callback: any) => callback(tx)),
  };
  const service = new DepartmentsService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((callback: any) => callback(tx));
  });

  it("returns only active Malls from the supplied access scope", async () => {
    prisma.mall.findMany.mockResolvedValue([]);

    await service.findMalls(["mall-1"]);

    expect(prisma.mall.findMany).toHaveBeenCalledWith({
      where: { isActive: true, id: { in: ["mall-1"] } },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    });
  });

  it("filters the list by the requested Mall and department name", async () => {
    prisma.department.findMany.mockResolvedValue([]);
    prisma.department.count.mockResolvedValue(0);

    await service.findAll({
      mallId: "mall-1",
      search: "  IT  ",
      page: 2,
      limit: 10,
    });

    expect(prisma.department.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          mallId: "mall-1",
          name: { contains: "IT", mode: "insensitive" },
        },
        skip: 10,
        take: 10,
      }),
    );
  });

  it("returns every Department option from only the requested Mall", async () => {
    prisma.department.findMany.mockResolvedValue([]);

    await service.findOptions("mall-1");

    expect(prisma.department.findMany).toHaveBeenCalledWith({
      where: { mallId: "mall-1" },
      select: { id: true, mallId: true, name: true, parentId: true },
      orderBy: [{ parentId: "asc" }, { name: "asc" }],
    });
  });

  it("rejects a parent that belongs to another Mall", async () => {
    prisma.department.findUnique.mockResolvedValue({
      mallId: "mall-2",
      parentId: null,
    });

    await expect(
      service.create({
        mallId: "mall-1",
        name: "Frontend",
        parentId: "other-mall-department",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.department.create).not.toHaveBeenCalled();
  });

  it("rejects moving a Department below one of its descendants", async () => {
    prisma.department.findUnique
      .mockResolvedValueOnce({ id: "department", mallId: "mall-1" })
      .mockResolvedValueOnce({ mallId: "mall-1", parentId: "department" });

    await expect(
      service.update("department", { parentId: "child" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.department.update).not.toHaveBeenCalled();
  });

  it("rejects deleting a parent and leaves User assignments unchanged", async () => {
    tx.department.findUnique.mockResolvedValue({
      id: "parent",
      children: [{ id: "child" }],
    });

    await expect(service.remove("parent")).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.user.updateMany).not.toHaveBeenCalled();
    expect(tx.department.delete).not.toHaveBeenCalled();
  });

  it("clears matching User values and hard-deletes a leaf in one transaction", async () => {
    tx.department.findUnique.mockResolvedValue({ id: "leaf", children: [] });
    tx.user.updateMany.mockResolvedValue({ count: 3 });
    tx.department.delete.mockResolvedValue({ id: "leaf" });

    await expect(service.remove("leaf")).resolves.toEqual({
      deleted: true,
      clearedUsers: 3,
    });
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { department: "leaf" },
      data: { department: null },
    });
    expect(tx.department.delete).toHaveBeenCalledWith({
      where: { id: "leaf" },
    });
  });
});
