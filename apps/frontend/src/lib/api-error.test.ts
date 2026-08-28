import { describe, it, expect, beforeAll } from 'vitest';
import i18n from './i18n';
import { getApiErrorMessage } from './api-error';

const prismaFailure = {
  response: {
    status: 500,
    data: {
      success: false,
      statusCode: 500,
      message:
        '\nInvalid `this.prisma.user.create()` invocation in\n/app/src/modules/users/users.service.ts:135:44\nForeign key constraint failed on the field: `User_tenantId_fkey (index)`',
      code: 'INTERNAL_ERROR',
    },
  },
};

describe('getApiErrorMessage', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('vi');
  });

  it('replaces a raw Prisma dump with an operator-readable message', () => {
    const message = getApiErrorMessage(prismaFailure);

    expect(message).not.toMatch(/prisma|invocation|constraint failed/i);
    expect(message).toBe(i18n.t('common:apiErrors.codes.INTERNAL_ERROR'));
  });

  it('localizes a known domain error code', () => {
    const message = getApiErrorMessage({
      response: { status: 400, data: { code: 'USER_TENANT_ROLE_MISMATCH', message: 'A linked tenant can only be set on a TENANT account' } },
    });

    expect(message).toBe(i18n.t('common:apiErrors.codes.USER_TENANT_ROLE_MISMATCH'));
  });

  it('lists every field-level validation problem', () => {
    const message = getApiErrorMessage({
      response: {
        status: 400,
        data: { code: 'VALIDATION_FAILED', message: 'x', errors: ['email must be an email', 'password is too short'] },
      },
    });

    expect(message).toBe('email must be an email\npassword is too short');
  });

  it('keeps a plain backend message that has no code', () => {
    const message = getApiErrorMessage({
      response: { status: 400, data: { message: 'At least one active administrator must remain' } },
    });

    expect(message).toBe('At least one active administrator must remain');
  });

  it('reports a lost connection distinctly from a server fault', () => {
    const message = getApiErrorMessage({ request: {}, message: 'Network Error' });

    expect(message).toBe(i18n.t('common:apiErrors.network'));
  });

  it('falls back to the caller-supplied wording when there is nothing usable', () => {
    expect(getApiErrorMessage({ response: { status: 400, data: {} } }, 'Không thể lưu')).toBe('Không thể lưu');
  });
});
