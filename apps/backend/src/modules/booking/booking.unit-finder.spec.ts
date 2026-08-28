import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { BookingStatus, UnitStatus } from "@prisma/client";
import { BookingService } from "./booking.service";

describe("BookingService.findUnits", () => {
  const prisma: any = {
    unit: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
    unitBooking: { groupBy: jest.fn() },
    lead: { findUnique: jest.fn() },
  };
  const categories: any = { validateProposedPrice: jest.fn() };
  const unitStatus: any = {
    isLockedForBooking: jest.fn(
      (status: UnitStatus) =>
        !([UnitStatus.VACANT, UnitStatus.OFFERING, UnitStatus.BOOKING] as UnitStatus[]).includes(
          status,
        ),
    ),
  };
  let service: BookingService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.unit.findMany.mockResolvedValue([]);
    prisma.unit.count.mockResolvedValue(0);
    prisma.unitBooking.groupBy.mockResolvedValue([]);
    service = new BookingService(prisma, categories, unitStatus);
  });

  it("applies accessible Mall IDs at the Unit query boundary", async () => {
    await service.findUnits({ mallIds: ["mall-1"], page: 1, limit: 20 });

    expect(prisma.unit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          mallId: { in: ["mall-1"] },
          isActive: true,
          leaseTermType: "LONG",
        }),
      }),
    );
  });

  it("combines unitId substitution protection with Mall scoping", async () => {
    await service.findUnits({
      unitId: "unit-other-mall",
      mallIds: ["mall-1"],
      page: 1,
      limit: 20,
    });

    expect(prisma.unit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "unit-other-mall",
          mallId: { in: ["mall-1"] },
        }),
      }),
    );
  });

  it("applies search, filters, and backend pagination with stable ordering", async () => {
    await service.findUnits({
      mallId: "mall-1",
      floorId: "floor-1",
      zoneId: "zone-1",
      status: UnitStatus.BOOKING,
      search: " A-01 ",
      minArea: 50,
      maxArea: 150,
      page: 3,
      limit: 10,
    });

    expect(prisma.unit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 10,
        orderBy: [{ code: "asc" }, { id: "asc" }],
        where: expect.objectContaining({
          mallId: "mall-1",
          floorId: "floor-1",
          zoneId: "zone-1",
          status: UnitStatus.BOOKING,
          areaNLA: { gte: 50, lte: 150 },
          OR: [
            { code: { contains: "A-01", mode: "insensitive" } },
            { name: { contains: "A-01", mode: "insensitive" } },
          ],
        }),
      }),
    );
  });

  it("passes search metacharacters only as a parameterized contains value", async () => {
    const input = "%_' OR 1=1 --";
    await service.findUnits({ search: input, page: 1, limit: 20 });
    expect(prisma.unit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { code: { contains: input, mode: "insensitive" } },
            { name: { contains: input, mode: "insensitive" } },
          ],
        }),
      }),
    );
  });

  it("returns immediate, queue, and blocked eligibility from UnitStatusService", async () => {
    prisma.unit.findMany.mockResolvedValue([
      unit("vacant", UnitStatus.VACANT),
      unit("offering", UnitStatus.OFFERING),
      unit("queued", UnitStatus.BOOKING),
      unit("locked", UnitStatus.CONTRACTED),
    ]);
    prisma.unit.count.mockResolvedValue(4);
    prisma.unitBooking.groupBy.mockResolvedValue([
      { unitId: "queued", _count: { _all: 2 } },
    ]);

    const result = await service.findUnits({ page: 1, limit: 20 });

    expect(result.data[0].currentEligibility).toEqual({
      selectable: true,
      mode: "IMMEDIATE",
      reasonCode: null,
      queueCount: 0,
    });
    // OFFERING (Chào thuê): actively marketed but no hold on it yet — must be just as
    // immediately bookable as VACANT, not silently BLOCKED alongside real commitments.
    expect(result.data[1].currentEligibility).toEqual({
      selectable: true,
      mode: "IMMEDIATE",
      reasonCode: null,
      queueCount: 0,
    });
    expect(result.data[2].currentEligibility).toEqual({
      selectable: true,
      mode: "QUEUE",
      reasonCode: null,
      queueCount: 2,
    });
    expect(result.data[3].currentEligibility).toEqual({
      selectable: false,
      mode: "BLOCKED",
      reasonCode: "UNIT_STATUS_CONTRACTED",
      queueCount: 0,
    });
    expect(unitStatus.isLockedForBooking).toHaveBeenCalledWith(
      UnitStatus.CONTRACTED,
    );
    expect(prisma.unitBooking.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: [BookingStatus.ACTIVE, BookingStatus.PENDING] },
        }),
      }),
    );
  });

  it("rejects an inverted NLA range before querying", async () => {
    await expect(
      service.findUnits({ minArea: 200, maxArea: 100, page: 1, limit: 20 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.unit.findMany).not.toHaveBeenCalled();
  });

  it("does not run a queue aggregation for an empty page", async () => {
    await service.findUnits({ page: 4, limit: 20 });
    expect(prisma.unitBooking.groupBy).not.toHaveBeenCalled();
  });

  it("fails safely when a Lead has no Mall or belongs to another Mall", async () => {
    prisma.unit.findUnique.mockResolvedValue({
      id: "unit-1",
      mallId: "mall-1",
      status: UnitStatus.VACANT,
      isActive: true,
      leaseTermType: "LONG",
    });
    prisma.lead.findUnique.mockResolvedValue({
      id: "lead-2",
      mallId: "mall-2",
      leaseTermType: "LONG",
      isActive: true,
    });

    await expect(
      service.create({ unitId: "unit-1", leadId: "lead-2" }, "user-1"),
    ).rejects.toBeInstanceOf(ForbiddenException);

    prisma.lead.findUnique.mockResolvedValue({
      id: "lead-unassigned",
      mallId: null,
      leaseTermType: "LONG",
      isActive: true,
    });
    await expect(
      service.create({ unitId: "unit-1", leadId: "lead-unassigned" }, "user-1"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

function unit(id: string, status: UnitStatus) {
  return {
    id,
    code: id.toUpperCase(),
    name: null,
    mallId: "mall-1",
    floorId: null,
    zoneId: null,
    areaNLA: 100,
    areaGFA: 120,
    category: null,
    status,
    leaseTermType: "LONG",
    mall: { id: "mall-1", name: "Mall One", code: "M1" },
    floor: null,
    zone: null,
  };
}
