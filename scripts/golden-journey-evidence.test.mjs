import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyJourneyEvidence,
  parseCoverageRows,
} from './golden-journey-evidence.mjs';

test('parses psql fixture counts into numeric evidence', () => {
  assert.deepEqual(parseCoverageRows('approved_lead_to_contract|2\nmall_count|1\n'), {
    approved_lead_to_contract: 2,
    mall_count: 1,
  });
});

test('classifies represented and missing journey fixtures without inventing PASS', () => {
  const rows = classifyJourneyEvidence(
    { represented: 2, absent: 0 },
    [
      { key: 'represented', journey: 'represented', description: 'represented', minimum: 1 },
      { key: 'absent', journey: 'absent', description: 'absent', minimum: 1 },
    ],
  );

  assert.equal(rows[0].status, 'EVIDENCED');
  assert.equal(rows[1].status, 'MISSING');
  assert.equal(rows[1].count, 0);
});
