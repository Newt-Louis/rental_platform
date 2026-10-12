import { test, expect } from '@playwright/test';

// Ban ve 2D rieng cho khu ngan han + ve slot dang da giac. Chay tren stack that (Docker dev), du lieu mau da seed.
const API = 'http://localhost:3000/api';
const ADMIN = { email: 'admin@thiso.com', password: 'Admin123!' };

// PNG 1x1 hop le
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('upload a short-term plan, draw a polygon slot, persist it', async ({ page, request }) => {
  test.setTimeout(60_000);
  const login = await request.post(`${API}/auth/login`, { data: ADMIN });
  const body = await login.json();
  const headers = { Authorization: `Bearer ${body.accessToken ?? body.data?.accessToken}` };
  const get = async (path: string) => {
    const r = await (await request.get(`${API}${path}`, { headers })).json();
    return r.data ?? r;
  };

  const malls = await get('/spaces/malls');
  const mallId = (Array.isArray(malls) ? malls : malls.data)[0].id;
  const units = await get(`/spaces/units?mallId=${mallId}&leaseTermType=SHORT&limit=5`);
  const unit = (Array.isArray(units) ? units : units.data)[0];
  const slotCode = `PG-${Date.now() % 100000}`;
  let createdSlotId: string | undefined;
  let createdMediaId: string | undefined;

  try {
    // UI login
    await page.goto('/login');
    await page.locator('input[type="email"], input[name="email"]').first().fill(ADMIN.email);
    await page.locator('input[type="password"]').first().fill(ADMIN.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 });

    // Mo mat bang ngan han -> tab Booking Slot
    await page.goto('/spaces');
    await page.getByText(/Short-term leasing|Cho thuê ngắn hạn/i).first().click();
    await page.getByText(unit.code).first().click();
    await page.getByRole('button', { name: /Booking Slot/ }).click();

    // Chua co ban ve ngan han thi nen hien thong bao rieng, KHONG dung floor plan dai han
    const hasPlan = (await get(`/spaces/units/${unit.id}/media?type=SHORT_TERM_PLAN`)).length > 0;
    if (!hasPlan) await expect(page.getByText('Chưa có bản vẽ cho thuê ngắn hạn')).toBeVisible();

    // Upload ban ve
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByText('Tải bản vẽ', { exact: true }).click(),
    ]);
    await chooser.setFiles({ name: 'plan.png', mimeType: 'image/png', buffer: PNG_1X1 });
    await expect(page.getByAltText('Floor plan')).toBeVisible({ timeout: 15_000 });
    const media = await get(`/spaces/units/${unit.id}/media?type=SHORT_TERM_PLAN`);
    createdMediaId = media[media.length - 1].id;

    // Ve da giac 4 dinh roi hoan tat
    await page.getByRole('button', { name: /Vẽ đa giác/ }).click();
    const canvas = page.getByAltText('Floor plan').locator('..');
    const box = (await canvas.boundingBox())!;
    for (const [fx, fy] of [[0.2, 0.2], [0.5, 0.2], [0.55, 0.6], [0.25, 0.65]]) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    }
    await page.getByRole('button', { name: 'Hoàn tất' }).click();

    // Form tao slot
    await page.getByPlaceholder('A01-Z1').fill(slotCode);
    await page.getByPlaceholder('50').fill('5');
    await page.getByPlaceholder('Front Corner Zone').fill('Slot da giac e2e');
    await page.getByRole('button', { name: /^(Tạo|Lưu|Tạo slot)/ }).last().click();

    // Da luu dang da giac
    await expect.poll(async () => {
      const slots = await get(`/slots/units/${unit.id}`);
      const s = slots.find((x: any) => x.code === slotCode);
      createdSlotId = s?.id;
      return s?.polygon?.length;
    }, { timeout: 15_000 }).toBe(4);

    // Hien thi tren ban ve duoi dang <polygon>
    await expect(page.locator('svg polygon')).toHaveCount(1);
  } finally {
    if (createdSlotId) await request.delete(`${API}/slots/${createdSlotId}`, { headers });
    if (createdMediaId) await request.delete(`${API}/spaces/units/${unit.id}/media/${createdMediaId}`, { headers });
  }
});
