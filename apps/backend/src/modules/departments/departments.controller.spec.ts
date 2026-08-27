import { ForbiddenException } from "@nestjs/common";
import { Role } from "@prisma/client";
import { ROLES_KEY } from "../../common/decorators/roles.decorator";
import { DepartmentsController } from "./departments.controller";

describe("DepartmentsController authorization", () => {
  const departments: any = {
    resolveMallId: jest.fn(),
    findMalls: jest.fn(),
    findAll: jest.fn(),
    findOptions: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const mallAccess: any = {
    assertMallAccess: jest.fn(),
    getAccessibleMallIds: jest.fn(),
  };
  const controller = new DepartmentsController(departments, mallAccess);

  beforeEach(() => {
    jest.clearAllMocks();
    mallAccess.assertMallAccess.mockReset();
  });

  it("declares exactly ADMIN, CEO and MALL_DIRECTOR at the controller boundary", () => {
    expect(Reflect.getMetadata(ROLES_KEY, DepartmentsController)).toEqual([
      Role.ADMIN,
      Role.CEO,
      Role.MALL_DIRECTOR,
    ]);
  });

  it("checks Mall access before listing Departments", async () => {
    departments.findAll.mockResolvedValue({ data: [] });
    const user = { id: "director", role: Role.MALL_DIRECTOR };
    const query = { mallId: "mall-1", page: 1, limit: 20 };

    await controller.findAll(query, user);

    expect(mallAccess.assertMallAccess).toHaveBeenCalledWith(
      user.id,
      user.role,
      "mall-1",
    );
    expect(departments.findAll).toHaveBeenCalledWith(query);
  });

  it("lists only the Department operator accessible Malls", async () => {
    mallAccess.getAccessibleMallIds.mockResolvedValue(["mall-1"]);
    departments.findMalls.mockResolvedValue([]);
    const user = { id: "ceo", role: Role.CEO };

    await controller.findMalls(user);

    expect(mallAccess.getAccessibleMallIds).toHaveBeenCalledWith(
      user.id,
      user.role,
    );
    expect(departments.findMalls).toHaveBeenCalledWith(["mall-1"]);
  });

  it("checks Mall access before returning the complete options list", async () => {
    departments.findOptions.mockResolvedValue([]);
    const user = { id: "ceo", role: Role.CEO };

    await controller.findOptions({ mallId: "mall-1" }, user);

    expect(mallAccess.assertMallAccess).toHaveBeenCalledWith(
      user.id,
      user.role,
      "mall-1",
    );
    expect(departments.findOptions).toHaveBeenCalledWith("mall-1");
  });

  it("does not call the service when Mall access is denied", async () => {
    mallAccess.assertMallAccess.mockRejectedValue(new ForbiddenException());

    await expect(
      controller.create(
        { mallId: "mall-2", name: "IT" },
        { id: "director", role: Role.MALL_DIRECTOR },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(departments.create).not.toHaveBeenCalled();
  });

  it("authorizes ID-based mutations against the Department stored Mall", async () => {
    departments.resolveMallId.mockResolvedValue("mall-stored");
    departments.update.mockResolvedValue({ id: "department" });
    const user = { id: "ceo", role: Role.CEO };

    await controller.update("department", { name: "Frontend" }, user);

    expect(mallAccess.assertMallAccess).toHaveBeenCalledWith(
      user.id,
      user.role,
      "mall-stored",
    );
    expect(departments.update).toHaveBeenCalledWith("department", {
      name: "Frontend",
    });
  });
});
