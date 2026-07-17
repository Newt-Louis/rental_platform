import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { RedisService } from '../../common/services/redis.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('AuthService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };
  const jwt = {
    sign: jest.fn(),
    decode: jest.fn(),
  };
  const redis = {
    set: jest.fn(),
    tokenBlacklistKey: jest.fn((token: string) => `blacklist:${token}`),
  };

  let service: AuthService;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      redis as unknown as RedisService,
    );
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('rejects login without revealing whether the account exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.login({ email: 'missing@example.com', password: 'secret' }),
    ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it('does not authenticate an inactive user', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'inactive@example.com',
      password: 'hash',
      isActive: false,
    });

    await expect(service.validateUser('inactive@example.com', 'secret')).resolves.toBeNull();
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it('returns a signed token without leaking the password', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      password: 'hash',
      isActive: true,
      fullName: 'User',
      role: Role.LEASING_EXECUTIVE,
      department: null,
      phone: null,
      avatar: null,
      tenantId: null,
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    jwt.sign.mockReturnValue('signed-token');

    const result = await service.login({
      email: 'user@example.com',
      password: 'secret',
    });

    expect(jwt.sign).toHaveBeenCalledWith({
      sub: 'user-1',
      email: 'user@example.com',
      role: Role.LEASING_EXECUTIVE,
    });
    expect(result.accessToken).toBe('signed-token');
    expect(result.user).not.toHaveProperty('password');
  });

  it('disables public registration in production', async () => {
    process.env.NODE_ENV = 'production';

    await expect(
      service.register({
        email: 'user@example.com',
        password: 'secret',
        fullName: 'User',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects duplicate registration', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(
      service.register({
        email: 'user@example.com',
        password: 'secret',
        fullName: 'User',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('never accepts a privileged role from public registration', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hash');
    prisma.user.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'user-1', isActive: true, ...data }),
    );

    const result = await service.register({
      email: 'user@example.com',
      password: 'secret',
      fullName: 'User',
      role: Role.ADMIN,
    });

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ role: Role.LEASING_EXECUTIVE }),
    });
    expect(result).not.toHaveProperty('password');
  });

  it('blacklists a logout token only for its remaining lifetime', async () => {
    jwt.decode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 120 });

    await service.logout('token');

    expect(redis.tokenBlacklistKey).toHaveBeenCalledWith('token');
    expect(redis.set).toHaveBeenCalledWith(
      'blacklist:token',
      '1',
      expect.any(Number),
    );
    expect(redis.set.mock.calls[0][2]).toBeGreaterThan(0);
    expect(redis.set.mock.calls[0][2]).toBeLessThanOrEqual(120);
  });
});
