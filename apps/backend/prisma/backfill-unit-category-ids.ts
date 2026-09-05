// One-off data backfill: links existing Units to the Category master data
// they should have been pointing at all along.
//
// Root cause (see spaces.service.ts resolveUnitCategoryFields): the Spaces
// "Ngành hàng" select only ever wrote Unit.category (free-text name), never
// Unit.categoryId (FK to the Category table managed in Admin > Ngành hàng).
// That silently broke CategoryMallPricing lookups and the proposal
// price-deviation check (ProposalsService gates on `unit.categoryId`), since
// categoryId was null for every Unit created through the app.
//
// This script matches each Unit's existing free-text `category` string
// against Category.name (case-insensitive, exact match) and sets categoryId
// accordingly. It only touches Units where categoryId is currently null and
// category is set -- never overwrites an already-linked Unit. Units whose
// free-text category doesn't match any current Category name are reported,
// not guessed at.
//
// Usage: npx ts-node prisma/backfill-unit-category-ids.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const categories = await prisma.category.findMany({ select: { id: true, name: true } });
  const byName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.id]));

  const candidates = await prisma.unit.findMany({
    where: { categoryId: null, category: { not: null } },
    select: { id: true, code: true, category: true },
  });

  let linked = 0;
  const unmatched: Array<{ code: string; category: string }> = [];

  for (const unit of candidates) {
    const categoryId = byName.get((unit.category ?? '').trim().toLowerCase());
    if (!categoryId) {
      unmatched.push({ code: unit.code, category: unit.category! });
      continue;
    }
    await prisma.unit.update({ where: { id: unit.id }, data: { categoryId } });
    linked++;
  }

  console.log(`Linked ${linked}/${candidates.length} unit(s) to a Category master record.`);
  if (unmatched.length > 0) {
    console.log(`${unmatched.length} unit(s) had no matching Category name and were left unlinked:`);
    for (const u of unmatched.slice(0, 50)) {
      console.log(`  - ${u.code}: "${u.category}"`);
    }
    if (unmatched.length > 50) console.log(`  ... and ${unmatched.length - 50} more`);
    console.log('Fix these by editing the unit in Spaces and re-selecting its Ngành hàng, or renaming/adding the matching Category in Admin.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
