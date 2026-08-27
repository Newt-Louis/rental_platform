import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

const dumpPath = resolve(process.env.BACKUP_FILE ?? '');
const target = process.env.RESTORE_TARGET_DB ?? '';
const expectedPrefix = process.env.RESTORE_DB_PREFIX ?? 'restore_verify_';
if (!process.env.BACKUP_FILE) fail('BACKUP_FILE is required');
if (!target.startsWith(expectedPrefix) || target === expectedPrefix) {
  fail(`RESTORE_TARGET_DB must be an isolated database starting with ${expectedPrefix}`);
}
if (process.env.ALLOW_RESTORE_VERIFICATION !== 'I_UNDERSTAND_THIS_RECREATES_THE_TARGET_DB') {
  fail('Set ALLOW_RESTORE_VERIFICATION=I_UNDERSTAND_THIS_RECREATES_THE_TARGET_DB');
}
if (process.env.PRODUCTION_DB_NAME && target === process.env.PRODUCTION_DB_NAME) {
  fail('Restore verification target must never equal PRODUCTION_DB_NAME');
}

const manifest = JSON.parse(await readFile(`${dumpPath}.json`, 'utf8'));
const digest = createHash('sha256');
for await (const chunk of createReadStream(dumpPath)) digest.update(chunk);
if (digest.digest('hex') !== manifest.sha256) fail('Backup checksum does not match manifest');

if (process.env.RESTORE_GUARD_ONLY === 'true') {
  console.log(`PASS: restore guard and checksum verified for isolated target ${target}`);
  process.exit();
}

const user = process.env.POSTGRES_USER;
const service = process.env.POSTGRES_SERVICE ?? 'postgres';
if (!user) fail('POSTGRES_USER is required');

function run(args, input) {
  const result = spawnSync('docker', ['compose', 'exec', '-T', service, ...args], {
    input,
    stdio: input ? ['pipe', 'inherit', 'inherit'] : 'inherit',
    shell: false,
  });
  if (result.status !== 0) fail(`${args[0]} failed with code ${result.status}`);
}

run(['dropdb', '--if-exists', '-U', user, target]);
run(['createdb', '-U', user, target]);
run(['pg_restore', '--exit-on-error', '--no-owner', '-U', user, '-d', target], await readFile(dumpPath));
run(['psql', '-U', user, '-d', target, '-v', 'ON_ERROR_STOP=1', '-c',
  "SELECT COUNT(*) AS application_tables FROM information_schema.tables WHERE table_schema='public';"]);

console.log(`PASS: backup restored and queried in isolated database ${target}`);
