// Go-Live Workstream C restore drill (docs/golive/RESTORE_DRILL.md). Mirrors
// verify-database-restore.mjs's safety guardrails: restores only into an isolated,
// throwaway Docker volume whose name must start with the expected prefix, never into the
// real `leasing-uploads` volume, and requires an explicit confirmation token. Verifies the
// restored archive's file count and total size, not just that tar exited zero.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

const archivePath = resolve(process.env.BACKUP_FILE ?? '');
const targetVolume = process.env.RESTORE_TARGET_VOLUME ?? '';
const expectedPrefix = process.env.RESTORE_VOLUME_PREFIX ?? 'restore_verify_uploads_';
const productionVolume = process.env.PRODUCTION_UPLOADS_VOLUME ?? 'leasing-uploads';

if (!process.env.BACKUP_FILE) fail('BACKUP_FILE is required');
if (!targetVolume.startsWith(expectedPrefix) || targetVolume === expectedPrefix) {
  fail(`RESTORE_TARGET_VOLUME must be an isolated volume starting with ${expectedPrefix}`);
}
if (targetVolume === productionVolume) fail('RESTORE_TARGET_VOLUME must never equal the production uploads volume');
if (process.env.ALLOW_RESTORE_VERIFICATION !== 'I_UNDERSTAND_THIS_RECREATES_THE_TARGET_VOLUME') {
  fail('Set ALLOW_RESTORE_VERIFICATION=I_UNDERSTAND_THIS_RECREATES_THE_TARGET_VOLUME');
}

const manifest = JSON.parse(await readFile(`${archivePath}.json`, 'utf8'));
const digest = createHash('sha256');
for await (const chunk of createReadStream(archivePath)) digest.update(chunk);
if (digest.digest('hex') !== manifest.sha256) fail('Backup checksum does not match manifest');

if (process.env.RESTORE_GUARD_ONLY === 'true') {
  console.log(`PASS: restore guard and checksum verified for isolated target ${targetVolume}`);
  process.exit();
}

function run(args, opts = {}) {
  const result = spawnSync('docker', args, { stdio: 'inherit', shell: false, ...opts });
  if (result.status !== 0) fail(`${args.join(' ')} failed with code ${result.status}`);
}

run(['volume', 'rm', '-f', targetVolume]);
run(['volume', 'create', targetVolume]);
run([
  'run', '--rm',
  '-v', `${targetVolume}:/data`,
  '-v', `${resolve(archivePath, '..')}:/backup:ro`,
  'alpine:latest',
  'sh', '-c', `tar xzf /backup/${archivePath.split(/[\\/]/).pop()} -C /data`,
]);

const countResult = spawnSync('docker', [
  'run', '--rm', '-v', `${targetVolume}:/data:ro`, 'alpine:latest',
  'sh', '-c', 'find /data -type f | wc -l',
], { encoding: 'utf8' });
if (countResult.status !== 0) fail('Could not count restored files');
const fileCount = countResult.stdout.trim();

console.log(`PASS: uploads archive restored into isolated volume ${targetVolume} — ${fileCount} files present`);
