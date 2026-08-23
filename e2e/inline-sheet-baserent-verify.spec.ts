/**
 * Verification: UnitDetailSheet inline "THÔNG TIN MẶT BẰNG" form —
 * numeric fields (baseRentPerSqm, areaGFA) fix verification.
 *
 * Bug fixed: react-hook-form's register() ref was attached to the
 * NumericFormat-rendered display input, so form submit read "5,000" (comma-
 * formatted) instead of "5000". Number("5,000") === NaN → JSON null → 400.
 *
 * Fix: visible <Input> uses value/onChange only; a hidden <input {...register}>
 * lets react-hook-form track the clean numeric string via setValue().
 *
 * This spec exercises the INLINE form in the UnitDetailSheet (the "THÔNG TIN
 * MẶT BẰNG" section with the "Lưu" button), NOT the separate edit dialog.
 *
 * Test unit: code="xxxx", id=cmru4t8ea000112jn8zlv74hg (mall: Tây Hồ tây)
 */
import { test, expect, Page, Request, Response } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';
const API_BASE = 'http://localhost:3000/api';
const UNIT_ID = 'cmru4t8ea000112jn8zlv74hg';

// ─── API helpers ────────────────────────────────────────────────────────────

async function getApiToken(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
): Promise<string> {
  const res = await request.post(`${API_BASE}/auth/login`, {
    data: { email: 'admin@thiso.com', password: 'Admin123!' },
  });
  const body = await res.json();
  const token = body.accessToken ?? body.data?.accessToken;
  if (!token) throw new Error('Could not obtain auth token from login API');
  return token;
}

