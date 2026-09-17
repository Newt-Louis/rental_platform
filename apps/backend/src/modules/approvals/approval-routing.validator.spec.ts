/**
 * Proposal governance — approval routing pre-flight (PROP-ROUTE).
 */
import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { assertApprovalRoutable, findRoutingIssues, routingErrorCode, RoutingApprover } from './approval-routing.validator';
import { ApprovalsService } from './approvals.service';

const ELIGIBLE = ApprovalsService.ELIGIBLE_APPROVER_ROLES;
const approver = (id: string, over: Partial<RoutingApprover> = {}): RoutingApprover =>
  ({ id, role: Role.LEASING_MANAGER, isActive: true, deletedAt: null, hasMallAccess: true, ...over });
const step = (order: number, approverId: string | null, role: Role = Role.LEASING_MANAGER) =>
  ({ stepOrder: order, stepName: `Bước ${order}`, approverRole: role, approverId });
const issues = (steps: any[], approvers: RoutingApprover[], creatorId = 'author') =>
  findRoutingIssues(steps, { creatorId, approvers: new Map(approvers.map((a) => [a.id, a])), eligibleRoles: ELIGIBLE });

describe('Approval routing pre-flight', () => {
  it('PROP-ROUTE-001 a fully configured route has no issues', () => {
    expect(issues([step(1, 'm1'), step(2, 'f1', Role.FINANCE)], [approver('m1'), approver('f1', { role: Role.FINANCE })])).toEqual([]);
  });

  it('PROP-ROUTE-002 the preparer configured as an approver is a self conflict', () => {
    const found = issues([step(1, 'm1'), step(2, 'author')], [approver('m1'), approver('author')]);
    expect(found).toEqual([{ stepOrder: 2, stepName: 'Bước 2', reason: 'SELF_APPROVAL' }]);
    expect(routingErrorCode(found)).toBe('APPROVAL_ROUTING_SELF_CONFLICT');
  });

  it('PROP-ROUTE-004 a step without an approver is unassigned, and that is reported first', () => {
    const found = issues([step(1, 'author'), step(2, null)], [approver('author')]);
    expect(found.map((i) => i.reason)).toEqual(['SELF_APPROVAL', 'STEP_UNASSIGNED']);
    expect(routingErrorCode(found)).toBe('APPROVAL_STEP_UNASSIGNED');
  });

  it('PROP-ROUTE-006 a missing, deleted or locked approver is rejected', () => {
    expect(issues([step(1, 'ghost')], []).map((i) => i.reason)).toEqual(['APPROVER_NOT_FOUND']);
    expect(issues([step(1, 'm1')], [approver('m1', { deletedAt: new Date() })]).map((i) => i.reason)).toEqual(['APPROVER_NOT_FOUND']);
    expect(issues([step(1, 'm1')], [approver('m1', { isActive: false })]).map((i) => i.reason)).toEqual(['APPROVER_INACTIVE']);
    expect(routingErrorCode(issues([step(1, 'm1')], [approver('m1', { isActive: false })]))).toBe('APPROVAL_ROUTING_INVALID');
  });

  it('PROP-ROUTE-006 an approver whose role changed since the rule was written, or is no longer eligible, is rejected', () => {
    expect(issues([step(1, 'm1')], [approver('m1', { role: Role.MALL_DIRECTOR })]).map((i) => i.reason)).toEqual(['APPROVER_ROLE_CHANGED']);
    expect(issues([step(1, 'm1', Role.TENANT)], [approver('m1', { role: Role.TENANT })]).map((i) => i.reason)).toEqual(['APPROVER_ROLE_NOT_ELIGIBLE']);
  });

  it('PROP-ROUTE-007 an approver without access to the Proposal Mall is rejected (ADMIN excepted, as in rule configuration)', () => {
    expect(issues([step(1, 'm1')], [approver('m1', { hasMallAccess: false })]).map((i) => i.reason)).toEqual(['APPROVER_NO_MALL_ACCESS']);
    expect(issues([step(1, 'a1', Role.ADMIN)], [approver('a1', { role: Role.ADMIN, hasMallAccess: false })])).toEqual([]);
  });

  it('no matched step at all is invalid routing, not an empty workflow', () => {
    expect(routingErrorCode(issues([], []))).toBe('APPROVAL_ROUTING_INVALID');
  });

  it('PROP-ROUTE-010 assertApprovalRoutable throws a structured, identity-free error', async () => {
    const tx: any = { user: { findMany: jest.fn().mockResolvedValue([{ id: 'author', role: Role.LEASING_MANAGER, isActive: true, deletedAt: null, mallAccess: [{ id: 'x' }] }]) } };
    const err = await assertApprovalRoutable(tx, [step(1, 'author')], { creatorId: 'author', mallId: 'mall-1', eligibleRoles: ELIGIBLE }).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    const body = err.getResponse();
    expect(body).toEqual({
      code: 'APPROVAL_ROUTING_SELF_CONFLICT',
      message: expect.stringContaining('phân công người lập Proposal làm người duyệt'),
      errors: [{ stepOrder: 1, stepName: 'Bước 1', reason: 'SELF_APPROVAL' }],
    });
    expect(JSON.stringify(body)).not.toContain('author');
    expect(tx.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ mallAccess: { where: { mallId: 'mall-1', isActive: true }, select: { id: true }, take: 1 } }),
    }));
  });

  it('PROP-ROUTE-008/009 the validator chooses no fallback approver and infers no hierarchy', () => {
    const source = fs.readFileSync(path.join(__dirname, 'approval-routing.validator.ts'), 'utf8');
    expect(source).not.toMatch(/CEO|MALL_DIRECTOR|LEASING_MANAGER|approvalLevel|escalat/);
    // Issues never rewrite a step; they only describe it.
    const steps = [step(1, null)];
    issues(steps, []);
    expect(steps[0].approverId).toBeNull();
  });
});
