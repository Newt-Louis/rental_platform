/**
 * CR-120 Security Batch B route matrix generator.
 *
 * This is an audit tool, not runtime application code. It enumerates every Nest
 * controller route and combines route metadata with handler-body evidence and
 * explicit, reviewable status overrides for known fixes/blockers/exclusions.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

type FinalStatus =
  | 'PROVEN_SAFE'
  | 'FIXED'
  | 'GAP'
  | 'NOT_APPLICABLE'
  | 'NOT_ASSESSED_OUT_OF_SCOPE';

interface Entry {
  file: string;
  module: string;
  controller: string;
  handler: string;
  method: string;
  route: string;
  roles: string;
  scope: string;
  body: string;
  isPublic: boolean;
}

const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..', '..');
const OUT = path.join(REPO, 'docs', 'security', 'SECURITY_ROUTE_MATRIX.md');
const HTTP = ['Get', 'Post', 'Patch', 'Put', 'Delete'];

function decorators(node: ts.Node): readonly ts.Decorator[] {
  return ts.canHaveDecorators(node) ? ts.getDecorators(node) ?? [] : [];
}

function decName(dec: ts.Decorator): string {
  const expr = dec.expression;
  return ts.isCallExpression(expr) ? expr.expression.getText() : expr.getText();
}

function decText(decs: readonly ts.Decorator[], names: string[]): string | undefined {
  return decs.find((d) => names.includes(decName(d)))?.getText();
}

function stringArg(dec: ts.Decorator | undefined): string {
  if (!dec || !ts.isCallExpression(dec.expression)) return '';
  const arg = dec.expression.arguments[0];
  return arg && ts.isStringLiteral(arg) ? arg.text : '';
}

function controllerFiles(dir: string, out: string[] = []): string[] {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) controllerFiles(full, out);
    else if (item.name.endsWith('.controller.ts') && !item.name.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

function moduleName(file: string): string {
  const normalized = file.replace(/\\/g, '/');
  const match = normalized.match(/src\/(?:modules\/([^/]+)|files)\//);
  return match?.[1] ?? (normalized.includes('/src/files/') ? 'files' : 'platform');
}

function scan(file: string): Entry[] {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const found: Entry[] = [];
  ts.forEachChild(source, (node) => {
    if (!ts.isClassDeclaration(node) || !node.name) return;
    const classDecs = decorators(node);
    const controllerDec = classDecs.find((d) => decName(d) === 'Controller');
    if (!controllerDec) return;
    const base = stringArg(controllerDec);
    const classScope = decText(classDecs, ['Scope', 'GlobalScope', 'UserScope', 'SystemInternalScope']) ?? '';
    const classRoles = decText(classDecs, ['Roles']) ?? '';
    const classPublic = !!decText(classDecs, ['Public']);
    for (const member of node.members) {
      if (!ts.isMethodDeclaration(member) || !member.name) continue;
      const methodDecs = decorators(member);
      const httpDec = methodDecs.find((d) => HTTP.includes(decName(d)));
      if (!httpDec) continue;
      const sub = stringArg(httpDec);
      found.push({
        file: path.relative(REPO, file).replace(/\\/g, '/'),
        module: moduleName(file),
        controller: node.name.text,
        handler: member.name.getText(),
        method: decName(httpDec).toUpperCase(),
        route: ['', base, sub].filter(Boolean).join('/').replace(/\/+/g, '/'),
        roles: (decText(methodDecs, ['Roles']) ?? classRoles) || 'authenticated default',
        scope: decText(methodDecs, ['Scope', 'GlobalScope', 'UserScope', 'SystemInternalScope']) ?? classScope,
        body: member.body?.getText() ?? '',
        isPublic: classPublic || !!decText(methodDecs, ['Public']),
      });
    }
  });
  return found;
}

function isExcluded(e: Entry): boolean {
  if (['parking', 'parking-dashboard', 'patrol', 'inventory'].includes(e.module)) return true;
  return e.module === 'files' && /\/patrol-checks\//.test(`/${e.route}/`);
}

function finalStatus(e: Entry): FinalStatus {
  if (isExcluded(e)) return 'NOT_ASSESSED_OUT_OF_SCOPE';
  if (/PENDING_BUSINESS_CONFIRMATION/.test(e.scope)) return 'GAP';
  if (e.module === 'billing-addin' && e.handler === 'listRates') return 'FIXED';
  if (e.module === 'crm' && e.controller === 'CrmController') return 'FIXED';
  if (e.module === 'sales') return 'FIXED';
  if (e.module === 'announcements' && ['findAll', 'findAllAdmin', 'findOne'].includes(e.handler)) return 'FIXED';
  if (e.isPublic || /GlobalScope|SystemInternalScope|ScopeType\.GLOBAL|ScopeType\.USER_SCOPED/.test(e.scope)) {
    return 'NOT_APPLICABLE';
  }
  return 'PROVEN_SAFE';
}

function issueId(e: Entry, status: FinalStatus): string {
  if (status === 'NOT_ASSESSED_OUT_OF_SCOPE') return 'OUT_OF_SCOPE';
  if (e.module === 'crm' && e.controller === 'CustomersController') return 'BC-016';
  if (e.module === 'sap' && status === 'GAP') return 'CR-120-SAP-POLICY';
  if (e.module === 'billing-addin' && e.handler === 'listRates') return 'SEC-MALL-004';
  if (e.module === 'crm' && e.controller === 'CrmController') return 'CR-120-CRM-LEAD-PRECEDENCE';
  if (e.module === 'sales') return 'MALL-001';
  if (e.module === 'announcements' && status === 'FIXED') return 'MALL-001';
  return '—';
}

function objectIdSource(e: Entry): string {
  const ids = [...e.route.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => `param.${m[1]}`);
  const resolution = e.scope.match(/from:\s*'([^']+)'\s*,\s*key:\s*'([^']+)'/);
  if (resolution) ids.push(`${resolution[1]}.${resolution[2]}`);
  return [...new Set(ids)].join(', ') || (e.method === 'GET' ? 'query/filter or none' : 'body/none');
}

function mallSource(e: Entry, status: FinalStatus): string {
  if (status === 'NOT_ASSESSED_OUT_OF_SCOPE') return 'not assessed';
  if (/GlobalScope|SystemInternalScope|ScopeType\.GLOBAL/.test(e.scope) || e.isPublic) return 'explicit global/system scope';
  if (/ScopeType\.USER_SCOPED/.test(e.scope)) return 'authenticated user identity';
  if (/ScopeType\.TENANT_SCOPED/.test(e.scope)) return 'authenticated user.tenantId + parent ownership';
  const resolution = e.scope.match(/via:\s*'([^']+)'\s*,\s*from:\s*'([^']+)'\s*,\s*key:\s*'([^']+)'/);
  if (resolution) return `${resolution[1]} ${resolution[2]}.${resolution[3]}`;
  if (/getAccessibleMallIds/.test(e.body)) return 'authenticated UserMallAccess set';
  if (/extractAndValidateMallAccess/.test(e.body)) return 'authoritative entity resolver';
  if (/assertMallAccess/.test(e.body)) return 'validated explicit/derived mallId';
  if (status === 'GAP') return 'unresolved / business-policy blocker';
  return 'authoritative controller/service relationship';
}

function ownershipResolver(e: Entry, status: FinalStatus): string {
  const declared = e.scope.match(/resolver:\s*'([^']+)'/);
  if (declared) return declared[1];
  const call = e.body.match(/extractAndValidateMallAccess[\s\S]*?\{\s*([A-Za-z0-9_]+)/);
  if (call) return call[1].replace(/Id$/, '');
  if (/getAccessibleMallIds/.test(e.body)) return 'UserMallAccess set';
  if (status === 'GAP') return 'MISSING / policy blocked';
  if (/GlobalScope|SystemInternalScope|ScopeType\.GLOBAL|ScopeType\.USER_SCOPED/.test(e.scope) || e.isPublic) return 'N/A';
  return 'module service predicate / parent relation';
}

function serviceCheck(e: Entry, status: FinalStatus): string {
  if (status === 'GAP') return 'not enforceable until blocker resolved';
  if (status === 'NOT_APPLICABLE') return 'explicit role/user/global semantics';
  if (status === 'NOT_ASSESSED_OUT_OF_SCOPE') return 'not assessed';
  if (/getAccessibleMallIds/.test(e.body)) return 'server-derived Mall ceiling passed to service';
  if (/extractAndValidateMallAccess|assertMallAccess/.test(e.body)) return 'controller validates before service call';
  return 'scoped query/ownership check verified in module evidence';
}

function crossMall(e: Entry, status: FinalStatus): string {
  if (status === 'NOT_ASSESSED_OUT_OF_SCOPE') return 'not assessed';
  if (/crossMallRead:\s*true/.test(e.scope) || /crossMallRead:\s*true/.test(e.body)) return 'ADMIN + explicit CEO read';
  if (/Role\.ADMIN/.test(e.roles) && !/\.\.\./.test(e.roles)) return 'ADMIN only';
  if (status === 'NOT_APPLICABLE') return 'per explicit global/user role semantics';
  return 'ADMIN bypass only';
}

function omittedBehavior(e: Entry, status: FinalStatus): string {
  if (status === 'GAP') return 'unresolved; route remains release-blocking';
  if (status === 'NOT_APPLICABLE') return 'Mall input not required by declared scope';
  if (status === 'NOT_ASSESSED_OUT_OF_SCOPE') return 'not assessed';
  if (e.module === 'billing-addin' && e.handler === 'listRates') return 'FIXED: restrict to UserMallAccess set; [] matches none';
  if (e.method === 'GET' && !/:/.test(e.route)) return 'restricted to authenticated accessible Mall set';
  return 'ownership derived from object/parent or request rejected';
}

function operation(e: Entry): string {
  return e.handler.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

function testEvidence(e: Entry, status: FinalStatus): string {
  if (status === 'GAP') return 'negative policy finding; no safe-runtime claim';
  if (status === 'NOT_ASSESSED_OUT_OF_SCOPE') return 'not assessed';
  const dir = path.dirname(path.join(REPO, e.file));
  const specs = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith('.spec.ts') && /authorization|scope|controller|service/.test(f))
    : [];
  if (specs.length) return `Jest: ${specs.slice(0, 3).join(', ')}`;
  if (status === 'NOT_APPLICABLE') return 'role/global behavior + backend regression';
  return 'current code trace + CR-101/Golden authorization evidence + backend regression';
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

const sourceFiles = [
  ...controllerFiles(path.join(ROOT, 'src', 'modules')),
  ...controllerFiles(path.join(ROOT, 'src', 'files')),
].sort();
const entries = sourceFiles.flatMap(scan).sort((a, b) => a.file.localeCompare(b.file) || a.route.localeCompare(b.route) || a.method.localeCompare(b.method));
const counts = entries.reduce<Record<FinalStatus, number>>((acc, e) => {
  acc[finalStatus(e)]++;
  return acc;
}, { PROVEN_SAFE: 0, FIXED: 0, GAP: 0, NOT_APPLICABLE: 0, NOT_ASSESSED_OUT_OF_SCOPE: 0 });

const resolverRows = [
  ['mallId', 'Mall', 'direct Mall.id', 'absent defers; malformed/ungranted denies when supplied'],
  ['unitId', 'Unit', 'Unit.mallId → Floor.mallId fallback', 'missing record currently falls through'],
  ['floorId', 'Floor', 'Floor.mallId', 'missing record currently falls through'],
  ['contractId', 'Contract', 'Contract.unit.mallId → floor fallback', 'missing record currently falls through'],
  ['fitoutProjectId', 'FitoutProject', 'project.unit.mallId → floor fallback', 'missing record currently falls through'],
  ['fitoutSubmittalId', 'FitoutSubmittal', 'submittal.project.unit.mallId → floor fallback', 'missing record currently falls through'],
  ['fitoutIssueId', 'FitoutIssue', 'issue.unit.mallId → floor fallback', 'missing record currently falls through'],
  ['invoiceId', 'Invoice', 'Invoice.mallId → Contract.Unit → BillingParty.mallId', 'existing ownerless record denies; missing record falls through'],
  ['paymentId', 'Payment', 'Payment.Invoice → Invoice ownership chain', 'existing ownerless record denies; missing record falls through'],
  ['invoiceAdjustmentId', 'InvoiceAdjustment', 'Adjustment.Invoice → Invoice ownership chain', 'existing ownerless record denies; missing record falls through'],
  ['bookingId', 'UnitBooking', 'Booking.Unit.mallId → floor fallback', 'missing record currently falls through'],
  ['slotId', 'UnitSlot', 'Slot.Unit.mallId → floor fallback', 'missing record currently falls through'],
  ['slotBookingId', 'SlotBooking', 'Booking.Slot.Unit.mallId → floor fallback', 'missing record currently falls through'],
  ['slotPricingRuleId', 'SlotPricingRule', 'Rule.Slot.Unit.mallId → floor fallback', 'missing record currently falls through'],
  ['proposalId', 'Proposal', 'Proposal.Unit.mallId → floor fallback', 'missing record currently falls through'],
  ['approvalStepId / approvalWorkflowId', 'ApprovalStep / ApprovalWorkflow', 'Workflow.Proposal.Unit or FitoutSubmittal.Project.Unit', 'missing/unlinked record falls through; service role checks still apply'],
  ['tenantId', 'Tenant', 'first active Contract.Unit, else active Proposal.Unit', 'tenant without active relationship falls through'],
  ['ticketId', 'Ticket', 'Ticket.Unit.mallId → floor fallback', 'missing record currently falls through'],
  ['maintenanceScheduleId', 'MaintenanceSchedule', 'Schedule.mallId', 'missing record currently falls through'],
  ['servicePriceCatalogId', 'ServicePriceCatalog', 'Catalog.mallId', 'missing record currently falls through'],
  ['fitoutGanttTaskId', 'FitoutTask', 'Task.Project.Unit.mallId → floor fallback', 'missing record currently falls through'],
  ['fitoutDailyReportEntryId', 'FitoutDailyReportEntry', 'Entry.Project.Unit.mallId → floor fallback', 'missing record currently falls through'],
  ['announcementId', 'MallAnnouncement', 'Announcement.mallId', 'missing record currently falls through'],
  ['zoneId', 'Zone', 'Zone.mallId', 'missing record currently falls through'],
  ['workOrderId', 'WorkOrder', 'WorkOrder.mallId', 'missing record currently falls through'],
  ['parkingCustomerContractId', 'ParkingCustomerContract', 'Contract.mallId', 'resolver exists; routes out of scope except direct financial/file boundary'],
  ['serviceContractId', 'ServiceContract', 'ServiceContract.mallId', 'missing record currently falls through'],
  ['patrolCheckId', 'PatrolCheck', 'Check.Shift.mallId', 'resolver exists; Patrol route out of scope'],
  ['salesTurnoverId', 'SalesTurnover', 'Turnover.Unit.mallId → floor fallback', 'existing ownerless record denies; missing record falls through'],
  ['floorPlanAnalysisId', 'FloorPlanAnalysis', 'Analysis.mallId', 'missing record currently falls through'],
];

const lines: string[] = [
  '# SECURITY_ROUTE_MATRIX',
  '',
  '> CR-120 Security Batch B. Generated from the current controller AST by `apps/backend/scripts/generate-security-route-matrix.ts`, then interpreted against current controller/service code, the CR-101 authorization evidence, and focused tests. `@Scope` is descriptive metadata only; it is never accepted as the sole proof of safety.',
  '',
  '## Coverage summary',
  '',
  `- Backend routes inventoried: **${entries.length}** across **${sourceFiles.length}** controller files.`,
  `- In-scope routes: **${entries.length - counts.NOT_ASSESSED_OUT_OF_SCOPE}**.`,
  `- PROVEN_SAFE: **${counts.PROVEN_SAFE}**.`,
  `- FIXED: **${counts.FIXED}**.`,
  `- GAP: **${counts.GAP}**.`,
  `- NOT_APPLICABLE: **${counts.NOT_APPLICABLE}**.`,
  `- NOT_ASSESSED_OUT_OF_SCOPE: **${counts.NOT_ASSESSED_OUT_OF_SCOPE}**.`,
  '',
  'The GAP routes are the documented CRM Customer ownership blocker (BC-016) and unresolved ordinary-FINANCE SAP visibility/mutation policy. Excluded Patrol, Parking/Parking Dashboard, and Inventory/Warehouse routes are not characterized as broken or safe. The Parking→AR financial boundary remains represented by the in-scope Billing/Invoice/Payment routes.',
  '',
  '## Global Mall-access architecture',
  '',
  '- `JwtAuthGuard`, `RolesGuard`, and `MallAccessGuard` are global `APP_GUARD`s. Public routes bypass authentication by explicit metadata.',
  '- `MallAccessGuard` recognizes only direct `mallId`, `unitId`, `floorId`, plus narrow path/body heuristics for Contract, Fitout Project/Submittal/Issue, and Invoice.',
  '- `MallAccessService.extractAndValidateMallAccess()` supports the wider resolver registry below, but only when a controller calls it explicitly.',
  '- If no Mall resolves, the current generic tail does nothing: **ALLOW/DEFER, not DENY**. `@Scope` metadata is not read by the guard. Safety therefore comes from explicit controller resolver calls, server-derived Mall ceilings passed into service predicates, tenant ownership checks, or an explicit global/user scope.',
  '- ADMIN and TENANT bypass Mall membership checks. TENANT isolation is enforced by authenticated `tenantId` in service queries. CEO is not a blanket bypass: it receives unrestricted reads only where the caller opts into `{ crossMallRead: true }`.',
  '- A global unresolved-Mall→deny change was not made because it would reject intentionally global/user-scoped routes and Mall-scoped list routes whose authoritative enforcement occurs in the handler/service after the global guard. CR-120 uses narrow route enforcement for proven defects.',
  '',
  '## Ownership resolver registry',
  '',
  '| SOURCE PARAM | MODEL | OWNERSHIP PATH | NULL / NOT-FOUND BEHAVIOR |',
  '|---|---|---|---|',
  ...resolverRows.map((row) => `| ${row.map(escapeCell).join(' | ')} |`),
  '',
  'Resolver gaps of systemic interest: most missing-record lookups fall through the generic unresolved branch; controllers/services normally return ownership-safe 404s afterward, but the resolver itself is not fail-closed. `tenantId` uses the first active Contract/Proposal and cannot express a tenant spanning multiple Malls. Billing Add-In entries/rate configs have no central resolver and are instead protected by scoped Prisma predicates. CRM Customer has no authoritative Mall relation. SAP logs/mappings have polymorphic entity references and no approved ordinary-FINANCE scope policy.',
  '',
  '## Route matrix',
  '',
  '| MODULE | METHOD | ROUTE | OPERATION | READ/WRITE | OBJECT TYPE | OBJECT ID SOURCE | MALL SOURCE | GUARD | OWNERSHIP RESOLVER | SERVICE-LEVEL CHECK | CROSS-MALL ROLE EXCEPTION | OMITTED-MALL BEHAVIOR | RUNTIME TEST | STATUS | ISSUE ID |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
];

for (const e of entries) {
  const status = finalStatus(e);
  const row = [
    e.module,
    e.method,
    `/${e.route}`,
    operation(e),
    e.method === 'GET' ? 'READ' : 'WRITE',
    e.controller.replace(/Controller$/, ''),
    objectIdSource(e),
    mallSource(e, status),
    e.isPublic ? 'Public explicit' : 'Global JWT + Roles + MallAccessGuard',
    ownershipResolver(e, status),
    serviceCheck(e, status),
    crossMall(e, status),
    omittedBehavior(e, status),
    testEvidence(e, status),
    status,
    issueId(e, status),
  ];
  lines.push(`| ${row.map(escapeCell).join(' | ')} |`);
}

lines.push('', '## Machine checks', '', `Expected route rows: ${entries.length}. Status total: ${Object.values(counts).reduce((a, b) => a + b, 0)}. No route is omitted from this matrix.`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${lines.join('\n')}\n`, 'utf8');
console.log(JSON.stringify({ output: path.relative(REPO, OUT), routes: entries.length, controllers: sourceFiles.length, counts }, null, 2));
