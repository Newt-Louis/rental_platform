import { test, expect, APIRequestContext } from '@playwright/test';

// Luong booking ngan han: khong FIFS, duyet truoc thang, xung dot cho nguoi xac nhan, mo lai khi giai phong,
// thue mot phan dien tich. Chay tren stack that (Docker dev): API :3000, UI :5173, du lieu mau da seed.
const API = 'http://localhost:3000/api';
const ADMIN = { email: 'admin@thiso.com', password: 'Admin123!' };

// Nam ngau nhien o tuong lai xa de khong dung booking co san / chay lai nhieu lan.
const YEAR = 2100 + Math.floor(Math.random() * 800);

const timeline = (day: number, extra: Record<string, unknown> = {}) => {
  const d = String(day).padStart(2, '0');
  const n = String(day + 1).padStart(2, '0');
  return {
    type: 'DAILY',
    installationStartDatetime: `${YEAR}-03-${d}T07:00:00Z`,
    installationEndDatetime: `${YEAR}-03-${d}T09:00:00Z`,
    startDatetime: `${YEAR}-03-${d}T09:00:00Z`,
    endDatetime: `${YEAR}-03-${n}T18:00:00Z`,
    dismantlingStartDatetime: `${YEAR}-03-${n}T18:00:00Z`,
    dismantlingEndDatetime: `${YEAR}-03-${n}T20:00:00Z`,
    ...extra,
  };
};

test.describe.serial('Short-term booking approval flow', () => {
  let api: APIRequestContext;
  let headers: Record<string, string>;
  let mallId: string;
  let slot: { id: string; area: number };
  const created: string[] = [];

  const call = async (method: 'get' | 'post' | 'patch' | 'delete', path: string, data?: unknown) => {
    const res = await api[method](`${API}${path}`, { headers, data: data as any });
    const body = await res.json().catch(() => ({}));
    return { status: res.status(), body: body?.data !== undefined ? body.data : body, raw: body };
  };
  const book = async (day: number, extra: Record<string, unknown> = {}) => {
    const r = await call('post', `/slots/${slot.id}/bookings`, timeline(day, extra));
    if (r.body?.id) created.push(r.body.id);
    return r;
  };

  test.beforeAll(async ({ playwright }) => {
    api = await playwright.request.newContext();
    const login = await api.post(`${API}/auth/login`, { data: ADMIN });
    const token = (await login.json()).data?.accessToken ?? (await login.json()).accessToken;
    headers = { Authorization: `Bearer ${token}` };

    const malls = (await call('get', '/spaces/malls')).body;
    mallId = (Array.isArray(malls) ? malls : malls.data)[0].id;
    const units = (await call('get', `/spaces/units?mallId=${mallId}&leaseTermType=SHORT&limit=5`)).body;
    const unit = (Array.isArray(units) ? units : units.data)[0];
    const slots = (await call('get', `/slots/units/${unit.id}`)).body;
    slot = slots.find((s: any) => s.currencyCode && s.pricePerDaySqm) ?? slots[0];
    expect(slot, 'seeded short-term slot with a price').toBeTruthy();
  });

  test.afterAll(async () => {
    // Don dep: huy roi xoa cac booking da tao (chi xoa duoc booking CANCELLED).
    for (const id of created) {
      await call('patch', `/slots/bookings/${id}/cancel`, { reason: 'e2e cleanup' });
      await call('delete', `/slots/bookings/${id}`);
    }
    await api.dispose();
  });

  let first: string;
  let second: string;

  test('two overlapping unapproved bookings coexist (no FIFS)', async () => {
    const a = await book(10);
    const b = await book(10);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    first = a.body.id;
    second = b.body.id;
    expect(a.body.lines).toHaveLength(1);
  });

  test('first approved wins; the other is flagged, not locked', async () => {
    await call('post', `/slots/bookings/${first}/submit`);
    await call('post', `/slots/bookings/${second}/submit`);
    const approved = await call('post', `/slots/bookings/${first}/approve`);
    expect(approved.status).toBe(201);
    expect(approved.body.conflictedBookingIds).toContain(second);

    // Booking moi trung lich voi booking da duyet bi chan ngay.
    expect((await book(10)).status).toBe(400);
    // Booking thua khong the duoc duyet.
    expect((await call('post', `/slots/bookings/${second}/approve`)).status).toBe(409);
  });

  test('conflict shows in the UI as "Trùng lịch"', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"], input[name="email"]').first().fill(ADMIN.email);
    await page.locator('input[type="password"]').first().fill(ADMIN.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 });

    await page.goto('/bookings');
    // Chuyen sang loai booking slot ngan han (option thu 2 cua bo loc loai booking).
    await page.getByRole('combobox').first().click();
    await page.getByRole('option').nth(1).click();
    await expect(page.getByText('Trùng lịch').first()).toBeVisible({ timeout: 20_000 });
  });

  test('needs-attention lists the conflict; lock needs explicit confirmation', async () => {
    const list = await call('get', `/slots/bookings/needs-attention?mallId=${mallId}`);
    expect(list.body.some((x: any) => x.booking.id === second && x.kind === 'CONFLICT')).toBe(true);

    const locked = await call('post', `/slots/bookings/${second}/confirm-lock`, {});
    expect(locked.body.status).toBe('LOCKED');
    // Chua mo lai duoc khi booking chiem cho van con hieu luc.
    expect((await call('post', `/slots/bookings/${second}/reopen`)).status).toBe(409);
  });

  test('cancelling the winner lets the locked booking be reopened and approved', async () => {
    await call('patch', `/slots/bookings/${first}/cancel`, { reason: 'e2e' });
    const reopened = await call('post', `/slots/bookings/${second}/reopen`);
    expect(reopened.body.status).toBe('SUBMITTED');
    expect((await call('post', `/slots/bookings/${second}/approve`)).status).toBe(201);
  });

  test('partial areas share a slot until it is full', async () => {
    const part = (area: number) => book(20, { lines: [{ slotId: slot.id, areaRented: area }] });
    const rest = slot.area - 4;
    const a = await part(4);
    const b = await part(rest);
    for (const r of [a, b]) await call('post', `/slots/bookings/${r.body.id}/submit`);
    expect((await call('post', `/slots/bookings/${a.body.id}/approve`)).status).toBe(201);
    expect((await call('post', `/slots/bookings/${b.body.id}/approve`)).status).toBe(201);
    // Slot da du: them bat ky dien tich nao nua cung bi tu choi.
    expect((await part(0.5)).status).toBe(400);
    // Gia ti le theo dien tich thue.
    expect(a.body.baseAmount / b.body.baseAmount).toBeCloseTo(4 / rest, 6);
  });
});
