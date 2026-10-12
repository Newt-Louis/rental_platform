import { BadRequestException, NotFoundException } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import { ServiceContractsService } from "./service-contracts.service";

describe("ServiceContractsService data boundaries", () => {
  const prisma = {
    serviceContract: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    serviceContractPayment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    serviceContractChecklistItem: { findFirst: jest.fn(), update: jest.fn() },
    serviceContractMilestone: { findFirst: jest.fn(), update: jest.fn() },
    serviceContractDocument: { aggregate: jest.fn(), create: jest.fn() },
    serviceContractEvent: { create: jest.fn() },
    mall: { findMany: jest.fn() },
    $transaction: jest.fn(),
  } as any;
  const storage = { saveFile: jest.fn(), deleteFile: jest.fn() } as any;
  let service: ServiceContractsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ServiceContractsService(prisma, storage);
  });

  it("rejects updating a checklist item that belongs to another contract", async () => {
    prisma.serviceContractChecklistItem.findFirst.mockResolvedValue(null);

    await expect(
      service.updateChecklist(
        "contract-a",
        "item-b",
        { isCompleted: true },
        "user-1",
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.serviceContractChecklistItem.update).not.toHaveBeenCalled();
    expect(prisma.serviceContractChecklistItem.findFirst).toHaveBeenCalledWith({
      where: { id: "item-b", contractId: "contract-a" },
      select: { id: true },
    });
  });

  it("rejects updating a milestone that belongs to another contract", async () => {
    prisma.serviceContractMilestone.findFirst.mockResolvedValue(null);

    await expect(
      service.updateMilestone(
        "contract-a",
        "item-b",
        { status: "DONE" },
        "user-1",
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.serviceContractMilestone.update).not.toHaveBeenCalled();
  });

  it("rejects a payment document linked to a different contract", async () => {
    prisma.serviceContract.findFirst.mockResolvedValue({
      id: "contract-a",
      documents: [],
      payments: [],
    });
    prisma.serviceContractPayment.findFirst.mockResolvedValue(null);

    await expect(
      service.uploadDocument(
        "contract-a",
        { mimetype: "application/pdf", size: 10 } as any,
        "INVOICE",
        "user-1",
        "payment-b",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.saveFile).not.toHaveBeenCalled();
  });

  it("does not delete a payment already transferred to Billing", async () => {
    prisma.serviceContractPayment.findFirst.mockResolvedValue({
      id: "payment-1",
      invoiceId: "invoice-1",
    });

    await expect(
      service.deletePayment("contract-1", "payment-1"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.serviceContractPayment.delete).not.toHaveBeenCalled();
  });

  it("only renews expiring or expired contracts", async () => {
    prisma.serviceContract.findFirst.mockResolvedValue({
      id: "contract-1",
      status: "ACTIVE",
    });

    await expect(
      service.renew(
        "contract-1",
        {
          contractNumber: "PL-RENEW-001",
          startDate: "2027-01-01",
          endDate: "2027-12-31",
        },
        "user-1",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("requires the legal contract number instead of generating an internal number", async () => {
    await expect(
      service.create(
        {
          contractNumber: "   ",
          title: "Hợp đồng bảo trì",
          mallId: "mall-1",
          counterpartyName: "Đối tác",
          serviceCategory: "MAINTENANCE",
          valueBasis: "ANNUAL",
        } as any,
        "user-1",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects creating a contract without both effective dates at the service boundary", async () => {
    await expect(
      service.create(
        {
          contractNumber: "SC-2026-001",
          title: "Hợp đồng bảo trì",
          mallId: "mall-1",
          counterpartyName: "Đối tác",
          serviceCategory: "MAINTENANCE",
          valueBasis: "ANNUAL",
        } as any,
        "user-1",
      ),
    ).rejects.toThrow("Ngày bắt đầu và ngày kết thúc là bắt buộc");
  });

  it("derives totalValue from initialValue and VAT instead of trusting a client total", async () => {
    const tx = {
      serviceContract: {
        create: jest
          .fn()
          .mockResolvedValue({ id: "contract-1", mallId: "mall-1" }),
      },
    };
    prisma.serviceContract.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback(tx),
    );

    await service.create(
      {
        contractNumber: "SC-2026-VAT-001",
        title: "Hợp đồng bảo trì",
        mallId: "mall-1",
        counterpartyName: "Đối tác",
        serviceCategory: "MAINTENANCE",
        valueBasis: "ANNUAL",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        initialValue: 100_000_000,
        VAT: 20.125,
        totalValue: 1,
      } as any,
      "user-1",
    );

    expect(tx.serviceContract.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          initialValue: 100_000_000,
          VAT: 20.125,
          totalValue: 120_125_000,
        }),
      }),
    );
  });

  it("rejects an update that attempts to change totalValue without its inputs", async () => {
    prisma.serviceContract.findFirst.mockResolvedValue({
      id: "contract-1",
      status: "DRAFT",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      billingParty: null,
    });

    await expect(
      service.update("contract-1", { totalValue: 120_000_000 }, "user-1"),
    ).rejects.toThrow(
      "Giá trị hợp đồng phải được tính từ giá trị ban đầu và VAT",
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("recalculates totalValue when both value inputs are updated", async () => {
    prisma.serviceContract.findFirst.mockResolvedValue({
      id: "contract-1",
      status: "DRAFT",
      mallId: "mall-1",
      createdById: "creator-1",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      billingParty: null,
      shares: [],
    });
    const tx = {
      serviceContract: {
        update: jest.fn().mockResolvedValue({
          initialValue: 100_000_000,
          VAT: 12.5,
          totalValue: 112_500_000,
        }),
      },
    };
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback(tx),
    );

    await service.update(
      "contract-1",
      { initialValue: 100_000_000, VAT: 12.5, totalValue: 1 },
      "user-1",
    );

    expect(tx.serviceContract.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          initialValue: 100_000_000,
          VAT: 12.5,
          totalValue: 112_500_000,
        }),
      }),
    );
  });

  it("does not let an edit leave a legacy contract without an effective period", async () => {
    prisma.serviceContract.findFirst.mockResolvedValue({
      id: "contract-1",
      status: "DRAFT",
      startDate: null,
      endDate: null,
      billingParty: null,
    });

    await expect(
      service.update("contract-1", { notes: "Cập nhật" }, "user-1"),
    ).rejects.toThrow("Ngày bắt đầu và ngày kết thúc là bắt buộc");
  });

  it("rejects renewal without an explicit start date", async () => {
    prisma.serviceContract.findFirst.mockResolvedValue({
      id: "contract-1",
      status: "EXPIRED",
      endDate: new Date("2026-12-31"),
    });

    await expect(
      service.renew(
        "contract-1",
        {
          contractNumber: "SC-2027-001",
          endDate: "2027-12-31",
        } as any,
        "user-1",
      ),
    ).rejects.toThrow("hợp đồng gia hạn là bắt buộc");
  });

  it("does not allow marking a contract renewed without creating its renewal", async () => {
    prisma.serviceContract.findFirst.mockResolvedValue({
      id: "contract-1",
      status: "EXPIRED",
    });

    await expect(
      service.updateStatus("contract-1", "RENEWED", undefined, "user-1"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(["EXPIRING", "EXPIRED"])(
    "rejects manual transition to automatic status %s",
    async (status) => {
      prisma.serviceContract.findFirst.mockResolvedValue({
        id: "contract-1",
        status: "ACTIVE",
      });

      await expect(
        service.updateStatus("contract-1", status as any, undefined, "user-1"),
      ).rejects.toThrow("được hệ thống tự động cập nhật");
    },
  );

  it("rejects zero-value payment schedules", async () => {
    prisma.serviceContract.findFirst.mockResolvedValue({
      id: "contract-1",
      defaultVatRate: 10,
    });

    await expect(
      service.createPayment("contract-1", {
        milestone: "Đợt 1",
        dueDate: "2027-01-01",
        amount: 0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("derives every recurring payment from the contract's initial value and VAT", async () => {
    prisma.serviceContract.findFirst.mockResolvedValue({
      id: "contract-1",
      initialValue: 1_000_000,
      VAT: 10,
      currency: "VND",
      invoiceLeadDays: 0,
    });
    prisma.serviceContractPayment.findMany.mockResolvedValue([]);

    await service.recurringPayments("contract-1", {
      startDate: "2027-01-01",
      frequency: "MONTHLY",
      count: 2,
      milestonePrefix: "Kỳ thanh toán",
    });

    const rows = prisma.serviceContractPayment.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        subtotal: 500_000,
        vatRate: 10,
        vatAmount: 50_000,
        amountBreakdown: [550_000],
        amount: 550_000,
        totalAmount: 550_000,
        currency: "VND",
      }),
    );
  });

  it("initializes a legacy scalar payment's breakdown and appends a signed reduction", async () => {
    prisma.serviceContractPayment.findFirst.mockResolvedValue({
      id: "payment-1",
      contractId: "contract-1",
      amount: 550_000,
      amountBreakdown: null,
      invoiceId: null,
    });
    prisma.serviceContractPayment.update.mockResolvedValue({ id: "payment-1" });

    await service.updatePayment("contract-1", "payment-1", {
      adjustmentAmount: 50_000,
      adjustmentDirection: "DECREASE",
    });

    expect(prisma.serviceContractPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amountBreakdown: [550_000, -50_000],
        }),
      }),
    );
  });

  it("rejects unsupported document types before storing the file", async () => {
    await expect(
      service.uploadDocument(
        "contract-1",
        { mimetype: "application/pdf", size: 10 } as any,
        "UNTRUSTED_TYPE",
        "user-1",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.saveFile).not.toHaveBeenCalled();
  });

  it("only includes effective contracts in the fixed seven-day expiry filter", async () => {
    prisma.serviceContract.findMany.mockResolvedValue([]);
    prisma.serviceContract.count.mockResolvedValue(0);

    await service.findAll({ alert: "EXPIRING", alertDays: 30 }, ["mall-1"]);

    expect(prisma.serviceContract.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          mallId: { in: ["mall-1"] },
          status: { in: ["ACTIVE", "EXPIRING"] },
          endDate: { gte: expect.any(Date), lte: expect.any(Date) },
        }),
      }),
    );
    const where = prisma.serviceContract.findMany.mock.calls[0][0].where;
    expect(where.endDate.lte.getTime() - where.endDate.gte.getTime()).toBe(
      7 * 86_400_000,
    );
  });

  it("counts only effective contracts in the seven-day expiry alert without changing payment alert days", async () => {
    prisma.serviceContract.count.mockResolvedValue(1);
    prisma.serviceContractPayment.count.mockResolvedValue(0);

    const result = await service.alerts(["mall-1"], 30);

    expect(result.expiring).toBe(1);
    expect(result.expiryDays).toBe(7);
    expect(prisma.serviceContract.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        status: { in: ["ACTIVE", "EXPIRING"] },
        endDate: { gte: expect.any(Date), lte: expect.any(Date) },
      }),
    });
    expect(prisma.serviceContractPayment.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        contract: expect.objectContaining({
          status: { in: ["ACTIVE", "EXPIRING"] },
        }),
      }),
    });
  });

  it("exports filtered contracts and their payment schedule to an Excel workbook", async () => {
    prisma.serviceContract.findMany.mockResolvedValue([
      {
        id: "contract-1",
        contractNumber: "PL-2026-001",
        title: "Hợp đồng bảo trì",
        counterpartyName: "Đối tác A",
        counterpartyTax: "0312345678",
        type: "SERVICE",
        serviceCategory: "MAINTENANCE",
        productName: "Bảo trì hệ thống",
        status: "ACTIVE",
        paymentDirection: "PAYABLE",
        signedDate: new Date("2026-01-01"),
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
        totalValue: 120000000,
        valueBasis: "ANNUAL",
        currency: "VND",
        notes: null,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-08-17"),
        mallId: "mall-1",
        _count: { documents: 1 },
        payments: [
          {
            milestone: "Đợt 1",
            dueDate: new Date("2026-09-01"),
            subtotal: 10000000,
            vatRate: 10,
            vatAmount: 1000000,
            totalAmount: 11000000,
            amount: 11000000,
            paidAmount: null,
            currency: "VND",
            status: "PENDING",
            invoiceNumber: null,
            notes: null,
          },
        ],
      },
    ]);
    prisma.mall.findMany.mockResolvedValue([
      { id: "mall-1", code: "SALA", name: "Thiso Mall Sala" },
    ]);

    const buffer = await service.exportExcel(
      { serviceCategory: "MAINTENANCE" },
      ["mall-1"],
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Hợp đồng",
      "Lịch thanh toán",
    ]);
    expect(workbook.getWorksheet("Hợp đồng")?.getCell("C2").value).toBe(
      "PL-2026-001",
    );
    expect(workbook.getWorksheet("Lịch thanh toán")?.getCell("F2").value).toBe(
      "Đợt 1",
    );
    expect(prisma.serviceContract.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          mallId: { in: ["mall-1"] },
          serviceCategory: "MAINTENANCE",
        }),
      }),
    );
  });
});
