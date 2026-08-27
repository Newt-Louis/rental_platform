const apiUrl = (process.env.BASE_URL ?? 'http://localhost:3000/api').replace(/\/$/, '');
const frontendUrl = (process.env.FRONTEND_URL ?? 'http://localhost:8080').replace(/\/$/, '');
const timeoutMs = Number(process.env.READINESS_TIMEOUT_MS ?? 10_000);
const checks = [];

async function probe(name, url, validate) {
  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json,text/plain,text/html',
        Connection: 'close',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    await validate(response, text);
    checks.push({ name, status: 'PASS', ms: Math.round(performance.now() - startedAt), detail: `HTTP ${response.status}` });
  } catch (error) {
    checks.push({ name, status: 'FAIL', ms: Math.round(performance.now() - startedAt), detail: error.message });
  }
}

await probe('API liveness', `${apiUrl}/health/live`, async (_response, text) => {
  const body = JSON.parse(text);
  if (body?.data?.status !== 'ok' && body?.status !== 'ok') throw new Error('Liveness status is not ok');
});
await probe('API readiness', `${apiUrl}/health/ready`, async (_response, text) => {
  const body = JSON.parse(text);
  const health = body?.data ?? body;
  if (health.status !== 'ok' || health.components?.database !== 'up') throw new Error('Database is not ready');
});
await probe('Frontend health', `${frontendUrl}/health`, async (_response, text) => {
  if (!text.trim()) throw new Error('Empty frontend health response');
});
await probe('Frontend API proxy', `${frontendUrl}/api/health/live`, async (_response, text) => {
  const body = JSON.parse(text);
  if ((body?.data ?? body)?.status !== 'ok') throw new Error('Proxied liveness status is not ok');
});
await probe('Frontend SPA shell', `${frontendUrl}/`, async (response, text) => {
  if (!response.headers.get('x-content-type-options')) throw new Error('Missing X-Content-Type-Options');
  if (!/<div[^>]+id=["']root["']/.test(text)) throw new Error('SPA root element not found');
});

console.table(checks);
const failed = checks.filter((check) => check.status === 'FAIL');
console.log(`Readiness summary: ${checks.length - failed.length}/${checks.length} checks passed.`);
process.exitCode = failed.length ? 1 : 0;
