/**
 * CR-CRM-CATEGORY-MASTER-001 — deal scoring industry fit.
 *
 * `industryFit` used to be `unit.category === customer.preferredCategory`, a
 * raw string comparison between two independently-maintained text columns. A
 * unit classified "Beauty & Wellness" and a customer recorded as
 * "Health & Beauty" are the same master category (BEAUTY) yet scored as a
 * mismatch — 65 instead of 90 — and nobody could see why.
 *
 * Identity now decides, with the text kept only as a fallback for rows that
 * predate the backfill.
 */
import { matchesIndustry } from './deal-scoring.service';

const BEAUTY = 'cat-beauty';
const FNB = 'cat-fnb';

describe('deal scoring — industry fit by canonical Category identity', () => {
  it('matches when both sides carry the same categoryId', () => {
    expect(
      matchesIndustry(
        { categoryId: BEAUTY, category: 'Beauty & Wellness' },
        { preferredCategoryId: BEAUTY, preferredCategory: 'Beauty & Wellness' },
      ),
    ).toBe(true);
  });

  it('matches when the historical names differ but the ids agree', () => {
    // The exact pair that used to be scored as a mismatch: the customer's
    // snapshot predates the rename/alias, the unit's does not.
    expect(
      matchesIndustry(
        { categoryId: BEAUTY, category: 'Beauty & Wellness' },
        { preferredCategoryId: BEAUTY, preferredCategory: 'Health & Beauty' },
      ),
    ).toBe(true);
  });

  it('does NOT match when the ids differ, even if the text happens to agree', () => {
    // A stale snapshot must not be able to fake a match either.
    expect(
      matchesIndustry(
        { categoryId: FNB, category: 'Beauty & Wellness' },
        { preferredCategoryId: BEAUTY, preferredCategory: 'Beauty & Wellness' },
      ),
    ).toBe(false);
  });

  it('falls back to text only while one side has no categoryId', () => {
    expect(
      matchesIndustry(
        { categoryId: null, category: 'F&B' },
        { preferredCategoryId: null, preferredCategory: 'F&B' },
      ),
    ).toBe(true);
    expect(
      matchesIndustry(
        { categoryId: null, category: 'F&B' },
        { preferredCategoryId: BEAUTY, preferredCategory: 'Beauty & Wellness' },
      ),
    ).toBe(false);
  });

  it('never matches on two empty categories', () => {
    expect(matchesIndustry({}, {})).toBe(false);
    expect(matchesIndustry(null, null)).toBe(false);
  });
});
