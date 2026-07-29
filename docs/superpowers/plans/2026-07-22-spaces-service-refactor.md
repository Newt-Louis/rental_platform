# Spaces Service Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 1534-line `SpacesService` "god service" into focused, single-responsibility services organized by sub-domain, following NestJS's official Feature Module pattern, while keeping `SpacesController` as a single controller that injects multiple services.

**Architecture:** Pure structural refactor — no behavior changes, no bug fixes, no route changes. Each task moves a cohesive group of methods verbatim (unchanged logic) from `spaces.service.ts` into a new dedicated service file, updates `spaces.module.ts` wiring, and updates the corresponding block in `spaces.controller.ts` to call the new service instead of `SpacesService`. Cross-service calls (e.g. `UnitHistoryService` needing `UnitsService.getUnit()`) are wired via constructor injection.

**Tech Stack:** NestJS 10, Prisma 5, TypeScript 5, Jest 30 (`ts-jest`).

## Global Constraints

- Zero behavior change: method bodies are moved **verbatim** (copy exact lines, do not rewrite logic, do not fix any bugs found in prior review — those are separate follow-up work).
- Route paths, route declaration order, and Swagger decorators in `spaces.controller.ts` do not change — only the injected service each handler calls.
- After every task: `cd apps/backend && npm run build` must succeed (`nest build` runs `tsc`).
- After every task: `cd apps/backend && npm test` must pass (full jest suite — cheap enough to run in full each time; only 2 spec files exist today).
- Do not create new NestJS modules — everything stays registered in the existing `SpacesModule`.
- Do not add new test files as part of this plan (out of scope — this is structure-only; see Task 12 for the coverage gap note).
- Commit after each task with a message describing the extraction (e.g. `refactor: extract MallsService from SpacesService`).

---

## Reference: current file being split

`apps/backend/src/modules/spaces/spaces.service.ts` (1534 lines) — all line ranges cited below refer to this file **as it exists before Task 1 starts**. If a prior task has already removed lines, later tasks' ranges refer to the original numbering; re-open the file with the Read tool to confirm current ranges before each move if unsure.

---

### Task 1: Extract merge/split DTOs

**Files:**
- Create: `apps/backend/src/modules/spaces/dto/merge-unit.dto.ts`
- Modify: `apps/backend/src/modules/spaces/spaces.service.ts:40-55` (delete these lines after copy)

**Interfaces:**
- Produces: `MergeUnitDto { code: string; name?: string; baseRentPerSqm?: number; camPerSqm?: number }`, `MergeResult { combinedUnit: any; mergedUnitIds: string[] }`, `SplitResult { restoredUnits: any[]; deactivatedCombinedId: string }`

- [ ] **Step 1: Create the DTO file**

```ts
// apps/backend/src/modules/spaces/dto/merge-unit.dto.ts
export interface MergeUnitDto {
  code: string;
  name?: string;
  baseRentPerSqm?: number;
  camPerSqm?: number;
}

export interface MergeResult {
  combinedUnit: any;
  mergedUnitIds: string[];
}

export interface SplitResult {
  restoredUnits: any[];
  deactivatedCombinedId: string;
}
```

- [ ] **Step 2: Delete lines 40-55 from `spaces.service.ts`** (the three interfaces just copied)

- [ ] **Step 3: In `spaces.service.ts`, replace any local use of these types with an import**

```ts
import { MergeUnitDto, MergeResult, SplitResult } from './dto/merge-unit.dto';
```

- [ ] **Step 4: In `spaces.controller.ts`, change the import**

Find:
```ts
import { SpacesService, MergeUnitDto } from './spaces.service';
```
Replace with:
```ts
import { SpacesService } from './spaces.service';
import { MergeUnitDto } from './dto/merge-unit.dto';
```

- [ ] **Step 5: Verify build**

Run: `cd apps/backend && npm run build`
Expected: exits 0, no TS errors.

- [ ] **Step 6: Verify tests**

