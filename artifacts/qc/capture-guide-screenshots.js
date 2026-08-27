const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const out = path.join(__dirname, 'guide-images');
fs.mkdirSync(out, { recursive: true });

async function login(page, email, password) {
  const response = await page.request.post('http://localhost:53000/api/auth/login', { data: { email, password } });
  if (!response.ok()) throw new Error(`Login failed: ${response.status()} ${await response.text()}`);
  const body = await response.json();
  await page.goto('http://localhost:58080/login');
  await page.evaluate((token) => localStorage.setItem('token', token), body.accessToken);
}

async function capture(page, name, route) {
  await page.goto(`http://localhost:58080${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
}

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  const admin = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await admin.newPage();
  await login(page, 'admin@thiso.com', 'Admin123!');
  for (const [name, route] of [
    ['01-dashboard', '/dashboard'], ['02-spaces', '/spaces'], ['03-crm', '/crm'],
    ['04-bookings', '/bookings'], ['05-proposals', '/proposals'], ['06-approvals', '/approvals'],
    ['07-contracts', '/contracts'], ['08-fitout', '/fitout'], ['09-tickets', '/tickets'],
    ['10-billing', '/billing'], ['11-announcements', '/announcements'], ['12-admin', '/admin'],
  ]) await capture(page, name, route);
  await admin.close();

  const tenant = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const tenantPage = await tenant.newPage();
  await login(tenantPage, 'portal.highlands@thiso.com', 'Tenant123!');
  await capture(tenantPage, '13-tenant-portal', '/tenant-portal');
  await capture(tenantPage, '14-tenant-announcements', '/announcements');
  await tenant.close();
  await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
