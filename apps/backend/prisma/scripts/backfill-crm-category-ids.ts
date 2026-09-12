/**
 * CR-CRM-CATEGORY-MASTER-001 — backfill `Lead.categoryId` and
 * `Customer.preferredCategoryId` from the legacy free-text columns.
 *
 * WHY THIS EXISTS
 * ---------------
 * The CRM only ever wrote free text, from three incompatible vocabularies, so
 * `Lead.categoryId` and `Customer.preferredCategoryId` were null on every row.
 * The application is now canonical-first; this links the rows created before
 * that.
 *
 * SAFETY CONTRACT
 * ---------------
 *   - DRY RUN BY DEFAULT. Nothing is written unless `--apply` is passed.
 *   - Non-destructive: only rows where the FK is currently NULL and the legacy
 *     text is non-empty are candidates. An already-linked row is never touched,
 *     which also makes a second run a no-op (idempotent).
 *   - Never guesses. A legacy value is auto-migrated only when it resolves to
 *     exactly ONE Category by EXACT name, CASE-ONLY difference, or an explicit
 *     reviewed alias. AMBIGUOUS and NO_MATCH are reported and left alone.
 *   - Creates nothing. Unlike prisma/scripts/migrate-categories.ts (superseded,
 *     see below) it never mints a Category from an unrecognised string.
 *   - Transaction-safe: all writes happen in one transaction, so the run either
 *     lands completely or not at all.
 *   - Auditable: prints the full mapping table before any write.
 *
 * SUPERSEDES prisma/scripts/migrate-categories.ts, which auto-created Category
 * master records from arbitrary legacy strings, had no dry run and no ambiguity
 * handling. Do not run that one.
 *
 * USAGE
 *   npx ts-node prisma/scripts/backfill-crm-category-ids.ts            # dry run
 *   npx ts-node prisma/scripts/backfill-crm-category-ids.ts --apply    # migrate
 *   npx ts-node prisma/scripts/backfill-crm-category-ids.ts --json     # machine-readable
 */

import { PrismaClient } from '@prisma/client';
import {
  classify,
  type MappingRow,
  type MasterCategory,
} from '../../src/modules/crm/category-backfill-rules';

const prisma = new PrismaClient();

