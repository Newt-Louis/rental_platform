/**
 * Migration script to populate Category master data from existing Unit.category strings.
 * 
 * This script:
 * 1. Extracts unique category values from Unit, Tenant, Lead, and Customer tables
 * 2. Creates Category records for each unique value
 * 3. Updates the categoryId FK on those records
 * 
 * Run with: npx ts-node prisma/scripts/migrate-categories.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Mapping of legacy category strings to new category codes
const CATEGORY_CODE_MAP: Record<string, string> = {
  'F&B': 'FNB',
  'Food & Beverage': 'FNB',
  'Fashion': 'FASHION',
  'Fashion & Apparel': 'FASHION',
  'Beauty & Wellness': 'BEAUTY',
  'Health & Beauty': 'BEAUTY',
  'Health': 'BEAUTY',
  'Beauty': 'BEAUTY',
  'Technology': 'TECH',
  'Electronics': 'TECH',
  'Entertainment': 'ENTERTAINMENT',
  'Entertainment & Leisure': 'ENTERTAINMENT',
  'Convenience Store': 'CONVENIENCE',
  'Convenience': 'CONVENIENCE',
  'Mini Mart': 'CONVENIENCE',
  'Supermarket': 'SUPERMARKET',
  'Grocery': 'SUPERMARKET',
  'Services': 'SERVICES',
  'Services & Others': 'SERVICES',
  'Home & Living': 'HOME_LIVING',
  'Sport': 'SPORT',
  'Sports': 'SPORT',
  'Other': 'OTHER',
  'Others': 'OTHER',
};

async function main() {
  console.log('Starting category migration...\n');

  // Step 1: Get all unique category strings from Units
  const unitCategories = await prisma.unit.findMany({
    select: { category: true },
    distinct: ['category'],
    where: { category: { not: null } },
  });

  const tenantCategories = await prisma.tenant.findMany({
    select: { category: true },
    distinct: ['category'],
    where: { category: { not: null } },
  });

  const leadCategories = await prisma.lead.findMany({
    select: { category: true },
    distinct: ['category'],
    where: { category: { not: null } },
  });

  const customerCategories = await prisma.customer.findMany({
    select: { preferredCategory: true },
    distinct: ['preferredCategory'],
    where: { preferredCategory: { not: null } },
  });

  // Combine all unique categories
  const allCategories = new Set<string>();
  unitCategories.forEach((u) => u.category && allCategories.add(u.category));
  tenantCategories.forEach((t) => t.category && allCategories.add(t.category));
  leadCategories.forEach((l) => l.category && allCategories.add(l.category));
  customerCategories.forEach((c) => c.preferredCategory && allCategories.add(c.preferredCategory));

  console.log(`Found ${allCategories.size} unique category strings:\n${[...allCategories].join(', ')}\n`);

  // Step 2: Get existing categories
  const existingCategories = await prisma.category.findMany({
    select: { id: true, code: true, name: true },
  });

  const categoryIdByCode = new Map<string, string>();
  existingCategories.forEach((c) => categoryIdByCode.set(c.code, c.id));

  console.log(`Found ${existingCategories.length} existing Category records\n`);

  // Step 3: Create missing categories
  const categoriesToCreate: { code: string; name: string }[] = [];

  for (const catString of allCategories) {
    const code = CATEGORY_CODE_MAP[catString] || catString.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    if (!categoryIdByCode.has(code)) {
      categoriesToCreate.push({ code, name: catString });
    }
  }

  if (categoriesToCreate.length > 0) {
    console.log(`Creating ${categoriesToCreate.length} new Category records...`);
    for (const cat of categoriesToCreate) {
      const existing = await prisma.category.findUnique({ where: { code: cat.code } });
      if (!existing) {
        const created = await prisma.category.create({
          data: {
            code: cat.code,
            name: cat.name,
            isActive: true,
          },
        });
        categoryIdByCode.set(cat.code, created.id);
        console.log(`  Created: ${cat.code} → ${created.id}`);
      } else {
        categoryIdByCode.set(cat.code, existing.id);
        console.log(`  Already exists: ${cat.code} → ${existing.id}`);
      }
    }
    console.log('');
  }

  // Step 4: Update Units
  console.log('Updating Unit.categoryId...');
  let unitUpdateCount = 0;
  const unitsToUpdate = await prisma.unit.findMany({
    where: { category: { not: null }, categoryId: null },
    select: { id: true, category: true },
  });

  for (const unit of unitsToUpdate) {
    const code = CATEGORY_CODE_MAP[unit.category!] || unit.category!.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const categoryId = categoryIdByCode.get(code);
    if (categoryId) {
      await prisma.unit.update({
        where: { id: unit.id },
        data: { categoryId },
      });
      unitUpdateCount++;
    }
  }
  console.log(`  Updated ${unitUpdateCount} units\n`);

  // Step 5: Update Tenants
  console.log('Updating Tenant.categoryId...');
  let tenantUpdateCount = 0;
  const tenantsToUpdate = await prisma.tenant.findMany({
    where: { category: { not: null }, categoryId: null },
    select: { id: true, category: true },
  });

  for (const tenant of tenantsToUpdate) {
    const code = CATEGORY_CODE_MAP[tenant.category!] || tenant.category!.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const categoryId = categoryIdByCode.get(code);
    if (categoryId) {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { categoryId },
      });
      tenantUpdateCount++;
    }
  }
  console.log(`  Updated ${tenantUpdateCount} tenants\n`);

  // Step 6: Update Leads
  console.log('Updating Lead.categoryId...');
  let leadUpdateCount = 0;
  const leadsToUpdate = await prisma.lead.findMany({
    where: { category: { not: null }, categoryId: null },
    select: { id: true, category: true },
  });

  for (const lead of leadsToUpdate) {
    const code = CATEGORY_CODE_MAP[lead.category!] || lead.category!.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const categoryId = categoryIdByCode.get(code);
    if (categoryId) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { categoryId },
      });
      leadUpdateCount++;
    }
  }
  console.log(`  Updated ${leadUpdateCount} leads\n`);

  // Step 7: Update Customers
  console.log('Updating Customer.preferredCategoryId...');
  let customerUpdateCount = 0;
  const customersToUpdate = await prisma.customer.findMany({
    where: { preferredCategory: { not: null }, preferredCategoryId: null },
    select: { id: true, preferredCategory: true },
  });

  for (const customer of customersToUpdate) {
    const code = CATEGORY_CODE_MAP[customer.preferredCategory!] || customer.preferredCategory!.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const categoryId = categoryIdByCode.get(code);
    if (categoryId) {
      await prisma.customer.update({
        where: { id: customer.id },
        data: { preferredCategoryId: categoryId },
      });
      customerUpdateCount++;
    }
  }
  console.log(`  Updated ${customerUpdateCount} customers\n`);

  console.log('Migration completed successfully!');
  console.log(`
Summary:
- Categories created/found: ${categoryIdByCode.size}
- Units updated: ${unitUpdateCount}
- Tenants updated: ${tenantUpdateCount}
- Leads updated: ${leadUpdateCount}
- Customers updated: ${customerUpdateCount}
`);
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
