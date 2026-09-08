import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MallAccessGuard } from './mall-access.guard';

describe('MallAccessGuard architecture (CR-120)', () => {
  const user = { id: 'user-a', role: 'MALL_DIRECTOR' };

  function context(request: any): ExecutionContext {
    return {
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
      switchToHttp: () => ({ getRequest: () => request }),
    } as any;
  }

  function build(isPublic = false) {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(isPublic) } as unknown as Reflector;
    const mallAccess: any = { extractAndValidateMallAccess: jest.fn().mockResolvedValue(undefined) };
    return { guard: new MallAccessGuard(reflector, mallAccess), mallAccess };
  }

  it('bypasses an explicitly public route', async () => {
    const { guard, mallAccess } = build(true);
    await expect(guard.canActivate(context({}))).resolves.toBe(true);
    expect(mallAccess.extractAndValidateMallAccess).not.toHaveBeenCalled();
  });

  it('defers when authentication has not populated a user', async () => {
    const { guard, mallAccess } = build();
    await expect(guard.canActivate(context({ query: {}, body: {}, params: {} }))).resolves.toBe(true);
    expect(mallAccess.extractAndValidateMallAccess).not.toHaveBeenCalled();
  });

  it('passes an explicit query mallId to the enforcement service', async () => {
    const { guard, mallAccess } = build();
    await guard.canActivate(context({ user, query: { mallId: 'mall-b' }, body: {}, params: {}, path: '/reports/revenue' }));
    expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith(user.id, user.role, expect.objectContaining({ mallId: 'mall-b' }));
  });

  it('prefers query mallId over body and route Mall fields', async () => {
    const { guard, mallAccess } = build();
    await guard.canActivate(context({ user, query: { mallId: 'query' }, body: { mallId: 'body' }, params: { mallId: 'param' }, path: '/' }));
    expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith(user.id, user.role, expect.objectContaining({ mallId: 'query' }));
  });

  it('maps a named unitId from the body', async () => {
    const { guard, mallAccess } = build();
    await guard.canActivate(context({ user, query: {}, body: { unitId: 'unit-b' }, params: {}, path: '/bookings' }));
    expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith(user.id, user.role, expect.objectContaining({ unitId: 'unit-b' }));
  });

  it('maps params.id to contractId only when the path heuristic matches', async () => {
    const { guard, mallAccess } = build();
    await guard.canActivate(context({ user, query: {}, body: {}, params: { id: 'contract-b' }, path: '/contracts/contract-b' }));
    expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith(user.id, user.role, expect.objectContaining({ contractId: 'contract-b' }));
  });

  it('does not recognize a generic object id outside its path heuristics', async () => {
    const { guard, mallAccess } = build();
    await guard.canActivate(context({ user, query: {}, body: {}, params: { id: 'sales-b' }, path: '/sales/sales-b/audit' }));
    const sources = mallAccess.extractAndValidateMallAccess.mock.calls[0][2];
    expect(Object.values(sources).every((value) => value === undefined)).toBe(true);
  });

  it('documents the current unresolved-source behavior: service call resolves and guard allows', async () => {
    const { guard, mallAccess } = build();
    await expect(guard.canActivate(context({ user, query: {}, body: {}, params: {}, path: '/announcements' }))).resolves.toBe(true);
    expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalled();
  });

  it('propagates a denial and never converts it to allow', async () => {
    const { guard, mallAccess } = build();
    mallAccess.extractAndValidateMallAccess.mockRejectedValue(new Error('denied'));
    await expect(guard.canActivate(context({ user, query: { mallId: 'mall-b' }, body: {}, params: {}, path: '/' }))).rejects.toThrow('denied');
  });
});
