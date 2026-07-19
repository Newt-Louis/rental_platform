import { BadRequestException } from '@nestjs/common';
import { TicketsService } from './tickets.service';

describe('maintenance workflow', () => {
  const prisma: any = {
    maintenanceSchedule: { findUnique: jest.fn() },
    maintenanceExecution: { create: jest.fn(), update: jest.fn() },
  };
  const service = new TicketsService(
    prisma,
    { saveFile: jest.fn() } as any,
    { create: jest.fn() } as any,
    {} as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('starts the current cycle and records the performer', async () => {
    prisma.maintenanceSchedule.findUnique.mockResolvedValue({
      id: 'schedule-1', nextDueDate: new Date('2026-07-20'), executions: [{ id: 'execution-1', startedAt: null }],
    });
    prisma.maintenanceExecution.update.mockResolvedValue({ id: 'execution-1', status: 'IN_PROGRESS' });

    await service.startMaintenance('schedule-1', 'user-1');

    expect(prisma.maintenanceExecution.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'execution-1' },
      data: expect.objectContaining({ status: 'IN_PROGRESS', performedById: 'user-1' }),
    }));
  });

  it('refuses completion without evidence', async () => {
    prisma.maintenanceSchedule.findUnique.mockResolvedValue({
      id: 'schedule-1', nextDueDate: new Date('2026-07-20'), executions: [{ id: 'execution-1' }],
    });

    await expect(service.completeMaintenance('schedule-1', 'user-1', {}, [])).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.maintenanceExecution.update).not.toHaveBeenCalled();
  });
});
