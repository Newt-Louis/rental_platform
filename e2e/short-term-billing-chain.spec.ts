import { test, expect, APIRequestContext } from '@playwright/test';

// Chuoi that: booking ngan han -> duyet -> Proposal -> duyet nhieu cap -> hop dong -> hoa don.
// Kiem tra dung loi trong problem.md (PRB-001): hoa don ngan han la MOT khoan tron goi bang gia tri booking,
// khong bi chia theo ngay nhu tien thue thang cua hop dong dai han.
//
// Test nay TAO HO SO KHONG XOA DUOC qua API (workflow phe duyet, hop dong, tenant, hoa don, thong bao), nen chi
// chay khi bat co:   E2E_FULL_CHAIN=1 npx playwright test e2e/short-term-billing-chain.spec.ts
// Du lieu tao ra mang ten "E2E Short Tenant" va nam 2200+ de de nhan biet / don dep.
const API = 'http://localhost:3000/api';
const ADMIN = { email: 'admin@thiso.com', password: 'Admin123!' };
const APPROVER_EMAIL: Record<string, string> = {
  LEASING_MANAGER: 'manager', MALL_DIRECTOR: 'director', FINANCE: 'finance', LEGAL: 'legal', CEO: 'ceo',
};

test.skip(!process.env.E2E_FULL_CHAIN, 'Set E2E_FULL_CHAIN=1 to run (creates un-deletable proposal/contract/invoice records)');

