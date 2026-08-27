/**
 * Verification suite for the NumericFormat/react-hook-form fix in CreateEditUnitDialog.
 *
 * Fix: numeric fields (areaGFA, areaNLA, baseRentPerSqm, camPerSqm, minFlexArea, maxFlexArea)
 * now use explicit value={watch('field')} + onChange → setValue(...) alongside register(),
 * so NumericFormat's internal state is properly seeded by react-hook-form's reset().
 *
 * Unit under test: code="xxxx", areaGFA=111, areaNLA=111, baseRentPerSqm=11, camPerSqm=11
 * Unit ID: cmru4t8ea000112jn8zlv74hg
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';
const API_BASE = 'http://localhost:3000/api';
const UNIT_ID = 'cmru4t8ea000112jn8zlv74hg';

// ─── API helpers ─────────────────────────────────────────────────────────────

async function getApiToken(request: Parameters<Parameters<typeof test>[1]>[0]['request']): Promise<string> {
  const res = await request.post(`${API_BASE}/auth/login`, {
    data: { email: 'admin@thiso.com', password: 'Admin123!' },
  });
  const body = await res.json();
  const token = body.accessToken ?? body.data?.accessToken;
  if (!token) throw new Error('Could not obtain auth token from login API');
  return token;
}

// ─── Page helpers ─────────────────────────────────────────────────────────────

async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.locator('#email').fill('admin@thiso.com');
  await page.locator('#password').fill('Admin123!');
  await page.getByRole('button', { name: /sign in|đăng nhập|login/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 });
  await page.waitForLoadState('networkidle');
}

async function navigateToSpaces(page: Page) {
  await page.goto(`${BASE_URL}/spaces`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
}

async function openUnitDetail(page: Page) {
  // Try search first
  const searchInput = page.getByPlaceholder(/tìm kiếm|search/i).first();
  const hasSearch = await searchInput.isVisible({ timeout: 2_000 }).catch(() => false);
  if (hasSearch) {
    await searchInput.fill('xxxx');
    await page.waitForTimeout(700);
  }

  // Click the "xxxx" unit card to open the detail sheet
  const unitCard = page.getByText('xxxx', { exact: true }).first();
  await expect(unitCard).toBeVisible({ timeout: 10_000 });
  await unitCard.click();

  // Wait for the detail sheet
  await expect(page.getByText(/xxxx/i).first()).toBeVisible({ timeout: 8_000 });
  // Allow the getUnit API call to settle
  await page.waitForTimeout(2_000);
}

async function closeDetailSheet(page: Page) {
  // The custom Sheet component listens for Escape via a keydown handler.
  await page.keyboard.press('Escape');
  // Wait for the 300ms CSS translate transition to complete.
  await page.waitForTimeout(600);
}

async function scrollSheetToBottom(page: Page) {
  await page.evaluate(() => {
    // Sheet inner: <div class="flex-1 overflow-y-auto">
    const scrollables = Array.from(document.querySelectorAll<HTMLElement>('.flex-1.overflow-y-auto'));
    const last = scrollables[scrollables.length - 1];
    if (last) { last.scrollTop = last.scrollHeight; return; }
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(300);
}

async function clickEditButton(page: Page) {
  // The "Sửa" button in UnitDetailSheet is hardcoded Vietnamese text.
  const editBtn = page.getByRole('button', { name: /^sửa$/i });
  await expect(editBtn).toBeVisible({ timeout: 6_000 });
  await editBtn.click();
}

async function waitForEditDialog(page: Page) {
  // Dialog title is hardcoded: "Sửa mặt bằng: xxxx"
  const dialog = page.locator('[role="dialog"]').filter({ hasText: /sửa mặt bằng/i });
  await expect(dialog).toBeVisible({ timeout: 8_000 });
  // Give react-hook-form reset() and NumericFormat time to sync.
  await page.waitForTimeout(700);
  return dialog;
}

async function readInputValue(dialog: ReturnType<Page['locator']>, name: string): Promise<string> {
  const el = dialog.locator(`input[name="${name}"]`).first();
  await el.waitFor({ state: 'attached', timeout: 4_000 });
  return el.inputValue();
}

/**
 * Select a specific mall via the MallContextModal.
 * The create button in SpacesPage only renders when {isAdmin && selectedMallId}.
 */
