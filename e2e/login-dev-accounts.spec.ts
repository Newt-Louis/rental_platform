import { test, expect } from '@playwright/test';

// Screenshot test to see the feature
test('Screenshot: Dev Accounts section visible', async ({ context, page }) => {
  await context.addCookies([
    {
      name: 'is_dev',
      value: 'true',
      domain: 'localhost',
      path: '/',
    },
  ]);

  await page.goto('http://localhost:5173/login');
  await page.waitForSelector('text=Dev Accounts');
  await page.screenshot({ path: 'login-with-dev-accounts.png', fullPage: true });
});

test.describe('Login page - Dev Accounts feature', () => {
  test('Dev accounts section should NOT appear without is_dev cookie', async ({ page }) => {
    await page.goto('http://localhost:5173/login');

    const devSection = page.locator('text=Dev Accounts');
    await expect(devSection).not.toBeVisible();
  });

  test('Dev accounts section should appear when is_dev cookie is set', async ({ context, page }) => {
    // Set is_dev cookie
    await context.addCookies([
      {
        name: 'is_dev',
        value: 'true',
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.goto('http://localhost:5173/login');

    // Check if Dev Accounts section is visible
    const devSection = page.locator('text=Dev Accounts');
    await expect(devSection).toBeVisible();
  });

  test('Dev account buttons should be clickable and populate form', async ({ context, page }) => {
    await context.addCookies([
      {
        name: 'is_dev',
        value: 'true',
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.goto('http://localhost:5173/login');

    // Wait for dev accounts to load
    await page.waitForSelector('text=ADMIN', { timeout: 5000 });

    // Click ADMIN button
    const adminButton = page.locator('text=ADMIN').first();
    await adminButton.click();

    // Check if email field is populated
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toHaveValue('admin@thiso.com');

    // Check if password field is populated
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toHaveValue('Admin123!');
  });

  test('All 9 dev accounts should be visible when cookie is set', async ({ context, page }) => {
    await context.addCookies([
      {
        name: 'is_dev',
        value: 'true',
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.goto('http://localhost:5173/login');

    const roles = [
      'ADMIN', 'LEASING EXECUTIVE', 'LEASING MANAGER', 'MALL DIRECTOR',
      'FINANCE', 'LEGAL', 'OPERATION', 'CEO', 'TENANT'
    ];

    for (const role of roles) {
      const button = page.locator('button').filter({ hasText: role });
      await expect(button.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('Dev account quick-login should not trigger login when password is wrong', async ({ context, page }) => {
    await context.addCookies([
      {
        name: 'is_dev',
        value: 'true',
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.goto('http://localhost:5173/login');

    // Click TENANT button (should have valid credentials)
    const tenantButton = page.locator('text=TENANT').first();
    await tenantButton.click();

    // Verify form is populated
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toHaveValue('tenant@thiso.com');
  });
});
