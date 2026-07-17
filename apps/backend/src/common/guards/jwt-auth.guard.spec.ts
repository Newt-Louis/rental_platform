import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RedisService } from '../services/redis.service';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  };
  const redis = {
    exists: jest.fn(),
    tokenBlacklistKey: jest.fn((token: string) => `blacklist:${token}`),
  };
  const request = { headers: {} as Record<string, string> };
  const context = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn(() => ({ getRequest: () => request })),
  } as unknown as ExecutionContext;
  let guard: JwtAuthGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    request.headers = {};
    guard = new JwtAuthGuard(
      reflector as unknown as Reflector,
      redis as unknown as RedisService,
    );
  });

  it('bypasses authentication for public routes', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(redis.exists).not.toHaveBeenCalled();
  });

  it('rejects a revoked bearer token before passport validation', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    request.headers.authorization = 'Bearer revoked-token';
    redis.exists.mockResolvedValue(true);

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Token has been revoked'),
    );
    expect(redis.tokenBlacklistKey).toHaveBeenCalledWith('revoked-token');
  });

  it('normalizes missing passport users to an unauthorized response', () => {
    expect(() => guard.handleRequest(null, null, null)).toThrow(
      new UnauthorizedException('Invalid or expired token'),
    );
  });

  it('preserves authentication errors returned by passport', () => {
    const error = new UnauthorizedException('Expired');

    expect(() => guard.handleRequest(error, null, null)).toThrow(error);
  });
});
