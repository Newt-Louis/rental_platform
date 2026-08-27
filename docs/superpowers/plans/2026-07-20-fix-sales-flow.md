# Fix Sales Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sửa 4 lỗi trong flow Kinh doanh (Lead → Proposal → Approval → Contract → Tenant).

**Architecture:** Backend-only NestJS changes. Mỗi fix là độc lập, không thay đổi database schema. Tất cả file nằm trong `apps/backend/src/modules/`.

**Tech Stack:** NestJS, Prisma ORM, TypeScript, PostgreSQL, NestJS EventEmitter

## Global Constraints

- Không thêm migration mới — schema hiện tại đã có đủ các model cần thiết
- Giữ nguyên convention đặt tên: `camelCase` methods, `SCREAMING_SNAKE_CASE` enums
- Không thay đổi interfaces/types đã export (backward-compatible)
- Tất cả routes mới phải có `@ApiOperation` và đúng `@Roles`
- `mallId` luôn được scope qua `mallAccess` service — không bao giờ trust client

---

## File Map

| File | Loại thay đổi | Mục đích |
|------|--------------|----------|
| `apps/backend/src/modules/proposals/proposals.service.ts` | Modify | Task 1 (assign-tenant method) + Task 2 (try/catch) |
| `apps/backend/src/modules/proposals/proposals.controller.ts` | Modify | Task 1 (assign-tenant route) |
| `apps/backend/src/modules/crm/crm.service.ts` | Modify | Task 3 (customer sync on create) |
| `apps/backend/src/modules/proposals/proposal-services.service.ts` | **Create** | Task 4 (line items CRUD) |
| `apps/backend/src/modules/proposals/proposals.module.ts` | Modify | Task 4 (register new service) |

---

## Task 1: Endpoint gán Tenant sau khi Proposal được duyệt

**Vấn đề:** Khi Proposal được duyệt nhưng chưa có `tenantId`, `handleProposalFullyApproved()` trả về `{ success: false, reason: 'NO_TENANT' }` và không có cách nào để retry sau đó. Không có API nào để gán tenant vào proposal đã duyệt.

**Files:**
- Modify: `apps/backend/src/modules/proposals/proposals.service.ts`
- Modify: `apps/backend/src/modules/proposals/proposals.controller.ts`

**Interfaces:**
- Produces: `PATCH /proposals/:id/assign-tenant` — nhận `{ tenantId: string }`, trả về `{ contractId, created }`

- [ ] **Step 1: Thêm method `assignTenant` vào ProposalsService**

Mở `apps/backend/src/modules/proposals/proposals.service.ts`. Thêm method sau vào cuối class (trước dấu `}`):

```typescript
async assignTenant(id: string, tenantId: string, userId: string) {
  const proposal = await this.findOne(id);
  if (proposal.status !== ProposalStatus.APPROVED) {
    throw new BadRequestException(
      'Chỉ có thể gán tenant vào proposal đã được phê duyệt (APPROVED)',
    );
  }
  if (proposal.tenantId) {
    throw new BadRequestException(
      `Proposal này đã có tenant (${proposal.tenantId}). Không thể gán lại.`,
    );
  }

  const tenant = await this.prisma.tenant.findFirst({
    where: { id: tenantId, isActive: true, deletedAt: null },
    select: { id: true, brandName: true },
  });
  if (!tenant) throw new NotFoundException('Tenant không tồn tại hoặc đã bị xóa');

  await this.prisma.proposal.update({
    where: { id },
    data: { tenantId },
  });

  return this.handleProposalFullyApproved(id, userId);
}
```

- [ ] **Step 2: Thêm route `PATCH /:id/assign-tenant` vào ProposalsController**

Mở `apps/backend/src/modules/proposals/proposals.controller.ts`. Thêm import `Role` nếu chưa có (đã có). Thêm method sau vào cuối class (trước dấu `}`):