test('short-term contract is invoiced once for the whole booking amount, not prorated monthly', async ({ playwright }) => {
  test.setTimeout(120_000);
  const api: APIRequestContext = await playwright.request.newContext();
  const loginToken = async (email: string, password: string) => {
    const r = await (await api.post(`${API}/auth/login`, { data: { email, password } })).json();
    return r.accessToken ?? r.data?.accessToken;
  };
  const adminToken = await loginToken(ADMIN.email, ADMIN.password);

  const call = async (method: 'get' | 'post' | 'patch', path: string, data?: unknown, token = adminToken) => {
    const res = await api[method](`${API}${path}`, { headers: { Authorization: `Bearer ${token}` }, data: data as any });
    const body = await res.json().catch(() => ({}));
    return { status: res.status(), body: body?.data !== undefined ? body.data : body, raw: body };
  };

  // ── Du lieu nen: slot ngan han co gia + lead ngan han
  const malls = (await call('get', '/spaces/malls')).body;
  const mallId = (Array.isArray(malls) ? malls : malls.data)[0].id;
  const units = (await call('get', `/spaces/units?mallId=${mallId}&leaseTermType=SHORT&limit=5`)).body;
  const unit = (Array.isArray(units) ? units : units.data)[0];
  const slot = (await call('get', `/slots/units/${unit.id}`)).body.find((s: any) => s.pricePerDaySqm && s.currencyCode);
  expect(slot, 'seeded priced short-term slot').toBeTruthy();
  const leads = (await call('get', '/crm/leads?leaseTermType=SHORT&limit=3')).body;
  const lead = (Array.isArray(leads) ? leads : leads.data)[0];

  // ── Booking 2 ngay VAT QUA THANG (30/3 -> 1/4) -- truong hop lich thang chia ngay se tinh sai
  const year = 2200 + Math.floor(Math.random() * 600);
  const booking = await call('post', `/slots/${slot.id}/bookings`, {
    type: 'DAILY', leadId: lead.id,
    installationStartDatetime: `${year}-03-30T07:00:00Z`, installationEndDatetime: `${year}-03-30T09:00:00Z`,
    startDatetime: `${year}-03-30T09:00:00Z`, endDatetime: `${year}-04-01T09:00:00Z`,
    dismantlingStartDatetime: `${year}-04-01T09:00:00Z`, dismantlingEndDatetime: `${year}-04-01T11:00:00Z`,
  });
  expect(booking.status, JSON.stringify(booking.raw)).toBe(201);
  const bookingId = booking.body.id;
  const bookingTotal: number = booking.body.totalAmount;
  expect(bookingTotal).toBeGreaterThan(0);

  // ── Duyet booking, lap Proposal
  expect((await call('post', `/slots/bookings/${bookingId}/submit`)).status).toBe(201);
  expect((await call('post', `/slots/bookings/${bookingId}/approve`)).status).toBe(201);
  const conv = await call('post', `/slots/bookings/${bookingId}/convert-to-proposal`, {});
  expect(conv.status, JSON.stringify(conv.raw)).toBe(201);
  const proposalId = conv.body.proposal.id;

  // ── Nguoi lap xac nhan noi dung to trinh roi trinh duyet
  const doc = (await call('get', `/proposals/${proposalId}/document`)).body;
  const saved = await call('patch', `/proposals/${proposalId}/document-content`, {
    expectedContentVersion: doc.sync.contentVersion ?? 0,
    reviewedFingerprint: doc.sync.sourceFingerprint,
    content: { ...doc.editableContent, items: [] },
  });
  expect(saved.status, JSON.stringify(saved.raw)).toBe(200);
  const submitted = await call('post', `/proposals/${proposalId}/submit`, { reviewedFingerprint: doc.sync.sourceFingerprint });
  expect(submitted.status, JSON.stringify(submitted.raw)).toBe(201);

  // ── Moi buoc duyet do dung tai khoan cua vai tro do (nguoi lap khong duoc tu duyet)
  for (let i = 0; i < 10; i++) {
    const p = (await call('get', `/proposals/${proposalId}`)).body;
    const step = (p.approvalWorkflow?.steps ?? []).find((s: any) => s.status === 'PENDING');
    if (!step) break;
    const email = APPROVER_EMAIL[step.approverRole];
    expect(email, `no demo account for role ${step.approverRole}`).toBeTruthy();
    const approverToken = await loginToken(`${email}@thiso.com`, 'User123!');
    const r = await call('post', `/approvals/${step.id}/approve`, { comment: 'e2e' }, approverToken);
    expect(r.status, `${step.stepName}: ${JSON.stringify(r.raw)}`).toBeLessThan(300);
  }
  // Ket qua phe duyet ap dung bat dong bo qua event; he thong co the tu lap hop dong ngay khi duyet xong
  await expect.poll(async () => (await call('get', `/proposals/${proposalId}`)).body.status, { timeout: 20_000 })
    .toMatch(/^(APPROVED|CONVERTED)$/);
  if ((await call('get', `/proposals/${proposalId}`)).body.status === 'APPROVED') {
    const converted = await call('post', `/proposals/${proposalId}/convert`, {
      tenant: { brandName: 'E2E Short Tenant', companyName: 'E2E Short Tenant Co', contactName: 'E2E', email: 'e2e-short@example.com', phone: '0900000000' },
    });
    expect(converted.status, JSON.stringify(converted.raw)).toBe(201);
  }

  // ── Hop dong da duoc lap: booking chuyen CONTRACTED (slot ghi nhan da khai thac)
  const contracts = (await call('get', `/contracts?proposalId=${proposalId}`)).body;
  const contractId = (Array.isArray(contracts) ? contracts : contracts.data)[0].id;
  const all = (await call('get', `/slots/bookings/all?unitId=${unit.id}`)).body;
  expect((Array.isArray(all) ? all : all.data).find((b: any) => b.id === bookingId).status).toBe('CONTRACTED');

  // ── Khong co lich thanh toan hang thang cho hop dong ngan han
  const schedule = (await call('get', `/billing/schedule/${contractId}`)).body;
  const entries = Array.isArray(schedule) ? schedule : (schedule.entries ?? schedule.data ?? []);
  expect(entries).toHaveLength(0);

  // ── Booking CONTRACTED xuat hien trong cong no cho xuat hoa don, dung gia tri tron goi
  const pending = (await call('get', `/billing/receivables/pending?mallId=${mallId}&sourceType=SHORT_TERM_BOOKING&search=${booking.body.bookingRef}`)).body;
  const row = (pending.data ?? pending).find((r: any) => r.id === bookingId);
  expect(row, 'CONTRACTED booking must be invoiceable').toBeTruthy();
  expect(row.subtotal).toBe(bookingTotal);

  // ── Hoa don: mot lan, dung tong tien booking (khong chia ngay), tao lai thi tra ve cung hoa don
  const invoice = await call('post', `/billing/receivables/pending/SHORT_TERM_BOOKING/${bookingId}/create-invoice`);
  expect(invoice.status, JSON.stringify(invoice.raw)).toBeLessThan(300);
  expect(invoice.body.subtotal).toBe(bookingTotal);
  expect(invoice.body.currencyCode).toBe(booking.body.currencyCode);
  const again = await call('post', `/billing/receivables/pending/SHORT_TERM_BOOKING/${bookingId}/create-invoice`);
  expect(again.body.id).toBe(invoice.body.id);

  await api.dispose();
});
