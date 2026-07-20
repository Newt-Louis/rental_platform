import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  };
  const context = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn(),
  } as unknown as ExecutionContext;
  let guard: RolesGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  function withUser(user?: { role: Role }) {
    (context.switchToHttp as jest.Mock).mockReturnValue({
      getRequest: () => ({ user }),
    });
  }

  it('allows public routes', () => {
    reflector.getAllAndOverride.mockReturnValueOnce(true);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows an authenticated user with a required role', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce([Role.ADMIN]);
    withUser({ role: Role.ADMIN });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('always allows Super Admin even when endpoint metadata omits ADMIN', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce([Role.TENANT]);
    withUser({ role: Role.ADMIN });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies a user without a required role', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce([Role.ADMIN]);
    withUser({ role: Role.TENANT });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('denies requests with role metadata but no authenticated user', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce([Role.ADMIN]);
    withUser();

    expect(() => guard.canActivate(context)).toThrow('Access denied');
  });
});
