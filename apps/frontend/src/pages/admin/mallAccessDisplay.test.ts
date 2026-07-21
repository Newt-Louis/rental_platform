import { describe, expect, it } from 'vitest';
import { getMallAccessDisplay } from './mallAccessDisplay';

describe('getMallAccessDisplay', () => {
  it('returns global for ADMIN regardless of mallAccess', () => {
    expect(getMallAccessDisplay({ role: 'ADMIN', mallAccess: [] })).toEqual({ kind: 'global' });
  });

  it('returns global for CEO regardless of mallAccess', () => {
    expect(getMallAccessDisplay({ role: 'CEO' })).toEqual({ kind: 'global' });
  });

  it('returns not-applicable for TENANT', () => {
    expect(getMallAccessDisplay({ role: 'TENANT', mallAccess: [] })).toEqual({ kind: 'not-applicable' });
  });

  it('returns unassigned for a mall-scoped role with no mall access', () => {
    expect(getMallAccessDisplay({ role: 'LEASING_EXECUTIVE', mallAccess: [] })).toEqual({ kind: 'unassigned' });
  });

  it('returns unassigned for a mall-scoped role when mallAccess is undefined', () => {
    expect(getMallAccessDisplay({ role: 'MALL_DIRECTOR' })).toEqual({ kind: 'unassigned' });
  });

  it('returns the mall list for a mall-scoped role with grants', () => {
    const mallAccess = [
      { mall: { id: 'mall-1', name: 'THISO Mall Sala' } },
      { mall: { id: 'mall-2', name: 'THISO Mall Vivo' } },
    ];
    expect(getMallAccessDisplay({ role: 'LEASING_EXECUTIVE', mallAccess })).toEqual({
      kind: 'malls',
      malls: [
        { id: 'mall-1', name: 'THISO Mall Sala' },
        { id: 'mall-2', name: 'THISO Mall Vivo' },
      ],
    });
  });

  it('defaults to not-applicable for a role outside both the global and mall-scoped lists (defensive default for future roles)', () => {
    expect(getMallAccessDisplay({ role: 'SOME_FUTURE_ROLE' as any, mallAccess: [] })).toEqual({ kind: 'not-applicable' });
  });
});
