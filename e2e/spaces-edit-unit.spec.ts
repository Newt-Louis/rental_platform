import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';
const API_BASE = 'http://localhost:3000/api';
const UNIT_ID = 'cmru4t8ea000112jn8zlv74hg';

async function getAuthToken(request: any): Promise<string> {
  const authRes = await request.post(`${API_BASE}/auth/login`, {
    data: { email: 'admin@thiso.com', password: 'Admin123!' },
  });
  if (!authRes.ok()) throw new Error(`Auth failed: ${await authRes.text()}`);
  const body = await authRes.json();
  // Auth endpoints skip TransformInterceptor, so response is the plain { accessToken, user, ... }
  return body.accessToken ?? body.data?.accessToken;
}

async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.locator('#email').fill('admin@thiso.com');
  await page.locator('#password').fill('Admin123!');
  // Button can be "Sign in" (EN) or "Đăng nhập" (VI) depending on browser locale
  await page.getByRole('button', { name: /sign in|đăng nhập|login/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 });
  await page.waitForLoadState('networkidle');
}

test.describe('Spaces – Edit unit bug reproduction', () => {

  // ─────────────────────────────────────────────────────────────────────────
  // Test 1: Verify the raw API response for the unit
  // ─────────────────────────────────────────────────────────────────────────
  test('API: GET /spaces/units/:id — verify areaGFA/areaNLA/baseRentPerSqm/camPerSqm', async ({ request }) => {
    const bearer = await getAuthToken(request);
    expect(bearer, 'accessToken must be present in auth response').toBeTruthy();

    const unitRes = await request.get(`${API_BASE}/spaces/units/${UNIT_ID}`, {
      headers: { Authorization: `Bearer ${bearer}` },
    });
    expect(unitRes.ok(), `Unit fetch failed (${unitRes.status()}): ${await unitRes.text()}`).toBeTruthy();

    const body = await unitRes.json();

    // The backend's TransformInterceptor wraps the response:
    // { success: true, requestId: null, data: { id, areaGFA, ... } }
    // (The frontend axios interceptor unwraps it, but Playwright's request context doesn't)
    const isWrapped = body?.success !== undefined && 'data' in body && !('total' in body);
    const unit = isWrapped ? body.data : body;

    console.log('\n=== RAW API RESPONSE — /spaces/units/' + UNIT_ID + ' ===');
    console.log('Response is wrapped by TransformInterceptor:', isWrapped);
    console.log(JSON.stringify({
      id: unit?.id,
      code: unit?.code,
      name: unit?.name,
      areaGFA: unit?.areaGFA,
      areaNLA: unit?.areaNLA,
      baseRentPerSqm: unit?.baseRentPerSqm,
      camPerSqm: unit?.camPerSqm,
      status: unit?.status,
      category: unit?.category,
      spaceType: unit?.spaceType,
      leaseTermType: unit?.leaseTermType,
      tier: unit?.tier,
      isFlexibleArea: unit?.isFlexibleArea,
      minFlexArea: unit?.minFlexArea,
      maxFlexArea: unit?.maxFlexArea,
    }, null, 2));

    expect(unit?.areaGFA, 'areaGFA must have a value').not.toBeNull();
    expect(unit?.areaGFA, 'areaGFA must have a value').not.toBeUndefined();
    expect(unit?.areaNLA, 'areaNLA must have a value').not.toBeNull();
    expect(unit?.baseRentPerSqm, 'baseRentPerSqm must have a value').not.toBeNull();
    expect(unit?.camPerSqm, 'camPerSqm must have a value').not.toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 2: Open the Edit dialog and inspect the 4 numeric fields
  // ─────────────────────────────────────────────────────────────────────────
  test('UI: Edit dialog — areaGFA/areaNLA/baseRent/CAM fields bug reproduction', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', (err) => consoleErrors.push(`[pageerror] ${err.message}`));

    // Capture browser-side /spaces/units/:id response (after axios unwrapping)
    let capturedUnitDetail: any = null;
    page.on('response', async (response) => {
      const url = response.url();
      if (
        url.includes(`/spaces/units/${UNIT_ID}`) &&
        !url.includes('/media') &&
        !url.includes('/history') &&
        !url.includes('/map-position') &&
        !url.includes('/split') &&
        response.status() < 400
      ) {
        try {
          const body = await response.json();
          // The backend wraps: { success, data: unit }
          // We capture the raw response here (before axios interceptor)
          capturedUnitDetail = body;
        } catch { /* ignore */ }
      }
    });

    await login(page);

    // Navigate to Spaces
    await page.goto(`${BASE_URL}/spaces`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Screenshot: Spaces page initial state
    await page.screenshot({ path: 'e2e/screenshots/00-spaces-page.png' });

    // ── Find unit "xxxx" ─────────────────────────────────────────────────
    // Try using the search box if available
    const searchInput = page.getByPlaceholder(/tìm kiếm|search/i).first();
    if (await searchInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await searchInput.fill('xxxx');
      await page.waitForTimeout(700);
    }

    // Find the unit card element containing "xxxx"
    const unitCode = page.getByText('xxxx', { exact: true }).first();
    await expect(unitCode).toBeVisible({ timeout: 10_000 });
    await unitCode.click();

    // ── Wait for the UnitDetailSheet to open ─────────────────────────────
    // The sheet has a heading "xxxx — xxx"
    const sheetHeading = page.getByText(/xxxx/, { exact: false });
    await expect(sheetHeading.first()).toBeVisible({ timeout: 10_000 });

    // Wait for the detail query (getUnit) to complete
    await page.waitForTimeout(2_500);

    // Screenshot: Detail sheet open (before clicking Edit)
    await page.screenshot({ path: 'e2e/screenshots/01-detail-sheet.png' });

    // ── Scroll the sheet panel to reveal the Edit button ─────────────────
    // The Sheet component uses: fixed right-0 top-0 z-[110] h-full
    // Its scrollable inner div has class "flex-1 overflow-y-auto"
    const sheetScrollArea = page.locator('.flex-1.overflow-y-auto').last();
    if (await sheetScrollArea.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await sheetScrollArea.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    } else {
      // Fallback: scroll the entire page / last fixed element
      await page.evaluate(() => {
        const panels = Array.from(document.querySelectorAll('[class*="fixed right-0"]'));
        const panel = panels[panels.length - 1];
        if (panel) {
          const scrollable = panel.querySelector('.overflow-y-auto');
          if (scrollable) scrollable.scrollTop = scrollable.scrollHeight;
        }
      });
    }
    await page.waitForTimeout(300);

    // ── Click the "Sửa" (Edit) button ────────────────────────────────────
    // The button is in UnitDetailSheet's action area: <Button variant="outline"> Sửa </Button>
    const editBtn = page.getByRole('button', { name: /^sửa$/i });
    await expect(editBtn).toBeVisible({ timeout: 5_000 });
    await editBtn.click();

    // ── Wait for the Radix Dialog (CreateEditUnitDialog) to open ─────────
    // Dialog title: "Sửa mặt bằng: xxxx"
    const editDialog = page.locator('[role="dialog"]').filter({ hasText: /sửa mặt bằng/i });
    await expect(editDialog).toBeVisible({ timeout: 8_000 });

    // Give react-hook-form's reset() time to populate the fields
    await page.waitForTimeout(600);

    // Screenshot: Edit dialog open
    await page.screenshot({ path: 'e2e/screenshots/02-edit-dialog-first-open.png' });

    // ── Read the 4 key numeric input fields ──────────────────────────────
    // The Input component for type="number" uses NumericFormat.
    // The `name` attribute is spread from register() so we can locate by name.
    // We also try by placeholder as a fallback.
    async function readField(selector: string, name: string): Promise<string> {
      try {
        const el = editDialog.locator(selector).first();
        await el.waitFor({ state: 'attached', timeout: 3_000 });
        return await el.inputValue();
      } catch {
        console.log(`  WARN: could not read field "${name}" via "${selector}"`);
        return '<field not found>';
      }
    }

    const gfaValue = await readField('input[name="areaGFA"]', 'areaGFA');
    const nlaValue = await readField('input[name="areaNLA"]', 'areaNLA');
    const rentValue = await readField('input[name="baseRentPerSqm"]', 'baseRentPerSqm');
    const camValue = await readField('input[name="camPerSqm"]', 'camPerSqm');
    const minFlexValue = await readField('input[name="minFlexArea"]', 'minFlexArea');
    const maxFlexValue = await readField('input[name="maxFlexArea"]', 'maxFlexArea');

    // Also capture the raw DOM value attribute (may differ from inputValue for controlled NumericFormat)
    async function getDomValue(selector: string): Promise<string> {
      try {
        return await editDialog.locator(selector).first().evaluate((el: HTMLInputElement) => el.value);
      } catch {
        return '<err>';
      }
    }
    const gfaDom = await getDomValue('input[name="areaGFA"]');
    const nlaDom = await getDomValue('input[name="areaNLA"]');
    const rentDom = await getDomValue('input[name="baseRentPerSqm"]');
    const camDom = await getDomValue('input[name="camPerSqm"]');

    // Check other fields to confirm form DID load (so we know if it's a specific field issue)
    let codeValue = '<not read>';
    try {
      codeValue = await editDialog.locator('input[name="code"]').first().inputValue();
    } catch { /* ignore */ }

    console.log('\n=== EDIT DIALOG FIELD VALUES (first open) ===');
    console.log(`  Mã mặt bằng (code):          "${codeValue}" (expected "xxxx")`);
    console.log(`  Diện tích GFA (m²):           inputValue="${gfaValue}"  domValue="${gfaDom}"  (expected "111")`);
    console.log(`  Diện tích NLA (m²):           inputValue="${nlaValue}"  domValue="${nlaDom}"  (expected "111")`);
    console.log(`  Giá thuê cơ bản (₫/m²):      inputValue="${rentValue}"  domValue="${rentDom}"  (expected "11")`);
    console.log(`  Phí CAM (₫/m²):               inputValue="${camValue}"  domValue="${camDom}"  (expected "11")`);
    console.log(`  Diện tích tối thiểu (minFlex): inputValue="${minFlexValue}" (expected "11")`);
    console.log(`  Diện tích tối đa (maxFlex):    inputValue="${maxFlexValue}" (expected "11")`);

    const isBlank = (v: string) => v === '' || v === '<field not found>';
    const isZero = (v: string) => v === '0';
    const bugReproduced = [gfaValue, nlaValue, rentValue, camValue].some(isBlank);
    const showsZero = [gfaValue, nlaValue, rentValue, camValue].some(isZero);

    console.log(`\n>>> Bug reproduced (blank fields)? ${bugReproduced ? 'YES' : 'NO'}`);
    if (bugReproduced) {
      const blanks = [
        isBlank(gfaValue) ? 'areaGFA' : null,
        isBlank(nlaValue) ? 'areaNLA' : null,
        isBlank(rentValue) ? 'baseRentPerSqm' : null,
        isBlank(camValue) ? 'camPerSqm' : null,
      ].filter(Boolean);
      console.log(`    Blank fields: ${blanks.join(', ')}`);
    }
    if (showsZero) {
      const zeros = [
        isZero(gfaValue) ? 'areaGFA' : null,
        isZero(nlaValue) ? 'areaNLA' : null,
        isZero(rentValue) ? 'baseRentPerSqm' : null,
        isZero(camValue) ? 'camPerSqm' : null,
      ].filter(Boolean);
      console.log(`>>> Some fields show "0": ${zeros.join(', ')}`);
    }

    // ── Close and reopen to test race condition ───────────────────────────
    const cancelBtn = editDialog.getByRole('button', { name: /hủy|cancel/i });
    if (await cancelBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await cancelBtn.click();
      await page.waitForTimeout(300);

      // Handle "unsaved changes" confirm dialog
      const discardBtn = page.getByRole('button', { name: /bỏ thay đổi|discard/i });
      if (await discardBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await discardBtn.click();
        await page.waitForTimeout(300);
      }

      // Reopen Edit dialog
      await editBtn.click();
      await expect(editDialog).toBeVisible({ timeout: 5_000 });
      await page.waitForTimeout(600);

      const gfaValue2 = await readField('input[name="areaGFA"]', 'areaGFA (2nd)');
      const nlaValue2 = await readField('input[name="areaNLA"]', 'areaNLA (2nd)');
      const rentValue2 = await readField('input[name="baseRentPerSqm"]', 'baseRentPerSqm (2nd)');
      const camValue2 = await readField('input[name="camPerSqm"]', 'camPerSqm (2nd)');

      console.log('\n=== EDIT DIALOG FIELD VALUES (second open, after close+reopen) ===');
      console.log(`  Diện tích GFA:           "${gfaValue2}"  (expected "111")`);
      console.log(`  Diện tích NLA:           "${nlaValue2}"  (expected "111")`);
      console.log(`  Giá thuê cơ bản (₫/m²): "${rentValue2}"  (expected "11")`);
      console.log(`  Phí CAM (₫/m²):          "${camValue2}"  (expected "11")`);

      const bugOnSecond = [gfaValue2, nlaValue2, rentValue2, camValue2].some(isBlank);
      console.log(`>>> Bug reproduced on SECOND open? ${bugOnSecond ? 'YES' : 'NO'}`);
      if (bugReproduced && !bugOnSecond) {
        console.log('CONCLUSION: Race condition / stale unit state on first open — values fill on reopen');
      } else if (!bugReproduced && !bugOnSecond) {
        console.log('CONCLUSION: Bug NOT reproduced — fields showed correct values on both opens');
      }

      await page.screenshot({ path: 'e2e/screenshots/03-edit-dialog-second-open.png' });
    }

    // ── Captured API response from browser network ────────────────────────
    console.log('\n=== BROWSER NETWORK: captured /spaces/units/:id response ===');
    if (capturedUnitDetail) {
      const isWrapped = capturedUnitDetail?.success !== undefined && 'data' in capturedUnitDetail && !('total' in capturedUnitDetail);
      const unitData = isWrapped ? capturedUnitDetail.data : capturedUnitDetail;
      console.log(`  Response wrapped by TransformInterceptor: ${isWrapped}`);
      console.log(JSON.stringify({
        areaGFA: unitData?.areaGFA,
        areaNLA: unitData?.areaNLA,
        baseRentPerSqm: unitData?.baseRentPerSqm,
        camPerSqm: unitData?.camPerSqm,
      }, null, 2));
    } else {
      console.log('  (no /spaces/units/:id response was captured — detail may not have been fetched)');
    }

    // ── Console errors ────────────────────────────────────────────────────
    console.log('\n=== BROWSER CONSOLE ERRORS ===');
    if (consoleErrors.length === 0) {
      console.log('  (none)');
    } else {
      consoleErrors.forEach((e) => console.log(' ', e));
    }
  });
});
