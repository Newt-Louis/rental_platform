import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const outputDir = resolve(process.env.BACKUP_DIR ?? 'backups');
const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? 14);
const database = process.env.POSTGRES_DB;
const user = process.env.POSTGRES_USER;
const composeService = process.env.POSTGRES_SERVICE ?? 'postgres';

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}
if (!database || !user) fail('POSTGRES_DB and POSTGRES_USER are required');
if (!Number.isInteger(retentionDays) || retentionDays < 1) fail('BACKUP_RETENTION_DAYS must be a positive integer');

await mkdir(outputDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
const dumpPath = join(outputDir, `leasing-${database}-${stamp}.dump`);

await new Promise((resolvePromise, reject) => {
  const child = spawn(
    'docker',
    ['compose', 'exec', '-T', composeService, 'pg_dump', '-U', user, '-d', database, '-Fc'],
    { stdio: ['ignore', 'pipe', 'inherit'], shell: false },
  );
  const chunks = [];
  child.stdout.on('data', (chunk) => chunks.push(chunk));
  child.on('error', reject);
  child.on('close', async (code) => {
    if (code !== 0) return reject(new Error(`pg_dump exited with code ${code}`));
    await writeFile(dumpPath, Buffer.concat(chunks), { flag: 'wx' });
    resolvePromise();
  });
});

const digest = createHash('sha256');
for await (const chunk of createReadStream(dumpPath)) digest.update(chunk);
const checksum = digest.digest('hex');
const metadata = await stat(dumpPath);
const manifest = {
  version: 1,
  createdAt: new Date().toISOString(),
  database,
  format: 'postgres-custom',
  bytes: metadata.size,
  sha256: checksum,
  file: basename(dumpPath),
};
await writeFile(`${dumpPath}.json`, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
await writeFile(`${dumpPath}.sha256`, `${checksum}  ${basename(dumpPath)}\n`, { flag: 'wx' });

const cutoff = Date.now() - retentionDays * 86_400_000;
for (const entry of await readdir(outputDir)) {
  if (!/^leasing-.*\.dump(\.json|\.sha256)?$/.test(entry)) continue;
  const file = join(outputDir, entry);
  if ((await stat(file)).mtimeMs < cutoff) await rm(file);
}

if (process.env.BACKUP_OFFSITE_COMMAND) {
  const child = spawn(process.env.BACKUP_OFFSITE_COMMAND, [dumpPath, `${dumpPath}.json`, `${dumpPath}.sha256`], {
    stdio: 'inherit',
    shell: true,
  });
  const code = await new Promise((resolvePromise) => child.on('close', resolvePromise));
  if (code !== 0) fail(`Off-site backup hook failed with code ${code}`);
}

console.log(`PASS: backup created ${dumpPath} (${metadata.size} bytes, sha256=${checksum})`);
