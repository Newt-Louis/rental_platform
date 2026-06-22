import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

describe('HealthController', () => {
  it('returns status ok when DB is reachable', async () => {
    const prismaMock = {
      $queryRaw: jest.fn().mockResolvedValueOnce(1),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prismaMock }],
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
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prismaMock }],
    }).compile();

    const controller = moduleRef.get(HealthController);
    const res = await controller.check();

    expect(res.status).toBe('degraded');
    expect(res.components.database).toBe('down');
  });
});

