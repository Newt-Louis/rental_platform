import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

function run(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/release-readiness.mjs'], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('close', (code) => resolve({ code, output }));
  });
}

test('CI mode emits a JSON report without claiming live UAT checks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'release-ready-'));
  const reportPath = join(dir, 'report.json');
  const result = await run({ RELEASE_MODE: 'ci', RELEASE_REPORT: reportPath });
  assert.equal(result.code, 0, result.output);
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  assert.equal(report.mode, 'ci');
  assert.equal(report.verdict, 'READY');
  assert.equal(report.migrations.checkedLive, false);
  assert.ok(report.results.some((item) => item.status === 'SKIP'));
});

test('UAT mode fails when live endpoints, credentials and evidence are missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'release-ready-'));
  const reportPath = join(dir, 'report.json');
  const result = await run({
    RELEASE_MODE: 'uat',
    RELEASE_REPORT: reportPath,
    BASE_URL: '',
    FRONTEND_URL: '',
    SMOKE_ACCOUNTS_JSON: '',
    SMOKE_EMAIL: '',
    SMOKE_PASSWORD: '',
    ENV_FILE: '',
  });
  assert.notEqual(result.code, 0);
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  assert.equal(report.verdict, 'NOT_READY');
  assert.ok(report.results.some((item) => item.name === 'Live UAT configuration' && item.status === 'FAIL'));
  assert.ok(report.counts.failed >= 1);
});