Run: `cd apps/backend && npm test`
Expected: all suites pass (unchanged from baseline).

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/spaces/dto/merge-unit.dto.ts apps/backend/src/modules/spaces/spaces.service.ts apps/backend/src/modules/spaces/spaces.controller.ts
git commit -m "refactor: move MergeUnitDto/MergeResult/SplitResult to dto/merge-unit.dto.ts"
```

---

### Task 2: Extract `units.util.ts`

**Files:**
- Create: `apps/backend/src/modules/spaces/units/units.util.ts`
- Modify: `apps/backend/src/modules/spaces/spaces.service.ts:11-38` (delete after copy)

**Interfaces:**
- Produces: `sanitizeUnitDto(dto: any): any`, `UNIT_RELATION_FIELDS: Set<string>`, `UNIT_REQUIRED_FIELDS: Set<string>`

- [ ] **Step 1: Create the util file** — copy lines 11-38 of `spaces.service.ts` verbatim into it, with an added `BadRequestException` import:

```ts
// apps/backend/src/modules/spaces/units/units.util.ts
import { BadRequestException } from '@nestjs/common';

// Relation fields and read-only fields that must never be written directly to Prisma
export const UNIT_RELATION_FIELDS = new Set([
  'id', 'createdAt', 'updatedAt',
  'mall', 'building', 'floor', 'zone', 'tenant',
  'categoryRef', 'contracts', 'media', 'bookings', 'proposals',
  'unitHistory',
]);

// Scalar fields that are non-nullable in schema.prisma -- sending `null` for these
// makes Prisma throw a misleading "Unknown argument `floorId`" error instead of the
// real "Argument `x` must not be null", because the query engine mis-reports the
// first field it can't reconcile once any field in the payload fails validation.
export const UNIT_REQUIRED_FIELDS = new Set([
  'mallId', 'code', 'areaGFA', 'areaNLA', 'baseRentPerSqm', 'camPerSqm',
  'status', 'isActive', 'isFlexibleArea', 'isCombined',
]);

export function sanitizeUnitDto(dto: any): any {
  const out: any = {};
  for (const key of Object.keys(dto)) {
    if (UNIT_RELATION_FIELDS.has(key)) continue;
    if (dto[key] === null && UNIT_REQUIRED_FIELDS.has(key)) {
      throw new BadRequestException(`Trường "${key}" không được để trống`);
    }
    out[key] = dto[key];
  }
  return out;
}
```

- [ ] **Step 2: Delete lines 11-38 from `spaces.service.ts`**

- [ ] **Step 3: In `spaces.service.ts`, add import and keep using the same names** (no call-site changes needed since names are unchanged)

```ts
import { sanitizeUnitDto } from './units/units.util';
```

- [ ] **Step 4: Verify build** — `cd apps/backend && npm run build` — expect exit 0.

- [ ] **Step 5: Verify tests** — `cd apps/backend && npm test` — expect all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/spaces/units/units.util.ts apps/backend/src/modules/spaces/spaces.service.ts
git commit -m "refactor: extract sanitizeUnitDto and unit field constants to units.util.ts"
```

---

### Task 3: Extract `MallsService`

**Files:**
- Create: `apps/backend/src/modules/spaces/malls/malls.service.ts`
- Modify: `apps/backend/src/modules/spaces/spaces.service.ts:66-128` (delete after copy)
- Modify: `apps/backend/src/modules/spaces/spaces.module.ts` (register provider)
- Modify: `apps/backend/src/modules/spaces/spaces.controller.ts:22-68` (inject + delegate Malls routes)

**Interfaces:**
- Produces: `getMalls()`, `createMall(dto: CreateMallDto)`, `setupMall(data)`, `getMall(id: string)`, `updateMall(id: string, dto: Partial<CreateMallDto>)`, `deleteMall(id: string)`
- Consumes: `PrismaService`

- [ ] **Step 1: Create `malls/malls.service.ts`** — copy the body of lines 66-128 from `spaces.service.ts` verbatim (methods `getMalls`, `createMall`, `setupMall`, `getMall`, `updateMall`, `deleteMall`) into a new `@Injectable()` class:

```ts
// apps/backend/src/modules/spaces/malls/malls.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateMallDto } from '../dto/create-mall.dto';

@Injectable()
export class MallsService {
  constructor(private prisma: PrismaService) {}

  // <-- paste verbatim body of getMalls/createMall/setupMall/getMall/updateMall/deleteMall
  //     from spaces.service.ts lines 66-128 here, unchanged -->
}
```

- [ ] **Step 2: Delete lines 66-128 (the Malls section) from `spaces.service.ts`**, including the `// MALLS` comment.

- [ ] **Step 3: In `spaces.module.ts`, register the new provider**

```ts
import { MallsService } from './malls/malls.service';
// ...
providers: [
  SpacesService, UnitMediaService, ServiceCatalogService,
  MallsService,
],
```

