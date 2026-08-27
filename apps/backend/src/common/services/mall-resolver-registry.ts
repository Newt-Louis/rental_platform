// CR-101 Phase 1 -- centralized, named registry describing the Mall-resolution
// logic that already exists (and keeps running unchanged) inside
// MallAccessService.extractAndValidateMallAccess(). This module does NOT
// reimplement or call that logic -- it is a structured, machine-readable
// DESCRIPTION of it, so:
//   (a) @Scope({ resolution: { via: 'entity', resolver: 'contract' } }) declarations
//       have one canonical name to refer to, instead of routes re-describing the
//       lookup chain ad hoc in comments;
//   (b) the future route-inventory tool and CI static gate (Phase 5) can validate
//       that a declared `resolver` name actually exists;
//   (c) Phase 6's eventual wiring has one place to consult for "how do I resolve
//       this entity type's Mall" rather than re-deriving it from MallAccessService's
//       source a second time.
//
// Per the review's explicit instruction ("do not rewrite functioning
// entity-resolution logic without evidence"), every entry's `authoritativeMallPath`
// and `failureBehavior` below is a description of code that was read and verified
// this session in apps/backend/src/common/services/mall-access.service.ts -- not
// new logic. New resolvers needed to close confirmed gaps (not yet backed by
// running code) are listed separately, clearly marked NOT YET IMPLEMENTED.

export interface MallResolverDescriptor {
  name: string;
  /** The Prisma model this resolver looks up. */
  entity: string;
  /** What identifier the resolver expects (matches the entity's primary key unless noted). */
  input: string;
  /** The relation chain used to reach a mallId, as implemented today. */
  authoritativeMallPath: string;
  /** What happens if the entity exists but no mallId can be derived from it. */
  failureBehavior: 'silently skips the check (returns undefined mallId)' | 'throws ForbiddenException';
  /** File:line of the verified, currently-running implementation. */
  implementedAt: string;
}

/**
 * Resolvers with existing, verified, unchanged implementations in
 * MallAccessService.extractAndValidateMallAccess() (mall-access.service.ts:51-266,
 * re-read in full this session).
 */
