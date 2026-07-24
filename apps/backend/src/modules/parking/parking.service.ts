import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../../storage/storage.service";

const STATUSES = [
  "DRAFT",
  "ACTIVE",
  "SUSPENDED",
  "EXPIRED",
  "TERMINATED",
  "RENEWED",
];
@Injectable()
export class ParkingService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}
  async contractMallId(id: string) {
    const x = await this.prisma.parkingCustomerContract.findUnique({
      where: { id },
      select: { mallId: true },
    });
    if (!x) throw new NotFoundException("Không tìm thấy hợp đồng bãi xe");
    return x.mallId;
  }
  async statementMallId(id: string) {
    const x = await this.prisma.parkingMonthlyStatement.findUnique({
      where: { id },
      select: { contract: { select: { mallId: true } } },
    });
    if (!x) throw new NotFoundException("Không tìm thấy kỳ công nợ");
    return x.contract.mallId;
  }
  contracts(mallIds?: string[], q?: any) {
    const where: Prisma.ParkingCustomerContractWhereInput = {
      isActive: true,
      ...(q?.mallId
        ? { mallId: q.mallId }
        : mallIds
          ? { mallId: { in: mallIds } }
          : {}),
      ...(q?.status ? { status: q.status } : {}),
      ...(q?.search
        ? {
            OR: [
              { contractNumber: { contains: q.search, mode: "insensitive" } },
              { title: { contains: q.search, mode: "insensitive" } },
              {
                tenant: {
                  brandName: { contains: q.search, mode: "insensitive" },
                },
              },
            ],
          }
        : {}),
    };
    return this.prisma.parkingCustomerContract.findMany({
      where,
      include: {
        mall: { select: { name: true } },
        tenant: { select: { id: true, brandName: true, companyName: true } },
        rates: {
          where: { effectiveTo: null },
          orderBy: { vehicleType: "asc" },
        },
        statements: { orderBy: { period: "desc" }, take: 1 },
      },
      orderBy: [{ endDate: "asc" }, { updatedAt: "desc" }],
      take: 300,
    });
  }
  async contract(id: string) {
    const x = await this.prisma.parkingCustomerContract.findUnique({
      where: { id },
      include: {
        mall: true,
        tenant: true,
        rates: { orderBy: [{ vehicleType: "asc" }, { effectiveFrom: "desc" }] },
        adjustments: {
          include: { createdBy: { select: { fullName: true } } },
          orderBy: { effectiveDate: "desc" },
        },
        statements: {
          include: { lines: true, payments: { orderBy: { paidAt: "desc" } } },
          orderBy: { period: "desc" },
        },
        documents: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!x) throw new NotFoundException("Không tìm thấy hợp đồng bãi xe");
    return x;
  }
  async createContract(b: any, userId: string) {
    if (
      !b.mallId ||
      !b.tenantId ||
      !b.contractNumber?.trim() ||
      !b.title?.trim() ||
      !b.startDate ||
      !b.endDate
    )
      throw new BadRequestException(
        "Mall, khách thuê, số hợp đồng, tiêu đề và thời hạn là bắt buộc",
      );
    if (new Date(b.endDate) < new Date(b.startDate))
      throw new BadRequestException("Ngày kết thúc phải sau ngày bắt đầu");
    if (!Array.isArray(b.rates) || !b.rates.length)
      throw new BadRequestException(
        "Cần ít nhất một dòng biểu phí theo loại xe",
      );
    try {
      return await this.prisma.parkingCustomerContract.create({
        data: {
          contractNumber: b.contractNumber.trim(),
          mallId: b.mallId,
          tenantId: b.tenantId,
          title: b.title.trim(),
          status: b.status || "DRAFT",
          signedDate: b.signedDate ? new Date(b.signedDate) : undefined,
          startDate: new Date(b.startDate),
          endDate: new Date(b.endDate),
          billingDay: Math.min(28, Math.max(1, Number(b.billingDay) || 1)),
          paymentTermDays: Math.max(0, Number(b.paymentTermDays) || 15),
          depositAmount: Number(b.depositAmount) || 0,
          notes: b.notes,
          createdById: userId,
          rates: {
            create: b.rates.map((r: any) => ({
              vehicleType: r.vehicleType,
              registeredQuantity: Math.max(
                0,
                Number(r.registeredQuantity) || 0,
              ),
              unitPrice: Math.max(0, Number(r.unitPrice) || 0),
              excessUnitPrice: Math.max(
                0,
                Number(r.excessUnitPrice ?? r.unitPrice) || 0,
              ),
              effectiveFrom: new Date(b.startDate),
            })),
          },
        },
        include: { rates: true },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      )
        throw new ConflictException("Số hợp đồng bãi xe đã tồn tại");
      throw e;
    }
  }
  async updateContract(id: string, b: any) {
    const data: any = {};
    for (const k of [
      "title",
      "signedDate",
      "startDate",
      "endDate",
      "billingDay",
      "paymentTermDays",
      "depositAmount",
      "notes",
    ])
      if (k in b)
        data[k] =
          ["signedDate", "startDate", "endDate"].includes(k) && b[k]
            ? new Date(b[k])
            : b[k];
    return this.prisma.parkingCustomerContract.update({ where: { id }, data });
  }
  updateStatus(id: string, status: string) {
    if (!STATUSES.includes(status))
      throw new BadRequestException("Trạng thái hợp đồng không hợp lệ");
    return this.prisma.parkingCustomerContract.update({
      where: { id },
      data: { status },
    });
  }
  async adjustQuantity(contractId: string, b: any, userId: string) {
    const contract = await this.contract(contractId),
      current = contract.rates.find(
        (r) => r.vehicleType === b.vehicleType && !r.effectiveTo,
      );
    if (!current)
      throw new BadRequestException("Không tìm thấy biểu phí loại xe");
    const effectiveDate = new Date(b.effectiveDate || Date.now()),
      newQuantity = Math.max(0, Number(b.newQuantity) || 0);
    return this.prisma.$transaction(async (tx) => {
      await tx.parkingContractRate.update({
        where: { id: current.id },
        data: { effectiveTo: effectiveDate },
      });
      const rate = await tx.parkingContractRate.create({
        data: {
          contractId,
          vehicleType: current.vehicleType,
          registeredQuantity: newQuantity,
          unitPrice: Number(b.unitPrice ?? current.unitPrice),
          excessUnitPrice: Number(b.excessUnitPrice ?? current.excessUnitPrice),
          effectiveFrom: effectiveDate,
        },
      });
      await tx.parkingVehicleAdjustment.create({
        data: {
          contractId,
          vehicleType: current.vehicleType,
          previousQuantity: current.registeredQuantity,
          newQuantity,
          effectiveDate,
          reason: b.reason || "Điều chỉnh số lượng đăng ký",
          createdById: userId,
        },
      });
      return rate;
    });
  }
  private periodDates(period: string) {
    if (!/^\d{4}-\d{2}$/.test(period))
      throw new BadRequestException("Kỳ phải có định dạng YYYY-MM");
    const [y, m] = period.split("-").map(Number),
      start = new Date(Date.UTC(y, m - 1, 1)),
      end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    return { start, end };
  }
  async generateStatement(
    contractId: string,
    period: string,
    actuals?: Record<string, number>,
  ) {
    const c = await this.contract(contractId),
      { start, end } = this.periodDates(period);
    if (start > c.endDate || end < c.startDate)
      throw new BadRequestException("Kỳ nằm ngoài thời hạn hợp đồng");
    const rates = c.rates
      .filter(
        (r) =>
          r.effectiveFrom <= end && (!r.effectiveTo || r.effectiveTo > start),
      )
      .filter(
        (r, i, a) => a.findIndex((x) => x.vehicleType === r.vehicleType) === i,
      );
    if (!rates.length)
      throw new BadRequestException("Không có biểu phí hiệu lực trong kỳ");
    const lines = rates.map((r) => {
        const actual = Math.max(
            0,
            Number(actuals?.[r.vehicleType] ?? r.registeredQuantity),
          ),
          excess = Math.max(0, actual - r.registeredQuantity),
          base = r.registeredQuantity * r.unitPrice,
          excessAmount = excess * r.excessUnitPrice;
        return {
          vehicleType: r.vehicleType,
          registeredQuantity: r.registeredQuantity,
          actualQuantity: actual,
          excessQuantity: excess,
          unitPrice: r.unitPrice,
          excessUnitPrice: r.excessUnitPrice,
          baseAmount: base,
          excessAmount,
          totalAmount: base + excessAmount,
        };
      }),
      subtotal = lines.reduce((s, x) => s + x.totalAmount, 0),
      due = new Date(end);
    due.setUTCDate(due.getUTCDate() + c.paymentTermDays);
    return this.prisma.parkingMonthlyStatement.upsert({
      where: { contractId_period: { contractId, period } },
      create: {
        contractId,
        period,
        periodStart: start,
        periodEnd: end,
        dueDate: due,
        subtotal,
        totalAmount: subtotal,
        lines: { create: lines },
      },
      update: {},
      include: { lines: true },
    });
  }
  statements(mallIds?: string[], q?: any) {
    return this.prisma.parkingMonthlyStatement.findMany({
      where: {
        ...(q?.period ? { period: q.period } : {}),
        ...(q?.status ? { status: q.status } : {}),
        contract: {
          ...(q?.mallId
            ? { mallId: q.mallId }
            : mallIds
              ? { mallId: { in: mallIds } }
              : {}),
          ...(q?.tenantId ? { tenantId: q.tenantId } : {}),
        },
      },
      include: {
        contract: {
          include: {
            tenant: { select: { id: true, brandName: true } },
            mall: { select: { name: true } },
          },
        },
        lines: true,
        payments: true,
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 500,
    });
  }
  async updateActual(
    id: string,
    actuals: Record<string, number>,
    adjustment = 0,
    notes?: string,
  ) {
    const s = await this.prisma.parkingMonthlyStatement.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!s) throw new NotFoundException("Không tìm thấy kỳ công nợ");
    if (s.status === "PAID")
      throw new BadRequestException("Kỳ đã thanh toán không thể điều chỉnh");
    return this.prisma.$transaction(async (tx) => {
      let subtotal = 0;
      for (const line of s.lines) {
        const actual = Math.max(
            0,
            Number(actuals?.[line.vehicleType] ?? line.actualQuantity),
          ),
          excess = Math.max(0, actual - line.registeredQuantity),
          base = line.registeredQuantity * line.unitPrice,
          excessAmount = excess * line.excessUnitPrice,
          total = base + excessAmount;
        subtotal += total;
        await tx.parkingMonthlyLine.update({
          where: { id: line.id },
          data: {
            actualQuantity: actual,
            excessQuantity: excess,
            baseAmount: base,
            excessAmount,
            totalAmount: total,
          },
        });
      }
      return tx.parkingMonthlyStatement.update({
        where: { id },
        data: {
          subtotal,
          adjustment: Number(adjustment) || 0,
          totalAmount: subtotal + (Number(adjustment) || 0),
          notes,
          reconciliationStatus: "PENDING",
        },
        include: { lines: true },
      });
    });
  }
  reconcile(id: string, status: string) {
    if (!["PENDING", "MATCHED", "DISPUTED"].includes(status))
      throw new BadRequestException("Trạng thái đối soát không hợp lệ");
    return this.prisma.parkingMonthlyStatement.update({
      where: { id },
      data: { reconciliationStatus: status },
    });
  }
  async addPayment(id: string, b: any, userId: string) {
    const s = await this.prisma.parkingMonthlyStatement.findUnique({
      where: { id },
    });
    if (!s) throw new NotFoundException("Không tìm thấy kỳ công nợ");
    const amount = Number(b.amount);
    if (!amount || amount <= 0)
      throw new BadRequestException("Số tiền thanh toán phải lớn hơn 0");
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.parkingDebtPayment.create({
          data: {
            statementId: id,
            amount,
            paidAt: new Date(b.paidAt || Date.now()),
            method: b.method,
            referenceNo: b.referenceNo,
            notes: b.notes,
            createdById: userId,
          },
        }),
        paid = s.paidAmount + amount,
        status =
          paid >= s.totalAmount ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID";
      await tx.parkingMonthlyStatement.update({
        where: { id },
        data: { paidAmount: paid, status },
      });
      return p;
    });
  }
  async uploadDocument(
    id: string,
    file: Express.Multer.File,
    type: string,
    userId: string,
  ) {
    if (!file) throw new BadRequestException("Vui lòng chọn file hợp đồng");
    const saved = await this.storage.saveFile(file, `parking-contracts/${id}`);
    return this.prisma.parkingContractDocument.create({
      data: {
        contractId: id,
        documentType: type || "CONTRACT",
        fileName: saved.fileName,
        filePath: saved.filePath,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadedById: userId,
      },
    });
  }
  async dashboard(mallIds?: string[], q?: any) {
    const contractWhere: any = {
        isActive: true,
        ...(q?.mallId
          ? { mallId: q.mallId }
          : mallIds
            ? { mallId: { in: mallIds } }
            : {}),
      },
      statementWhere: any = {
        ...(q?.period ? { period: q.period } : {}),
        contract: contractWhere,
      },
      now = new Date(),
      soon = new Date(Date.now() + 30 * 86400000);
    const [contracts, active, expiring, statements, rates] = await Promise.all([
      this.prisma.parkingCustomerContract.count({ where: contractWhere }),
      this.prisma.parkingCustomerContract.count({
        where: { ...contractWhere, status: "ACTIVE" },
      }),
      this.prisma.parkingCustomerContract.count({
        where: {
          ...contractWhere,
          status: "ACTIVE",
          endDate: { gte: now, lte: soon },
        },
      }),
      this.prisma.parkingMonthlyStatement.findMany({
        where: statementWhere,
        select: {
          totalAmount: true,
          paidAmount: true,
          status: true,
          dueDate: true,
        },
      }),
      this.prisma.parkingContractRate.findMany({
        where: { effectiveTo: null, contract: contractWhere },
        select: { registeredQuantity: true },
      }),
    ]);
    const revenue = statements.reduce((s, x) => s + x.totalAmount, 0),
      paid = statements.reduce((s, x) => s + x.paidAmount, 0);
    return {
      contracts,
      active,
      expiring,
      registeredVehicles: rates.reduce((s, x) => s + x.registeredQuantity, 0),
      revenue,
      paid,
      receivable: revenue - paid,
      overdue: statements
        .filter((x) => x.dueDate < now && x.paidAmount < x.totalAmount)
        .reduce((s, x) => s + x.totalAmount - x.paidAmount, 0),
    };
  }
  async alerts(mallIds?: string[], mallId?: string) {
    const now = new Date(),
      soon = new Date(Date.now() + 30 * 86400000),
      where: any = mallId
        ? { mallId }
        : mallIds
          ? { mallId: { in: mallIds } }
          : {};
    const [expiring, overdue, dueSoon, excess] = await Promise.all([
      this.prisma.parkingCustomerContract.findMany({
        where: { ...where, status: "ACTIVE", endDate: { gte: now, lte: soon } },
        include: { tenant: { select: { brandName: true } } },
      }),
      this.prisma.parkingMonthlyStatement.findMany({
        where: {
          dueDate: { lt: now },
          status: { not: "PAID" },
          contract: where,
        },
        include: {
          contract: { include: { tenant: { select: { brandName: true } } } },
        },
      }),
      this.prisma.parkingMonthlyStatement.findMany({
        where: {
          dueDate: { gte: now, lte: new Date(Date.now() + 7 * 86400000) },
          status: { not: "PAID" },
          contract: where,
        },
        include: {
          contract: { include: { tenant: { select: { brandName: true } } } },
        },
      }),
      this.prisma.parkingMonthlyLine.findMany({
        where: { excessQuantity: { gt: 0 }, statement: { contract: where } },
        include: {
          statement: {
            include: {
              contract: {
                include: { tenant: { select: { brandName: true } } },
              },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 100,
      }),
    ]);
    return { expiring, overdue, dueSoon, excess };
  }
  private csv(rows: any[][]) {
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    return `\uFEFF${rows.map((r) => r.map(esc).join(",")).join("\n")}`;
  }
  async receivablesCsv(mallIds?: string[], q?: any) {
    const rows = await this.statements(mallIds, q);
    return this.csv([
      [
        "Kỳ",
        "Mall",
        "Khách thuê",
        "Số hợp đồng",
        "Tổng phải thu",
        "Đã thu",
        "Còn nợ",
        "Hạn thanh toán",
        "Trạng thái",
        "Đối soát",
      ],
      ...rows.map((x: any) => [
        x.period,
        x.contract.mall.name,
        x.contract.tenant.brandName,
        x.contract.contractNumber,
        x.totalAmount,
        x.paidAmount,
        x.totalAmount - x.paidAmount,
        x.dueDate.toISOString().slice(0, 10),
        x.status,
        x.reconciliationStatus,
      ]),
    ]);
  }
  async vehiclesCsv(mallIds?: string[], q?: any) {
    const rows = await this.statements(mallIds, q);
    return this.csv([
      [
        "Kỳ",
        "Mall",
        "Khách thuê",
        "Hợp đồng",
        "Loại xe",
        "Đăng ký",
        "Thực tế",
        "Vượt",
        "Đơn giá",
        "Phí vượt",
        "Thành tiền",
      ],
      ...rows.flatMap((x: any) =>
        x.lines.map((l: any) => [
          x.period,
          x.contract.mall.name,
          x.contract.tenant.brandName,
          x.contract.contractNumber,
          l.vehicleType,
          l.registeredQuantity,
          l.actualQuantity,
          l.excessQuantity,
          l.unitPrice,
          l.excessAmount,
          l.totalAmount,
        ]),
      ),
    ]);
  }
  @Cron("0 2 * * *", {
    name: "parking-contract-billing",
    timeZone: "Asia/Ho_Chi_Minh",
  })
  async generateDueStatements() {
    const now = new Date(),
      period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
      contracts = await this.prisma.parkingCustomerContract.findMany({
        where: {
          status: "ACTIVE",
          startDate: { lte: now },
          endDate: { gte: now },
          billingDay: { lte: now.getDate() },
        },
      });
    let created = 0;
    for (const c of contracts) {
      const exists = await this.prisma.parkingMonthlyStatement.findUnique({
        where: { contractId_period: { contractId: c.id, period } },
      });
      if (!exists) {
        await this.generateStatement(c.id, period);
        created++;
      }
    }
    return { created };
  }
}
