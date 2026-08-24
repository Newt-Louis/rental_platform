import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';

// UserMallAccess mô hình hoá "nhân viên này phụ trách mall nào" — không áp dụng cho TENANT
// (khách thuê không có khái niệm phụ trách mall). Cách ly dữ liệu của TENANT được thực hiện bằng
// kiểm tra tenantId ở tầng service (findOne/findAll mỗi module), chặt hơn và đúng bản chất hơn
// so với UserMallAccess — nên TENANT bypass guard này thay vì bị chặn vì thiếu UserMallAccess.
//
// CR-101 Phase 3G (BC-CEO-SCOPE, Option A — approved 2026-08-22): CEO removed from this
// blanket bypass. CEO's Mall access is no longer "skip every check for every domain it can
// reach" — it is now the narrower CROSS_MALL_READ_ROLES grant below, explicitly opted into
// per call site, never inferred from role name alone. See
// docs/architecture-review/35-CR-101-PHASE-3G-IMPLEMENTATION-PLAN.md.
const BYPASS_ROLES: Role[] = [Role.ADMIN, Role.TENANT];

// CR-101 Phase 3G — the business-approved set of roles that get unrestricted (all-Mall) READ
// on a small, explicitly-named set of oversight domains (Dashboard, Reports, Analytics, AI,
// Approvals-action) — never CREATE/UPDATE/DELETE/APPROVE-outside-workflow/ADMIN. Consumed only
// via the `crossMallRead` opt-in below, mirroring the "declared, not granted" philosophy already
// used by @Scope's `crossMallRead` metadata field (scope.types.ts). A call site NOT passing
// `{ crossMallRead: true }` gives CEO exactly the same ordinary UserMallAccess-derived scoping
// as any other non-bypass role — this is deliberate, not an oversight, for every domain outside
// the approved five.
const CROSS_MALL_READ_ROLES: Role[] = [Role.CEO];

export interface MallAccessOptions {
  /** CR-101 Phase 3G — set true only at the small, business-approved set of call sites
   * (Dashboard, Reports, Analytics read paths, AI, Approvals-action) that should give
   * CROSS_MALL_READ_ROLES members unrestricted read. Never set this from generic/shared code
   * reused by other domains. */
  crossMallRead?: boolean;
}

@Injectable()
export class MallAccessService {
  constructor(private prisma: PrismaService) {}

  bypassesMallCheck(role?: string): boolean {
    return !!role && BYPASS_ROLES.includes(role as Role);
  }

  /** CR-101 Phase 3G — true only for roles in CROSS_MALL_READ_ROLES. Does not by itself grant
   * anything; callers must combine with an explicit `crossMallRead: true` opt-in. */
  hasCrossMallRead(role?: string): boolean {
    return !!role && CROSS_MALL_READ_ROLES.includes(role as Role);
  }

  private grantsUnrestrictedRead(role: string, opts?: MallAccessOptions): boolean {
    return this.bypassesMallCheck(role) || (!!opts?.crossMallRead && this.hasCrossMallRead(role));
  }

  async assertMallAccess(userId: string, role: string, mallId: string, opts?: MallAccessOptions): Promise<void> {
    if (this.grantsUnrestrictedRead(role, opts)) return;

    const access = await this.prisma.userMallAccess.findFirst({
      where: { userId, mallId, isActive: true },
    });

    if (!access) {
      throw new ForbiddenException('You do not have access to this mall');
    }
  }

  async getAccessibleMallIds(userId: string, role: string, opts?: MallAccessOptions): Promise<string[] | null> {
    if (this.grantsUnrestrictedRead(role, opts)) return null;

    const accesses = await this.prisma.userMallAccess.findMany({
      where: { userId, isActive: true },
      select: { mallId: true },
    });
    return accesses.map((access) => access.mallId);
  }

  /** Resolve mallId from unitId when mallId not provided explicitly */
  async resolveMallIdFromUnit(unitId: string): Promise<string | null> {
    const unit = await this.prisma.unit.findUnique({
      where: { id: unitId },
      select: { mallId: true, floor: { select: { mallId: true } } },
    });
    if (!unit) return null;
    return unit.mallId ?? unit.floor?.mallId ?? null;
  }

