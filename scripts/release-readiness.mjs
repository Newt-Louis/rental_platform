import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const mode = process.env.RELEASE_MODE ?? 'ci';
const reportPath = resolve(process.env.RELEASE_REPORT ?? 'artifacts/release-readiness.json');
const startedAt = new Date();
const results = [];

if (!['ci', 'uat'].includes(mode)) {
  console.error('RELEASE_MODE must be ci or uat');
  process.exit(1);
}

function run(name, command, args, options = {}) {
  const started = Date.now();
  const windowsCommandShim = process.platform === 'win32' && ['npm', 'npx'].includes(command);
  const executable = windowsCommandShim ? (process.env.ComSpec ?? 'cmd.exe') : command;
  const executableArgs = windowsCommandShim
    ? ['/d', '/s', '/c', `${command} ${args.join(' ')}`]
    : args;
  const result = spawnSync(executable, executableArgs, {
    cwd: options.cwd ?? process.cwd(),
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
    shell: false,
    timeout: options.timeout ?? 300_000,
  });
  const status = result.status === 0 ? 'PASS' : 'FAIL';
  results.push({
    name,
    status,
    command: [command, ...args].join(' '),
    durationMs: Date.now() - started,
    detail: (status === 'PASS'
      ? result.stdout
      : `${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.error?.stack ?? ''}`)
      .trim()
      .slice(-2000),
  });
}

async function artifact(name, path, required = true) {
  try {
    const info = await stat(resolve(path));
    results.push({ name, status: 'PASS', artifact: path, bytes: info.size, detail: 'artifact present' });
  } catch {
    results.push({
      name,
      status: required ? 'FAIL' : 'SKIP',
      artifact: path,
      detail: required ? 'required artifact is missing' : 'optional artifact is missing',
    });
  }
}

run('Operations static gates', process.execPath, ['scripts/ops-static-check.mjs']);
run('Operations fixture tests', process.execPath, [
  '--test',
  'scripts/ops-automation.test.mjs',
  'scripts/backup-restore.test.mjs',
  'scripts/performance-smoke.test.mjs',
]);

if (process.env.RELEASE_RUN_FULL_BUILD === 'true') {
  run('Prisma schema validation', 'npx', ['prisma', 'validate'], { cwd: 'apps/backend' });
  run('Prisma client generation', 'npx', ['prisma', 'generate'], { cwd: 'apps/backend' });
  run('Backend tests', 'npm', ['test', '--', '--runInBand'], { cwd: 'apps/backend', timeout: 600_000 });
  run('Backend build', 'npm', ['run', 'build'], { cwd: 'apps/backend', timeout: 600_000 });
  run('Frontend tests', 'npm', ['test'], { cwd: 'apps/frontend', timeout: 600_000 });
  run('Frontend build', 'npm', ['run', 'build'], { cwd: 'apps/frontend', timeout: 600_000 });
} else {
  results.push({
    name: 'Full build and test evidence',
    status: 'SKIP',
    detail: 'Set RELEASE_RUN_FULL_BUILD=true or provide CI evidence artifacts',
  });
}

await artifact('Backup manifest evidence', process.env.BACKUP_MANIFEST ?? 'artifacts/backup-manifest.json', mode === 'uat');
await artifact('Performance evidence', process.env.PERFORMANCE_REPORT ?? 'artifacts/performance-report.json', mode === 'uat');

if (mode === 'uat') {
  const missing = [];
  if (!process.env.BASE_URL) missing.push('BASE_URL');
  if (!process.env.FRONTEND_URL) missing.push('FRONTEND_URL');
  if (!process.env.SMOKE_ACCOUNTS_JSON && !(process.env.SMOKE_EMAIL && process.env.SMOKE_PASSWORD)) {
    missing.push('SMOKE_ACCOUNTS_JSON or SMOKE_EMAIL/SMOKE_PASSWORD');
  }
  if (missing.length) {
    results.push({
      name: 'Live UAT configuration',
      status: 'FAIL',
      detail: `Missing ${missing.join(', ')}`,
    });
  } else {
    run('Live UAT readiness', process.execPath, ['scripts/ops-readiness.mjs']);
    run('Live UAT role smoke', process.execPath, ['scripts/smoke-test.mjs']);
    if (process.env.RUN_UAT_PERFORMANCE === 'true') {
      run('Live UAT read-only performance', process.execPath, ['scripts/performance-smoke.mjs'], {
        env: { PERF_BASE_URL: process.env.BASE_URL },
      });
    } else {
      results.push({
        name: 'Live UAT performance execution',
        status: 'SKIP',
        detail: 'Use approved capacity window and set RUN_UAT_PERFORMANCE=true',
      });
    }
  }
}

if (process.env.ENV_FILE) {
  run('Deployment environment preflight', process.execPath, ['scripts/ops-preflight.mjs', process.env.ENV_FILE]);
} else {
  results.push({
    name: 'Deployment environment preflight',
    status: mode === 'uat' ? 'FAIL' : 'SKIP',
    detail: 'ENV_FILE not provided',
  });
}

const failures = results.filter((result) => result.status === 'FAIL');
const report = {
  schemaVersion: 1,
  mode,
  startedAt: startedAt.toISOString(),
  completedAt: new Date().toISOString(),
  verdict: failures.length ? 'NOT_READY' : 'READY',
  counts: {
    passed: results.filter((result) => result.status === 'PASS').length,
    failed: failures.length,
    skipped: results.filter((result) => result.status === 'SKIP').length,
  },
  migrations: {
    expectation: 'prisma migrate deploy must complete successfully before application rollout',
    checkedLive: false,
    note: mode === 'uat'
      ? 'Database migration deployment evidence must be attached by the release operator'
      : 'CI validates schema only; it does not claim UAT migrations are applied',
  },
  results,
};
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.table(results.map(({ name, status, durationMs, detail }) => ({ name, status, durationMs: durationMs ?? 0, detail })));
console.log(`Release verdict: ${report.verdict}. Report: ${reportPath}`);
if (failures.length) process.exitCode = 1;
