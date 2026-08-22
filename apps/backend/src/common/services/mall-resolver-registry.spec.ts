import * as fs from 'fs';
import * as path from 'path';
import { EXISTING_MALL_RESOLVERS, PLANNED_MALL_RESOLVERS } from './mall-resolver-registry';

// CR-101 Phase 1 -- "duplicate resolver names" and "invalid resolver reference"
// checks from docs/architecture-review/18-CR-101-TEST-STRATEGY.md. Scans every
// controller for `resolver: 'name'` strings inside @Scope(...) declarations and
// asserts each name is registered somewhere (existing or planned) -- catches a
// typo'd resolver reference immediately, distinct from (and narrower than) the
// Phase 5 "does every route have @Scope at all" completeness gate, which this
// test does NOT attempt.

function findControllerFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findControllerFiles(full, acc);
    else if (entry.name.endsWith('.controller.ts') && !entry.name.endsWith('.spec.ts')) acc.push(full);
  }
  return acc;
}

describe('CR-101 Phase 1 -- Mall resolver registry integrity', () => {
  it('has no duplicate resolver names between EXISTING and PLANNED', () => {
    const existingNames = Object.keys(EXISTING_MALL_RESOLVERS);
    const plannedNames = Object.keys(PLANNED_MALL_RESOLVERS);
    const overlap = existingNames.filter((n) => plannedNames.includes(n));
    expect(overlap).toEqual([]);
  });

  it('every resolver name referenced by a @Scope(...) declaration in a controller is registered (existing or planned)', () => {
    const modulesDir = path.join(__dirname, '..', '..', 'modules');
    const filesDir = path.join(__dirname, '..', '..', 'files');
    const files = [...findControllerFiles(modulesDir), ...(fs.existsSync(filesDir) ? findControllerFiles(filesDir) : [])];

    const knownResolvers = new Set([...Object.keys(EXISTING_MALL_RESOLVERS), ...Object.keys(PLANNED_MALL_RESOLVERS)]);
    const unknownReferences: { file: string; resolver: string }[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const matches = content.matchAll(/resolver:\s*'([^']+)'/g);
      for (const m of matches) {
        const name = m[1];
        if (!knownResolvers.has(name)) {
          unknownReferences.push({ file: path.relative(process.cwd(), file), resolver: name });
        }
      }
    }

    expect(unknownReferences).toEqual([]);
  });
});