- [ ] **Step 4: In `spaces.controller.ts`, inject `MallsService` and delegate the 6 Malls routes**

In the constructor:
```ts
constructor(
  private readonly spacesService: SpacesService,
  private readonly unitMediaService: UnitMediaService,
  private readonly mallsService: MallsService,
) {}
```

Change each of the 6 handlers under `// ─── Malls ───` (lines 30-68) from `this.spacesService.xxx(...)` to `this.mallsService.xxx(...)`, e.g.:
```ts
getMalls() {
  return this.mallsService.getMalls();
}
```
Do this for `createMall`, `setupMall`, `getMall`, `updateMall`, `deleteMall` as well. Add the import:
```ts
import { MallsService } from './malls/malls.service';
```

- [ ] **Step 5: Verify build** — `cd apps/backend && npm run build` — expect exit 0.

- [ ] **Step 6: Verify tests** — `cd apps/backend && npm test` — expect all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/spaces/malls/malls.service.ts apps/backend/src/modules/spaces/spaces.service.ts apps/backend/src/modules/spaces/spaces.module.ts apps/backend/src/modules/spaces/spaces.controller.ts
git commit -m "refactor: extract MallsService from SpacesService"
```

---

### Task 4: Extract `ZonesService`

**Files:**
- Create: `apps/backend/src/modules/spaces/zones/zones.service.ts`
- Modify: `spaces.service.ts:165-197` (delete after copy)
- Modify: `spaces.module.ts` (register provider)
- Modify: `spaces.controller.ts:102-129` (inject + delegate Zones routes)

**Interfaces:**
- Produces: `getZones(floorId?, mallId?)`, `createZone(data)`, `updateZone(id, data)`, `deleteZone(id)`
- Consumes: `PrismaService`

- [ ] **Step 1: Create `zones/zones.service.ts`** — copy verbatim body of lines 165-197 (`getZones`, `createZone`, `updateZone`, `deleteZone`):

```ts
// apps/backend/src/modules/spaces/zones/zones.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class ZonesService {
  constructor(private prisma: PrismaService) {}

  // <-- paste verbatim body of getZones/createZone/updateZone/deleteZone
  //     from spaces.service.ts lines 165-197 here, unchanged -->
}
```

- [ ] **Step 2: Delete lines 165-197 (`// ZONES` section) from `spaces.service.ts`**

- [ ] **Step 3: Register in `spaces.module.ts`**

```ts
import { ZonesService } from './zones/zones.service';
// add ZonesService to providers array
```

- [ ] **Step 4: In `spaces.controller.ts`, inject `ZonesService` and delegate the 4 Zones routes** (lines 102-129), same pattern as Task 3 Step 4. Add import `import { ZonesService } from './zones/zones.service';`.

- [ ] **Step 5: Verify build** — `npm run build` — expect exit 0.

- [ ] **Step 6: Verify tests** — `npm test` — expect all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/spaces/zones/zones.service.ts apps/backend/src/modules/spaces/spaces.service.ts apps/backend/src/modules/spaces/spaces.module.ts apps/backend/src/modules/spaces/spaces.controller.ts
git commit -m "refactor: extract ZonesService from SpacesService"
```

---

### Task 5: Extract `FloorsService`

**Files:**
- Create: `apps/backend/src/modules/spaces/floors/floors.service.ts`
- Modify: `spaces.service.ts:131-162` (delete after copy)
- Modify: `spaces.module.ts` (register provider)
- Modify: `spaces.controller.ts:72-98` (inject + delegate Floors routes)

**Interfaces:**
- Produces: `getFloors(mallId?)`, `createFloor(data)`, `updateFloor(id, data)`, `deleteFloor(id)`
- Consumes: `PrismaService`

- [ ] **Step 1: Create `floors/floors.service.ts`** — copy verbatim body of lines 131-162:

```ts
// apps/backend/src/modules/spaces/floors/floors.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class FloorsService {
  constructor(private prisma: PrismaService) {}

  // <-- paste verbatim body of getFloors/createFloor/updateFloor/deleteFloor
  //     from spaces.service.ts lines 131-162 here, unchanged -->
}
```

- [ ] **Step 2: Delete lines 131-162 (`// FLOORS` section) from `spaces.service.ts`**

- [ ] **Step 3: Register in `spaces.module.ts`**, same pattern as before.

