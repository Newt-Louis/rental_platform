import type { TFunction } from 'i18next';

const ROLE_VALUES = new Set([
  'ADMIN',
  'CEO',
  'MALL_DIRECTOR',
  'LEASING_MANAGER',
  'LEASING_EXECUTIVE',
  'FINANCE',
  'LEGAL',
  'OPERATION',
  'TENANT',
]);

const SAP_STATUS_VALUES = new Set([
  'PENDING',
  'SUCCESS',
  'FAILED',
  'RETRYING',
  'SYNCED',
  'MATCHED',
  'MISMATCH',
]);

const INVOICE_TYPE_VALUES = new Set([
  'MONTHLY_RENT',
  'DEPOSIT',
  'UTILITY',
  'MARKETING_FEE',
  'PARKING',
  'PENALTY',
  'REVENUE_SHARE',
  'SERVICE_CONTRACT',
]);

const SERVICE_CONTRACT_TYPE_VALUES = new Set([
  'SERVICE',
  'SUPPLY',
  'LABOR',
  'MAINTENANCE',
  'CONSTRUCTION',
  'CONSULTING',
  'PARTNERSHIP',
  'CONFIDENTIALITY',
  'SOFTWARE',
  'INSURANCE',
  'SECURITY',
  'CLEANING',
  'OTHER',
]);

function enumTranslationKey(values: Set<string>, prefix: string, value?: string | null) {
  return value && values.has(value) ? `${prefix}.${value}` : 'common:unknownValue';
}

export function localizedEnumLabel(
  t: TFunction,
  prefix: string,
  value?: string | null,
) {
  const fallback = String(t('common:unknownValue'));
  return value
    ? String(t(`${prefix}.${value}`, { defaultValue: fallback }))
    : fallback;
}

export const roleTranslationKey = (value?: string | null) =>
  enumTranslationKey(ROLE_VALUES, 'admin:users.roles', value);

export const sapStatusTranslationKey = (value?: string | null) =>
  enumTranslationKey(SAP_STATUS_VALUES, 'sap:statuses', value);

export const invoiceTypeTranslationKey = (value?: string | null) =>
  enumTranslationKey(INVOICE_TYPE_VALUES, 'reports:revenueReceivables.invoiceTypes', value);

export const serviceContractTypeTranslationKey = (value?: string | null) =>
  enumTranslationKey(SERVICE_CONTRACT_TYPE_VALUES, 'serviceContracts:types', value);
