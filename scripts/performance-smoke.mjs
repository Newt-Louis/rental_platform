import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const baseUrl = (process.env.PERF_BASE_URL ?? 'http://127.0.0.1:3000/api').replace(/\/$/, '');
const concurrency = Number(process.env.PERF_CONCURRENCY ?? 5);
const targetRps = Number(process.env.PERF_RPS ?? 5);
const durationSeconds = Number(process.env.PERF_DURATION_SECONDS ?? 10);
const maxErrorRate = Number(process.env.PERF_MAX_ERROR_RATE ?? 0.01);
const p95ThresholdMs = Number(process.env.PERF_P95_MS ?? 750);
const timeoutMs = Number(process.env.PERF_TIMEOUT_MS ?? 5_000);
const email = process.env.PERF_EMAIL;
const password = process.env.PERF_PASSWORD;
const reportPath = process.env.PERF_REPORT ? resolve(process.env.PERF_REPORT) : null;

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

for (const [name, value] of [
  ['PERF_CONCURRENCY', concurrency],
  ['PERF_RPS', targetRps],
  ['PERF_DURATION_SECONDS', durationSeconds],
  ['PERF_TIMEOUT_MS', timeoutMs],
]) {
  if (!Number.isFinite(value) || value <= 0) fail(`${name} must be greater than zero`);
}
if (maxErrorRate < 0 || maxErrorRate > 1) fail('PERF_MAX_ERROR_RATE must be between 0 and 1');

const target = new URL(baseUrl);
const safeHosts = new Set(['127.0.0.1', 'localhost', '::1']);
if (!safeHosts.has(target.hostname) && process.env.ALLOW_NONLOCAL_PERF_TEST !== 'I_ACCEPT_READ_ONLY_LOAD') {
  fail('Non-local performance target requires ALLOW_NONLOCAL_PERF_TEST=I_ACCEPT_READ_ONLY_LOAD');
}

async function request(path, options = {}) {
  const startedAt = performance.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        Connection: 'close',
        'Content-Type': 'application/json',
        ...options.headers,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    await response.arrayBuffer();
    return { ok: response.ok, status: response.status, ms: performance.now() - startedAt };
  } catch (error) {
    return { ok: false, status: 0, ms: performance.now() - startedAt, error: error.message };
  }
}

let token;
if (email && password) {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { Connection: 'close', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json();
  token = body.accessToken ?? body.data?.accessToken;
  if (!response.ok || !token) fail('Optional performance login failed');
}

const publicPaths = ['/health/live', '/health/ready'];
const authenticatedPaths = ['/dashboard', '/spaces/units?limit=10', '/contracts?limit=10', '/tickets?limit=10'];
const paths = token ? [...publicPaths, ...authenticatedPaths] : publicPaths;
const deadline = performance.now() + durationSeconds * 1000;
const results = [];
let cursor = 0;

async function worker() {
  const pacingMs = (Math.floor(concurrency) / targetRps) * 1_000;
  while (performance.now() < deadline) {
    const iterationStartedAt = performance.now();
    const path = paths[cursor++ % paths.length];
    const result = await request(path, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
    results.push({ path, ...result });
    const remainingDelay = pacingMs - (performance.now() - iterationStartedAt);
    if (remainingDelay > 0) await new Promise((resolvePromise) => setTimeout(resolvePromise, remainingDelay));
  }
}

await Promise.all(Array.from({ length: Math.floor(concurrency) }, () => worker()));
if (!results.length) fail('Performance test produced no requests');

const sorted = results.map((result) => result.ms).sort((a, b) => a - b);
const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
const failures = results.filter((result) => !result.ok);
const summary = {
  target: target.origin,
  readOnly: true,
  concurrency: Math.floor(concurrency),
  targetRequestsPerSecond: targetRps,
  durationSeconds,
  requests: results.length,
  requestsPerSecond: Math.round((results.length / durationSeconds) * 10) / 10,
  errorRate: failures.length / results.length,
  p50Ms: Math.round(percentile(0.5)),
  p95Ms: Math.round(percentile(0.95)),
  p99Ms: Math.round(percentile(0.99)),
  statusCounts: Object.fromEntries(
    [...new Set(results.map((result) => result.status))]
      .sort((a, b) => a - b)
      .map((status) => [status, results.filter((result) => result.status === status).length]),
  ),
};
console.table(summary);

const violations = [];
if (summary.errorRate > maxErrorRate) violations.push(`errorRate ${summary.errorRate} > ${maxErrorRate}`);
if (summary.p95Ms > p95ThresholdMs) violations.push(`p95 ${summary.p95Ms}ms > ${p95ThresholdMs}ms`);
if (reportPath) {
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    verdict: violations.length ? 'FAIL' : 'PASS',
    thresholds: { maxErrorRate, p95ThresholdMs },
    summary,
    violations,
  }, null, 2)}\n`);
}
if (violations.length) fail(`Performance thresholds failed: ${violations.join('; ')}`);
console.log(`PASS: ${summary.requests} read-only requests met performance thresholds.`);