- [ ] **Step 4: In `spaces.controller.ts`, inject `FloorsService` and delegate the 4 Floors routes** (lines 72-98).

- [ ] **Step 5: Verify build** — `npm run build`.

- [ ] **Step 6: Verify tests** — `npm test`.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/spaces/floors/floors.service.ts apps/backend/src/modules/spaces/spaces.service.ts apps/backend/src/modules/spaces/spaces.module.ts apps/backend/src/modules/spaces/spaces.controller.ts
git commit -m "refactor: extract FloorsService from SpacesService"
```

---

### Task 6: Extract `UnitsService` (core CRUD)

**Files:**
- Create: `apps/backend/src/modules/spaces/units/units.service.ts`
- Modify: `spaces.service.ts:200-407` (delete after copy)
- Modify: `spaces.module.ts` (register provider)
- Modify: `spaces.controller.ts:133-149,259-291` (inject + delegate Units CRUD routes)

**Interfaces:**
- Produces: `getUnits(query)`, `getUnit(id: string)`, `createUnit(dto: CreateUnitDto)`, `updateUnit(id: string, dto: any)`, `updateUnitStatus(id, status, userId?)`, `deleteUnit(id: string)`
- Consumes: `PrismaService`, `UnitStatusService` (from `../../../common/services/unit-status.service`), `sanitizeUnitDto` (from `./units.util`)

- [ ] **Step 1: Create `units/units.service.ts`** — copy verbatim body of lines 200-407 (`getUnits`, `getUnit`, `createUnit`, `updateUnit`, `updateUnitStatus`, `deleteUnit`):

```ts
// apps/backend/src/modules/spaces/units/units.service.ts
import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateUnitDto } from '../dto/create-unit.dto';
import { UnitStatus } from '@prisma/client';
import { UnitStatusService } from '../../../common/services/unit-status.service';
import { sanitizeUnitDto } from './units.util';

@Injectable()
export class UnitsService {
  constructor(
    private prisma: PrismaService,
    private unitStatus: UnitStatusService,
  ) {}

  // <-- paste verbatim body of getUnits/getUnit/createUnit/updateUnit/updateUnitStatus/deleteUnit
  //     from spaces.service.ts lines 200-407 here, unchanged.
  //     Inside updateUnit/updateUnitStatus/deleteUnit, `this.getUnit(id)` calls stay as-is
  //     since getUnit now lives in this same class. -->
}
```

- [ ] **Step 2: Delete lines 200-407 (`// UNITS` section) from `spaces.service.ts`**

- [ ] **Step 3: Register in `spaces.module.ts`**

```ts
import { UnitsService } from './units/units.service';
// add UnitsService to providers array
```

- [ ] **Step 4: In `spaces.controller.ts`, inject `UnitsService` and delegate**: `getUnits` (line 147), `getUnit` (line 261), `createUnit` (line 268 — note it also reads `user.activeMallId`, keep that logic in the controller unchanged, only swap the service call), `updateUnit` (line 276), `updateUnitStatus` (line 283), `deleteUnit` (line 290).

- [ ] **Step 5: Verify build** — `npm run build`.

- [ ] **Step 6: Verify tests** — `npm test`.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/spaces/units/units.service.ts apps/backend/src/modules/spaces/spaces.service.ts apps/backend/src/modules/spaces/spaces.module.ts apps/backend/src/modules/spaces/spaces.controller.ts
git commit -m "refactor: extract UnitsService from SpacesService"
```

---

### Task 7: Extract `UnitHistoryService`

**Files:**
- Create: `apps/backend/src/modules/spaces/units/unit-history.service.ts`
- Modify: `spaces.service.ts:495-607` (delete after copy — `recordUnitHistory`, `getUnitHistory`, `updateUnitWithHistory`)
- Modify: `spaces.module.ts` (register provider)
- Modify: `spaces.controller.ts:370-385` (inject + delegate history routes)

**Interfaces:**
- Produces: `recordUnitHistory(unitId, changeType, fieldName, oldValue, newValue, changedById?, notes?)`, `getUnitHistory(unitId: string)`, `updateUnitWithHistory(id: string, dto: any, userId?: string)`
- Consumes: `PrismaService`, `UnitsService.getUnit()` (Task 6), `sanitizeUnitDto` (Task 2)

- [ ] **Step 1: Create `units/unit-history.service.ts`** — copy verbatim body of lines 499-607, changing the one `this.getUnit(id)` call at what was line 536 to `this.unitsService.getUnit(id)`:

```ts
// apps/backend/src/modules/spaces/units/unit-history.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { UnitHistoryType, UnitStatus, Prisma } from '@prisma/client';
import { UnitsService } from './units.service';
import { sanitizeUnitDto } from './units.util';

