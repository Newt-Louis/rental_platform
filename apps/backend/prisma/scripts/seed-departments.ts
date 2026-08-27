/**
 * Seed the initial Department catalogue after the base Prisma seed has created
 * at least one Mall. Existing User.department values are deliberately untouched.
 *
 * Run with:
 *   npx ts-node --transpile-only prisma/scripts/seed-departments.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const INITIAL_DEPARTMENTS = [
  'IT',
  'Leasing',
  'Management',
  'Finance',
  'Legal',
  'Operations',
  'Executive',
  'Tenant',
] as const;

async function main() {
  const mall = await prisma.mall.findFirst({
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, name: true },
  });

  if (!mall) {
    throw new Error('No Mall found. Run the base Prisma seed before seed-departments.ts.');
  }

  let created = 0;
  let existing = 0;

  for (const name of INITIAL_DEPARTMENTS) {
    const department = await prisma.department.findFirst({
      where: { mallId: mall.id, name, parentId: null },
      select: { id: true },
    });

    if (department) {
      existing += 1;
      continue;
    }

    await prisma.department.create({
      data: { mallId: mall.id, name },
    });
    created += 1;
  }

  console.log(
    `Department seed completed for ${mall.name}: ${created} created, ${existing} already present.`,
  );
}

main()
  .catch((error) => {
    console.error('Department seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
