import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';

function runNode(script, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function startFixtureServer() {
  const server = http.createServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.url === '/' || req.url === '/health') {
      res.writeHead(200, { 'Content-Type': req.url === '/' ? 'text/html' : 'text/plain' });
      res.end(req.url === '/' ? '<!doctype html><div id="root"></div>' : 'OK');
      return;
    }
    if (req.url === '/api/health/live') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: { status: 'ok', service: 'fixture-api' } }));
      return;
    }
    if (req.url === '/api/health/ready') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: { status: 'ok', components: { database: 'up' } } }));
      return;
    }
    if (req.url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: { status: 'ok', components: { database: 'up', redis: 'configured' } } }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('readiness automation passes against a healthy deployment fixture', async (t) => {
  const server = await startFixtureServer();
  t.after(() => server.close());
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const result = await runNode('scripts/ops-readiness.mjs', {
    BASE_URL: `${origin}/api`,
    FRONTEND_URL: origin,
  });
  assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /5\/5 checks passed/);
});

test('public smoke automation passes and skips RBAC without credentials', async (t) => {
  const server = await startFixtureServer();
  t.after(() => server.close());
  const { port } = server.address();
  const result = await runNode('scripts/smoke-test.mjs', {
    BASE_URL: `http://127.0.0.1:${port}/api`,
    SMOKE_EMAIL: '',
    SMOKE_PASSWORD: '',
    SMOKE_ACCOUNTS_JSON: '',
  });
  assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /3 passed, 0 failed, 1 skipped/);
});