async function getUnitFromApi(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
  token: string,
) {
  const res = await request.get(`${API_BASE}/spaces/units/${UNIT_ID}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  return body?.data ?? body;
}

// ─── Page helpers ────────────────────────────────────────────────────────────

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

async function openUnitSheet(page: Page) {
  // Try search input
  const searchInput = page.getByPlaceholder(/tìm kiếm|search/i).first();
  const hasSearch = await searchInput.isVisible({ timeout: 2_000 }).catch(() => false);
  if (hasSearch) {
    await searchInput.fill('xxxx');
    await page.waitForTimeout(700);
  }

  // Click the unit card to open the detail sheet
  const unitCard = page.getByText('xxxx', { exact: true }).first();
  await expect(unitCard).toBeVisible({ timeout: 10_000 });
  await unitCard.click();

  // Wait for the sheet and let data settle
  await page.waitForTimeout(2_000);
}

/** Returns the visible (non-hidden) input with the given name inside the sheet */
function visibleInput(page: Page, name: string) {
  // The NumericFormat-rendered input has name="xyz" and is NOT type="hidden"
  // The register() hidden input also has name="xyz" but IS type="hidden"
  return page.locator(`input[name="${name}"]:not([type="hidden"])`).first();
}

/** Clears the input and types a string character-by-character */
async function clearAndType(page: Page, locator: ReturnType<Page['locator']>, text: string) {
  await locator.click({ clickCount: 3 }); // triple-click to select all
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(100);
  for (const char of text) {
    await locator.type(char, { delay: 50 });
  }
  await page.waitForTimeout(200);
}

// ─── Setup: reset unit to canonical state ───────────────────────────────────

test.beforeAll(async ({ request }) => {
  const token = await getApiToken(request);
  const res = await request.patch(`${API_BASE}/spaces/units/${UNIT_ID}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { areaGFA: 111, areaNLA: 111, baseRentPerSqm: 11, camPerSqm: 11 },
  });
  if (!res.ok()) {
    console.warn(`beforeAll reset failed: ${res.status()} ${await res.text()}`);
  } else {
    console.log('beforeAll: unit reset to areaGFA=111, baseRentPerSqm=11');
  }
});

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Inline sheet form — baseRentPerSqm + areaGFA fix verification', () => {

  test('Step 1: Sheet inline form pre-populates numeric fields from DB', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push(`PAGE_ERROR: ${err.message}`));

    await login(page);
    await navigateToSpaces(page);
    await openUnitSheet(page);

    await page.screenshot({ path: 'e2e/screenshots/inline-verify-01-sheet-open.png' });

    // The inline form's visible numeric inputs (NOT the hidden register inputs)
    const rentInput  = visibleInput(page, 'baseRentPerSqm');
    const gfaInput   = visibleInput(page, 'areaGFA');

    // Wait for them to be visible (they live inside the "THÔNG TIN MẶT BẰNG" section)
    await expect(rentInput).toBeVisible({ timeout: 8_000 });
    await expect(gfaInput).toBeVisible({ timeout: 4_000 });

    const rentVal = await rentInput.inputValue();
    const gfaVal  = await gfaInput.inputValue();

    console.log('\n=== Step 1: Inline form pre-populated values ===');
    console.log(`  baseRentPerSqm (expect "11"):  "${rentVal}"`);
    console.log(`  areaGFA        (expect "111"): "${gfaVal}"`);

    // Fields must not be blank (that was part of the bug)
    expect(rentVal, 'baseRentPerSqm must not be blank').not.toBe('');
    expect(gfaVal,  'areaGFA must not be blank').not.toBe('');

    // Strip commas in case NumericFormat already formats small numbers (unlikely for 11/111)
    const strip = (v: string) => v.replace(/,/g, '');
    expect(strip(rentVal), 'baseRentPerSqm initial value').toBe('11');
    expect(strip(gfaVal),  'areaGFA initial value').toBe('111');

    console.log(`  Console errors: ${consoleErrors.length === 0 ? 'none' : consoleErrors.join(' | ')}`);
  });

  test('Step 2: Type "5000" → display shows "5,000"; save → PATCH body has numeric 5000, HTTP 200, toast fires', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
      // Also capture the debug logs added by the developer
      if (msg.text().includes('[DEBUG baseRentPerSqm]')) console.log('  [page-log]', msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(`PAGE_ERROR: ${err.message}`));

    await login(page);
    await navigateToSpaces(page);
    await openUnitSheet(page);

    // ── Locate the visible (NumericFormat) baseRentPerSqm input ──────────
    const rentInput = visibleInput(page, 'baseRentPerSqm');
    await expect(rentInput).toBeVisible({ timeout: 8_000 });

    // ── Clear and type "5000" one character at a time ─────────────────────
    console.log('\n=== Step 2: Typing "5000" into baseRentPerSqm ===');
    await clearAndType(page, rentInput, '5000');

    // ── After typing each digit, capture intermediate display values ───────
    // (We typed all 4 at once above, but let's verify the final state)
    const displayVal = await rentInput.inputValue();
    console.log(`  Display value after typing "5000": "${displayVal}"`);

    // The NumericFormat with thousandSeparator="," should show "5,000"
    expect(displayVal, 'Display must show formatted "5,000"').toBe('5,000');

    // ── Also check the hidden input (register) has the clean value ─────────
    const hiddenRent = page.locator(`input[name="baseRentPerSqm"][type="hidden"]`).first();
    const hiddenVal  = await hiddenRent.inputValue();
    console.log(`  Hidden input value (register): "${hiddenVal}" (expect "5000")`);

    // ── Also change areaGFA to "1200" (sanity check on a second numeric ≥1000) ──
    const gfaInput = visibleInput(page, 'areaGFA');
    await expect(gfaInput).toBeVisible({ timeout: 4_000 });
    await clearAndType(page, gfaInput, '1200');

    const gfaDisplay = await gfaInput.inputValue();
    console.log(`  areaGFA display after typing "1200": "${gfaDisplay}" (expect "1,200")`);
    expect(gfaDisplay, 'areaGFA display must show "1,200"').toBe('1,200');

    await page.screenshot({ path: 'e2e/screenshots/inline-verify-02-after-typing.png' });

    // ── Set up request/response capture BEFORE clicking Lưu ───────────────
    let capturedPatchBody: any = null;
    let capturedPatchStatus: number | null = null;
    let capturedPatchResponseBody: any = null;

    // Use page.on('request') to capture the outgoing PATCH body
    const patchRequestPromise = page.waitForRequest(
      (req) => req.method() === 'PATCH' && req.url().includes(`/spaces/units/${UNIT_ID}`),
      { timeout: 15_000 },
    );
    const patchResponsePromise = page.waitForResponse(
      (res) => res.request().method() === 'PATCH' && res.url().includes(`/spaces/units/${UNIT_ID}`),
      { timeout: 15_000 },
    );

    // ── Click "Lưu" ───────────────────────────────────────────────────────
    const saveBtn = page.getByRole('button', { name: /^lưu$/i });
    await expect(saveBtn).toBeVisible({ timeout: 5_000 });
    await saveBtn.click();

    // ── Capture PATCH request and response ────────────────────────────────
    const patchReq = await patchRequestPromise;
    const patchRes = await patchResponsePromise;

    try { capturedPatchBody = JSON.parse(patchReq.postData() ?? '{}'); } catch { capturedPatchBody = patchReq.postData(); }
    capturedPatchStatus = patchRes.status();
    try { capturedPatchResponseBody = await patchRes.json(); } catch { capturedPatchResponseBody = await patchRes.text(); }

    console.log('\n=== PATCH request/response ===');
    console.log(`  URL:    ${patchReq.url()}`);
    console.log(`  Status: ${capturedPatchStatus}`);
    console.log(`  Request body (full):    ${JSON.stringify(capturedPatchBody)}`);
    console.log(`  baseRentPerSqm in body: ${JSON.stringify(capturedPatchBody?.baseRentPerSqm)}`);
    console.log(`  areaGFA in body:        ${JSON.stringify(capturedPatchBody?.areaGFA)}`);
    console.log(`  Response body:          ${JSON.stringify(capturedPatchResponseBody)}`);

    // ── CORE ASSERTION: baseRentPerSqm must be numeric 5000, NOT null ─────
    expect(capturedPatchBody?.baseRentPerSqm, 'PATCH body: baseRentPerSqm must be numeric 5000').toBe(5000);
    expect(capturedPatchBody?.areaGFA, 'PATCH body: areaGFA must be numeric 1200').toBe(1200);

    // ── HTTP status must be 200, not 400 ─────────────────────────────────
    expect(capturedPatchStatus, 'HTTP status must be 200').toBe(200);

    // ── Success toast must appear ─────────────────────────────────────────
    const toast = page.getByText(/đã cập nhật mặt bằng/i);
    await expect(toast).toBeVisible({ timeout: 8_000 });
    console.log('  Toast "Đã cập nhật mặt bằng" visible: YES');

    await page.screenshot({ path: 'e2e/screenshots/inline-verify-03-after-save.png' });

    // ── Console errors ────────────────────────────────────────────────────
    console.log(`\n  Console errors: ${consoleErrors.length === 0 ? 'none' : consoleErrors.join(' | ')}`);

    // No JS page errors (page crashes)
    const pageCrashes = consoleErrors.filter((e) => e.startsWith('PAGE_ERROR:'));
    expect(pageCrashes, 'No page-level JS errors').toHaveLength(0);
  });

  test('Step 3: Reload page → reopen unit sheet → values 5000 and 1200 persisted from DB', async ({ page, request }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push(`PAGE_ERROR: ${err.message}`));

    await login(page);

    // ── Verify persistence via direct API call first ─────────────────────
    const token = await page.evaluate(() => localStorage.getItem('token'));
    if (token) {
      const apiReq = await request.get(`${API_BASE}/spaces/units/${UNIT_ID}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const apiBody = await apiReq.json();
      const unitData = apiBody?.data ?? apiBody;
      console.log('\n=== Step 3: API GET after save ===');
      console.log(`  baseRentPerSqm from API: ${unitData?.baseRentPerSqm} (expect 5000)`);
      console.log(`  areaGFA from API:        ${unitData?.areaGFA} (expect 1200)`);
      expect(unitData?.baseRentPerSqm, 'API: baseRentPerSqm persisted as 5000').toBe(5000);
      expect(unitData?.areaGFA, 'API: areaGFA persisted as 1200').toBe(1200);
    } else {
      console.log('  Skipping API verification: no token in localStorage yet');
    }

    // ── Full page reload to clear React Query cache ────────────────────────
    await navigateToSpaces(page);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    // Re-authenticate if redirected to login
    if (page.url().includes('/login')) {
      await login(page);
      await navigateToSpaces(page);
    }

    await openUnitSheet(page);
    await page.screenshot({ path: 'e2e/screenshots/inline-verify-04-reopen-sheet.png' });

    // ── Check the inline form shows persisted values ───────────────────────
    const rentInput = visibleInput(page, 'baseRentPerSqm');
    const gfaInput  = visibleInput(page, 'areaGFA');

    await expect(rentInput).toBeVisible({ timeout: 8_000 });
    await expect(gfaInput).toBeVisible({ timeout: 4_000 });

    const rentVal = await rentInput.inputValue();
    const gfaVal  = await gfaInput.inputValue();

    console.log('\n=== Step 3: Values after full reload ===');
    console.log(`  baseRentPerSqm displayed: "${rentVal}" (expect "5,000" or "5000")`);
    console.log(`  areaGFA displayed:        "${gfaVal}" (expect "1,200" or "1200")`);

    const strip = (v: string) => v.replace(/,/g, '');
    expect(strip(rentVal), 'UI shows persisted baseRentPerSqm=5000 after reload').toBe('5000');
    expect(strip(gfaVal),  'UI shows persisted areaGFA=1200 after reload').toBe('1200');

    await page.screenshot({ path: 'e2e/screenshots/inline-verify-05-values-after-reload.png' });

    console.log(`\n  Console errors: ${consoleErrors.length === 0 ? 'none' : consoleErrors.join(' | ')}`);
  });

  test('afterAll restore: reset unit back to original values via API', async ({ request }) => {
    const token = await getApiToken(request);
    const res = await request.patch(`${API_BASE}/spaces/units/${UNIT_ID}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { areaGFA: 111, areaNLA: 111, baseRentPerSqm: 11, camPerSqm: 11 },
    });
    const status = res.status();
    const body = await res.json();
    console.log(`\n=== Restore: PATCH status=${status} ===`);
    console.log(`  Response: ${JSON.stringify(body)}`);
    expect(status, 'Restore PATCH must succeed').toBe(200);
  });

});
