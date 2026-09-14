import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateServiceContractDto, RenewServiceContractDto } from './service-contract.dto';

describe('Service Contract effective date DTO validation', () => {
  const createPayload = {
    contractNumber: 'SC-2026-001',
    title: 'Hợp đồng bảo trì',
    mallId: 'mall-1',
    counterpartyName: 'Đối tác',
    serviceCategory: 'MAINTENANCE',
    valueBasis: 'ANNUAL',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  };

  it('accepts create only when both effective dates are present and valid', async () => {
    await expect(validate(plainToInstance(CreateServiceContractDto, createPayload)))
      .resolves.toHaveLength(0);

    const errors = await validate(plainToInstance(CreateServiceContractDto, {
      ...createPayload,
      startDate: undefined,
      endDate: undefined,
    }));
    expect(errors.map((error) => error.property)).toEqual(expect.arrayContaining(['startDate', 'endDate']));
  });

  it('requires both dates when renewing a Service Contract', async () => {
    await expect(validate(plainToInstance(RenewServiceContractDto, {
      contractNumber: 'SC-2027-001',
      startDate: '2027-01-01',
      endDate: '2027-12-31',
    }))).resolves.toHaveLength(0);

    const errors = await validate(plainToInstance(RenewServiceContractDto, {
      contractNumber: 'SC-2027-001',
      endDate: '2027-12-31',
    }));
    expect(errors.map((error) => error.property)).toContain('startDate');
  });
});
