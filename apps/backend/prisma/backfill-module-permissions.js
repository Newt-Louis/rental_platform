// One-off data backfill: seeds the ModulePermission table (the DB-backed
// matrix behind /admin?section=permissions and RolesGuard's dynamic module
// override) on an environment whose migrations ran via `prisma migrate
// deploy` -- which only creates the table, it never inserts rows. Without
// this, the table stays empty and every module simply falls back to the
// static MODULE_ROLES rule (safe, but the Admin UI shows nothing to edit
// yet).
//
// Purely additive: every insert uses createMany({ skipDuplicates: true }),
// so running this more than once, or after an Admin has already customized
// rows via the UI, never overwrites anything -- it only fills gaps. Safe to
// run against a live environment with real data.
//
// Plain JS (not .ts) on purpose: the production image has no ts-node, so
// this needs to run with a bare `node` there; it also runs fine with `node`
// in dev, so there's no separate .ts twin to keep in sync.
//
// Usage (dev):  docker compose exec backend node prisma/backfill-module-permissions.js
// Usage (prod): docker cp prisma/backfill-module-permissions.js <container>:/app/prisma/
//               docker exec <container> node prisma/backfill-module-permissions.js
'use strict';

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const GLOBAL_MALL_KEY = 'GLOBAL';

const MODULE_PERMISSION_DEFAULTS = [
  { module: 'dashboard', roles: ['CEO', 'MALL_DIRECTOR', 'LEASING_MANAGER', 'LEASING_EXECUTIVE', 'FINANCE', 'LEGAL', 'OPERATION'] },
  { module: 'spaces', roles: ['MALL_DIRECTOR', 'LEASING_MANAGER', 'LEASING_EXECUTIVE', 'FINANCE', 'LEGAL', 'OPERATION'] },
  { module: 'crm', roles: ['LEASING_MANAGER', 'LEASING_EXECUTIVE', 'MALL_DIRECTOR'] },
  { module: 'bookings', roles: ['LEASING_MANAGER', 'LEASING_EXECUTIVE', 'MALL_DIRECTOR'] },
  { module: 'proposals', roles: ['LEASING_MANAGER', 'LEASING_EXECUTIVE', 'MALL_DIRECTOR', 'CEO'] },
  { module: 'approvals', roles: ['LEASING_MANAGER', 'MALL_DIRECTOR', 'FINANCE', 'LEGAL', 'CEO', 'OPERATION'] },
  { module: 'contracts', roles: ['LEASING_MANAGER', 'MALL_DIRECTOR', 'FINANCE', 'LEGAL'] },
  { module: 'tenants', roles: ['LEASING_MANAGER', 'LEASING_EXECUTIVE', 'MALL_DIRECTOR', 'FINANCE', 'LEGAL'] },
  { module: 'fitout', roles: ['OPERATION', 'LEASING_MANAGER', 'MALL_DIRECTOR'] },
  { module: 'fitout-dossier-view', roles: ['LEASING_MANAGER', 'LEASING_EXECUTIVE', 'MALL_DIRECTOR', 'FINANCE', 'LEGAL', 'FITOUT_BASIC_TEAM'] },
  { module: 'tickets', roles: ['OPERATION', 'MALL_DIRECTOR', 'LEASING_MANAGER', 'TENANT'] },
  { module: 'sales', roles: ['FINANCE', 'MALL_DIRECTOR', 'CEO', 'TENANT'] },
  { module: 'billing', roles: ['FINANCE', 'MALL_DIRECTOR', 'TENANT'] },
  { module: 'billing-addin', roles: ['OPERATION', 'MALL_DIRECTOR', 'FINANCE'] },
  { module: 'sap', roles: ['FINANCE'] },
  { module: 'reports', roles: ['FINANCE', 'MALL_DIRECTOR', 'CEO', 'LEASING_MANAGER'] },
  { module: 'analytics', roles: ['FINANCE', 'MALL_DIRECTOR', 'CEO', 'LEASING_MANAGER'] },
  { module: 'ai', roles: ['LEASING_MANAGER', 'MALL_DIRECTOR', 'CEO'] },
  { module: 'admin', roles: [] },
  { module: 'announcements', roles: ['MALL_DIRECTOR', 'OPERATION', 'LEASING_MANAGER', 'TENANT'] },
  { module: 'cross-mall', roles: ['CEO'] },
  { module: 'audit-log', roles: ['CEO'] },
  { module: 'parking', roles: ['CEO', 'MALL_DIRECTOR', 'FINANCE', 'OPERATION'] },
  { module: 'crm-overview', roles: ['LEASING_MANAGER', 'LEASING_EXECUTIVE', 'MALL_DIRECTOR'] },
  { module: 'deal-pipeline', roles: ['LEASING_MANAGER', 'LEASING_EXECUTIVE', 'MALL_DIRECTOR', 'CEO'] },
  { module: 'pipeline-stats', roles: ['LEASING_MANAGER', 'LEASING_EXECUTIVE', 'MALL_DIRECTOR', 'CEO'] },
  { module: 'fitout-approvals', roles: ['OPERATION', 'LEASING_MANAGER', 'MALL_DIRECTOR'] },
  { module: 'service-contracts', roles: ['CEO', 'LEASING_MANAGER', 'MALL_DIRECTOR', 'FINANCE', 'LEGAL', 'OPERATION'] },
  { module: 'inventory', roles: ['CEO', 'MALL_DIRECTOR', 'FINANCE', 'OPERATION'] },
  { module: 'work-orders', roles: ['CEO', 'MALL_DIRECTOR', 'OPERATION', 'LEASING_MANAGER'] },
  { module: 'patrol', roles: ['CEO', 'MALL_DIRECTOR', 'OPERATION'] },
  { module: 'parking-report', roles: ['CEO', 'MALL_DIRECTOR', 'FINANCE', 'OPERATION'] },
  { module: 'parking-transaction', roles: ['CEO', 'MALL_DIRECTOR', 'FINANCE', 'OPERATION'] },
  { module: 'tenant-portal', roles: ['TENANT', 'MALL_DIRECTOR', 'LEASING_MANAGER', 'LEASING_EXECUTIVE', 'OPERATION'] },
];

async function main() {
  const { count: globalCount } = await prisma.modulePermission.createMany({
    data: MODULE_PERMISSION_DEFAULTS.flatMap(({ module, roles }) =>
      roles.map((role) => ({ module, role, mallId: GLOBAL_MALL_KEY, allowed: true })),
    ),
    skipDuplicates: true,
  });
  console.log(`Global defaults: inserted ${globalCount} new row(s) (existing rows left untouched).`);

  const allMalls = await prisma.mall.findMany({ select: { id: true, name: true } });
  const globalRows = await prisma.modulePermission.findMany({ where: { mallId: GLOBAL_MALL_KEY } });
  let totalMallRows = 0;
  for (const mall of allMalls) {
    const { count } = await prisma.modulePermission.createMany({
      data: globalRows.map((row) => ({ module: row.module, role: row.role, mallId: mall.id, allowed: row.allowed })),
      skipDuplicates: true,
    });
    totalMallRows += count;
    console.log(`  Mall "${mall.name}" (${mall.id}): inserted ${count} new row(s).`);
  }
  console.log(`Done. ${allMalls.length} Mall(s) processed, ${totalMallRows} Mall-scoped row(s) inserted in total.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
