import { describe, expect, it } from 'vitest';
import { getReportsExportCap } from './reportsExportPresentation';

describe('reports export cap presentation', () => {
  it('reads additive export disclosure headers', () => {
    expect(getReportsExportCap({
      'x-export-truncated': 'true',
      'x-export-row-count': '5000',
      'x-export-limit': '5000',
    })).toEqual({ truncated: true, rowCount: 5000, limit: 5000 });
  });

  it('does not mark a complete export as truncated', () => {
    expect(getReportsExportCap({
      'x-export-truncated': 'false',
      'x-export-row-count': '12',
      'x-export-limit': '5000',
    })).toEqual({ truncated: false, rowCount: 12, limit: 5000 });
  });
});
