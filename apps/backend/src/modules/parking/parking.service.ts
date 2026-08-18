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
const STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["ACTIVE", "TERMINATED"],
  ACTIVE: ["SUSPENDED", "EXPIRED", "TERMINATED", "RENEWED"],
  SUSPENDED: ["ACTIVE", "TERMINATED"],
  EXPIRED: ["RENEWED"],
  TERMINATED: [],
  RENEWED: [],
};
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
          contractType: b.contractType || "FIXED_QUOTA",
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
    const current = await this.prisma.parkingCustomerContract.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("Không tìm thấy hợp đồng bãi xe");
    if (["EXPIRED", "TERMINATED", "RENEWED"].includes(current.status)) {
      throw new BadRequestException("Hợp đồng đã kết thúc không thể chỉnh sửa");
    }
    const startDate = b.startDate ? new Date(b.startDate) : current.startDate;
    const endDate = b.endDate ? new Date(b.endDate) : current.endDate;
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) {
      throw new BadRequestException("Ngày kết thúc phải sau ngày bắt đầu");
    }
    const data: any = {};
    if (b.contractType && b.contractType !== current.contractType && current.status !== "DRAFT")
      throw new BadRequestException("Chỉ được đổi loại hợp đồng khi còn ở trạng thái nháp");
    for (const k of [
      "title",
      "contractType",
      "signedDate",
      "startDate",
      "endDate",
      "billingDay",
      "paymentTermDays",
      "depositAmount",
      "notes",
    ]) {
      if (!(k in b)) continue;
      if (["signedDate", "startDate", "endDate"].includes(k)) {
        data[k] = b[k] ? new Date(b[k]) : null;
      } else if (k === "billingDay") {
        const value = Number(b[k]);
        if (!Number.isInteger(value) || value < 1 || value > 28) throw new BadRequestException("Ngày lập phí phải từ 1 đến 28");
        data[k] = value;
      } else if (k === "paymentTermDays" || k === "depositAmount") {
        const value = Number(b[k]);
        if (!Number.isFinite(value) || value < 0) throw new BadRequestException(`${k} không hợp lệ`);
        data[k] = value;
      } else data[k] = b[k];
    }
    return this.prisma.parkingCustomerContract.update({ where: { id }, data });
  }
  async updateStatus(id: string, status: string) {
    if (!STATUSES.includes(status))
      throw new BadRequestException("Trạng thái hợp đồng không hợp lệ");
    const contract = await this.prisma.parkingCustomerContract.findUnique({ where: { id }, select: { status: true } });
    if (!contract) throw new NotFoundException("Không tìm thấy hợp đồng bãi xe");
    if (contract.status === status) return this.prisma.parkingCustomerContract.findUnique({ where: { id } });
    if (!(STATUS_TRANSITIONS[contract.status] || []).includes(status)) {
      throw new BadRequestException(`Không thể chuyển trạng thái từ ${contract.status} sang ${status}`);
    }
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
    if (contract.status !== "ACTIVE") throw new BadRequestException("Chỉ điều chỉnh được hợp đồng đang hiệu lực");
    const effectiveDate = new Date(b.effectiveDate || Date.now());
    const newQuantity = Number(b.newQuantity);
    const unitPrice = Number(b.unitPrice ?? current.unitPrice);
    const excessUnitPrice = Number(b.excessUnitPrice ?? current.excessUnitPrice);
    if (Number.isNaN(effectiveDate.getTime()) || effectiveDate < contract.startDate || effectiveDate > contract.endDate) {
      throw new BadRequestException("Ngày hiệu lực điều chỉnh nằm ngoài thời hạn hợp đồng");
    }
    if (effectiveDate <= current.effectiveFrom) throw new BadRequestException("Ngày hiệu lực mới phải sau ngày hiệu lực hiện tại");
    if (!Number.isInteger(newQuantity) || newQuantity < 0) throw new BadRequestException("Số lượng đăng ký phải là số nguyên không âm");
    if (!Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(excessUnitPrice) || excessUnitPrice < 0) {
      throw new BadRequestException("Đơn giá không hợp lệ");
    }
    if (!b.reason?.trim()) throw new BadRequestException("Vui lòng nhập lý do điều chỉnh");
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
          unitPrice,
          excessUnitPrice,
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
          reason: b.reason.trim(),
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
  async previewStatement(
    contractId: string,
    period: string,
    actuals?: Record<string, number>,
    adjustment = 0,
    notes?: string,
  ) {
    const c = await this.contract(contractId),
      { start, end } = this.periodDates(period);
    if (c.status !== "ACTIVE")
      throw new BadRequestException("Chỉ tạo bảng kê cho hợp đồng đang hiệu lực");
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

    const isActual = c.contractType === "PRINCIPLE_ACTUAL";
    const lines = rates.map((r) => {
      const rawActual = actuals?.[r.vehicleType] ?? (isActual ? 0 : r.registeredQuantity);
      const actual = Number(rawActual);
      if (!Number.isInteger(actual) || actual < 0)
        throw new BadRequestException(`Số lượng thực tế ${r.vehicleType} phải là số nguyên không âm`);
      const excess = isActual ? 0 : Math.max(0, actual - r.registeredQuantity);
      const base = isActual
        ? actual * r.unitPrice
        : r.registeredQuantity * r.unitPrice;
      const excessAmount = isActual ? 0 : excess * r.excessUnitPrice;
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
    });
    const subtotal = lines.reduce((sum, line) => sum + line.totalAmount, 0);
    const adjustmentValue = Number(adjustment || 0);
    if (!Number.isFinite(adjustmentValue) || subtotal + adjustmentValue < 0)
      throw new BadRequestException("Giá trị điều chỉnh không hợp lệ");
    const dueDate = new Date(end);
    dueDate.setUTCDate(dueDate.getUTCDate() + c.paymentTermDays);
    const existingStatement = await this.prisma.parkingMonthlyStatement.findUnique({
      where: { contractId_period: { contractId, period } },
      select: { id: true, status: true, reconciliationStatus: true },
    });
    return {
      contractId,
      contractType: c.contractType,
      period,
      periodStart: start,
      periodEnd: end,
      dueDate,
      subtotal,
      adjustment: adjustmentValue,
      totalAmount: subtotal + adjustmentValue,
      notes,
      lines,
      existingStatement,
    };
  }
  async generateStatement(
    contractId: string,
    period: string,
    actuals?: Record<string, number>,
    adjustment = 0,
    notes?: string,
  ) {
    const preview = await this.previewStatement(
      contractId, period, actuals, adjustment, notes,
    );
    if (preview.existingStatement)
      throw new ConflictException("Công nợ kỳ này đã được tạo; vui lòng điều chỉnh tại danh sách công nợ");
    try {
      return await this.prisma.parkingMonthlyStatement.create({
        data: {
        contractId,
        period,
        periodStart: preview.periodStart,
        periodEnd: preview.periodEnd,
        dueDate: preview.dueDate,
        subtotal: preview.subtotal,
        adjustment: preview.adjustment,
        totalAmount: preview.totalAmount,
        notes: preview.notes,
        lines: { create: preview.lines },
        },
        include: { lines: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        throw new ConflictException("Công nợ kỳ này đã được tạo");
      throw error;
    }
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
            rates: { where: { effectiveTo: null }, orderBy: { vehicleType: "asc" } },
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
      include: { lines: true, contract: { select: { contractType: true } } },
    });
    if (!s) throw new NotFoundException("Không tìm thấy kỳ công nợ");
    if (s.status === "PAID")
      throw new BadRequestException("Kỳ đã thanh toán không thể điều chỉnh");
    if (s.paidAmount > 0)
      throw new BadRequestException("Kỳ đã phát sinh thanh toán không thể điều chỉnh số tiền");
    if (["MATCHED", "TRANSFERRED_TO_BILLING"].includes(s.reconciliationStatus))
      throw new BadRequestException("Bảng kê đã đối soát hoặc chuyển Billing không thể điều chỉnh");
    return this.prisma.$transaction(async (tx) => {
      let subtotal = 0;
      for (const line of s.lines) {
        const actual = Number(actuals?.[line.vehicleType] ?? line.actualQuantity);
        if (!Number.isInteger(actual) || actual < 0)
          throw new BadRequestException(`Số lượng thực tế ${line.vehicleType} phải là số nguyên không âm`);
        const isActual = s.contract.contractType === "PRINCIPLE_ACTUAL",
          excess = isActual ? 0 : Math.max(0, actual - line.registeredQuantity),
          base = isActual ? actual * line.unitPrice : line.registeredQuantity * line.unitPrice,
          excessAmount = isActual ? 0 : excess * line.excessUnitPrice,
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
      const adjustmentValue = Number(adjustment) || 0;
      if (!Number.isFinite(adjustmentValue) || subtotal + adjustmentValue < 0)
        throw new BadRequestException("Giá trị điều chỉnh không hợp lệ");
      return tx.parkingMonthlyStatement.update({
        where: { id },
        data: {
          subtotal,
          adjustment: adjustmentValue,
          totalAmount: subtotal + adjustmentValue,
          notes,
          reconciliationStatus: "PENDING",
        },
        include: { lines: true },
      });
    });
  }
  async reconcile(id: string, status: string) {
    if (!["PENDING", "MATCHED", "DISPUTED"].includes(status))
      throw new BadRequestException("Trạng thái đối soát không hợp lệ");
    const statement = await this.prisma.parkingMonthlyStatement.findUnique({ where: { id } });
    if (!statement) throw new NotFoundException("Không tìm thấy kỳ công nợ");
    if (statement.reconciliationStatus === "TRANSFERRED_TO_BILLING")
      throw new BadRequestException("Bảng kê đã chuyển Billing không thể thay đổi đối soát");
    return this.prisma.parkingMonthlyStatement.update({
      where: { id },
      data: { reconciliationStatus: status },
    });
  }
  async addPayment(id: string, b: any, userId: string) {
    const amount = Number(b.amount);
    if (!amount || amount <= 0)
      throw new BadRequestException("Số tiền thanh toán phải lớn hơn 0");
    if (b.paidAt && Number.isNaN(new Date(b.paidAt).getTime()))
      throw new BadRequestException("Ngày thanh toán không hợp lệ");
    return this.prisma.$transaction(async (tx) => {
      const s = await tx.parkingMonthlyStatement.findUnique({ where: { id } });
      if (!s) throw new NotFoundException("Không tìm thấy kỳ công nợ");
      if (s.reconciliationStatus === "TRANSFERRED_TO_BILLING")
        throw new BadRequestException("Bảng kê đã chuyển Billing; vui lòng ghi nhận thanh toán tại Billing");
      if (s.status === "PAID") throw new BadRequestException("Bảng kê đã thanh toán đủ");
      const remaining = Math.max(0, s.totalAmount - s.paidAmount);
      if (amount > remaining) throw new BadRequestException("Số tiền thanh toán vượt quá công nợ còn lại");
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
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  async uploadDocument(
    id: string,
    file: Express.Multer.File,
    type: string,
    userId: string,
  ) {
    if (!file) throw new BadRequestException("Vui lòng chọn file hợp đồng");
    const allowed = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowed.includes(file.mimetype))
      throw new BadRequestException("Chỉ hỗ trợ PDF, Word, JPG hoặc PNG");
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
    const now = new Date();
    await this.prisma.parkingCustomerContract.updateMany({
      where: { status: "ACTIVE", endDate: { lt: now } },
      data: { status: "EXPIRED" },
    });
    const
      period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
      contracts = await this.prisma.parkingCustomerContract.findMany({
        where: {
          status: "ACTIVE",
          contractType: "FIXED_QUOTA",
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
