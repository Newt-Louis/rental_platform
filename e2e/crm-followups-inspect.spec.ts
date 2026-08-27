import { test } from '@playwright/test';

const SCRATCHPAD = 'C:/Users/Win10/AppData/Local/Temp/claude/d--job-new-htdocs-emart-thiso-leasing/8bc65a1d-552e-4828-a453-f4e57b8523e1/scratchpad';

test('inspect CRM follow-ups tab', async ({ page }) => {
  // Capture API responses matching follow-up URLs
  const apiResponses: { url: string; status: number; body: any }[] = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('follow-up') || url.includes('followup') || url.includes('follow_up')) {
      try {
        const body = await response.json().catch(() => null);
        apiResponses.push({ url, status: response.status(), body });
      } catch (_) { /**/ }
    }
  });

  // 1. Login
  await page.goto('http://localhost:5173');
  await page.waitForLoadState('networkidle');

  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passInput = page.locator('input[type="password"]').first();
  await emailInput.fill('admin@thiso.com');
  await passInput.fill('Admin123!');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/(dashboard|crm|spaces|tenants|\/)?$/, { timeout: 15000 });
  await page.waitForLoadState('networkidle');

  // 2. Go to CRM
  await page.goto('http://localhost:5173/crm');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${SCRATCHPAD}/crm-leads-tab.png` });

  // 3. Click Follow-up tab
  const tabs = page.locator('[role="tab"]');
  const tabCount = await tabs.count();
  let followupClicked = false;
  for (let i = 0; i < tabCount; i++) {
    const text = await tabs.nth(i).textContent();
    if (text && /follow|bell|nhắc/i.test(text)) {
      await tabs.nth(i).click();
      followupClicked = true;
      break;
    }
  }
  if (!followupClicked) {
    await page.goto('http://localhost:5173/crm?section=followups');
    await page.waitForLoadState('networkidle');
  }

  await page.waitForTimeout(3000);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${SCRATCHPAD}/crm-followups-tab.png`, fullPage: true });

  // 4. Read DOM structure
  const sections = await page.locator('section[aria-labelledby^="follow-up-"]').all();
  console.log(`Found ${sections.length} follow-up sections`);
  const sectionData: any[] = [];
  for (const section of sections) {
    const heading = await section.locator('h2').textContent();
    const articles = await section.locator('article').all();
    const cards: any[] = [];
    for (const article of articles) {
      const name = await article.locator('button').first().textContent().catch(() => '');
      const note = await article.locator('p').first().textContent().catch(() => '');
      const badges = await article.locator('[data-slot="badge"]').allTextContents().catch(() => []);
      const spans = await article.locator('span').allTextContents().catch(() => []);
      cards.push({ name: name?.trim(), note: note?.trim(), badges, spans });
    }
    const emptyMsg = cards.length === 0 ? (await section.locator('p').textContent().catch(() => '')) : '';
    sectionData.push({ heading: heading?.trim(), cardCount: articles.length, cards, emptyMsg: emptyMsg?.trim() });
  }
  console.log('=== SECTION DATA ===');
  console.log(JSON.stringify(sectionData, null, 2));

  // 5. Captured network API responses
  console.log('=== CAPTURED API RESPONSES (network) ===');
  for (const r of apiResponses) {
    const items = Array.isArray(r.body) ? r.body : (r.body?.data ?? []);
    console.log(`  ${r.url} → status ${r.status}, items: ${items.length}`);
    if (items.length > 0) {
      console.log('  First item keys:', Object.keys(items[0] ?? {}));
      console.log('  First item lead:', JSON.stringify(items[0]?.lead));
      console.log('  All lead.status values:', items.map((i: any) => i.lead?.status ?? '(no lead)'));
    }
  }

  // 6. Direct fetch inside page context (uses same session cookie)
  const apiResult = await page.evaluate(async () => {
    const resp = await fetch('/api/crm/follow-ups?isDone=false&daysAhead=7', {
      credentials: 'include',
    });
    const raw = await resp.json().catch(() => null);
    const items: any[] = Array.isArray(raw) ? raw : (raw?.data ?? []);
    return {
      status: resp.status,
      totalCount: items.length,
      firstItem: items[0] ?? null,
      leadStatusMap: items.map((i: any) => ({
        id: i.id,
        hasLead: !!i.lead,
        leadId: i.lead?.id ?? null,
        leadBrandName: i.lead?.brandName ?? null,
        leadStatus: i.lead?.status ?? null,
        hasCustomer: !!i.customer,
      })),
    };
  });
  console.log('=== DIRECT API CALL /api/crm/follow-ups ===');
  console.log(JSON.stringify(apiResult, null, 2));

  const alertCount = await page.locator('[role="alert"]').count();
  console.log(`Error alerts on page: ${alertCount}`);
  console.log('Final URL:', page.url());
});
