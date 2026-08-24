// Go-Live Workstream C (docs/golive/GO_LIVE_BLOCKERS.md GL-03): uploaded-file backup.
// Mirrors scripts/backup-database.mjs's shape (checksummed archive + manifest + retention +
// optional off-site hook) so the two backup procedures are operationally consistent, but
// archives the `leasing-uploads` named Docker volume instead of a Postgres dump. Runs via a
// throwaway `alpine` container mounting the volume read-only, so it has no dependency on
// what's installed inside the backend image itself.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const outputDir = resolve(process.env.BACKUP_DIR ?? 'backups');
const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? 14);
const volumeName = process.env.UPLOADS_VOLUME ?? 'leasing-uploads';

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}
if (!Number.isInteger(retentionDays) || retentionDays < 1) fail('BACKUP_RETENTION_DAYS must be a positive integer');

await mkdir(outputDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
const archiveName = `uploads-${volumeName}-${stamp}.tar.gz`;
const archivePath = join(outputDir, archiveName);
const absOutputDir = resolve(outputDir);

await new Promise((resolvePromise, reject) => {
  const child = spawn(
    'docker',
    [
      'run', '--rm',
      '-v', `${volumeName}:/data:ro`,
      '-v', `${absOutputDir}:/backup`,
      'alpine:latest',
      'sh', '-c', `tar czf /backup/${archiveName} -C /data .`,
    ],
    { stdio: 'inherit', shell: false },
  );
  child.on('error', reject);
  child.on('close', (code) => (code === 0 ? resolvePromise() : reject(new Error(`tar exited with code ${code}`))));
});

const digest = createHash('sha256');
for await (const chunk of createReadStream(archivePath)) digest.update(chunk);
const checksum = digest.digest('hex');
const metadata = await stat(archivePath);
const manifest = {
  version: 1,
  createdAt: new Date().toISOString(),
  volume: volumeName,
  format: 'tar.gz',
  bytes: metadata.size,
  sha256: checksum,
  file: archiveName,
};
await writeFile(`${archivePath}.json`, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
await writeFile(`${archivePath}.sha256`, `${checksum}  ${archiveName}\n`, { flag: 'wx' });

const cutoff = Date.now() - retentionDays * 86_400_000;
for (const entry of await readdir(outputDir)) {
  if (!/^uploads-.*\.tar\.gz(\.json|\.sha256)?$/.test(entry)) continue;
  const file = join(outputDir, entry);
  if ((await stat(file)).mtimeMs < cutoff) await rm(file);
}

if (process.env.BACKUP_OFFSITE_COMMAND) {
  const child = spawn(process.env.BACKUP_OFFSITE_COMMAND, [archivePath, `${archivePath}.json`, `${archivePath}.sha256`], {
    stdio: 'inherit',
    shell: true,
  });
  const code = await new Promise((resolvePromise) => child.on('close', resolvePromise));
  if (code !== 0) fail(`Off-site backup hook failed with code ${code}`);
}

console.log(`PASS: uploads backup created ${archivePath} (${metadata.size} bytes, sha256=${checksum})`);