async function selectMall(page: Page, mallName: string) {
  // The mall selector button in the header shows the current mall name or "Tất cả Mall".
  // It may already show the target mall (if the admin's activeMall is persisted in DB).
  const headerBtn = page.locator('header button, [role="banner"] button').filter({
    hasText: new RegExp(mallName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
  }).first();
  const alreadySelected = await headerBtn.isVisible({ timeout: 1_500 }).catch(() => false);

  if (alreadySelected) {
    console.log(`  Mall "${mallName}" already selected — skipping modal open`);
    return;
  }

  // Open the mall modal
  const mallSelectorBtn = page.locator('header button, [role="banner"] button').filter({
    hasText: /tất cả mall|all mall/i,
  }).first();
  await expect(mallSelectorBtn).toBeVisible({ timeout: 5_000 });
  await mallSelectorBtn.click();

  // Wait for MallContextModal
  const modal = page.locator('[role="dialog"]').filter({ hasText: /chọn mall/i });
  await expect(modal).toBeVisible({ timeout: 5_000 });
  await page.waitForTimeout(500); // let mall list load

  // Click on the target mall
  const mallOption = modal.getByText(mallName, { exact: false }).first();
  await expect(mallOption).toBeVisible({ timeout: 5_000 });
  await mallOption.click();

  await expect(modal).not.toBeVisible({ timeout: 5_000 });
  await page.waitForTimeout(800);
}

// ─── Test setup: ensure unit is in known state ────────────────────────────────

test.beforeAll(async ({ request }) => {
  // Reset the test unit to its canonical values before any test in this file runs.
  // This prevents data pollution from previous failed runs where the restore didn't execute.
  const token = await getApiToken(request);
  const res = await request.patch(`${API_BASE}/spaces/units/${UNIT_ID}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { areaGFA: 111, areaNLA: 111, baseRentPerSqm: 11, camPerSqm: 11 },
  });
  if (!res.ok()) {
    console.warn(`beforeAll unit reset failed: ${res.status()} ${await res.text()}`);
  } else {
    console.log('beforeAll: unit reset to areaGFA=111, areaNLA=111, baseRentPerSqm=11, camPerSqm=11');
  }
});

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('CreateEditUnitDialog – numeric field fix verification', () => {

  /**
   * CHECK 1: Edit dialog pre-populates the 4 numeric fields with stored values.
   *
   * Before the fix: NumericFormat kept its empty internal state and ignored the value
   * that react-hook-form's reset() set imperatively.
   * After the fix: areaGFA=111, areaNLA=111, baseRentPerSqm=11, camPerSqm=11.
   */
  test('CHECK 1 – Edit popup pre-populates numeric fields (not blank)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await login(page);
    await navigateToSpaces(page);
    await openUnitDetail(page);
    await scrollSheetToBottom(page);

    await page.screenshot({ path: 'e2e/screenshots/fix-check1-before-edit.png' });

    await clickEditButton(page);
    const dialog = await waitForEditDialog(page);

    await page.screenshot({ path: 'e2e/screenshots/fix-check1-dialog-open.png' });

    // Read the 4 key numeric fields
    const gfa  = await readInputValue(dialog, 'areaGFA');
    const nla  = await readInputValue(dialog, 'areaNLA');
    const rent = await readInputValue(dialog, 'baseRentPerSqm');
    const cam  = await readInputValue(dialog, 'camPerSqm');

    // Also read code field to confirm the form loaded at all
    const code = await readInputValue(dialog, 'code');

    console.log('\n=== CHECK 1: Edit dialog field values ===');
    console.log(`  code (text field, expect "xxxx"):       "${code}"`);
    console.log(`  areaGFA (expect "111"):                  "${gfa}"`);
    console.log(`  areaNLA (expect "111"):                  "${nla}"`);
    console.log(`  baseRentPerSqm (expect "11"):            "${rent}"`);
    console.log(`  camPerSqm (expect "11"):                 "${cam}"`);

    if (consoleErrors.length > 0) {
      console.log('\n=== CONSOLE ERRORS ===');
      consoleErrors.forEach((e) => console.log(' ', e));
    } else {
      console.log('\n  (no console errors)');
    }

    // Core assertion: none of the numeric fields may be blank (that was the bug)
    expect(gfa,  'areaGFA must not be blank after fix').not.toBe('');
    expect(nla,  'areaNLA must not be blank after fix').not.toBe('');
    expect(rent, 'baseRentPerSqm must not be blank after fix').not.toBe('');
    expect(cam,  'camPerSqm must not be blank after fix').not.toBe('');

    // Values must match the stored backend data (reset to 111/111/11/11 by beforeAll).
    // NumericFormat with thousandSeparator="," formats with commas at ≥1000; strip them.
    const stripCommas = (v: string) => v.replace(/,/g, '');
    expect(stripCommas(gfa),  'areaGFA value').toBe('111');
    expect(stripCommas(nla),  'areaNLA value').toBe('111');
    expect(stripCommas(rent), 'baseRentPerSqm value').toBe('11');
    expect(stripCommas(cam),  'camPerSqm value').toBe('11');
  });

  /**
   * CHECK 2: End-to-end edit — change areaGFA from 111 → 222, save, reopen and confirm 222.
   *
   * Implementation note: CreateEditUnitDialog's mutation only invalidates ['units'] (the list),
   * NOT ['unit-detail', unit.id]. After saving we must close the Sheet and re-click the unit
   * to force a fresh unit-detail fetch. Only then will the Edit dialog show the new value.
   *
   * Restores GFA to 111 at the end for test idempotency.
   */
  test('CHECK 2 – Edit saves correctly and persists the new value', async ({ page, request }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await login(page);
    await navigateToSpaces(page);
    await openUnitDetail(page);
    await scrollSheetToBottom(page);
    await clickEditButton(page);
    const dialog = await waitForEditDialog(page);

    // ── Change areaGFA: select all and type "222" ──────────────────────────
    const gfaInput = dialog.locator('input[name="areaGFA"]').first();
    await gfaInput.waitFor({ state: 'visible', timeout: 4_000 });

    // Select all existing text, then type to trigger NumericFormat's onValueChange → setValue
    await gfaInput.click();
    await page.keyboard.press('Control+a');
    await gfaInput.type('222');

    const gfaAfterTyping = await gfaInput.inputValue();
    console.log(`\n  areaGFA after typing "222": "${gfaAfterTyping}" (expect "222")`);
    expect(gfaAfterTyping.replace(/,/g, ''), 'areaGFA after typing').toBe('222');

    await page.screenshot({ path: 'e2e/screenshots/fix-check2-after-type.png' });

    // ── Submit the form ─────────────────────────────────────────────────────
    const saveBtn = dialog.getByRole('button', { name: /lưu thay đổi|save/i });
    await expect(saveBtn).toBeEnabled({ timeout: 3_000 });
    await saveBtn.click();

    // Dialog closes on success
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    // Success toast (hardcoded Vietnamese in the mutation's onSuccess)
    const toast = page.getByText(/đã cập nhật mặt bằng/i);
    await expect(toast).toBeVisible({ timeout: 8_000 });
    console.log('  Submit: dialog closed, success toast visible');

    await page.screenshot({ path: 'e2e/screenshots/fix-check2-after-save.png' });

    // ── Verify via API that the backend persisted 222 ─────────────────────
    // Auth token is stored in localStorage under key 'token' (useAuthStore uses
    // localStorage.setItem('token', ...) directly, not Zustand persist)
    const accessToken = await page.evaluate(() => localStorage.getItem('token'));

    if (accessToken) {
      const unitRes = await request.get(`${API_BASE}/spaces/units/${UNIT_ID}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (unitRes.ok()) {
        const body = await unitRes.json();
        const isWrapped = body?.success !== undefined && 'data' in body && !('total' in body);
        const unitData = isWrapped ? body.data : body;
        const apiGfa = unitData?.areaGFA;
        console.log(`  API verification: areaGFA from backend = ${apiGfa} (expect 222)`);
        expect(apiGfa, 'Backend must have persisted areaGFA=222').toBe(222);
      } else {
        console.log(`  API verification skipped: ${unitRes.status()}`);
      }
    } else {
      console.log('  API verification skipped: no token in localStorage');
    }

    // ── Reload the page to clear the React Query cache, then reopen the unit ──
    // The mutation only invalidates ['units'] (not ['unit-detail', unit.id]).
    // In headless mode React Query v5 does not reliably fire a background refetch
    // when the disabled→enabled query key transition happens; the in-memory cache
    // keeps serving the stale value (111). A full page reload clears the cache so
    // the next unit-detail fetch is guaranteed to be fresh from the backend.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    // Ensure we're still authenticated (the auth token is in localStorage)
    if (page.url().includes('/login')) {
      await login(page);
    }

    await openUnitDetail(page);
    await scrollSheetToBottom(page);

    await page.screenshot({ path: 'e2e/screenshots/fix-check2-reopen-sheet.png' });

    await clickEditButton(page);
    const dialog2 = await waitForEditDialog(page);

    await page.screenshot({ path: 'e2e/screenshots/fix-check2-reopen-dialog.png' });

    const gfaAfterReopen = await readInputValue(dialog2, 'areaGFA');
    console.log(`  areaGFA after sheet reopen + edit dialog: "${gfaAfterReopen}" (expect "222")`);
    expect(gfaAfterReopen.replace(/,/g, ''), 'UI must show 222 after fresh detail fetch').toBe('222');

    console.log('\n=== CONSOLE ERRORS ===');
    if (consoleErrors.length === 0) {
      console.log('  (none)');
    } else {
      consoleErrors.forEach((e) => console.log(' ', e));
    }

    // ── Restore areaGFA to 111 for test idempotency ─────────────────────────
    const gfaInput2 = dialog2.locator('input[name="areaGFA"]').first();
    await gfaInput2.click();
    await page.keyboard.press('Control+a');
    await gfaInput2.type('111');

    const saveBtn2 = dialog2.getByRole('button', { name: /lưu thay đổi|save/i });
    await saveBtn2.click();
    await expect(dialog2).not.toBeVisible({ timeout: 10_000 });
    console.log('  Restored areaGFA to 111');
  });

  /**
   * CHECK 3: CREATE flow sanity check — open "Thêm mặt bằng mới", type GFA=500,
   * confirm digits appear as typed without glitches, doubling, or clearing.
   *
   * Note: The create button (and dialog) title uses i18n (t('unit.create')),
   * which may render as "Add space" (en-US) or "Thêm mặt bằng mới" (vi).
   * The dialog title is hardcoded "Thêm mặt bằng mới" in the component.
   * The button only renders when {isAdmin && selectedMallId} is truthy.
   */
  test('CHECK 3 – Create flow: typing in GFA field works without glitches', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await login(page);
    await navigateToSpaces(page);

    // Ensure a mall is selected so the create button renders.
    await selectMall(page, 'Tây Hồ tây');

    await page.screenshot({ path: 'e2e/screenshots/fix-check3-after-mall-select.png' });

    // The create button text comes from i18n:
    //   - Vietnamese locale: "Thêm mặt bằng mới"
    //   - English locale (en-US browser): "Add space" (whatever the en translation is)
    // Accept either via combined regex.
    const createBtn = page.getByRole('button', { name: /thêm mặt bằng mới|add space/i });
    await expect(createBtn).toBeVisible({ timeout: 8_000 });
    await createBtn.click();

    // Dialog title is hardcoded "Thêm mặt bằng mới" (not from i18n).
    const createDialog = page.locator('[role="dialog"]').filter({ hasText: /thêm mặt bằng mới|add space/i });
    await expect(createDialog).toBeVisible({ timeout: 8_000 });
    await page.waitForTimeout(400);

    await page.screenshot({ path: 'e2e/screenshots/fix-check3-create-dialog-open.png' });

    // The GFA input starts empty in create mode (defaultValues: areaGFA: '')
    const gfaInput = createDialog.locator('input[name="areaGFA"]').first();
    await gfaInput.waitFor({ state: 'visible', timeout: 4_000 });

    const gfaInitial = await gfaInput.inputValue();
    console.log(`\n=== CHECK 3: Create dialog ===`);
    console.log(`  areaGFA initial value: "${gfaInitial}" (expect empty "")`);
    expect(gfaInitial, 'GFA field should start empty in create mode').toBe('');

    // Type "5", "0", "0" one character at a time to test the onChange pathway
    await gfaInput.click();
    await gfaInput.type('5');
    const after5 = await gfaInput.inputValue();
    console.log(`  After typing "5": "${after5}" (expect "5")`);

    await gfaInput.type('0');
    const after50 = await gfaInput.inputValue();
    console.log(`  After typing "50": "${after50}" (expect "50")`);

    await gfaInput.type('0');
    const after500 = await gfaInput.inputValue();
    console.log(`  After typing "500": "${after500}" (expect "500")`);

    await page.screenshot({ path: 'e2e/screenshots/fix-check3-after-typing.png' });

    // Each digit must appear immediately and correctly — no glitch/doubling/clearing
    expect(after5.replace(/,/g, ''), 'digit "5" must appear immediately').toBe('5');
    expect(after50.replace(/,/g, ''), 'typing "50" must produce "50"').toBe('50');
    expect(after500.replace(/,/g, ''), 'typing "500" must produce "500"').toBe('500');

    console.log('\n=== CONSOLE ERRORS ===');
    if (consoleErrors.length === 0) {
      console.log('  (none)');
    } else {
      consoleErrors.forEach((e) => console.log(' ', e));
    }

    // No unhandled JS errors (React controlled/uncontrolled warnings are not errors)
    const jsErrors = consoleErrors.filter((e) => !/warning/i.test(e));
    expect(jsErrors, 'No unhandled JS errors during create flow').toHaveLength(0);
  });

});