export const EXISTING_MALL_RESOLVERS: Record<string, MallResolverDescriptor> = {
  unit: {
    name: 'unit',
    entity: 'Unit',
    input: 'unitId',
    authoritativeMallPath: 'unit.mallId ?? unit.floor.mallId',
    failureBehavior: 'silently skips the check (returns undefined mallId)',
    implementedAt: 'mall-access.service.ts:42-49,81-83',
  },
  floor: {
    name: 'floor',
    entity: 'Floor',
    input: 'floorId',
    authoritativeMallPath: 'floor.mallId',
    failureBehavior: 'silently skips the check (returns undefined mallId)',
    implementedAt: 'mall-access.service.ts:85-91',
  },
  contract: {
    name: 'contract',
    entity: 'Contract',
    input: 'contractId',
    authoritativeMallPath: 'contract.unit.mallId ?? contract.unit.floor.mallId',
    failureBehavior: 'silently skips the check (returns undefined mallId)',
    implementedAt: 'mall-access.service.ts:93-99',
  },
  maintenanceSchedule: {
    name: 'maintenanceSchedule',
    entity: 'MaintenanceSchedule',
    input: 'maintenanceScheduleId',
    authoritativeMallPath: 'schedule.mallId',
    failureBehavior: 'silently skips the check (returns undefined mallId)',
    implementedAt: 'mall-access.service.ts:101-104',
  },
  fitoutProject: {
    name: 'fitoutProject',
    entity: 'FitoutProject',
    input: 'fitoutProjectId',
    authoritativeMallPath: 'project.unit.mallId ?? project.unit.floor.mallId',
    failureBehavior: 'silently skips the check (returns undefined mallId)',
    implementedAt: 'mall-access.service.ts:106-112',
  },
  fitoutSubmittal: {
    name: 'fitoutSubmittal',
    entity: 'FitoutSubmittal',
    input: 'fitoutSubmittalId',
    authoritativeMallPath: 'submittal.project.unit.mallId ?? submittal.project.unit.floor.mallId',
    failureBehavior: 'silently skips the check (returns undefined mallId)',
    implementedAt: 'mall-access.service.ts:114-120',
  },
  fitoutIssue: {
    name: 'fitoutIssue',
    entity: 'FitoutIssue',
    input: 'fitoutIssueId',
    authoritativeMallPath: 'issue.unit.mallId ?? issue.unit.floor.mallId',
    failureBehavior: 'silently skips the check (returns undefined mallId)',
    implementedAt: 'mall-access.service.ts:122-128',
  },
  invoice: {
    name: 'invoice',
    entity: 'Invoice',
    input: 'invoiceId',
    authoritativeMallPath:
      'invoice.mallId ?? invoice.contract.unit.mallId ?? invoice.contract.unit.floor.mallId ?? invoice.billingParty.mallId',
    failureBehavior: 'throws ForbiddenException',
    implementedAt: 'mall-access.service.ts:130-143',
  },
  payment: {
    name: 'payment',
    entity: 'Payment',
    input: 'paymentId',
    authoritativeMallPath: "via parent invoice's chain (same as invoice resolver)",
    failureBehavior: 'throws ForbiddenException',
    implementedAt: 'mall-access.service.ts:145-166',
  },
  invoiceAdjustment: {
    name: 'invoiceAdjustment',
    entity: 'InvoiceAdjustment',
    input: 'invoiceAdjustmentId',
    authoritativeMallPath: "via parent invoice's chain (same as invoice resolver)",
    failureBehavior: 'throws ForbiddenException',
    implementedAt: 'mall-access.service.ts:168-183',
  },
  booking: {
    name: 'booking',
    entity: 'UnitBooking',
    input: 'bookingId',
    authoritativeMallPath: 'booking.unit.mallId ?? booking.unit.floor.mallId',
    failureBehavior: 'silently skips the check (returns undefined mallId)',
    implementedAt: 'mall-access.service.ts:185-191',
  },
  slot: {
    name: 'slot',
    entity: 'UnitSlot',
    input: 'slotId',
    authoritativeMallPath: 'slot.unit.mallId ?? slot.unit.floor.mallId',
    failureBehavior: 'silently skips the check (returns undefined mallId)',
    implementedAt: 'mall-access.service.ts:193-199',
  },
  slotBooking: {
    name: 'slotBooking',
    entity: 'SlotBooking',
    input: 'slotBookingId',
    authoritativeMallPath: 'booking.slot.unit.mallId ?? booking.slot.unit.floor.mallId',
    failureBehavior: 'silently skips the check (returns undefined mallId)',
    implementedAt: 'mall-access.service.ts:201-207',
  },
  slotPricingRule: {
    name: 'slotPricingRule',
    entity: 'SlotPricingRule',
    input: 'slotPricingRuleId',
    authoritativeMallPath: 'rule.slot.unit.mallId ?? rule.slot.unit.floor.mallId',
    failureBehavior: 'silently skips the check (returns undefined mallId)',
    implementedAt: 'mall-access.service.ts:209-215',
  },
  proposal: {
    name: 'proposal',
    entity: 'Proposal',
    input: 'proposalId',
    authoritativeMallPath: 'proposal.unit.mallId ?? proposal.unit.floor.mallId',
    failureBehavior: 'silently skips the check (returns undefined mallId)',
    implementedAt: 'mall-access.service.ts:217-223',
  },
  approvalStepOrWorkflow: {
    name: 'approvalStepOrWorkflow',
    entity: 'ApprovalStep | ApprovalWorkflow',
    input: 'approvalStepId or approvalWorkflowId',
    authoritativeMallPath:
      "via linked Proposal's unit chain, or linked FitoutSubmittal's project.unit chain",
    failureBehavior: 'silently skips the check (returns undefined mallId)',
    implementedAt: 'mall-access.service.ts:225-240',
  },
  tenant: {
    name: 'tenant',
    entity: 'Tenant',
    input: 'tenantId',
    authoritativeMallPath: "via active Contract's or Proposal's unit chain (first found)",
    failureBehavior: 'silently skips the check (returns undefined mallId)',
    implementedAt: 'mall-access.service.ts:242-252',
  },
  ticket: {
    name: 'ticket',
    entity: 'Ticket',
    input: 'ticketId',
    authoritativeMallPath: 'ticket.unit.mallId ?? ticket.unit.floor.mallId',
    failureBehavior: 'silently skips the check (returns undefined mallId)',
    implementedAt: 'mall-access.service.ts:254-260',
  },
  servicePriceCatalog: {
    name: 'servicePriceCatalog',
    entity: 'ServicePriceCatalog',
    input: 'servicePriceCatalogId',
    authoritativeMallPath: 'item.mallId (direct field)',
    failureBehavior: 'silently skips the check (returns undefined mallId)',
    implementedAt: 'mall-access.service.ts:CR-101 Phase 3A addition',
  },
  fitoutGanttTask: {
    name: 'fitoutGanttTask',
    entity: 'FitoutTask (Gantt)',
    input: 'fitoutGanttTaskId',
    authoritativeMallPath: 'task.project.unit.mallId ?? task.project.unit.floor.mallId',
    failureBehavior: 'silently skips the check (returns undefined mallId)',
    implementedAt: 'mall-access.service.ts:CR-101 Phase 3A addition',
  },
  fitoutDailyReportEntry: {
    name: 'fitoutDailyReportEntry',
    entity: 'FitoutDailyReport entry',
    input: 'fitoutDailyReportEntryId',
    authoritativeMallPath: 'entry.project.unit.mallId ?? entry.project.unit.floor.mallId',
    failureBehavior: 'silently skips the check (returns undefined mallId)',
    implementedAt: 'mall-access.service.ts:CR-101 Phase 3A addition',
  },
  announcementMall: {
    name: 'announcementMall',
    entity: 'MallAnnouncement',
    input: 'announcementId',
    authoritativeMallPath: 'announcement.mallId (direct field)',
    failureBehavior: 'silently skips the check (returns undefined mallId)',
    implementedAt: 'mall-access.service.ts:CR-101 Phase 3A addition',
  },
  zone: {
    name: 'zone',
    entity: 'Zone',
    input: 'zoneId',
    authoritativeMallPath: 'zone.mallId (direct field -- confirmed CR-101 Phase 3B; no floor traversal needed, Zone.mallId is authoritative on its own)',
    failureBehavior: 'silently skips the check (returns undefined mallId)',
    implementedAt: 'mall-access.service.ts:CR-101 Phase 3B addition',
  },
  workOrder: {
    name: 'workOrder',
    entity: 'WorkOrder',
    input: 'workOrderId',
    authoritativeMallPath: 'workOrder.mallId (direct field, non-nullable)',
    failureBehavior: 'silently skips the check (returns undefined mallId)',
    implementedAt: 'mall-access.service.ts:CR-101 Phase 3C (C3) addition',
  },
  parkingCustomerContract: {
    name: 'parkingCustomerContract',
    entity: 'ParkingCustomerContract',
    input: 'parkingCustomerContractId',
    authoritativeMallPath: 'contract.mallId (direct field, non-nullable)',
    failureBehavior: 'silently skips the check (returns undefined mallId)',
    implementedAt: 'mall-access.service.ts:CR-101 Phase 3C (C3) addition',
  },
  serviceContract: {
    name: 'serviceContract',
    entity: 'ServiceContract',
    input: 'serviceContractId',
    authoritativeMallPath: 'contract.mallId (direct scalar field, non-nullable -- no Prisma `mall Mall @relation` object exists on this model, referential-integrity note only, does not weaken the authorization chain)',
    failureBehavior: 'silently skips the check (returns undefined mallId)',
    implementedAt: 'mall-access.service.ts:CR-101 Phase 3C (C3) addition',
  },
  patrolCheck: {
    name: 'patrolCheck',
    entity: 'PatrolCheck',
    input: 'patrolCheckId',
    authoritativeMallPath: 'check.shift.mallId (via shiftId -- folds patrol.service.ts\'s existing, unchanged `checkMallId()` helper logic into this canonical registry; that helper itself is not modified and keeps its own call sites in patrol.controller.ts)',
    failureBehavior: 'silently skips the check (returns undefined mallId)',
    implementedAt: 'mall-access.service.ts:CR-101 Phase 3C (C3) addition',
  },
  floorPlanAnalysis: {
    name: 'floorPlanAnalysis',
    entity: 'FloorPlanAnalysis',
    input: 'floorPlanAnalysisId',
    authoritativeMallPath: 'analysis.mallId (direct field, non-nullable)',
    failureBehavior: 'silently skips the check (returns undefined mallId)',
    implementedAt: 'mall-access.service.ts:CR-101 Phase 3D addition',
  },
};

