import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/services/redis.service';
import { PrismaParkingService } from '../prisma-parking/prisma-parking.service';

const redisMock = { isConfigured: false, ping: jest.fn().mockResolvedValue(false) };
// HealthController's 3rd dependency (PrismaParkingService) — mocked unconfigured/disabled,
// matching every test's assumption that the parking DB isn't part of what's exercised.
const parkingMock = { isConfigured: false, ping: jest.fn().mockResolvedValue(false) };

describe('HealthController', () => {
  it('returns liveness without querying the database', async () => {
    const prismaMock = { $queryRaw: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: prismaMock },
        { provide: RedisService, useValue: redisMock },
        { provide: PrismaParkingService, useValue: parkingMock },
      ],
    }).compile();

    const controller = moduleRef.get(HealthController);
    expect(controller.live().status).toBe('ok');
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it('returns readiness only when the database is reachable', async () => {
    const prismaMock = { $queryRaw: jest.fn().mockResolvedValueOnce(1) };
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: prismaMock },
        { provide: RedisService, useValue: redisMock },
        { provide: PrismaParkingService, useValue: parkingMock },
      ],
    }).compile();

    const controller = moduleRef.get(HealthController);
    await expect(controller.ready()).resolves.toMatchObject({
      status: 'ok',
      components: { database: 'up' },
    });
  });

  it('fails readiness with HTTP 503 semantics when the database is down', async () => {
    const prismaMock = { $queryRaw: jest.fn().mockRejectedValueOnce(new Error('db down')) };
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: prismaMock },
        { provide: RedisService, useValue: redisMock },
        { provide: PrismaParkingService, useValue: parkingMock },
      ],
    }).compile();

    const controller = moduleRef.get(HealthController);
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('returns status ok when DB is reachable', async () => {
    const prismaMock = {
      $queryRaw: jest.fn().mockResolvedValueOnce(1),
      emailSettings: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: prismaMock },
        { provide: RedisService, useValue: redisMock },
        { provide: PrismaParkingService, useValue: parkingMock },
      ],
    }).compile();

    const controller = moduleRef.get(HealthController);
    const res = await controller.check();

    expect(res.status).toBe('ok');
    expect(res.components.database).toBe('up');
    expect(typeof res.components.ai).toBe('string');
    expect(typeof res.components.email).toBe('string');
    expect(typeof res.components.sap).toBe('string');
  });

  it('returns status degraded when DB fails', async () => {
    const prismaMock = {
      $queryRaw: jest.fn().mockRejectedValueOnce(new Error('db down')),
      emailSettings: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: prismaMock },
        { provide: RedisService, useValue: redisMock },
        { provide: PrismaParkingService, useValue: parkingMock },
      ],
    }).compile();

    const controller = moduleRef.get(HealthController);
    const res = await controller.check();

    expect(res.status).toBe('degraded');
    expect(res.components.database).toBe('down');
  });
});
