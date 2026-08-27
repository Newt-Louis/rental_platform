import { readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.cwd());
const backendRoot = join(root, 'apps', 'backend', 'src');
const entrypoint = join(backendRoot, 'app.module.ts');
const failures = [];
const warnings = [];

async function exists(path) {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
    if (await exists(candidate)) return normalize(candidate);
  }
  return null;
}

async function reachableFiles() {
  const visited = new Set();
  const pending = [entrypoint];
  while (pending.length) {
    const file = pending.pop();
    if (!file || visited.has(file)) continue;
    visited.add(file);
    const source = await readFile(file, 'utf8');
    const imports = source.matchAll(/(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g);
    for (const match of imports) {
      const dependency = await resolveImport(file, match[1]);
      if (dependency && !visited.has(dependency)) pending.push(dependency);
    }
  }
  return visited;
}

const reachable = await reachableFiles();
const cronNames = new Map();
let cronCount = 0;

for (const file of reachable) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/@Cron\(([\s\S]*?)\)\s*(?:\r?\n)\s*(?:async\s+)?([A-Za-z0-9_]+)/g)) {
    cronCount++;
    const declaration = match[1];
    const method = match[2];
    const name = declaration.match(/\bname\s*:\s*['"]([^'"]+)['"]/)?.[1];
    const timezone = declaration.match(/\btimeZone\s*:\s*['"]([^'"]+)['"]/)?.[1];
    const label = `${file.slice(root.length + 1)}#${method}`;
    if (!name) {
      warnings.push(`${label}: cron has no stable name`);
    } else {
      const owner = cronNames.get(name);
      if (owner) failures.push(`Duplicate reachable cron name "${name}": ${owner} and ${label}`);
      cronNames.set(name, label);
    }
    if (!timezone) warnings.push(`${label}: cron has no explicit timeZone`);
    if (name) {
      const methodBody = source.slice(match.index, match.index + 1200);
      const lockCall = new RegExp(`schedulerLock\\.runExclusive\\(\\s*['"]${name}['"]`);
      if (!lockCall.test(methodBody)) {
        failures.push(`${label}: cron "${name}" must use SchedulerLockService.runExclusive`);
      }
    }
  }
}

const dockerfile = await readFile(join(root, 'apps', 'backend', 'Dockerfile'), 'utf8');
const commandSection = dockerfile.match(/^CMD\s+(.+)$/gm)?.at(-1) ?? '';
if (/prisma\s+migrate|migrate\s+deploy/i.test(commandSection)) {
  failures.push('Backend production CMD must not run database migrations');
}
if (!/health\/ready/.test(dockerfile)) {
  failures.push('Backend Dockerfile healthcheck must use /api/health/ready');
}

const compose = await readFile(join(root, 'docker-compose.yml'), 'utf8');
if (!/profiles:\s*\r?\n\s*-\s*migrate/.test(compose)) {
  failures.push('Compose migration service must be protected by the migrate profile');
}
if (!/SEED_DATABASE/.test(compose) || !/prisma\/seed/.test(compose)) {
  failures.push('Compose migration service must explicitly guard optional seed execution');
}
if (!/backend:[\s\S]*?health\/ready/.test(compose)) {
  failures.push('Compose backend healthcheck must use readiness, not generic health');
}

const contractsController = await readFile(
  join(root, 'apps', 'backend', 'src', 'modules', 'contracts', 'contracts.controller.ts'),
  'utf8',
);
const contractsService = await readFile(
  join(root, 'apps', 'backend', 'src', 'modules', 'contracts', 'contracts.service.ts'),
  'utf8',
);
if (!/@Get\(['"]:id\/activation-readiness['"]\)/.test(contractsController)) {
  failures.push('Contracts API must expose a read-only activation-readiness endpoint');
}
if (
  !/status\s*===\s*ContractStatus\.ACTIVE[\s\S]{0,200}getActivationReadiness/.test(
    contractsService,
  )
) {
  failures.push('Contract ACTIVE transition must enforce getActivationReadiness');
}

const restoreScript = await readFile(
  join(root, 'scripts', 'verify-database-restore.mjs'),
  'utf8',
);
for (const invariant of [
  ['restore_verify_', 'Restore verification must enforce an isolated database prefix'],
  ['I_UNDERSTAND_THIS_RECREATES_THE_TARGET_DB', 'Restore verification must require an explicit confirmation token'],
  ['PRODUCTION_DB_NAME', 'Restore verification must compare against the production database name'],
  ['sha256', 'Restore verification must validate a SHA-256 manifest'],
]) {
  if (!restoreScript.includes(invariant[0])) failures.push(invariant[1]);
}

const performanceScript = await readFile(
  join(root, 'scripts', 'performance-smoke.mjs'),
  'utf8',
);
for (const invariant of [
  ['ALLOW_NONLOCAL_PERF_TEST', 'Performance runner must guard non-local targets'],
  ['PERF_MAX_ERROR_RATE', 'Performance runner must enforce an error-rate threshold'],
  ['PERF_P95_MS', 'Performance runner must enforce a p95 latency threshold'],
  ['readOnly: true', 'Performance runner must declare read-only execution'],
]) {
  if (!performanceScript.includes(invariant[0])) failures.push(invariant[1]);
}

const releaseScript = await readFile(join(root, 'scripts', 'release-readiness.mjs'), 'utf8');
for (const invariant of [
  ['RELEASE_MODE', 'Release readiness must distinguish CI and UAT modes'],
  ['SMOKE_ACCOUNTS_JSON', 'Live UAT readiness must require role smoke credentials'],
  ["verdict: failures.length ? 'NOT_READY' : 'READY'", 'Release verdict must fail closed'],
  ['checkedLive: false', 'Release report must not claim live migration verification'],
]) {
  if (!releaseScript.includes(invariant[0])) failures.push(invariant[1]);
}

console.log(`Static operations check: ${reachable.size} reachable backend files, ${cronCount} cron jobs.`);
for (const warning of warnings) console.warn(`WARN: ${warning}`);
for (const failure of failures) console.error(`FAIL: ${failure}`);

if (failures.length) {
  process.exitCode = 1;
} else {
  console.log(`PASS: cron names are unique and production deployment invariants are satisfied (${warnings.length} warnings).`);
}