```typescript
@Patch(':id/assign-tenant')
@Roles(...PROPOSAL_CONVERT_ROLES)
@ApiOperation({ summary: 'Assign tenant to an APPROVED proposal and auto-create contract' })
async assignTenant(
  @Param('id') id: string,
  @Body('tenantId') tenantId: string,
  @CurrentUser() user: any,
) {
  await this.validateProposal(user, id);
  if (!tenantId) throw new BadRequestException('tenantId là bắt buộc');
  return this.proposalsService.assignTenant(id, tenantId, user.id);
}
```

Đảm bảo `BadRequestException` đã được import ở đầu file. Hiện tại controller chưa import nó — thêm vào:

```typescript
import {
  Controller, Get, Post, Put, Patch, Delete, Param, Body, Query, UseGuards, Res, HttpCode, HttpStatus,
  BadRequestException,
} from '@nestjs/common';
```

- [ ] **Step 3: Kiểm tra thủ công logic**

Mở file `proposals.service.ts` và đọc lại `handleProposalFullyApproved()` (line 483–532). Xác nhận:
- Khi `tenantId` đã có sau khi gán (step 1 trên), nhánh `if (!proposal.tenantId)` sẽ không chạy
- `handleProposalFullyApproved` sẽ gọi `createContractFromProposal()` → billing schedule → notification

- [ ] **Step 4: Chạy type-check**

