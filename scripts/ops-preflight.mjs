import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const envPath = process.argv[2] ?? '.env';
const required = ['POSTGRES_PASSWORD', 'JWT_SECRET', 'CORS_ORIGIN'];
const productionRequiredWhenEnabled = {
  SAP_ENABLED: ['SAP_BASE_URL', 'SAP_CLIENT_ID', 'SAP_CLIENT_SECRET'],
};
const placeholderPatterns = [
  /^replace-/i,
  /^change-?me$/i,
  /^your[-_]/i,
  /^example/i,
];

function parseEnv(source) {
  const values = new Map();
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    values.set(key, value);
  }
  return values;
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

let source;
try {
  source = await readFile(envPath, 'utf8');
} catch {
  fail(`Cannot read ${envPath}. Create it from .env.example and set production values.`);
  process.exit();
}

const env = parseEnv(source);
for (const key of required) {
  const value = env.get(key);
  if (!value) {
    fail(`${key} is missing or empty in ${envPath}`);
  } else if (placeholderPatterns.some((pattern) => pattern.test(value))) {
    fail(`${key} still contains an example/placeholder value`);
  }
}

const jwtSecret = env.get('JWT_SECRET') ?? '';
if (jwtSecret && jwtSecret.length < 32) {
  fail('JWT_SECRET must contain at least 32 characters');
}

const corsOrigins = (env.get('CORS_ORIGIN') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
for (const origin of corsOrigins) {
  try {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/') {
      throw new Error();
    }
  } catch {
    fail(`CORS_ORIGIN contains an invalid origin: ${origin}`);
  }
}

if ((env.get('ALLOW_PUBLIC_REGISTER') ?? 'false').toLowerCase() === 'true') {
  fail('ALLOW_PUBLIC_REGISTER must not be true for a production deployment');
}
if ((env.get('SEED_DATABASE') ?? 'false').toLowerCase() === 'true') {
  fail('SEED_DATABASE must not be true for a production deployment');
}

for (const [featureFlag, featureVariables] of Object.entries(productionRequiredWhenEnabled)) {
  if ((env.get(featureFlag) ?? 'false').toLowerCase() !== 'true') continue;
  for (const key of featureVariables) {
    if (!env.get(key)) fail(`${key} is required when ${featureFlag}=true`);
  }
}

const smtpValues = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].filter((key) => !!env.get(key));
if (smtpValues.length > 0 && smtpValues.length < 3) {
  fail('SMTP configuration is partial; SMTP_HOST, SMTP_USER and SMTP_PASS must be set together');
}

const exposedPorts = ['DB_PORT', 'REDIS_PORT', 'BACKEND_PORT', 'FRONTEND_PORT'];
const seenPorts = new Map();
for (const key of exposedPorts) {
  const raw = env.get(key);
  if (!raw) continue;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail(`${key} must be a valid TCP port`);
    continue;
  }
  const existing = seenPorts.get(port);
  if (existing) fail(`${key} conflicts with ${existing} on port ${port}`);
  seenPorts.set(port, key);
}

if (!process.exitCode) {
  const compose = spawnSync(
    'docker',
    ['compose', '--env-file', envPath, 'config', '--quiet'],
    { stdio: 'inherit', shell: false },
  );
  if (compose.status !== 0) {
    fail('Docker Compose configuration is invalid');
  }
}

if (!process.exitCode) {
  console.log(`PASS: ${envPath} and Docker Compose configuration are deployment-ready.`);
}
