import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const appUrl = (process.env.GOLDEN_E2E_BASE_URL ?? 'http://localhost:8080').replace(/\/$/, '');
const email = process.env.GOLDEN_E2E_EMAIL;
const password = process.env.GOLDEN_E2E_PASSWORD;

const viewports = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1024x768', width: 1024, height: 768 },
];

const workspaces = [
  { name: 'dashboard', path: '/dashboard' },
  { name: 'fitout', path: '/fitout' },
  { name: 'crm', path: '/crm' },
  { name: 'spaces', path: '/spaces' },
  { name: 'work-orders', path: '/work-orders' },
  { name: 'reports', path: '/reports' },
  { name: 'admin', path: '/admin' },
];

const rawI18nKey = /\b(?:common|auth|dashboard|fitout|crm|spaces|workOrders|reports|admin|bookings|billing|contracts|proposals|approvals):?[a-z][\w-]*(?:\.[\w-]+){1,}\b/g;

async function authenticate(page: import('@playwright/test').Page) {
  const response = await page.request.post(`${appUrl}/api/auth/login`, {
    data: { email, password },
  });
  expect(response.ok(), `Login failed with HTTP ${response.status()}`).toBeTruthy();
  const body = await response.json();
  const token = body?.data?.accessToken ?? body?.accessToken;
  expect(token, 'Login response is missing accessToken').toBeTruthy();
  await page.goto(`${appUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((accessToken) => localStorage.setItem('token', accessToken), token);
}

test.describe('Golden candidate rendered viewports', () => {
  test.skip(!email || !password, 'Set GOLDEN_E2E_EMAIL and GOLDEN_E2E_PASSWORD for local rendered verification');

  for (const viewport of viewports) {
    test(`${viewport.name} has no page-level overflow, raw i18n keys or fatal render errors`, async ({ page }, testInfo) => {
      test.setTimeout(240_000);
      await mkdir('e2e/screenshots', { recursive: true });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await authenticate(page);

      for (const workspace of workspaces) {
        const errorStart = pageErrors.length;
        await page.goto(`${appUrl}${workspace.path}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1_250);

        expect(page.url(), `${workspace.name} redirected unexpectedly`).not.toContain('/login');

        const metrics = await page.evaluate(() => ({
          viewportWidth: document.documentElement.clientWidth,
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
          text: document.body.innerText,
        }));
        const overflow = Math.max(metrics.documentWidth, metrics.bodyWidth) - metrics.viewportWidth;
        expect(overflow, `${workspace.name} has ${overflow}px page-level horizontal overflow at ${viewport.name}`).toBeLessThanOrEqual(1);

        const rawKeys = Array.from(new Set(metrics.text.match(rawI18nKey) ?? []));
        expect(rawKeys, `${workspace.name} exposes raw i18n keys at ${viewport.name}`).toEqual([]);
        expect(pageErrors.slice(errorStart), `${workspace.name} emitted fatal page errors at ${viewport.name}`).toEqual([]);

        const screenshotPath = `e2e/screenshots/golden-${workspace.name}-${viewport.name}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        await testInfo.attach(`${workspace.name}-${viewport.name}`, {
          path: screenshotPath,
          contentType: 'image/png',
        });
      }
    });
  }
});
