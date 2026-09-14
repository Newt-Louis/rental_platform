/**
 * CR-CRM-CATEGORY-MASTER-001 — classification rules for the CRM category
 * backfill.
 *
 * These live under src/ rather than next to the script that uses them for two
 * reasons: a test importing them from prisma/ would pull that directory into
 * the Nest build program and move the emitted tree from dist/ to dist/src/,
 * and the rules are the part worth reviewing and testing on their own.
 *
 * The rules decide whether a legacy free-text category can be resolved to the
 * Category master SAFELY. They must never guess: writing a wrong canonical
 * identity into the CRM is silent and far worse than leaving the legacy text
 * in place for a human to resolve.
 */

/**
 * Reviewed aliases: legacy text that is KNOWN to mean a specific master
 * Category but does not match its name.
 *
 * Every entry must be justified. The only entry needed for the current data is
 * "Health & Beauty", and it is not a guess: the repository already carries this
 * exact mapping in prisma/scripts/migrate-categories.ts
 * (`'Health & Beauty': 'BEAUTY'`), authored when the Category master was
 * introduced. Anything not listed here is reported, never auto-migrated —
 * "Supermarket" and "Technology" for instance match by name and need no alias.
 *
 * Keys are compared case-insensitively after trimming. Values are Category.code
 * so the mapping stays portable across environments: NO environment-specific
 * Category ids appear anywhere in this file.
 */
export const APPROVED_ALIASES: Record<string, string> = {
  'health & beauty': 'BEAUTY',
};

export type MatchMethod = 'EXACT' | 'CASE_ONLY' | 'APPROVED_ALIAS' | 'AMBIGUOUS' | 'NO_MATCH';

export interface MappingRow {
  entity: 'Lead' | 'Customer';
  legacyValue: string;
  recordCount: number;
  candidateId: string | null;
  candidateName: string | null;
  method: MatchMethod;
  confidence: 'HIGH' | 'NONE';
  autoMigrate: boolean;
  reason: string;
}

export interface MasterCategory {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export type Classification = Omit<MappingRow, 'entity' | 'legacyValue' | 'recordCount'>;

export function classify(legacy: string, master: MasterCategory[]): Classification {
  const trimmed = legacy.trim();
  const lowered = trimmed.toLowerCase();

  const exact = master.filter((c) => c.name === trimmed);
  if (exact.length === 1) {
    return {
      candidateId: exact[0].id,
      candidateName: exact[0].name,
      method: 'EXACT',
      confidence: 'HIGH',
      autoMigrate: exact[0].isActive,
      reason: exact[0].isActive
        ? 'Trung khop chinh xac Category.name'
        : 'Trung ten nhung Category da ngung su dung - can nghiep vu xac nhan',
    };
  }
  if (exact.length > 1) {
    return {
      candidateId: null,
      candidateName: null,
      method: 'AMBIGUOUS',
      confidence: 'NONE',
      autoMigrate: false,
      reason: `${exact.length} Category trung ten chinh xac`,
    };
  }

  const caseOnly = master.filter((c) => c.name.trim().toLowerCase() === lowered);
  if (caseOnly.length === 1) {
    return {
      candidateId: caseOnly[0].id,
      candidateName: caseOnly[0].name,
      method: 'CASE_ONLY',
      confidence: 'HIGH',
      autoMigrate: caseOnly[0].isActive,
      reason: caseOnly[0].isActive
        ? 'Chi khac hoa/thuong hoac khoang trang'
        : 'Khop hoa/thuong nhung Category da ngung su dung',
    };
  }
  if (caseOnly.length > 1) {
    return {
      candidateId: null,
      candidateName: null,
      method: 'AMBIGUOUS',
      confidence: 'NONE',
      autoMigrate: false,
      reason: `${caseOnly.length} Category khop khi bo qua hoa/thuong`,
    };
  }

  const aliasCode = APPROVED_ALIASES[lowered];
  if (aliasCode) {
    const byCode = master.filter((c) => c.code === aliasCode);
    if (byCode.length === 1) {
      return {
        candidateId: byCode[0].id,
        candidateName: byCode[0].name,
        method: 'APPROVED_ALIAS',
        confidence: 'HIGH',
        autoMigrate: byCode[0].isActive,
        reason: byCode[0].isActive
          ? `Alias da duyet -> Category.code ${aliasCode}`
          : `Alias da duyet nhung Category ${aliasCode} da ngung su dung`,
      };
    }
    return {
      candidateId: null,
      candidateName: null,
      method: 'NO_MATCH',
      confidence: 'NONE',
      autoMigrate: false,
      reason: `Alias tro toi code ${aliasCode} nhung khong tim thay Category tuong ung`,
    };
  }

  return {
    candidateId: null,
    candidateName: null,
    method: 'NO_MATCH',
    confidence: 'NONE',
    autoMigrate: false,
    reason: 'Khong co Category nao khop va khong co alias da duyet - can nghiep vu quyet dinh',
  };
}