// CR-101 Phase 3B note: the Spaces hierarchy's "own-id" routes (Mall/Floor/Unit
// looked up by their own :id, as opposed to a foreign-key field on another
// entity) turned out to need ZERO new resolver code, once verified against the
// actual lookups already in extractAndValidateMallAccess:
//   - Mall's own :id IS the mallId -- pass `{ mallId: id }` directly, no lookup.
//   - Floor's own :id reuses the existing `floor` resolver (`{ floorId: id }`)
//     unchanged -- that resolver was always "given an id, look up Floor.mallId",
//     regardless of whether the id came from a route's own :id or a foreign-key
//     field on another entity.
//   - Unit's own :id reuses the existing `unit` resolver (`{ unitId: id }`)
//     unchanged, same reasoning.
// Only Zone's own-id lookup was genuinely new (added above) -- Zone had no
// existing `zoneId` source at all before this phase. The `mallById`/`floorById`/
// `unitById`/`zoneById` names from the Phase 1/2 PLANNED list below were a
// documentation-only distinction that turned out not to reflect a functional
// difference for Mall/Floor/Unit -- removed as redundant with `mallId`(direct)/
// `floor`/`unit` above; `zoneById` is superseded by `zone` above.

/**
 * Resolvers a Phase 3+ fix would need but that do NOT exist as running code yet.
 * Listed here only as a forward-referenceable name for @Scope(...) declarations
 * on GAP routes (docs/architecture-review/16-CR-101-RESOLVER-REGISTRY.md has the
 * full rationale per entry) -- attempting to actually resolve one of these today
 * would throw, since no implementation backs it. Phase 1/2 must not implement any
 * of these; they exist here purely so a GAP-status @Scope(...) declaration has a
 * stable name to reference instead of free text.
 */