@Injectable()
export class UnitHistoryService {
  constructor(
    private prisma: PrismaService,
    private unitsService: UnitsService,
  ) {}

  // <-- paste verbatim body of recordUnitHistory (lines 499-519) and
  //     getUnitHistory (lines 521-533) here, unchanged -->

  // <-- paste verbatim body of updateUnitWithHistory (lines 535-607) here,
  //     with ONE change: replace `const current = await this.getUnit(id);`
  //     with `const current = await this.unitsService.getUnit(id);` -->
}
```

- [ ] **Step 2: Delete lines 495-607 (the `// PHASE 2: Unit History Tracking` section) from `spaces.service.ts`**

- [ ] **Step 3: Register in `spaces.module.ts`**

```ts
import { UnitHistoryService } from './units/unit-history.service';
// add UnitHistoryService to providers array
```

- [ ] **Step 4: In `spaces.controller.ts`, inject `UnitHistoryService` and delegate** `getUnitHistory` (line 372) and `updateUnitWithHistory` (line 384).

- [ ] **Step 5: Verify build** — `npm run build`.

- [ ] **Step 6: Verify tests** — `npm test`.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/spaces/units/unit-history.service.ts apps/backend/src/modules/spaces/spaces.service.ts apps/backend/src/modules/spaces/spaces.module.ts apps/backend/src/modules/spaces/spaces.controller.ts
git commit -m "refactor: extract UnitHistoryService from SpacesService"
```

---

### Task 8: Extract `UnitMergeService` (and update the existing spec)

**Files:**
- Create: `apps/backend/src/modules/spaces/units/unit-merge.service.ts`
- Modify: `spaces.service.ts:1357-1533` (delete after copy — `mergeUnits`, `splitUnit`, plus the `// GAP #2` banner)
- Modify: `spaces.module.ts` (register provider)
- Modify: `spaces.controller.ts:221-255` (inject + delegate merge/split routes)
- Modify: `apps/backend/src/modules/spaces/spaces.merge-split.spec.ts` (point at the new service)

**Interfaces:**
- Produces: `mergeUnits(unitIds: string[], dto: MergeUnitDto, userId?: string): Promise<MergeResult>`, `splitUnit(unitId: string, userId?: string): Promise<SplitResult>`
- Consumes: `PrismaService` only (this pair is self-contained — verified no calls to other `SpacesService` methods)

- [ ] **Step 1: Create `units/unit-merge.service.ts`** — copy verbatim body of lines 1361-1533 (`mergeUnits`, `splitUnit`):

```ts
// apps/backend/src/modules/spaces/units/unit-merge.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { UnitStatus, UnitHistoryType } from '@prisma/client';
import { MergeUnitDto, MergeResult, SplitResult } from '../dto/merge-unit.dto';

@Injectable()
export class UnitMergeService {
  constructor(private prisma: PrismaService) {}

  // <-- paste verbatim body of mergeUnits (lines 1361-1462) here, unchanged -->

  // <-- paste verbatim body of splitUnit (lines 1464-1533) here, unchanged -->
}
```

- [ ] **Step 2: Delete lines 1357-1533 (`// GAP #2 — Merge / Split Units` section) from `spaces.service.ts`**

- [ ] **Step 3: Register in `spaces.module.ts`**

```ts
import { UnitMergeService } from './units/unit-merge.service';
// add UnitMergeService to providers array
```

- [ ] **Step 4: In `spaces.controller.ts`, inject `UnitMergeService` and delegate** `mergeUnits` (line 239) and `splitUnit` (line 253).

