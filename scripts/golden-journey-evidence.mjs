// Read-only Golden ERP journey coverage verifier.
//
// This script measures whether the current local fixture contains linked data
// for important cross-module journey segments. It never mutates the database
// and it does not treat fixture coverage as human UAT completion.
//
// Usage: node scripts/golden-journey-evidence.mjs
// Env:   POSTGRES_SERVICE (default "postgres"), POSTGRES_USER (default "leasing"),
//        POSTGRES_DB (default "leasing_platform"), REQUIRE_COMPLETE=true to
//        return a failing exit code when any required fixture is missing.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const service = process.env.POSTGRES_SERVICE ?? 'postgres';
const user = process.env.POSTGRES_USER ?? 'leasing';
const db = process.env.POSTGRES_DB ?? 'leasing_platform';

export const JOURNEY_REQUIREMENTS = [
  {
    key: 'approved_lead_to_contract',
    journey: 'UAT-01/02/03/05 support',
    description: 'Lead → Booking → approved Proposal workflow → Contract',
    minimum: 1,
  },
  {
    key: 'active_contract_handoffs',
    journey: 'UAT-06 support',
    description: 'Active Contract with both Fitout Project and Billing Schedule',
    minimum: 1,
  },
  {
    key: 'invoice_to_payment',
    journey: 'UAT-08 support',
    description: 'Invoice with a persisted Payment',
    minimum: 1,
  },
  {
    key: 'completed_ticket',
    journey: 'UAT-07 support',
    description: 'Resolved or closed operational Ticket',
    minimum: 1,
  },
  {
    key: 'rejected_workflow',
    journey: 'UAT-04 fixture',
    description: 'Rejected Proposal approval workflow',
    minimum: 1,
  },
  {
    key: 'lead_to_collection',
    journey: 'Full Golden journey fixture',
    description: 'Lead → Booking → Proposal → Contract → Invoice → Payment',
    minimum: 1,
  },
  {
    key: 'mall_count',
    journey: 'UAT-10 fixture',
    description: 'Distinct Malls available for cross-Mall verification',
    minimum: 2,
  },
  {
    key: 'persisted_currency_count',
    journey: 'Currency-variant support',
    description: 'Distinct persisted Contract/Invoice currencies',
    minimum: 3,
  },
];

const COVERAGE_SQL = `
  SELECT 'approved_lead_to_contract', count(DISTINCT c.id)::bigint
  FROM "Contract" c
  JOIN "Proposal" p ON p.id = c."proposalId"
  JOIN "UnitBooking" b ON b.id = p."bookingId"
  JOIN "Lead" l ON l.id = b."leadId"
  JOIN "ApprovalWorkflow" aw ON aw."proposalId" = p.id AND aw.status = 'APPROVED'

  UNION ALL
  SELECT 'active_contract_handoffs', count(*)::bigint
  FROM "Contract" c
  WHERE c.status IN ('ACTIVE', 'EXPIRING') AND c."isActive" = true
    AND EXISTS (SELECT 1 FROM "FitoutProject" f WHERE f."contractId" = c.id)
    AND EXISTS (SELECT 1 FROM "BillingScheduleEntry" s WHERE s."contractId" = c.id)

  UNION ALL
  SELECT 'invoice_to_payment', count(DISTINCT i.id)::bigint
  FROM "Invoice" i JOIN "Payment" p ON p."invoiceId" = i.id

  UNION ALL
  SELECT 'completed_ticket', count(*)::bigint
  FROM "Ticket" WHERE status IN ('RESOLVED', 'CLOSED')

  UNION ALL
  SELECT 'rejected_workflow', count(*)::bigint
  FROM "ApprovalWorkflow" WHERE status = 'REJECTED'

  UNION ALL
  SELECT 'lead_to_collection', count(DISTINCT c.id)::bigint
  FROM "Contract" c
  JOIN "Proposal" p ON p.id = c."proposalId"
  JOIN "UnitBooking" b ON b.id = p."bookingId"
  JOIN "Lead" l ON l.id = b."leadId"
  JOIN "Invoice" i ON i."contractId" = c.id
  JOIN "Payment" pay ON pay."invoiceId" = i.id

  UNION ALL
  SELECT 'mall_count', count(*)::bigint FROM "Mall"

  UNION ALL
  SELECT 'persisted_currency_count', count(DISTINCT currency)::bigint
  FROM (
    SELECT "currencyCode"::text AS currency FROM "Contract"
    UNION ALL
    SELECT "currencyCode"::text AS currency FROM "Invoice"
  ) currencies;
`;

export function classifyJourneyEvidence(counts, requirements = JOURNEY_REQUIREMENTS) {
  return requirements.map((requirement) => {
    const count = Number(counts[requirement.key] ?? 0);
    return {
      ...requirement,
      count,
      status: count >= requirement.minimum ? 'EVIDENCED' : 'MISSING',
    };
  });
}

export function parseCoverageRows(output) {
  return Object.fromEntries(
    output
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [key, value] = line.split('|');
        return [key, Number(value)];
      }),
  );
}

function readCoverage() {
  const result = spawnSync(
    'docker',
    ['compose', 'exec', '-T', service, 'psql', '-U', user, '-d', db, '-v', 'ON_ERROR_STOP=1', '-tA', '-F', '|', '-c', COVERAGE_SQL],
    { encoding: 'utf8', shell: false },
  );
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'Unable to query journey evidence').trim());
  }
  return parseCoverageRows(result.stdout);
}

function main() {
  const rows = classifyJourneyEvidence(readCoverage());
  console.log('Golden ERP Journey Evidence — read-only fixture coverage');
  console.table(rows.map(({ journey, description, count, minimum, status }) => ({ journey, description, count, minimum, status })));
  const evidenced = rows.filter((row) => row.status === 'EVIDENCED').length;
  const missing = rows.length - evidenced;
  console.log(`Coverage summary: ${evidenced}/${rows.length} evidenced, ${missing} missing.`);
  console.log('This is automated fixture evidence, not human UAT sign-off.');
  if (process.env.REQUIRE_COMPLETE === 'true' && missing) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