```bash
cd apps/backend && npx tsc --noEmit
```
Expected: no errors liên quan đến proposals module.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/proposals/proposals.service.ts apps/backend/src/modules/proposals/proposals.controller.ts
git commit -m "feat(proposals): add PATCH assign-tenant endpoint to unblock approved proposals without tenant"
```

---

## Task 2: Error handling cho @OnEvent handlers

**Vấn đề:** Ba `@OnEvent` handlers trong `ProposalsService` không có try/catch. Nếu DB lỗi trong `onApprovalWorkflowCompleted` (ví dụ khi tạo contract), exception sẽ bị nuốt bởi EventEmitter mà không để lại dấu vết — proposal có thể mắc kẹt ở trạng thái APPROVED mà không có contract.

**Files:**
- Modify: `apps/backend/src/modules/proposals/proposals.service.ts`

**Interfaces:**
- Không thay đổi public API

- [ ] **Step 1: Wrap `onApprovalWorkflowCompleted` trong try/catch**

Tìm đến method `onApprovalWorkflowCompleted` (line 441 hiện tại). Thay toàn bộ method bằng:

```typescript
@OnEvent('approval.workflow.completed')
async onApprovalWorkflowCompleted(payload: ApprovalWorkflowCompletedEvent) {
  if (payload.entityType !== 'PROPOSAL') return;
  const proposalId = payload.entityId;

  try {
    await this.prisma.proposal.update({
      where: { id: proposalId },
      data: { status: ProposalStatus.APPROVED },
    });

    await this.handleProposalFullyApproved(proposalId, payload.decidedByUserId);

    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      select: { proposalNumber: true, createdById: true },
    });
    if (proposal?.createdById) {
      await this.notifications.create({
        userId: proposal.createdById,
        title: `Proposal ${proposal.proposalNumber} đã được phê duyệt`,
        body: 'Deal đã hoàn tất quy trình phê duyệt.',
        type: 'PROPOSAL_APPROVED',
        entityType: 'PROPOSAL',
        entityId: proposalId,
      });
    }
  } catch (e) {
    this.logger.error(
      `[onApprovalWorkflowCompleted] Failed processing proposalId=${proposalId}: ${e.message}`,
      e.stack,
    );
  }
}
```

- [ ] **Step 2: Wrap `onApprovalWorkflowStepAdvanced` trong try/catch**

Tìm method `onApprovalWorkflowStepAdvanced` (line 468). Thay bằng:

```typescript
@OnEvent('approval.workflow.step-advanced')
async onApprovalWorkflowStepAdvanced(payload: ApprovalWorkflowStepAdvancedEvent) {
  if (payload.entityType !== 'PROPOSAL') return;
  try {
    await this.notifyPendingApprovers(payload.workflowId, payload.nextStepOrder);
  } catch (e) {
    this.logger.error(
      `[onApprovalWorkflowStepAdvanced] Failed notifying approvers for workflowId=${payload.workflowId}: ${e.message}`,
      e.stack,
    );
  }
}
```

- [ ] **Step 3: Wrap `onApprovalWorkflowRejected` trong try/catch**

Tìm method `onApprovalWorkflowRejected` (line 474). Thay bằng:

```typescript
@OnEvent('approval.workflow.rejected')
async onApprovalWorkflowRejected(payload: ApprovalWorkflowRejectedEvent) {
  if (payload.entityType !== 'PROPOSAL') return;
  try {
    await this.prisma.proposal.update({
      where: { id: payload.entityId },
      data: { status: ProposalStatus.REJECTED },
    });
  } catch (e) {
    this.logger.error(
      `[onApprovalWorkflowRejected] Failed updating proposalId=${payload.entityId}: ${e.message}`,
      e.stack,
    );
  }
}
```

- [ ] **Step 4: Chạy type-check**

```bash
cd apps/backend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/proposals/proposals.service.ts
git commit -m "fix(proposals): add try/catch to @OnEvent handlers to prevent silent failures"
```

---

## Task 3: Đồng bộ Customer.status khi tạo Lead có sẵn customerId

**Vấn đề:** `CrmService.create()` không sync `Customer.status` khi lead được tạo với `customerId` và `status` khác `NEW`. Ví dụ: lead tạo thẳng với `status: PROPOSAL` nhưng customer vẫn ở `PROSPECT`.

**Files:**
- Modify: `apps/backend/src/modules/crm/crm.service.ts`

**Interfaces:**
- `create(dto)` — không thay đổi signature, chỉ thêm side-effect

- [ ] **Step 1: Sửa `create()` để sync customer status**

Tìm method `create()` trong `crm.service.ts` (line 233). Thay bằng:

```typescript
async create(dto: CreateLeadDto & { customerId?: string }) {
  const lead = await this.prisma.lead.create({
    data: dto,
    include: {
      assignedTo: { select: { id: true, fullName: true } },
      customer: { select: { id: true, customerCode: true, status: true } },
    },
  });

  // Sync customer status nếu lead tạo với status cao hơn PROSPECT và có customerId
  if (lead.customerId && lead.status && lead.status !== 'NEW' && lead.status !== 'CONTACTED') {
    const targetCustomerStatus = this.LEAD_TO_CUSTOMER[lead.status];
    const currentStatus = (lead.customer as any)?.status ?? 'PROSPECT';
    const shouldAdvance =
      targetCustomerStatus &&
      this.CUSTOMER_RANK[targetCustomerStatus] > this.CUSTOMER_RANK[currentStatus];

    if (shouldAdvance) {
      await this.prisma.customer.update({
        where: { id: lead.customerId },
        data: { status: targetCustomerStatus as any },
      });
    }
  }

  return lead;
}
```

- [ ] **Step 2: Chạy type-check**

```bash
cd apps/backend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/crm/crm.service.ts
git commit -m "fix(crm): sync customer status when creating lead with non-default status and existing customerId"
```

---

## Task 4: CRUD cho ProposalService line items

**Vấn đề:** Schema có model `ProposalService` (line items liên kết `Proposal` ↔ `ServicePriceCatalog`) nhưng không có service class hay routes nào để quản lý chúng. Không thể thêm/sửa/xóa dịch vụ bổ sung trong proposal qua API.

**Schema của ProposalService:**
```
id, proposalId, serviceCatalogId?, serviceCode, name, quantity (default 1),
unit, unitPrice, totalPrice, currency (default VND), notes?
```

**Files:**
- Create: `apps/backend/src/modules/proposals/proposal-services.service.ts`
- Modify: `apps/backend/src/modules/proposals/proposals.controller.ts`
- Modify: `apps/backend/src/modules/proposals/proposals.module.ts`

**Interfaces:**
- Produces:
  - `GET /proposals/:id/services` → `ProposalService[]`
  - `POST /proposals/:id/services` → `ProposalService`
  - `PATCH /proposals/:id/services/:serviceId` → `ProposalService`
  - `DELETE /proposals/:id/services/:serviceId` → `{ deleted: true }`

- [ ] **Step 1: Tạo `proposal-services.service.ts`**

Tạo file mới `apps/backend/src/modules/proposals/proposal-services.service.ts`:

```typescript
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProposalStatus } from '@prisma/client';

