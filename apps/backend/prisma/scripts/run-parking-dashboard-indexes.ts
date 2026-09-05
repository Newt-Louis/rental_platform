/**
 * Applies apps/backend/prisma/scripts/parking-dashboard-indexes.sql against
 * PARKING_DATABASE_URL, one statement at a time, outside a transaction
 * (CREATE INDEX CONCURRENTLY cannot run inside one).
 *
 * `parking_transactions` is a partitioned parent (list-partitioned into
 * parking_transactions_t1..t5) and Postgres does not support
 * CREATE INDEX CONCURRENTLY directly on a partitioned parent. Each
 * `ON parking_transactions (...)` statement in the .sql file is expanded
 * here into one CONCURRENTLY build per partition (index name suffixed with
 * the partition name) — the planner uses per-partition indexes fine via
 * partition pruning, so a parent-level index isn't required.
 *
 * Run with: npm run parking:apply-indexes
 */

import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';

const PARTITIONED_TABLE = 'parking_transactions';

async function main() {
  const connectionString = process.env.PARKING_DATABASE_URL;
  if (!connectionString) {
    console.log('PARKING_DATABASE_URL is not set — skipping parking dashboard index apply.');
    return;
  }

  const sqlPath = path.join(__dirname, 'parking-dashboard-indexes.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  // Strip full-line `--` comments before splitting on ';' — a semicolon
  // inside a comment (e.g. "one partition at a time; the parent index")
  // would otherwise be mistaken for a statement boundary.
  const sqlWithoutComments = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  const templateStatements = sqlWithoutComments
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const { rows } = await client.query<{ child: string }>(
      `SELECT inhrelid::regclass::text AS child FROM pg_inherits WHERE inhparent = $1::regclass ORDER BY child`,
      [PARTITIONED_TABLE],
    );
    const partitions = rows.map((r) => r.child);

    const statements: { label: string; sql: string }[] = [];
    for (const template of templateStatements) {
      const match = template.match(new RegExp(`^(CREATE INDEX CONCURRENTLY IF NOT EXISTS )(\\w+)\\s+ON ${PARTITIONED_TABLE}\\b([\\s\\S]*)$`));
      if (!match) {
        const label = template.match(/idx_\w+/)?.[0] ?? 'statement';
        statements.push({ label, sql: template });
        continue;
      }
      const [, prefix, indexName, rest] = match;
      for (const partition of partitions) {
        const suffix = partition.replace(`${PARTITIONED_TABLE}_`, '');
        const indexNameForPartition = `${indexName}_${suffix}`;
        statements.push({
          label: indexNameForPartition,
          sql: `${prefix}${indexNameForPartition} ON ${partition}${rest}`,
        });
      }
    }

    for (const [index, statement] of statements.entries()) {
      console.log(`[${index + 1}/${statements.length}] applying ${statement.label}...`);
      await client.query(statement.sql);
      console.log(`[${index + 1}/${statements.length}] ${statement.label} done.`);
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
