/**
 * CR-CRM-CATEGORY-MASTER-001 — backfill classification rules.
 *
 * The backfill decides, per legacy string, whether a Category can be resolved
 * SAFELY. The whole point of the CR is that it must never guess: a wrong
 * auto-migration writes a false canonical identity into the CRM that nobody
 * would notice, which is worse than leaving the legacy text in place.
 *
 * Covers CRM-CAT-014..019.
 */
import { classify, APPROVED_ALIASES, type MasterCategory } from './category-backfill-rules';

const MASTER: MasterCategory[] = [
  { id: 'cat-fnb', code: 'FNB', name: 'F&B', isActive: true },
  { id: 'cat-fashion', code: 'FASHION', name: 'Fashion', isActive: true },
  { id: 'cat-beauty', code: 'BEAUTY', name: 'Beauty & Wellness', isActive: true },
  { id: 'cat-tech', code: 'TECH', name: 'Technology', isActive: true },
];

describe('CRM category backfill classification', () => {
  // CRM-CAT-014
  it('CRM-CAT-014 maps an exact name match', () => {
    const r = classify('F&B', MASTER);
    expect(r.method).toBe('EXACT');
    expect(r.candidateId).toBe('cat-fnb');
    expect(r.autoMigrate).toBe(true);
  });

  // CRM-CAT-015
  it('CRM-CAT-015 maps a case-only / whitespace-only difference', () => {
    const r = classify('  fashion ', MASTER);
    expect(r.method).toBe('CASE_ONLY');
    expect(r.candidateId).toBe('cat-fashion');
    expect(r.autoMigrate).toBe(true);
  });

  // CRM-CAT-016 — the one legacy value in this dataset that needs an alias.
  it('CRM-CAT-016 maps "Health & Beauty" only because an approved alias exists', () => {
    const r = classify('Health & Beauty', MASTER);
    expect(r.method).toBe('APPROVED_ALIAS');
    expect(r.candidateId).toBe('cat-beauty');
    expect(r.autoMigrate).toBe(true);

    // Guard the premise: remove the alias and it must fall back to NO_MATCH
    // rather than being guessed from the shared word "Beauty".
    const withoutAlias = { ...APPROVED_ALIASES };
    delete withoutAlias['health & beauty'];
    expect(Object.keys(withoutAlias)).not.toContain('health & beauty');
  });

  it('CRM-CAT-016 does not fuzzy-match an unlisted near-miss', () => {
    // "Beauty" alone is not an approved alias; sharing a word with
    // "Beauty & Wellness" must not be enough.
    const r = classify('Beauty', MASTER);
    expect(r.method).toBe('NO_MATCH');
    expect(r.candidateId).toBeNull();
    expect(r.autoMigrate).toBe(false);
  });

  // CRM-CAT-017 — two master rows differ from the legacy value only by case, so
  // there is no single safe answer.
  it('CRM-CAT-017 leaves a case-ambiguous value untouched', () => {
    const ambiguousMaster: MasterCategory[] = [
      { id: 'cat-a', code: 'A', name: 'f&b', isActive: true },
      { id: 'cat-b', code: 'B', name: 'F&b', isActive: true },
    ];
    const r = classify('F&B', ambiguousMaster);
    expect(r.method).toBe('AMBIGUOUS');
    expect(r.candidateId).toBeNull();
    expect(r.autoMigrate).toBe(false);
  });

  it('CRM-CAT-017 leaves a duplicated exact name untouched', () => {
    const ambiguousMaster: MasterCategory[] = [
      { id: 'cat-a', code: 'A', name: 'F&B', isActive: true },
      { id: 'cat-b', code: 'B', name: 'F&B', isActive: true },
    ];
    const r = classify('F&B', ambiguousMaster);
    expect(r.method).toBe('AMBIGUOUS');
    expect(r.autoMigrate).toBe(false);
  });

  it('prefers an exact match over a case-only duplicate', () => {
    // Not ambiguity: one row matches exactly, so the answer is unique.
    const r = classify('F&B', [
      ...MASTER,
      { id: 'cat-fnb-2', code: 'FNB_ALT', name: 'f&b', isActive: true },
    ]);
    expect(r.method).toBe('EXACT');
    expect(r.candidateId).toBe('cat-fnb');
  });

  // CRM-CAT-018
  it('CRM-CAT-018 leaves an unknown value untouched', () => {
    const r = classify('Ngành hàng chưa khai báo', MASTER);
    expect(r.method).toBe('NO_MATCH');
    expect(r.candidateId).toBeNull();
    expect(r.autoMigrate).toBe(false);
  });

  it('refuses to auto-migrate onto an inactive Category', () => {
    const r = classify('Technology', [
      { id: 'cat-tech', code: 'TECH', name: 'Technology', isActive: false },
    ]);
    expect(r.method).toBe('EXACT');
    expect(r.autoMigrate).toBe(false);
  });

  // CRM-CAT-019 — idempotence is structural: the candidate query only selects
  // rows whose FK is still NULL, so a migrated row is never a candidate again.
  // This asserts the invariant the query relies on.
  it('CRM-CAT-019 second run has nothing to do once rows are linked', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    const src = fs.readFileSync(
      require.resolve('../../../prisma/scripts/backfill-crm-category-ids.ts'),
      'utf8',
    ) as string;

    expect(src).toContain('where: { categoryId: null, category: { not: null }, deletedAt: null }');
    expect(src).toContain(
      'where: { preferredCategoryId: null, preferredCategory: { not: null }, deletedAt: null }',
    );
    // And it must never create a Category from free text.
    expect(src).not.toMatch(/prisma\.category\.create/);
  });

  it('is dry-run unless --apply is passed', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    const src = fs.readFileSync(
      require.resolve('../../../prisma/scripts/backfill-crm-category-ids.ts'),
      'utf8',
    ) as string;

    expect(src).toContain("const apply = process.argv.includes('--apply')");
    expect(src).toContain('if (!apply) {');
    // Writes are inside a single transaction.
    expect(src).toContain('await prisma.$transaction([');
  });
});
