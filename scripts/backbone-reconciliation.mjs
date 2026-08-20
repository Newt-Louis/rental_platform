// Backbone Consolidation Gate (docs/program/06-BACKBONE-RECONCILIATION.md): read-only
// cross-module invariant checks. Every query here expects ZERO rows for a healthy system —
// a non-empty result is a real, reportable inconsistency, not a warning to ignore.
//
// Runs entirely via `docker compose exec psql` (same pattern as scripts/verify-database-restore.mjs)
// rather than importing @prisma/client, so it has no dependency on which workspace it's run
// from and never mutates data — every query is a SELECT.
//
// Usage: node scripts/backbone-reconciliation.mjs
// Env:   POSTGRES_SERVICE (default "postgres"), POSTGRES_USER (default "leasing"),
//        POSTGRES_DB (default "leasing_platform")
import { spawnSync } from 'node:child_process';

const service = process.env.POSTGRES_SERVICE ?? 'postgres';
const user = process.env.POSTGRES_USER ?? 'leasing';
const db = process.env.POSTGRES_DB ?? 'leasing_platform';

const CHECKS = [
  {
    name: 'ACTIVE/EXPIRING contracts without any BillingScheduleEntry',
    severity: 'P1 if the contract was activated through the app; P3 (seed/data-hygiene) if constructed directly',
    sql: `
      SELECT c.id, c."contractNumber", c.status
      FROM "Contract" c
      WHERE c.status IN ('ACTIVE','EXPIRING') AND c."isActive" = true
        AND NOT EXISTS (SELECT 1 FROM "BillingScheduleEntry" b WHERE b."contractId" = c.id)
      ORDER BY c."createdAt";
    `,
  },
  {
    name: 'ACTIVE/EXPIRING contracts without any FitoutProject',
    severity: 'P1',
    sql: `
      SELECT c.id, c."contractNumber", c.status
      FROM "Contract" c
      WHERE c.status IN ('ACTIVE','EXPIRING') AND c."isActive" = true
        AND NOT EXISTS (SELECT 1 FROM "FitoutProject" f WHERE f."contractId" = c.id)
      ORDER BY c."createdAt";
    `,
  },
  {
    name: 'Multiple Contracts per Proposal (duplicate conversion)',
    severity: 'P0',
    sql: `
      SELECT "proposalId", count(*) AS contract_count
      FROM "Contract" WHERE "proposalId" IS NOT NULL
      GROUP BY "proposalId" HAVING count(*) > 1;
    `,
  },
  {
    name: 'Multiple FitoutProjects per Contract (duplicate auto-create)',
    severity: 'P0',
    sql: `
      SELECT "contractId", count(*) AS project_count
      FROM "FitoutProject" GROUP BY "contractId" HAVING count(*) > 1;
    `,
  },
  {
    name: 'Multiple ApprovalWorkflows per Proposal (duplicate submit)',
    severity: 'P0',
    sql: `
      SELECT "proposalId", count(*) AS workflow_count
      FROM "ApprovalWorkflow" WHERE "proposalId" IS NOT NULL
      GROUP BY "proposalId" HAVING count(*) > 1;
    `,
  },
  {
    name: 'TERMINATED/TERMINATING contracts whose FitoutProject is not at a terminal-ish stage',
    severity: 'P1 — advanceStatus does not currently check Contract.status at all (code-verified, docs/program/06-BACKBONE-CONSOLIDATION.md)',
    sql: `
      SELECT c."contractNumber", c.status AS contract_status, f.status AS fitout_status
      FROM "Contract" c
      JOIN "FitoutProject" f ON f."contractId" = c.id
      WHERE c.status IN ('TERMINATING','TERMINATED') AND f.status NOT IN ('OPENED');
    `,
  },
  {
    name: 'Active invoices whose Contract is soft-deleted',
    severity: 'P1',
    sql: `
      SELECT i."invoiceNumber", i.status, c."contractNumber", c."deletedAt"
      FROM "Invoice" i
      JOIN "Contract" c ON c.id = i."contractId"
      WHERE c."deletedAt" IS NOT NULL AND i."isActive" = true;
    `,
  },
  {
    name: 'FitoutProject at OPENED but its Unit is not OCCUPIED (handover/unit-status desync)',
    severity: 'P1',
    sql: `
      SELECT c."contractNumber", f.status AS fitout_status, u.code AS unit_code, u.status AS unit_status
      FROM "FitoutProject" f
      JOIN "Contract" c ON c.id = f."contractId"
      JOIN "Unit" u ON u.id = f."unitId"
      WHERE f.status = 'OPENED' AND u.status != 'OCCUPIED';
    `,
  },
  {
    name: 'Orphan ApprovalWorkflow (PROPOSAL/FITOUT_SUBMITTAL entityType with no matching owner record)',
    severity: 'P2',
    sql: `
      SELECT aw.id, aw."entityType", aw."entityId", aw.status
      FROM "ApprovalWorkflow" aw
      WHERE aw."entityType" = 'PROPOSAL' AND NOT EXISTS (SELECT 1 FROM "Proposal" p WHERE p.id = aw."entityId")
      UNION ALL
      SELECT aw.id, aw."entityType", aw."entityId", aw.status
      FROM "ApprovalWorkflow" aw
      WHERE aw."entityType" = 'FITOUT_SUBMITTAL' AND NOT EXISTS (SELECT 1 FROM "FitoutSubmittal" s WHERE s."workflowId" = aw.id);
    `,
  },
  // ── Phase 6 (docs/program/07-CRM-BOOKING-COMPLETION.md) — Booking invariants ──────────────
  {
    name: 'ACTIVE/PENDING bookings referencing an inactive or deleted Unit',
    severity: 'P1',
    sql: `
      SELECT b."bookingNumber", b.status, u.code, u."isActive"
      FROM "UnitBooking" b
      JOIN "Unit" u ON u.id = b."unitId"
      WHERE b."isActive" = true AND b.status IN ('ACTIVE','PENDING') AND u."isActive" = false;
    `,
  },
  {
    name: 'Multiple ACTIVE bookings for the same Unit (queue-priority-1 duplicate)',
    severity: 'P0',
    sql: `
      SELECT "unitId", count(*) AS active_count
      FROM "UnitBooking" WHERE "isActive" = true AND status = 'ACTIVE'
      GROUP BY "unitId" HAVING count(*) > 1;
    `,
  },
  {
    name: 'Unit locked as BOOKING/NEGOTIATING with no corresponding ACTIVE/PENDING booking (orphaned lock)',
    severity: 'P1',
    sql: `
      SELECT u.code, u.status
      FROM "Unit" u
      WHERE u.status IN ('BOOKING','NEGOTIATING') AND u."isActive" = true
        AND NOT EXISTS (
          SELECT 1 FROM "UnitBooking" b
          WHERE b."unitId" = u.id AND b."isActive" = true AND b.status IN ('ACTIVE','PENDING')
        );
    `,
  },
  {
    name: 'Proposal.bookingId referencing a Booking that no longer exists or was never CONVERTED',
    severity: 'P2',
    sql: `
      SELECT p."proposalNumber", p."bookingId", b.status AS booking_status
      FROM "Proposal" p
      LEFT JOIN "UnitBooking" b ON b.id = p."bookingId"
      WHERE p."bookingId" IS NOT NULL AND (b.id IS NULL OR b.status != 'CONVERTED');
    `,
  },

  // --- Multi-currency foundation (docs/program/MULTI_CURRENCY_ARCHITECTURE.md) ---
  // Booking → Proposal is a deliberate SNAPSHOT (a sales rep may re-quote a deal in a
  // different currency at conversion time), so it is not checked here. Everything
  // downstream of Proposal is a REFERENCE/DERIVED invariant that must never drift.
  {
    name: 'Contract.currencyCode does not match its source Proposal.rentCurrency',
    severity: 'P0 -- ContractsService.create() must force this; a mismatch means the override was bypassed',
    sql: `
      SELECT c."contractNumber", c."currencyCode" AS contract_currency, p."rentCurrency" AS proposal_currency
      FROM "Contract" c
      JOIN "Proposal" p ON p.id = c."proposalId"
      WHERE c."currencyCode" != p."rentCurrency";
    `,
  },
  {
    name: 'BillingScheduleEntry.currencyCode does not match its Contract.currencyCode',
    severity: 'P0',
    sql: `
      SELECT b.id, b.period, b."currencyCode" AS entry_currency, c."currencyCode" AS contract_currency
      FROM "BillingScheduleEntry" b
      JOIN "Contract" c ON c.id = b."contractId"
      WHERE b."currencyCode" != c."currencyCode";
    `,
  },
  {
    name: 'Invoice.currencyCode does not match its source Contract.currencyCode (LEASE_CONTRACT invoices only)',
    severity: 'P0',
    sql: `
      SELECT i."invoiceNumber", i."currencyCode" AS invoice_currency, c."currencyCode" AS contract_currency
      FROM "Invoice" i
      JOIN "Contract" c ON c.id = i."contractId"
      WHERE i."sourceType" = 'LEASE_CONTRACT' AND i."currencyCode" != c."currencyCode";
    `,
  },
  {
    name: 'Payment.currencyCode does not match its Invoice.currencyCode',
    severity: 'P0 -- BillingService.recordPayment() must force this; a mismatch means an unsupported cross-currency payment slipped through',
    sql: `
      SELECT pay.id, pay."currencyCode" AS payment_currency, i."currencyCode" AS invoice_currency, i."invoiceNumber"
      FROM "Payment" pay
      JOIN "Invoice" i ON i.id = pay."invoiceId"
      WHERE pay."currencyCode" != i."currencyCode";
    `,
  },
];

