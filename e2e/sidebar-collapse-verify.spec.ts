import { test, expect, Page } from '@playwright/test';
import path from 'path';

const SCREENSHOT_DIR = 'C:\\Users\\Win10\\AppData\\Local\\Temp\\claude\\d--job-new-htdocs-emart-thiso-leasing\\4f35ea6b-fb28-49cd-b67c-e728165b6225\\scratchpad';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill('admin@thiso.com');
  await page.getByLabel(/password/i).fill('Admin123!');
  await page.getByRole('button', { name: /login|sign in|đăng nhập/i }).click();
  // Wait for dashboard to load
  await page.waitForURL(/\/(dashboard|$)/, { timeout: 15_000 });
}

test.describe('Sidebar collapse/expand toggle', () => {
  test('collapse, tooltip on hover, localStorage persistence, re-expand', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(`[pageerror] ${err.message}`));

    // ── 1. Login ──────────────────────────────────────────────────────────────
    await login(page);

    // Ensure sidebar starts expanded (clear any leftover collapsed state)
    await page.evaluate(() => localStorage.setItem('thiso-sidebar-collapsed', '0'));
    await page.reload();
    await page.waitForURL(/\/(dashboard|$)/, { timeout: 15_000 });

    // ── 2. Locate the toggle button ───────────────────────────────────────────
    // When expanded the button aria-label is "Collapse navigation menu"
    const collapseBtn = page.getByRole('button', { name: 'Collapse navigation menu' });
    await expect(collapseBtn).toBeVisible({ timeout: 8_000 });

    // Verify sidebar is currently EXPANDED (≥200px wide)
    const sidebar = page.getByRole('complementary', { name: 'Main navigation' });
    const expandedWidth = await sidebar.evaluate((el) => el.getBoundingClientRect().width);
    expect(expandedWidth).toBeGreaterThan(100);

    // ── 3. Click to collapse ──────────────────────────────────────────────────
    await collapseBtn.click();

    // Button label should now read "Expand navigation menu"
    const expandBtn = page.getByRole('button', { name: 'Expand navigation menu' });
    await expect(expandBtn).toBeVisible({ timeout: 5_000 });

    // Wait for CSS transition (300ms) to finish
    await page.waitForTimeout(400);

    // Sidebar should be narrowed to ~64px (md:w-16)
    const collapsedWidth = await sidebar.evaluate((el) => el.getBoundingClientRect().width);
    expect(collapsedWidth).toBeLessThan(100);

    // ── 4. Hover over Dashboard icon — tooltip should appear ──────────────────
    // The Dashboard navlink has aria-label="Dashboard"
    const dashboardLink = sidebar.getByRole('link', { name: 'Dashboard' });
    await expect(dashboardLink).toBeVisible();
    await dashboardLink.hover();

    // TooltipProvider has delayDuration=0, so tooltip should appear quickly
    const tooltip = page.getByRole('tooltip', { name: 'Dashboard' });
    await expect(tooltip).toBeVisible({ timeout: 3_000 });

    // Screenshot: collapsed sidebar + tooltip
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'sidebar-collapsed-tooltip.png'),
      fullPage: false,
    });

    // ── 5. Reload — collapsed state should persist ────────────────────────────
    await page.reload();
    await page.waitForURL(/\/(dashboard|$)/, { timeout: 15_000 });

    // Wait for React to hydrate
    await page.waitForTimeout(800);

    const widthAfterReload = await sidebar.evaluate((el) => el.getBoundingClientRect().width);
    expect(widthAfterReload).toBeLessThan(100);

    // The "Expand navigation menu" button (collapsed state) should still be shown
    await expect(expandBtn).toBeVisible({ timeout: 5_000 });

    // localStorage should still store "1"
    const storedValue = await page.evaluate(() =>
      localStorage.getItem('thiso-sidebar-collapsed'),
    );
    expect(storedValue).toBe('1');

    // ── 6. Expand again — text labels reappear ────────────────────────────────
    await expandBtn.click();

    await page.waitForTimeout(400); // wait for transition

    const reexpandedWidth = await sidebar.evaluate((el) => el.getBoundingClientRect().width);
    expect(reexpandedWidth).toBeGreaterThan(150);

    // A text label (e.g. "Dashboard") should now be visible as text in the sidebar
    await expect(sidebar.getByText('Dashboard', { exact: true })).toBeVisible({ timeout: 5_000 });

    // Screenshot: expanded sidebar with text labels
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'sidebar-expanded.png'),
      fullPage: false,
    });

    // ── 7. Console error report ───────────────────────────────────────────────
    const relevantErrors = consoleErrors.filter(
      (e) => /tooltip|radix|react|layout/i.test(e),
    );
    // Attach all console errors as test info regardless
    if (consoleErrors.length > 0) {
      console.log('Console errors captured:', consoleErrors);
    }
    expect(relevantErrors, `Tooltip/Radix/React console errors: ${relevantErrors.join('\n')}`).toHaveLength(0);
  });
});