  async extractAndValidateMallAccess(
    userId: string,
    role: string,
    sources: {
      mallId?: string;
      unitId?: string;
      floorId?: string;
      contractId?: string;
      fitoutProjectId?: string;
      fitoutSubmittalId?: string;
      fitoutIssueId?: string;
      invoiceId?: string;
      paymentId?: string;
      invoiceAdjustmentId?: string;
      bookingId?: string;
      slotId?: string;
      slotBookingId?: string;
      slotPricingRuleId?: string;
      proposalId?: string;
      approvalStepId?: string;
      approvalWorkflowId?: string;
      tenantId?: string;
      ticketId?: string;
      maintenanceScheduleId?: string;
      // CR-101 Phase 3A -- new resolvers, additive only, same pattern as above.
      servicePriceCatalogId?: string;
      fitoutGanttTaskId?: string;
      fitoutDailyReportEntryId?: string;
      announcementId?: string;
      // CR-101 Phase 3B -- Spaces hierarchy. Mall's own :id is passed directly as
      // `mallId` (no lookup needed -- the entity IS the mallId). Floor's and
      // Unit's own :id reuse the `floorId`/`unitId` sources above unchanged (those
      // sources already resolve "given this id, what Mall does it belong to" --
      // the same lookup whether the id came from a route's own :id or from a
      // foreign-key field on another entity). Zone's own :id is the one genuinely
      // new lookup, added below.
      zoneId?: string;
      // CR-101 Phase 3C (C3) -- WorkOrder/ParkingCustomerContract/ServiceContract
      // all have a direct, non-nullable mallId field (confirmed against
      // schema.prisma this phase, see docs/architecture-review/29-CR-101-FILE-OWNERSHIP-MATRIX.md).
      // `patrolCheckId` folds patrol.service.ts's existing, unchanged
      // `checkMallId()` helper's logic (PatrolCheck.shiftId -> PatrolShift.mallId)
      // into this canonical registry, per the standing recommendation in
      // 16-CR-101-RESOLVER-REGISTRY.md -- patrol.service.ts itself is not
      // modified; its own call sites keep using checkMallId() unchanged.
      workOrderId?: string;
      parkingCustomerContractId?: string;
      serviceContractId?: string;
      patrolCheckId?: string;
      // CR-101 Phase 3D -- FloorPlanAnalysis has a direct, non-nullable mallId
      // field (confirmed against schema.prisma). Closes the confirmed gap:
      // ai.controller.ts's getAnalysis/pollStatus/applySuggestions routes had
      // zero Mall check, keyed only on the analysis's own id.
      floorPlanAnalysisId?: string;
    },
    opts?: MallAccessOptions,
  ): Promise<void> {
    if (this.grantsUnrestrictedRead(role, opts)) return;

    let mallId = sources.mallId;

    if (!mallId && sources.unitId) {
      mallId = (await this.resolveMallIdFromUnit(sources.unitId)) ?? undefined;
    }

    if (!mallId && sources.floorId) {
      const floor = await this.prisma.floor.findUnique({
        where: { id: sources.floorId },
        select: { mallId: true },
      });
      mallId = floor?.mallId;
    }

    if (!mallId && sources.contractId) {
      const contract = await this.prisma.contract.findUnique({
        where: { id: sources.contractId },
        select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } },
      });
      mallId = contract?.unit?.mallId ?? contract?.unit?.floor?.mallId;
    }

    if (!mallId && sources.maintenanceScheduleId) {
      const schedule = await this.prisma.maintenanceSchedule.findUnique({ where: { id: sources.maintenanceScheduleId }, select: { mallId: true } });
      mallId = schedule?.mallId;
    }

    if (!mallId && sources.fitoutProjectId) {
      const project = await this.prisma.fitoutProject.findUnique({
        where: { id: sources.fitoutProjectId },
        select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } },
      });
      mallId = project?.unit?.mallId ?? project?.unit?.floor?.mallId;
    }

    if (!mallId && sources.fitoutSubmittalId) {
      const submittal = await this.prisma.fitoutSubmittal.findUnique({
        where: { id: sources.fitoutSubmittalId },
        select: { project: { select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } } } },
      });
      mallId = submittal?.project?.unit?.mallId ?? submittal?.project?.unit?.floor?.mallId;
    }

    if (!mallId && sources.fitoutIssueId) {
      const issue = await this.prisma.fitoutIssue.findUnique({
        where: { id: sources.fitoutIssueId },
        select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } },
      });
      mallId = issue?.unit?.mallId ?? issue?.unit?.floor?.mallId;
    }

    if (!mallId && sources.invoiceId) {
      const invoice = await this.prisma.invoice.findUnique({
        where: { id: sources.invoiceId },
        select: {
          mallId: true,
          contract: { select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } } },
          billingParty: { select: { mallId: true } },
        },
      });
      mallId = invoice?.mallId ?? invoice?.contract?.unit?.mallId ?? invoice?.contract?.unit?.floor?.mallId ?? invoice?.billingParty?.mallId ?? undefined;
      if (invoice && !mallId) {
        throw new ForbiddenException('Invoice is not assigned to an accessible mall');
      }
    }

    if (!mallId && sources.paymentId) {
      const payment = await this.prisma.payment.findUnique({
        where: { id: sources.paymentId },
        select: {
          invoice: {
            select: {
              mallId: true,
              contract: { select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } } },
              billingParty: { select: { mallId: true } },
            },
          },
        },
      });
      mallId = payment?.invoice?.mallId
        ?? payment?.invoice?.contract?.unit?.mallId
        ?? payment?.invoice?.contract?.unit?.floor?.mallId
        ?? payment?.invoice?.billingParty?.mallId
        ?? undefined;
      if (payment && !mallId) {
        throw new ForbiddenException('Payment is not assigned to an accessible mall');
      }
    }

    if (!mallId && sources.invoiceAdjustmentId) {
      const adjustment = await this.prisma.invoiceAdjustment.findUnique({
        where: { id: sources.invoiceAdjustmentId },
        select: { invoice: { select: {
          mallId: true,
          contract: { select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } } },
          billingParty: { select: { mallId: true } },
        } } },
      });
      mallId = adjustment?.invoice.mallId
        ?? adjustment?.invoice.contract?.unit?.mallId
        ?? adjustment?.invoice.contract?.unit?.floor?.mallId
        ?? adjustment?.invoice.billingParty?.mallId
        ?? undefined;
      if (adjustment && !mallId) throw new ForbiddenException('Adjustment is not assigned to an accessible mall');
    }

    if (!mallId && sources.bookingId) {
      const booking = await this.prisma.unitBooking.findUnique({
        where: { id: sources.bookingId },
        select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } },
      });
      mallId = booking?.unit?.mallId ?? booking?.unit?.floor?.mallId;
    }

    if (!mallId && sources.slotId) {
      const slot = await this.prisma.unitSlot.findUnique({
        where: { id: sources.slotId },
        select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } },
      });
      mallId = slot?.unit?.mallId ?? slot?.unit?.floor?.mallId;
    }

    if (!mallId && sources.slotBookingId) {
      const booking = await this.prisma.slotBooking.findUnique({
        where: { id: sources.slotBookingId },
        select: { slot: { select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } } } },
      });
      mallId = booking?.slot?.unit?.mallId ?? booking?.slot?.unit?.floor?.mallId;
    }

    if (!mallId && sources.slotPricingRuleId) {
      const rule = await this.prisma.slotPricingRule.findUnique({
        where: { id: sources.slotPricingRuleId },
        select: { slot: { select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } } } },
      });
      mallId = rule?.slot?.unit?.mallId ?? rule?.slot?.unit?.floor?.mallId;
    }

    if (!mallId && sources.proposalId) {
      const proposal = await this.prisma.proposal.findUnique({
        where: { id: sources.proposalId },
        select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } },
      });
      mallId = proposal?.unit?.mallId ?? proposal?.unit?.floor?.mallId;
    }

    if (!mallId && (sources.approvalStepId || sources.approvalWorkflowId)) {
      const workflowId = sources.approvalWorkflowId ?? (await this.prisma.approvalStep.findUnique({
        where: { id: sources.approvalStepId }, select: { workflowId: true },
      }))?.workflowId;
      if (workflowId) {
        const workflow = await this.prisma.approvalWorkflow.findUnique({
          where: { id: workflowId },
          select: {
            proposal: { select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } } },
            fitoutSubmittal: { select: { project: { select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } } } } },
          },
        });
        mallId = workflow?.proposal?.unit?.mallId ?? workflow?.proposal?.unit?.floor?.mallId
          ?? workflow?.fitoutSubmittal?.project?.unit?.mallId ?? workflow?.fitoutSubmittal?.project?.unit?.floor?.mallId;
      }
    }

    if (!mallId && sources.tenantId) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: sources.tenantId },
        select: {
          contracts: { where: { isActive: true }, take: 1, select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } } },
          proposals: { where: { isActive: true }, take: 1, select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } } },
        },
      });
      const unit = tenant?.contracts[0]?.unit ?? tenant?.proposals[0]?.unit;
      mallId = unit?.mallId ?? unit?.floor?.mallId;
    }

    if (!mallId && sources.ticketId) {
      const ticket = await this.prisma.ticket.findUnique({
        where: { id: sources.ticketId },
        select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } },
      });
      mallId = ticket?.unit?.mallId ?? ticket?.unit?.floor?.mallId;
    }

    if (!mallId && sources.servicePriceCatalogId) {
      const item = await this.prisma.servicePriceCatalog.findUnique({
        where: { id: sources.servicePriceCatalogId },
        select: { mallId: true },
      });
      mallId = item?.mallId;
    }

    if (!mallId && sources.fitoutGanttTaskId) {
      const task = await this.prisma.fitoutTask.findUnique({
        where: { id: sources.fitoutGanttTaskId },
        select: { project: { select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } } } },
      });
      mallId = task?.project?.unit?.mallId ?? task?.project?.unit?.floor?.mallId;
    }

    if (!mallId && sources.fitoutDailyReportEntryId) {
      const entry = await this.prisma.fitoutDailyReportEntry.findUnique({
        where: { id: sources.fitoutDailyReportEntryId },
        select: { project: { select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } } } },
      });
      mallId = entry?.project?.unit?.mallId ?? entry?.project?.unit?.floor?.mallId;
    }

    if (!mallId && sources.announcementId) {
      const announcement = await this.prisma.mallAnnouncement.findUnique({
        where: { id: sources.announcementId },
        select: { mallId: true },
      });
      mallId = announcement?.mallId;
    }

    if (!mallId && sources.zoneId) {
      const zone = await this.prisma.zone.findUnique({
        where: { id: sources.zoneId },
        select: { mallId: true },
      });
      mallId = zone?.mallId;
    }

    if (!mallId && sources.workOrderId) {
      const workOrder = await this.prisma.workOrder.findUnique({
        where: { id: sources.workOrderId },
        select: { mallId: true },
      });
      mallId = workOrder?.mallId;
    }

    if (!mallId && sources.parkingCustomerContractId) {
      const contract = await this.prisma.parkingCustomerContract.findUnique({
        where: { id: sources.parkingCustomerContractId },
        select: { mallId: true },
      });
      mallId = contract?.mallId;
    }

    if (!mallId && sources.serviceContractId) {
      const contract = await this.prisma.serviceContract.findUnique({
        where: { id: sources.serviceContractId },
        select: { mallId: true },
      });
      mallId = contract?.mallId;
    }

    if (!mallId && sources.patrolCheckId) {
      const check = await this.prisma.patrolCheck.findUnique({
        where: { id: sources.patrolCheckId },
        select: { shift: { select: { mallId: true } } },
      });
      mallId = check?.shift?.mallId;
    }

    if (!mallId && sources.floorPlanAnalysisId) {
      const analysis = await this.prisma.floorPlanAnalysis.findUnique({
        where: { id: sources.floorPlanAnalysisId },
        select: { mallId: true },
      });
      mallId = analysis?.mallId;
    }

    if (mallId) {
      await this.assertMallAccess(userId, role, mallId);
    }
  }
}