export const PLANNED_MALL_RESOLVERS: Record<string, Omit<MallResolverDescriptor, 'failureBehavior' | 'implementedAt'>> = {
  fitoutRisk: {
    name: 'fitoutRisk',
    entity: 'FitoutRisk',
    input: "the route's own :riskId",
    authoritativeMallPath: 'risk.project.unit.mallId ?? ... (same chain shape as fitoutSubmittal)',
  },
  fitoutChangeOrder: {
    name: 'fitoutChangeOrder',
    entity: 'FitoutChangeOrder',
    input: "the route's own :changeId",
    authoritativeMallPath: 'changeOrder.project.unit.mallId ?? ...',
  },
  salesTurnover: {
    name: 'salesTurnover',
    entity: 'SalesTurnover',
    input: 'salesTurnoverId or (tenantId+unitId+period)',
    authoritativeMallPath: 'turnover.unit.mallId ?? turnover.unit.floor.mallId',
  },
  crmDeal: {
    name: 'crmDeal',
    entity: 'Lead',
    input: 'leadId',
    authoritativeMallPath: 'lead.mallId (field already exists on the model)',
  },
  serviceCatalogProposal: {
    name: 'serviceCatalogProposal',
    entity: 'Proposal',
    input: 'proposalId',
    authoritativeMallPath: 'reuses the existing `proposal` resolver directly -- not a new chain',
  },
  parkingGateFacility: {
    name: 'parkingGateFacility',
    entity: '(external MSSQL, no Prisma model)',
    input: 'parkingCode',
    authoritativeMallPath:
      'REQUIRES a new parkingCode -> mallId mapping table/config that does not exist today -- schema-dependent, not pure wiring',
  },
  customer: {
    name: 'customer',
    entity: 'Customer',
    input: 'customerId',
    authoritativeMallPath:
      'NONE EXISTS -- Customer has no mallId field and no direct Mall relation today; blocked on BC-016 (docs/system-truth/BUSINESS_CONFIRMATION_REQUIRED.md) before this resolver can even be designed',
  },
  fileOwnerEntity: {
    name: 'fileOwnerEntity',
    entity: '(varies per document family)',
    input: 'fileId (dispatch by document type)',
    authoritativeMallPath:
      'per-type chain -- see docs/architecture-review/16-CR-101-RESOLVER-REGISTRY.md\'s fileOwnerEntity sub-table; several chains flagged not-independently-verified',
  },
};
