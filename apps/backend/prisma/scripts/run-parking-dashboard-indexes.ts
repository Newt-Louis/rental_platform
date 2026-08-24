/**
 * Applies apps/backend/prisma/scripts/parking-dashboard-indexes.sql against
 * PARKING_DATABASE_URL, one statement at a time, outside a transaction
 * (CREATE INDEX CONCURRENTLY cannot run inside one).
 *
 * Run with: npm run parking:apply-indexes
 */

import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';

async function main() {
  const connectionString = process.env.PARKING_DATABASE_URL;
  if (!connectionString) {
    console.error('PARKING_DATABASE_URL is not set.');
    process.exit(1);
  }

  const sqlPath = path.join(__dirname, 'parking-dashboard-indexes.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const statements = sql
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0 && !statement.startsWith('--'));

  const client = new Client({ connectionString });
  await client.connect();

  try {
    for (const [index, statement] of statements.entries()) {
      const label = statement.match(/idx_\w+/)?.[0] ?? `statement ${index + 1}`;
      console.log(`[${index + 1}/${statements.length}] applying ${label}...`);
      await client.query(statement);
      console.log(`[${index + 1}/${statements.length}] ${label} done.`);
    }
    console.log('All parking dashboard indexes applied.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Failed to apply parking dashboard indexes:', error);
  process.exit(1);
});
