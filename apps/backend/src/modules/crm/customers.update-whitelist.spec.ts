/**
 * CR-CRM-CUSTOMER-PROFILE-EDIT — the Customer update allow-list.
 *
 * `PUT /crm/customers/:id` took `@Body() dto: any`. With no type metadata the
 * global ValidationPipe had nothing to whitelist against, and the service
 * spread the body straight into `prisma.customer.update`. Proven against the
 * running system before the fix: a plain PUT carrying
 * `{"customerCode":"HACKED-001"}` renamed a customer's identifier.
 *
 * These tests pin the allow-list itself, so a field becomes writable only by
 * being declared — never by being sent.
 */
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateCustomerDto } from './dto/update-customer.dto';

/** Mirrors the runtime ValidationPipe config from main.ts. */
async function throughPipe(body: Record<string, unknown>) {
  const instance = plainToInstance(UpdateCustomerDto, body, {
    enableImplicitConversion: true,
    excludeExtraneousValues: false,
  });
  const errors = await validate(instance as object, {
    whitelist: true,
    forbidNonWhitelisted: false,
  });
  // `whitelist: true` strips undeclared properties off the instance.
  return { instance: instance as Record<string, unknown>, errors };
}

describe('UpdateCustomerDto — what a client may write', () => {
  it.each([
    'customerCode',
    'createdById',
    'isActive',
    'deletedAt',
    'wonAt',
    'lostAt',
    'id',
  ])('strips %s so it can never reach Prisma', async (field) => {
    const { instance } = await throughPipe({ companyName: 'Cty A', [field]: 'attacker-value' });

    expect(instance).not.toHaveProperty(field);
    expect(instance.companyName).toBe('Cty A');
  });

  it('keeps every field the profile screen actually edits', async () => {
    const body = {
      companyName: 'Cty A',
      brandName: 'Brand',
      taxCode: '0123456789',
      industry: 'Bán lẻ',
      address: 'Số 1',
      website: 'https://x.com',
      contactName: 'Nguyễn Văn A',
      contactTitle: 'Giám đốc',
      phone: '0901234567',
      email: 'a@x.com',
      source: 'BROKER',
      preferredCategoryId: 'cat-1',
      expectedArea: 120,
      budgetMin: 500_000,
      budgetMax: 900_000,
      currencyCode: 'VND',
      rating: 4,
      assignedToId: 'user-1',
      notes: 'ghi chú',
    };

    const { instance, errors } = await throughPipe(body);

    expect(errors).toHaveLength(0);
    for (const key of Object.keys(body)) {
      expect(instance).toHaveProperty(key);
    }
  });

  it('rejects a malformed email rather than storing it', async () => {
    const { errors } = await throughPipe({ email: 'not-an-email' });
    expect(errors.map((e) => e.property)).toContain('email');
  });

  it('rejects a rating outside 1..5', async () => {
    for (const rating of [0, 6, 2.5]) {
      const { errors } = await throughPipe({ rating });
      expect(errors.map((e) => e.property)).toContain('rating');
    }
  });

  it('rejects a negative budget', async () => {
    const { errors } = await throughPipe({ budgetMin: -1 });
    expect(errors.map((e) => e.property)).toContain('budgetMin');
  });

  it('rejects a status that is not a CustomerStatus', async () => {
    const { errors } = await throughPipe({ status: 'NOT_A_STATUS' });
    expect(errors.map((e) => e.property)).toContain('status');
  });

  it('accepts null on preferredCategoryId, which means "clear it"', async () => {
    // Distinct from omitting the field, which means "leave unchanged".
    const { errors } = await throughPipe({ preferredCategoryId: null });
    expect(errors).toHaveLength(0);
  });
});
