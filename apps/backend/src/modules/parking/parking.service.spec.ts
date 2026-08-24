import { BadRequestException } from "@nestjs/common";
import { ParkingService } from "./parking.service";

describe("ParkingService safeguards", () => {
  function setup() {
    const tx: any = {
      parkingMonthlyStatement: { findUnique: jest.fn(), update: jest.fn() },
      parkingDebtPayment: { create: jest.fn() },
    };
    const prisma: any = {
      parkingCustomerContract: { findUnique: jest.fn(), update: jest.fn() },
      parkingMonthlyStatement: { findUnique: jest.fn(), update: jest.fn() },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const storage: any = { saveFile: jest.fn() };
    const schedulerLock: any = { runExclusive: jest.fn((_name, _ttl, task) => task().then((value: unknown) => ({ executed: true, value }))) };
    return { service: new ParkingService(prisma, storage, schedulerLock), prisma, storage, tx, schedulerLock };
  }

  it("runs the daily statement job under the distributed scheduler lock", async () => {
    const { service, prisma, schedulerLock } = setup();
    prisma.parkingCustomerContract.updateMany = jest.fn().mockResolvedValue({ count: 0 });
    prisma.parkingCustomerContract.findMany = jest.fn().mockResolvedValue([]);

    await service.generateDueStatements();

    expect(schedulerLock.runExclusive).toHaveBeenCalledWith("parking-contract-billing", 14_400_000, expect.any(Function));
    expect(prisma.parkingCustomerContract.updateMany).toHaveBeenCalledTimes(1);
  });

  it("does not run the statement job body when another instance already holds the lock", async () => {
    const { service, prisma, schedulerLock } = setup();
    schedulerLock.runExclusive = jest.fn().mockResolvedValue({ executed: false, reason: "locked" });
    prisma.parkingCustomerContract.updateMany = jest.fn();

    await service.generateDueStatements();

    expect(prisma.parkingCustomerContract.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an invalid contract status transition", async () => {
    const { service, prisma } = setup();
    prisma.parkingCustomerContract.findUnique.mockResolvedValue({ status: "DRAFT" });

    await expect(service.updateStatus("contract-1", "EXPIRED")).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.parkingCustomerContract.update).not.toHaveBeenCalled();
  });

  it("allows the defined DRAFT to ACTIVE transition", async () => {
    const { service, prisma } = setup();
    prisma.parkingCustomerContract.findUnique.mockResolvedValue({ status: "DRAFT" });
    prisma.parkingCustomerContract.update.mockResolvedValue({ id: "contract-1", status: "ACTIVE" });

    await expect(service.updateStatus("contract-1", "ACTIVE")).resolves.toEqual({ id: "contract-1", status: "ACTIVE" });
  });

  it("blocks direct Parking payment after the statement is transferred to Billing", async () => {
    const { service, tx } = setup();
    tx.parkingMonthlyStatement.findUnique.mockResolvedValue({
      id: "statement-1", totalAmount: 1_000_000, paidAmount: 0,
      status: "UNPAID", reconciliationStatus: "TRANSFERRED_TO_BILLING",
    });

    await expect(service.addPayment("statement-1", { amount: 500_000 }, "user-1")).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.parkingDebtPayment.create).not.toHaveBeenCalled();
  });

  it("rejects a payment larger than the remaining receivable", async () => {
    const { service, tx } = setup();
    tx.parkingMonthlyStatement.findUnique.mockResolvedValue({
      id: "statement-1", totalAmount: 1_000_000, paidAmount: 800_000,
      status: "PARTIAL", reconciliationStatus: "MATCHED",
    });

    await expect(service.addPayment("statement-1", { amount: 300_000 }, "user-1")).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.parkingDebtPayment.create).not.toHaveBeenCalled();
  });

  it("previews a fixed-quota contract with base fee and excess fee", async () => {
    const { service, prisma } = setup();
    prisma.parkingCustomerContract.findUnique.mockResolvedValue({
      id: "contract-1", status: "ACTIVE", contractType: "FIXED_QUOTA",
      startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), paymentTermDays: 15,
      rates: [{ vehicleType: "CAR", registeredQuantity: 10, unitPrice: 100, excessUnitPrice: 150, effectiveFrom: new Date("2026-01-01"), effectiveTo: null }],
    });
    prisma.parkingMonthlyStatement.findUnique.mockResolvedValue(null);

    const result = await service.previewStatement("contract-1", "2026-08", { CAR: 12 });

    expect(result.subtotal).toBe(1300);
    expect(result.lines[0]).toMatchObject({ baseAmount: 1000, excessQuantity: 2, excessAmount: 300 });
  });

  it("previews a principle contract entirely from actual vehicle quantity", async () => {
    const { service, prisma } = setup();
    prisma.parkingCustomerContract.findUnique.mockResolvedValue({
      id: "contract-2", status: "ACTIVE", contractType: "PRINCIPLE_ACTUAL",
      startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), paymentTermDays: 15,
      rates: [{ vehicleType: "MOTORBIKE", registeredQuantity: 0, unitPrice: 80, excessUnitPrice: 0, effectiveFrom: new Date("2026-01-01"), effectiveTo: null }],
    });
    prisma.parkingMonthlyStatement.findUnique.mockResolvedValue(null);

    const result = await service.previewStatement("contract-2", "2026-08", { MOTORBIKE: 25 }, -100);

    expect(result.subtotal).toBe(2000);
    expect(result.totalAmount).toBe(1900);
    expect(result.lines[0]).toMatchObject({ baseAmount: 2000, excessQuantity: 0, excessAmount: 0 });
  });
});
