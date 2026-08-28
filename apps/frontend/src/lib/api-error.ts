import i18n from './i18n';

/**
 * Backend error envelope (see `HttpExceptionFilter`):
 * `{ success: false, statusCode, message, code, errors }`.
 *
 * `code` is the stable, machine-readable reason and is what we localize;
 * `message` is only the English fallback for reasons that have no code yet.
 */
interface ApiErrorBody {
  message?: string | string[];
  code?: string | null;
  errors?: string[] | null;
}

/** Reasons that have a localized wording. Anything else falls back to `message`. */
const LOCALIZED_CODES = new Set([
  'DUPLICATE_VALUE',
  'INVALID_REFERENCE',
  'MISSING_REQUIRED_FIELD',
  'RELATION_CONSTRAINT',
  'RECORD_NOT_FOUND',
  'DATABASE_ERROR',
  'INTERNAL_ERROR',
  'USER_EMAIL_TAKEN',
  'USER_TENANT_ROLE_MISMATCH',
  'USER_TENANT_NOT_FOUND',
  'USER_DEPARTMENT_NOT_FOUND',
  'USER_MALL_SCOPE_NOT_APPLICABLE',
  'USER_MALL_ROLE_NOT_GRANTABLE',
  'USER_MALL_NOT_FOUND',
]);

/**
 * Turns an Axios failure into something a non-technical operator can act on.
 * Raw driver text ("Invalid `prisma.user.create()` invocation ... Foreign key
 * constraint failed") must never reach the UI.
 */
export function getApiErrorMessage(error: any, fallback?: string): string {
  const t = i18n.t.bind(i18n);
  const defaultMessage = fallback ?? t('common:apiErrors.generic');

  if (!error) return defaultMessage;

  if (error.response === undefined && error.request !== undefined) {
    return t('common:apiErrors.network');
  }

  const status = error.response?.status;
  const body: ApiErrorBody | undefined = error.response?.data;

  if (body?.code && LOCALIZED_CODES.has(body.code)) {
    return t(`common:apiErrors.codes.${body.code}`);
  }

  // Field-level validation: list every problem, not just the first one.
  if (Array.isArray(body?.errors) && body!.errors!.length > 0) {
    return body!.errors!.join('\n');
  }

  const message = Array.isArray(body?.message) ? body!.message!.join('\n') : body?.message;
  if (message && !looksTechnical(message)) return message;

  if (status && status >= 500) return t('common:apiErrors.server');
  return defaultMessage;
}

/** Prisma/stack-trace style text that would be meaningless to an operator. */
function looksTechnical(message: string): boolean {
  return /prisma|invocation|constraint failed|\bat\s+\/|\.ts:\d+|SQL|ECONNREFUSED/i.test(message);
}