- [ ] **Step 5: Update `spaces.merge-split.spec.ts`** — read the file first to see its exact current mock/instantiation shape, then:
  - Replace `import { SpacesService } from './spaces.service';` with `import { UnitMergeService } from './units/unit-merge.service';`
  - Replace every `new SpacesService(...)` (or `Test.createTestingModule({ providers: [SpacesService, ...] })`) with the `UnitMergeService` equivalent — same constructor args (`PrismaService` mock only; drop `UnitStatusService` mock if the spec currently passes one, since `UnitMergeService` doesn't need it).
  - Replace all `service.mergeUnits(...)` / `service.splitUnit(...)` calls — keep the variable name or rename `service` → `service` (type change only, same usage).

- [ ] **Step 6: Verify build** — `npm run build`.

- [ ] **Step 7: Verify tests** — `npm test` — pay special attention to `spaces.merge-split.spec.ts` passing under the new import.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/spaces/units/unit-merge.service.ts apps/backend/src/modules/spaces/spaces.service.ts apps/backend/src/modules/spaces/spaces.module.ts apps/backend/src/modules/spaces/spaces.controller.ts apps/backend/src/modules/spaces/spaces.merge-split.spec.ts
git commit -m "refactor: extract UnitMergeService from SpacesService, update merge/split spec"
```

---

### Task 9: Extract `UnitBulkService`

**Files:**
- Create: `apps/backend/src/modules/spaces/units/unit-bulk.service.ts`
- Modify: `spaces.service.ts:1114-1195` (delete after copy — `bulkUpdateUnits`, plus `// PHASE 3: Bulk Operations` banner)
- Modify: `spaces.module.ts` (register provider)
- Modify: `spaces.controller.ts:424-432` (inject + delegate bulk-update route)

**Interfaces:**
- Produces: `bulkUpdateUnits(unitIds: string[], updates: {...}, userId?: string)`
- Consumes: `PrismaService`, `UnitHistoryService.recordUnitHistory()` (Task 7)

- [ ] **Step 1: Create `units/unit-bulk.service.ts`** — copy verbatim body of lines 1114-1195, changing the `this.recordUnitHistory(...)` call at what was line 1186 to `this.unitHistoryService.recordUnitHistory(...)`:

```ts
// apps/backend/src/modules/spaces/units/unit-bulk.service.ts
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { UnitStatus, UnitHistoryType } from '@prisma/client';
import { UnitHistoryService } from './unit-history.service';

@Injectable()
export class UnitBulkService {
  constructor(
    private prisma: PrismaService,
    private unitHistoryService: UnitHistoryService,
  ) {}

  // <-- paste verbatim body of bulkUpdateUnits (lines 1114-1195) here,
  //     with ONE change: replace `await this.recordUnitHistory(...)`
  //     with `await this.unitHistoryService.recordUnitHistory(...)` -->
}
```

- [ ] **Step 2: Delete lines 1114-1195 (`// PHASE 3: Bulk Operations` section) from `spaces.service.ts`**

- [ ] **Step 3: Register in `spaces.module.ts`**

```ts
import { UnitBulkService } from './units/unit-bulk.service';
// add UnitBulkService to providers array
```

- [ ] **Step 4: In `spaces.controller.ts`, inject `UnitBulkService` and delegate** `bulkUpdateUnits` (line 431).

- [ ] **Step 5: Verify build** — `npm run build`.

- [ ] **Step 6: Verify tests** — `npm test`.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/spaces/units/unit-bulk.service.ts apps/backend/src/modules/spaces/spaces.service.ts apps/backend/src/modules/spaces/spaces.module.ts apps/backend/src/modules/spaces/spaces.controller.ts
git commit -m "refactor: extract UnitBulkService from SpacesService"
```

---

### Task 10: Extract `FloorPlanService` (Digital Map)

**Files:**
- Create: `apps/backend/src/modules/spaces/floors/floor-plan.service.ts`
- Modify: `spaces.service.ts:1197-1355` (delete after copy)
- Modify: `spaces.module.ts` (register provider)
- Modify: `spaces.controller.ts:438-488` (inject + delegate digital map routes)

**Interfaces:**
- Produces: `getFloorMapData(floorId)`, `uploadFloorPlan(floorId, file)`, `deleteFloorPlan(floorId)`, `saveMapPositions(floorId, positions)`, `updateUnitMapPosition(unitId, pos)`, `clearUnitMapPosition(unitId)`
- Consumes: `PrismaService`, `path`, `fs`, `sharp` (self-contained — no other service dependencies)

- [ ] **Step 1: Create `floors/floor-plan.service.ts`** — copy verbatim body of lines 1201-1355 (private fields `uploadRoot`/`floorPlanDir`, `resolvePhysicalPath`, `getFloorMapData`, `uploadFloorPlan`, `deleteFloorPlan`, `saveMapPositions`, `updateUnitMapPosition`, `clearUnitMapPosition`), including its own `Logger`:

```ts
// apps/backend/src/modules/spaces/floors/floor-plan.service.ts
import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import * as path from 'path';
import * as fs from 'fs';
import * as sharp from 'sharp';

@Injectable()
export class FloorPlanService {
  private readonly logger = new Logger(FloorPlanService.name);
  constructor(private prisma: PrismaService) {}

  // <-- paste verbatim body of lines 1201-1355 from spaces.service.ts here,
  //     unchanged (uploadRoot/floorPlanDir fields, resolvePhysicalPath,
  //     getFloorMapData, uploadFloorPlan, deleteFloorPlan, saveMapPositions,
  //     updateUnitMapPosition, clearUnitMapPosition) -->
}
```

- [ ] **Step 2: Delete lines 1197-1355 (`// DIGITAL MAP` section) from `spaces.service.ts`**

- [ ] **Step 3: Register in `spaces.module.ts`**

```ts
import { FloorPlanService } from './floors/floor-plan.service';
// add FloorPlanService to providers array
```

- [ ] **Step 4: In `spaces.controller.ts`, inject `FloorPlanService` and delegate** `getFloorMapData` (440), `uploadFloorPlan` (453), `deleteFloorPlan` (460), `saveMapPositions` (470), `updateUnitMapPosition` (480), `clearUnitMapPosition` (487).

- [ ] **Step 5: Verify build** — `npm run build`.

- [ ] **Step 6: Verify tests** — `npm test`.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/spaces/floors/floor-plan.service.ts apps/backend/src/modules/spaces/spaces.service.ts apps/backend/src/modules/spaces/spaces.module.ts apps/backend/src/modules/spaces/spaces.controller.ts
git commit -m "refactor: extract FloorPlanService from SpacesService"
```

---

### Task 11: Extract `SpacesAnalyticsService`

**Files:**
- Create: `apps/backend/src/modules/spaces/analytics/spaces-analytics.service.ts`
- Modify: `spaces.service.ts` (delete after copy: lines 409-450, 452-493, 609-654, 656-730, 732-878, 880-982, 984-1029, 1035-1108 — the last remaining content in the file)
- Modify: `spaces.module.ts` (register provider)
- Modify: `spaces.controller.ts:151-217,390-418` (inject + delegate analytics/search routes)

**Interfaces:**
- Produces: `getOccupancySummary(mallId?)`, `getStaleVacantUnits(mallId?, days?)`, `compareUnits(unitIds)`, `getExpiringLeases(mallId?, days?)`, `getUnitsAdvanced(query)`, `getRentAnalytics(mallId?)`, `getOccupancyTrend(mallId?, months?)`, `getAvailabilityCalendar(mallId?, months?)`
- Consumes: `PrismaService` only (verified: `getOccupancyTrend`'s call to `this.getOccupancySummary(mallId)` stays intra-class since both land in this same service)

- [ ] **Step 1: Create `analytics/spaces-analytics.service.ts`** — copy verbatim body of the 8 methods listed above, in this order, from their respective line ranges:

```ts
// apps/backend/src/modules/spaces/analytics/spaces-analytics.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { UnitStatus, Prisma } from '@prisma/client';

@Injectable()
export class SpacesAnalyticsService {
  constructor(private prisma: PrismaService) {}

  // <-- paste verbatim body of getOccupancySummary (lines 409-450) -->

  // <-- paste verbatim body of getStaleVacantUnits (lines 456-493) -->

  // <-- paste verbatim body of compareUnits (lines 609-654) -->

  // <-- paste verbatim body of getExpiringLeases (lines 656-730) -->

  // <-- paste verbatim body of getUnitsAdvanced (lines 736-878) -->

  // <-- paste verbatim body of getRentAnalytics (lines 884-982) -->

  // <-- paste verbatim body of getOccupancyTrend (lines 988-1029) —
  //     the internal `this.getOccupancySummary(mallId)` call at former
  //     line 1015 stays as `this.getOccupancySummary(mallId)`, unchanged,
  //     since both methods now live in this same class -->

  // <-- paste verbatim body of getAvailabilityCalendar (lines 1035-1108) -->
}
```

- [ ] **Step 2: Delete the now-remaining content from `spaces.service.ts`** — at this point every method has been moved out except these 8; delete them along with their `// PHASE 1 / PHASE 2 / PHASE 3` banner comments. The file should now contain only the class shell (imports that are still used, `@Injectable()`, constructor) with **zero methods**.

- [ ] **Step 3: Register in `spaces.module.ts`**

```ts
import { SpacesAnalyticsService } from './analytics/spaces-analytics.service';
// add SpacesAnalyticsService to providers array
```

- [ ] **Step 4: In `spaces.controller.ts`, inject `SpacesAnalyticsService` and delegate**: `getOccupancy` (155), `getStaleVacantUnits` (168), `getExpiringLeases` (179), `compareUnits` (187), `searchUnits` (216 — this one calls `getUnitsAdvanced`), `getRentAnalytics` (395), `getOccupancyTrend` (406), `getAvailabilityCalendar` (417).

- [ ] **Step 5: Verify build** — `npm run build`.

- [ ] **Step 6: Verify tests** — `npm test`.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/spaces/analytics/spaces-analytics.service.ts apps/backend/src/modules/spaces/spaces.service.ts apps/backend/src/modules/spaces/spaces.module.ts apps/backend/src/modules/spaces/spaces.controller.ts
git commit -m "refactor: extract SpacesAnalyticsService from SpacesService"
```

---

### Task 12: Remove the empty `SpacesService` and do final verification

**Files:**
- Delete: `apps/backend/src/modules/spaces/spaces.service.ts`
- Modify: `apps/backend/src/modules/spaces/spaces.module.ts` (remove `SpacesService` from `providers`/`exports`)
- Modify: `apps/backend/src/modules/spaces/spaces.controller.ts` (remove now-unused `spacesService` constructor param and its import)

**Interfaces:**
- Consumes: nothing — this is cleanup only.

- [ ] **Step 1: Confirm `spaces.service.ts` has no remaining methods** (only the empty class shell after Task 11). Grep to be sure nothing still references `this.spacesService` in the controller:

Run: `grep -n "spacesService" apps/backend/src/modules/spaces/spaces.controller.ts`
Expected: no matches (or only the now-dead constructor line, which Step 2 removes).

- [ ] **Step 2: Remove the `spacesService` constructor parameter and its import from `spaces.controller.ts`**

- [ ] **Step 3: Delete `spaces.service.ts`**

```bash
git rm apps/backend/src/modules/spaces/spaces.service.ts
```

- [ ] **Step 4: In `spaces.module.ts`, remove `SpacesService` from imports, `providers`, and `exports`**

- [ ] **Step 5: Final full build verification**

Run: `cd apps/backend && npm run build`
Expected: exit 0.

- [ ] **Step 6: Final full test verification**

Run: `cd apps/backend && npm test`
Expected: all suites pass, including `spaces.merge-split.spec.ts` and `service-catalog.service.spec.ts`.

- [ ] **Step 7: Commit**

```bash
git add -A apps/backend/src/modules/spaces/
git commit -m "refactor: remove empty SpacesService, complete spaces module split"
```

- [ ] **Step 8: Note the test-coverage gap (no code change — just flag it)**

`MallsService`, `ZonesService`, `FloorsService`, `UnitsService`, `UnitHistoryService`, `UnitBulkService`, `FloorPlanService`, and `SpacesAnalyticsService` have **no existing unit tests** — only `UnitMergeService` (via `spaces.merge-split.spec.ts`) and `ServiceCatalogService` do. This refactor does not add coverage (out of scope, see Global Constraints). If a regression slips through, it will only be caught by `tsc` type-checking or manual/E2E testing, not by `npm test`. Recommend a follow-up task to add unit tests for the highest-risk pieces (`UnitsService.updateUnit` mallId handling, `UnitBulkService` transaction-safety) — flagged in the earlier code review — as separate future work.

---

## Self-Review Notes

- **Spec coverage:** all 8 route groups from `spaces.controller.ts` (Malls, Floors, Zones, Units, Unit History, Merge/Split, Bulk, Digital Map, Analytics) map to exactly one task each (Tasks 3-11); DTO/util extraction (Tasks 1-2) precede them since later services import from these; cleanup (Task 12) is last. No method from the original 1534-line file is left unaccounted for.
- **Cross-service dependencies resolved:** `UnitHistoryService → UnitsService` (Task 7), `UnitBulkService → UnitHistoryService` (Task 9). Both are declared in each task's Interfaces block and wired via constructor injection — no circular dependency (`UnitsService` and `UnitHistoryService` don't depend on anything created after them).
- **Route/behavior parity:** every task's Step 4 explicitly lists the controller line numbers being changed, ensuring no route is missed or accidentally reordered.
