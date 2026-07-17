import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';

function run(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/performance-smoke.mjs'], {
      cwd: process.cwd(), env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('close', (code) => resolve({ code, output }));
  });
}

function fixture(delayMs = 0) {
  const server = http.createServer((_request, response) => {
    setTimeout(() => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ data: { status: 'ok', components: { database: 'up' } } }));
    }, delayMs);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

test('read-only performance gate passes a healthy local fixture', async (t) => {
  const server = await fixture();
  t.after(() => server.close());
  const { port } = server.address();
  const result = await run({
    PERF_BASE_URL: `http://127.0.0.1:${port}/api`,
    PERF_CONCURRENCY: '2',
    PERF_DURATION_SECONDS: '1',
    PERF_P95_MS: '500',
    PERF_MAX_ERROR_RATE: '0',
  });
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /read-only requests met performance thresholds/);
});

test('performance runner rejects a non-local target without confirmation', async () => {
  const result = await run({ PERF_BASE_URL: 'https://leasing.example.com/api' });
  assert.notEqual(result.code, 0);
  assert.match(result.output, /Non-local performance target requires/);
});