function runQuery(sql) {
  const result = spawnSync(
    'docker',
    ['compose', 'exec', '-T', service, 'psql', '-U', user, '-d', db, '-t', '-A', '-c', sql],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(`psql failed (exit ${result.status}): ${result.stderr || result.stdout}`);
  }
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

const results = [];
for (const check of CHECKS) {
  try {
    const rows = runQuery(check.sql);
    results.push({ ...check, status: rows.length === 0 ? 'CLEAN' : 'FOUND', rows });
  } catch (error) {
    results.push({ ...check, status: 'ERROR', rows: [], error: error.message });
  }
}

console.log('Backbone Reconciliation — read-only cross-module invariant checks\n');
for (const r of results) {
  console.log(`[${r.status}] ${r.name}`);
  if (r.status === 'FOUND') {
    console.log(`  severity: ${r.severity}`);
    for (const row of r.rows) console.log(`  - ${row}`);
  }
  if (r.status === 'ERROR') console.log(`  error: ${r.error}`);
  console.log('');
}

const found = results.filter((r) => r.status === 'FOUND');
const errored = results.filter((r) => r.status === 'ERROR');
console.log(`Summary: ${results.length - found.length - errored.length}/${results.length} clean, ${found.length} found issues, ${errored.length} errored.`);
process.exitCode = found.length || errored.length ? 1 : 0;