export interface CreateProposalServiceDto {
  serviceCatalogId?: string;
  serviceCode: string;
  name: string;
  quantity?: number;
  unit: string;
  unitPrice: number;
  currency?: string;
  notes?: string;
}

export interface UpdateProposalServiceDto {
  quantity?: number;
  unitPrice?: number;
  notes?: string;
}

@Injectable()
export class ProposalServicesService {
  constructor(private prisma: PrismaService) {}

  private async assertEditable(proposalId: string) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      select: { status: true },
    });
    if (!proposal) throw new NotFoundException('Proposal not found');
    if (proposal.status !== ProposalStatus.DRAFT) {
      throw new BadRequestException('Chỉ có thể sửa dịch vụ của proposal ở trạng thái DRAFT');
    }
  }

  async list(proposalId: string) {
    return this.prisma.proposalService.findMany({
      where: { proposalId },
      include: {
        serviceCatalog: { select: { id: true, serviceCode: true, serviceName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(proposalId: string, dto: CreateProposalServiceDto) {
    await this.assertEditable(proposalId);

    const quantity = dto.quantity ?? 1;
    const totalPrice = quantity * dto.unitPrice;

    return this.prisma.proposalService.create({
      data: {
        proposalId,
        serviceCatalogId: dto.serviceCatalogId ?? null,
        serviceCode: dto.serviceCode,
        name: dto.name,
        quantity,
        unit: dto.unit,
        unitPrice: dto.unitPrice,
        totalPrice,
        currency: dto.currency ?? 'VND',
        notes: dto.notes,
      },
    });
  }

  async update(proposalId: string, serviceId: string, dto: UpdateProposalServiceDto) {
    await this.assertEditable(proposalId);

    const existing = await this.prisma.proposalService.findFirst({
      where: { id: serviceId, proposalId },
    });
    if (!existing) throw new NotFoundException('Dịch vụ không tồn tại trong proposal này');

    const quantity = dto.quantity ?? existing.quantity;
    const unitPrice = dto.unitPrice ?? existing.unitPrice;
    const totalPrice = quantity * unitPrice;

    return this.prisma.proposalService.update({
      where: { id: serviceId },
      data: { quantity, unitPrice, totalPrice, notes: dto.notes },
    });
  }

  async remove(proposalId: string, serviceId: string) {
    await this.assertEditable(proposalId);

    const existing = await this.prisma.proposalService.findFirst({
      where: { id: serviceId, proposalId },
    });
    if (!existing) throw new NotFoundException('Dịch vụ không tồn tại trong proposal này');

    await this.prisma.proposalService.delete({ where: { id: serviceId } });
    return { deleted: true };
  }
}
```

- [ ] **Step 2: Đăng ký `ProposalServicesService` vào `proposals.module.ts`**

Mở `apps/backend/src/modules/proposals/proposals.module.ts`. Thêm import và provider:

```typescript
import { Module } from '@nestjs/common';
import { ProposalsController } from './proposals.controller';
import { ProposalsService } from './proposals.service';
import { ProposalPdfService } from './proposal-pdf.service';
import { DealScoringService } from './deal-scoring.service';
import { DealScoringController } from './deal-scoring.controller';
import { ProposalScenarioService } from './proposal-scenario.service';
import { ProposalServicesService } from './proposal-services.service';
import { CrmModule } from '../crm/crm.module';
import { BillingModule } from '../billing/billing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [CrmModule, BillingModule, NotificationsModule, CategoriesModule],
  controllers: [ProposalsController, DealScoringController],
  providers: [ProposalsService, ProposalPdfService, DealScoringService, ProposalScenarioService, ProposalServicesService],
  exports: [ProposalsService, DealScoringService, ProposalScenarioService],
})
export class ProposalsModule {}
```

- [ ] **Step 3: Inject `ProposalServicesService` vào `ProposalsController` và thêm 4 routes**

Mở `apps/backend/src/modules/proposals/proposals.controller.ts`.

Thêm import ở đầu file:
```typescript
import { ProposalServicesService } from './proposal-services.service';
```

Sửa constructor của controller — thêm `proposalServicesService`:
```typescript
constructor(
  private readonly proposalsService: ProposalsService,
  private readonly pdfService: ProposalPdfService,
  private readonly scenarioService: ProposalScenarioService,
  private readonly proposalServicesService: ProposalServicesService,
  private readonly mallAccess: MallAccessService,
) {}
```

Thêm 4 routes sau vào cuối class (trước dấu `}`), ngay sau phần Scenarios:

```typescript
// ── Services (Line Items) ──────────────────────────────────────────────────
@Get(':id/services')
@ApiOperation({ summary: 'List additional services in a proposal' })
async listServices(@Param('id') id: string, @CurrentUser() user: any) {
  await this.validateProposal(user, id);
  return this.proposalServicesService.list(id);
}

@Post(':id/services')
@Roles(...PROPOSAL_EDIT_ROLES)
@ApiOperation({ summary: 'Add a service line item to a DRAFT proposal' })
async createService(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: any) {
  await this.validateProposal(user, id);
  return this.proposalServicesService.create(id, dto);
}

@Patch(':id/services/:serviceId')
@Roles(...PROPOSAL_EDIT_ROLES)
@ApiOperation({ summary: 'Update a service line item (quantity, unitPrice, notes)' })
async updateService(
  @Param('id') id: string,
  @Param('serviceId') serviceId: string,
  @Body() dto: any,
  @CurrentUser() user: any,
) {
  await this.validateProposal(user, id);
  return this.proposalServicesService.update(id, serviceId, dto);
}

@Delete(':id/services/:serviceId')
@Roles(...PROPOSAL_EDIT_ROLES)
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Remove a service line item from a DRAFT proposal' })
async removeService(
  @Param('id') id: string,
  @Param('serviceId') serviceId: string,
  @CurrentUser() user: any,
) {
  await this.validateProposal(user, id);
  return this.proposalServicesService.remove(id, serviceId);
}
```

- [ ] **Step 4: Chạy type-check**

```bash
cd apps/backend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/proposals/proposal-services.service.ts apps/backend/src/modules/proposals/proposals.controller.ts apps/backend/src/modules/proposals/proposals.module.ts
git commit -m "feat(proposals): add CRUD routes for ProposalService line items"
```

---

## Self-Review

**Spec coverage:**
- ✅ Issue 1 (assign-tenant): Task 1 thêm method + route
- ✅ Issue 2 (billing schedule manual): `contracts.service.ts updateStatus(ACTIVE)` đã gọi `buildScheduleForContract()` (upsert idempotent) — không cần fix thêm
- ✅ Issue 3 (event handler errors): Task 2 thêm try/catch vào 3 handlers
- ✅ Issue 4 (proposal line items): Task 4 tạo service + routes
- ✅ Issue 5 (customer sync): Task 3 thêm sync vào `create()`

**Placeholder scan:** Không có TBD/TODO trong code steps.

**Type consistency:** 
- `ProposalStatus.APPROVED`, `ProposalStatus.DRAFT` — dùng nhất quán từ Prisma client
- `PROPOSAL_EDIT_ROLES`, `PROPOSAL_CONVERT_ROLES` — dùng constants đã có trong controller
- `proposalServicesService` — tên inject nhất quán với `ProposalServicesService`
