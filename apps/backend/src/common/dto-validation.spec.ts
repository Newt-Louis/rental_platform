import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateInvoiceDto } from '../modules/billing/dto/invoice.dto';
import { CreateSalesDto, DisputeSalesDto } from '../modules/sales/dto/sales.dto';
import {
  CreateDailyReportDto,
  CreateFitoutIssueDto,
  CreateGanttTaskDto,
  UpdateGanttTaskDto,
} from '../modules/fitout/dto/fitout-operations.dto';

async function errors<T extends object>(type: new () => T, payload: object) {
  return validate(plainToInstance(type, payload), {
    whitelist: true,
    forbidNonWhitelisted: false,
  });
}

describe('High-risk write DTO validation', () => {
  it('accepts a compatible invoice payload and strips unknown properties', async () => {
    const dto = plainToInstance(CreateInvoiceDto, {
      contractId: 'contract-1',
      tenantId: 'tenant-1',
      period: '2026-07',
      subtotal: '1000',
      vatRate: 10,
      dueDate: '2026-07-31',
      unexpectedAdminOverride: true,
      lines: [{
        type: 'ELECTRICITY',
        description: 'Electricity',
        qty: 2,
        unitPrice: 100,
        amount: 200,
      }],
    });

    await expect(validate(dto, { whitelist: true })).resolves.toHaveLength(0);
    expect(dto.subtotal).toBe(1000);
    expect((dto as any).unexpectedAdminOverride).toBeUndefined();
  });

  it('rejects malformed invoice amounts, period and dates', async () => {
    const result = await errors(CreateInvoiceDto, {
      contractId: 'contract-1',
      tenantId: 'tenant-1',
      period: 'July',
      subtotal: -1,
      dueDate: 'not-a-date',
    });

    expect(result.map((error) => error.property)).toEqual(
      expect.arrayContaining(['period', 'subtotal', 'dueDate']),
    );
  });

  it('rejects negative sales and empty dispute reasons', async () => {
    const salesErrors = await errors(CreateSalesDto, {
      tenantId: 'tenant-1',
      unitId: 'unit-1',
      date: '2026-07-16',
      period: '2026-07',
      grossSales: -10,
      netSales: 5,
    });
    const disputeErrors = await errors(DisputeSalesDto, { reason: '' });

    expect(salesErrors.some((error) => error.property === 'grossSales')).toBe(true);
    expect(disputeErrors.some((error) => error.property === 'reason')).toBe(true);
  });

  it('validates fitout issue coordinates and required daily report fields', async () => {
    const issueErrors = await errors(CreateFitoutIssueDto, {
      projectId: 'project-1',
      unitId: 'unit-1',
      title: 'Leak',
      positionX: 101,
    });
    const reportErrors = await errors(CreateDailyReportDto, {
      projectId: 'project-1',
      reportDate: 'invalid',
      description: '',
      workforceCount: -1,
    });

    expect(issueErrors.some((error) => error.property === 'positionX')).toBe(true);
    expect(reportErrors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['reportDate', 'description', 'workforceCount']),
    );
  });

  it('validates Gantt dates and completion percentage bounds', async () => {
    const createErrors = await errors(CreateGanttTaskDto, {
      projectId: 'project-1',
      name: 'Task',
      plannedStart: 'invalid',
      plannedEnd: '2026-08-01',
    });
    const updateErrors = await errors(UpdateGanttTaskDto, { percentComplete: 101 });

    expect(createErrors.some((error) => error.property === 'plannedStart')).toBe(true);
    expect(updateErrors.some((error) => error.property === 'percentComplete')).toBe(true);
  });
});