function renderTable(rows: MappingRow[]) {
  const header = [
    'ENTITY',
    'LEGACY VALUE',
    'COUNT',
    'CANDIDATE ID',
    'CANDIDATE NAME',
    'METHOD',
    'CONF',
    'AUTO',
    'REASON',
  ];
  const body = rows.map((r) => [
    r.entity,
    r.legacyValue,
    String(r.recordCount),
    r.candidateId ?? '-',
    r.candidateName ?? '-',
    r.method,
    r.confidence,
    r.autoMigrate ? 'YES' : 'NO',
    r.reason,
  ]);
  const all = [header, ...body];
  const widths = header.map((_, i) => Math.max(...all.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  console.log(line(header));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const r of body) console.log(line(r));
}

async function main() {
  const apply = process.argv.includes('--apply');
  const asJson = process.argv.includes('--json');

  const master: MasterCategory[] = await prisma.category.findMany({
    select: { id: true, code: true, name: true, isActive: true },
  });

  const leads = await prisma.lead.findMany({
    where: { categoryId: null, category: { not: null }, deletedAt: null },
    select: { id: true, category: true },
  });
  const customers = await prisma.customer.findMany({
    where: { preferredCategoryId: null, preferredCategory: { not: null }, deletedAt: null },
    select: { id: true, preferredCategory: true, leads: { select: { categoryId: true } } },
  });

  // Lead mapping
  const leadCounts = new Map<string, number>();
  for (const lead of leads) {
    const value = (lead.category ?? '').trim();
    if (!value) continue;
    leadCounts.set(value, (leadCounts.get(value) ?? 0) + 1);
  }

  const rows: MappingRow[] = [];
  const leadDecision = new Map<string, MappingRow>();
  for (const [value, count] of [...leadCounts.entries()].sort((a, b) => b[1] - a[1])) {
    const row: MappingRow = {
      entity: 'Lead',
      legacyValue: value,
      recordCount: count,
      ...classify(value, master),
    };
    rows.push(row);
    leadDecision.set(value, row);
  }

  // Customer mapping.
  //
  // A Customer may descend from a Lead. `Lead.customerId` is the authoritative
  // provenance link (written by createFromLead), so when every Lead attached to
  // a Customer already carries the SAME canonical categoryId, that relationship
  // is stronger evidence than any text match and is used directly. Customers
  // whose leads disagree, or who have no linked lead with a categoryId, fall
  // back to the same safe text rules. Name similarity is never used.
  const customerCounts = new Map<string, number>();
  const customerByProvenance: Array<{ id: string; categoryId: string }> = [];
  for (const customer of customers) {
    const value = (customer.preferredCategory ?? '').trim();
    if (!value) continue;
    const linked = [...new Set(customer.leads.map((l) => l.categoryId).filter(Boolean))] as string[];
    if (linked.length === 1) {
      customerByProvenance.push({ id: customer.id, categoryId: linked[0] });
      continue;
    }
    customerCounts.set(value, (customerCounts.get(value) ?? 0) + 1);
  }

  const customerDecision = new Map<string, MappingRow>();
  for (const [value, count] of [...customerCounts.entries()].sort((a, b) => b[1] - a[1])) {
    const row: MappingRow = {
      entity: 'Customer',
      legacyValue: value,
      recordCount: count,
      ...classify(value, master),
    };
    rows.push(row);
    customerDecision.set(value, row);
  }

  if (customerByProvenance.length > 0) {
    const byCategory = new Map<string, number>();
    for (const c of customerByProvenance) {
      byCategory.set(c.categoryId, (byCategory.get(c.categoryId) ?? 0) + 1);
    }
    for (const [categoryId, count] of byCategory) {
      const cat = master.find((m) => m.id === categoryId);
      rows.push({
        entity: 'Customer',
        legacyValue: '<tu Lead da lien ket>',
        recordCount: count,
        candidateId: categoryId,
        candidateName: cat?.name ?? '(khong tim thay)',
        method: 'EXACT',
        confidence: 'HIGH',
        autoMigrate: Boolean(cat?.isActive),
        reason: 'Provenance: moi Lead lien ket deu tro toi cung mot Category',
      });
    }
  }

  // Report
  const leadAuto = leads.filter((l) => leadDecision.get((l.category ?? '').trim())?.autoMigrate).length;
  const leadAmbiguous = leads.filter(
    (l) => leadDecision.get((l.category ?? '').trim())?.method === 'AMBIGUOUS',
  ).length;
  const leadNoMatch = leads.filter(
    (l) => leadDecision.get((l.category ?? '').trim())?.method === 'NO_MATCH',
  ).length;

  const provenanceAuto = customerByProvenance.filter(
    (c) => master.find((m) => m.id === c.categoryId)?.isActive,
  ).length;
  const customerTextAuto = customers.filter((c) => {
    if (customerByProvenance.some((p) => p.id === c.id)) return false;
    return customerDecision.get((c.preferredCategory ?? '').trim())?.autoMigrate;
  }).length;
  const customerAuto = customerTextAuto + provenanceAuto;
  const customerAmbiguous = customers.filter(
    (c) => customerDecision.get((c.preferredCategory ?? '').trim())?.method === 'AMBIGUOUS',
  ).length;
  const customerNoMatch = customers.filter(
    (c) => customerDecision.get((c.preferredCategory ?? '').trim())?.method === 'NO_MATCH',
  ).length;

  const summary = {
    mode: apply ? 'APPLY' : 'DRY RUN',
    masterCategories: master.length,
    lead: { total: leads.length, autoMappable: leadAuto, ambiguous: leadAmbiguous, noMatch: leadNoMatch },
    customer: {
      total: customers.length,
      autoMappable: customerAuto,
      ambiguous: customerAmbiguous,
      noMatch: customerNoMatch,
      fromProvenance: customerByProvenance.length,
    },
    rows,
  };

  if (asJson) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`\n=== CR-CRM-CATEGORY-MASTER-001 CRM category backfill (${summary.mode}) ===\n`);
    console.log(`Category master records: ${master.length}\n`);
    if (rows.length === 0) {
      console.log('Khong co ban ghi nao can backfill.\n');
    } else {
      renderTable(rows);
    }
    console.log('');
    console.log(
      `Lead     - total ${leads.length}, auto ${leadAuto}, ambiguous ${leadAmbiguous}, no-match ${leadNoMatch}`,
    );
    console.log(
      `Customer - total ${customers.length}, auto ${customerAuto} (${provenanceAuto} tu Lead lien ket), ambiguous ${customerAmbiguous}, no-match ${customerNoMatch}`,
    );
    console.log('');
  }

  if (!apply) {
    console.log('DRY RUN - khong ghi gi. Chay lai voi --apply sau khi bang anh xa da duoc duyet.\n');
    return;
  }

  const leadWrites = leads
    .map((lead) => {
      const row = leadDecision.get((lead.category ?? '').trim());
      return row?.autoMigrate && row.candidateId
        ? { id: lead.id, categoryId: row.candidateId, name: row.candidateName as string }
        : null;
    })
    .filter(Boolean) as Array<{ id: string; categoryId: string; name: string }>;

  const customerWrites: Array<{ id: string; categoryId: string; name: string }> = [];
  for (const c of customerByProvenance) {
    const cat = master.find((m) => m.id === c.categoryId);
    if (cat?.isActive) customerWrites.push({ id: c.id, categoryId: cat.id, name: cat.name });
  }
  for (const customer of customers) {
    if (customerByProvenance.some((c) => c.id === customer.id)) continue;
    const row = customerDecision.get((customer.preferredCategory ?? '').trim());
    if (row?.autoMigrate && row.candidateId) {
      customerWrites.push({
        id: customer.id,
        categoryId: row.candidateId,
        name: row.candidateName as string,
      });
    }
  }

  await prisma.$transaction([
    // The snapshot is re-derived from the master in the same statement, so the
    // text and the FK can never disagree after this run.
    ...leadWrites.map((w) =>
      prisma.lead.update({ where: { id: w.id }, data: { categoryId: w.categoryId, category: w.name } }),
    ),
    ...customerWrites.map((w) =>
      prisma.customer.update({
        where: { id: w.id },
        data: { preferredCategoryId: w.categoryId, preferredCategory: w.name },
      }),
    ),
  ]);

  console.log(`APPLIED - ${leadWrites.length} Lead va ${customerWrites.length} Customer da duoc lien ket.`);
  console.log('Chay lai script se khong thay doi gi them (idempotent).\n');
}

// Only run when invoked directly, so the classification rules above can be
// unit-tested without opening a database connection.
if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
