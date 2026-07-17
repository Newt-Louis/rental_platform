const baseUrl = (process.env.BASE_URL ?? 'http://localhost:3000/api').replace(/\/$/, '');
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 15_000);
const results = [];

const commonChecks = [
  ['Current user authorization', '/auth/me'],
  ['Dashboard', '/dashboard'],
];

const roleChecks = {
  ADMIN: [
    ['Users', '/users?limit=1'],
    ['Audit log', '/audit-logs?limit=1'],
    ['Malls', '/spaces/malls?limit=1'],
  ],
  LEASING_EXECUTIVE: [
    ['CRM leads', '/crm/leads?limit=1'],
    ['Bookings', '/bookings?limit=1'],
    ['Space inventory', '/spaces/units?limit=1'],
  ],
  LEASING_MANAGER: [
    ['CRM leads', '/crm/leads?limit=1'],
    ['Proposals', '/proposals?limit=1'],
    ['Approvals', '/approvals?limit=1'],
  ],
  LEGAL: [
    ['Contracts', '/contracts?limit=1'],
  ],
  OPERATION: [
    ['Fitout projects', '/fitouts?limit=1'],
    ['Operation tickets', '/tickets?limit=1'],
    ['Space inventory', '/spaces/units?limit=1'],
  ],
  FINANCE: [
    ['Invoices', '/billing/invoices?limit=1'],
    ['Contracts', '/contracts?limit=1'],
    ['AR dashboard', '/billing/ar-aging'],
  ],
  TENANT: [
    ['Tenant contracts', '/contracts?limit=1'],
    ['Tenant invoices', '/billing/invoices?limit=1'],
    ['Tenant tickets', '/tickets?limit=1'],
  ],
  CEO: [
    ['Revenue and receivables report', '/reports/revenue-receivables'],
    ['Occupancy analytics', '/analytics/occupancy'],
    ['Audit log', '/audit-logs?limit=1'],
  ],
  MALL_DIRECTOR: [
    ['Occupancy analytics', '/analytics/occupancy'],
    ['Approvals', '/approvals?limit=1'],
    ['Operation tickets', '/tickets?limit=1'],
  ],
};

async function request(path, options = {}) {
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
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(body).slice(0, 300)}`);
  }
  return body?.data ?? body;
}

async function check(scope, name, fn) {
  const startedAt = performance.now();
  try {
    const detail = await fn();
    results.push({ scope, name, status: 'PASS', ms: Math.round(performance.now() - startedAt), detail: detail ?? '' });
  } catch (error) {
    results.push({
      scope,
      name,
      status: 'FAIL',
      ms: Math.round(performance.now() - startedAt),
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

function loadAccounts() {
  if (process.env.SMOKE_ACCOUNTS_JSON) {
    const parsed = JSON.parse(process.env.SMOKE_ACCOUNTS_JSON);
    if (!Array.isArray(parsed)) throw new Error('SMOKE_ACCOUNTS_JSON must be an array');
    return parsed;
  }
  if (process.env.SMOKE_EMAIL && process.env.SMOKE_PASSWORD) {
    return [{ email: process.env.SMOKE_EMAIL, password: process.env.SMOKE_PASSWORD }];
  }
  return [];
}

await check('public', 'Liveness', async () => {
  const health = await request('/health/live');
  if (health.status !== 'ok') throw new Error(`Unexpected liveness: ${JSON.stringify(health)}`);
  return health.service;
});

await check('public', 'Database readiness', async () => {
  const health = await request('/health/ready');
  if (health.status !== 'ok' || health.components?.database !== 'up') {
    throw new Error(`Unhealthy response: ${JSON.stringify(health)}`);
  }
  return 'database=up';
});

await check('public', 'Dependency configuration', async () => {
  const health = await request('/health');
  return Object.entries(health.components ?? {}).map(([key, value]) => `${key}=${value}`).join(', ');
});

let accounts = [];
try {
  accounts = loadAccounts();
} catch (error) {
  results.push({ scope: 'config', name: 'Smoke accounts', status: 'FAIL', ms: 0, detail: error.message });
}

for (const account of accounts) {
  let token;
  let role;
  const scope = account.label ?? account.email ?? 'account';
  await check(scope, 'Authentication', async () => {
    const auth = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: account.email, password: account.password }),
    });
    token = auth.accessToken;
    role = auth.user?.role;
    if (!token || !role) throw new Error('Login response is missing token or role');
    if (account.role && account.role !== role) throw new Error(`Expected role ${account.role}, received ${role}`);
    return role;
  });
  if (!token) continue;

  // TENANT users land on the tenant portal and are intentionally denied the
  // internal management dashboard. All other roles exercise the shared ERP shell.
  const sharedChecks = role === 'TENANT'
    ? commonChecks.filter(([, path]) => path !== '/dashboard')
    : commonChecks;
  const checks = [...sharedChecks, ...(roleChecks[role] ?? [])];
  for (const [name, path] of checks) {
    await check(scope, name, () => request(path, { headers: { Authorization: `Bearer ${token}` } }));
  }
}

if (!accounts.length) {
  results.push({
    scope: 'RBAC',
    name: 'Authenticated journeys',
    status: 'SKIP',
    ms: 0,
    detail: 'Set SMOKE_ACCOUNTS_JSON or SMOKE_EMAIL/SMOKE_PASSWORD',
  });
}

console.table(results);
const failures = results.filter((result) => result.status === 'FAIL');
const passes = results.filter((result) => result.status === 'PASS');
console.log(`Smoke summary: ${passes.length} passed, ${failures.length} failed, ${results.length - passes.length - failures.length} skipped.`);
process.exitCode = failures.length ? 1 : 0;
