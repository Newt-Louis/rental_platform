import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

function run(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/verify-database-restore.mjs'], {
      cwd: process.cwd(), env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('close', (code) => resolve({ code, output }));
  });
}

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'leasing-backup-'));
  const dump = join(dir, 'fixture.dump');
  const contents = Buffer.from('safe restore fixture');
  await writeFile(dump, contents);
  await writeFile(`${dump}.json`, JSON.stringify({ sha256: createHash('sha256').update(contents).digest('hex') }));
  return dump;
}

test('restore verification rejects a production-like target', async () => {
  const result = await run({
    BACKUP_FILE: await fixture(),
    RESTORE_TARGET_DB: 'leasing_platform',
    ALLOW_RESTORE_VERIFICATION: 'I_UNDERSTAND_THIS_RECREATES_THE_TARGET_DB',
    RESTORE_GUARD_ONLY: 'true',
  });
  assert.notEqual(result.code, 0);
  assert.match(result.output, /isolated database/);
});

test('guard-only verification validates isolated target and checksum', async () => {
  const result = await run({
    BACKUP_FILE: await fixture(),
    RESTORE_TARGET_DB: 'restore_verify_ci',
    ALLOW_RESTORE_VERIFICATION: 'I_UNDERSTAND_THIS_RECREATES_THE_TARGET_DB',
    RESTORE_GUARD_ONLY: 'true',
  });
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /checksum verified/);
});

function runUploads(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/verify-uploads-restore.mjs'], {
      cwd: process.cwd(), env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('close', (code) => resolve({ code, output }));
  });
}

test('uploads restore verification rejects the production uploads volume', async () => {
  const result = await runUploads({
    BACKUP_FILE: await fixture(),
    RESTORE_TARGET_VOLUME: 'leasing-uploads',
    ALLOW_RESTORE_VERIFICATION: 'I_UNDERSTAND_THIS_RECREATES_THE_TARGET_VOLUME',
    RESTORE_GUARD_ONLY: 'true',
  });
  assert.notEqual(result.code, 0);
  assert.match(result.output, /isolated volume/);
});

test('uploads guard-only verification validates isolated target and checksum', async () => {
  const result = await runUploads({
    BACKUP_FILE: await fixture(),
    RESTORE_TARGET_VOLUME: 'restore_verify_uploads_ci',
    ALLOW_RESTORE_VERIFICATION: 'I_UNDERSTAND_THIS_RECREATES_THE_TARGET_VOLUME',
    RESTORE_GUARD_ONLY: 'true',
  });
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /checksum verified/);
});
