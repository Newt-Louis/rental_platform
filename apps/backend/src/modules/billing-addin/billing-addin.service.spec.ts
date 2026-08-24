import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { BillingAddInService } from './billing-addin.service';

describe('BillingAddInService', () => {
  const CONTRACT = {
    id: 'contract-1',
    contractedArea: 400,
    actualArea: null,
    currencyCode: 'VND',
    unit: { mallId: 'mall-1', mall: { leaseCategory: 'OFFICE' } },
    tenant: { id: 'tenant-1', brandName: 'ABC Coffee' },
  };

  const baseEntry = (overrides: Partial<any> = {}) => ({
    id: 'entry-1',
    contractId: 'contract-1',
    chargeType: 'MANAGEMENT_FEE_SURCHARGE',
    period: '2026-08',
    periodStart: new Date('2026-08-01'),
    status: 'PENDING',
    contract: CONTRACT,
    ...overrides,
  });

  const rateConfig = { ratesJson: { normAreaPerPerson: 8, surchargePerPerson: 150000 } };

  let prisma: any;
  let service: BillingAddInService;

  beforeEach(() => {
    prisma = {
      periodicChargeEntry: {
        findFirst: jest.fn(),
        update: jest.fn((args: any) => ({ id: 'entry-1', ...args.data })),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      periodicChargeRateConfig: {
        findFirst: jest.fn().mockResolvedValue(rateConfig),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn((args: any) => ({ id: 'rate-1', ...args.data })),
        update: jest.fn((args: any) => ({ id: args.where.id, ...args.data })),
      },
      contract: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    service = new BillingAddInService(prisma);
  });

  describe('saveDraft', () => {
    it('computes lines/subtotal from the entry chargeType and rate config', async () => {
      prisma.periodicChargeEntry.findFirst.mockResolvedValue(baseEntry());
      const result = await service.saveDraft('entry-1', { headcount: 75 }, undefined, 'user-1');
      expect(result.status).toBe('DRAFT');
      expect(result.subtotal).toBe((75 - 50) * 150000); // 400/8 = 50 max headcount
      expect(result.draftedById).toBe('user-1');
    });

    it('rejects missing required input keys', async () => {
      prisma.periodicChargeEntry.findFirst.mockResolvedValue(baseEntry());
      await expect(service.saveDraft('entry-1', {}, undefined, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('blocks editing once the entry is CONFIRMED', async () => {
      prisma.periodicChargeEntry.findFirst.mockResolvedValue(baseEntry({ status: 'CONFIRMED' }));
      await expect(service.saveDraft('entry-1', { headcount: 75 }, undefined, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('blocks editing once the entry is INVOICED', async () => {
      prisma.periodicChargeEntry.findFirst.mockResolvedValue(baseEntry({ status: 'INVOICED' }));
      await expect(service.saveDraft('entry-1', { headcount: 75 }, undefined, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('throws when no active rate config exists for the mall/chargeType', async () => {
      prisma.periodicChargeEntry.findFirst.mockResolvedValue(baseEntry());
      prisma.periodicChargeRateConfig.findFirst.mockResolvedValue(null);
      await expect(service.saveDraft('entry-1', { headcount: 75 }, undefined, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('throws when the entry is not found (or outside the caller mall scope)', async () => {
      prisma.periodicChargeEntry.findFirst.mockResolvedValue(null);
      await expect(service.saveDraft('missing', { headcount: 1 }, undefined, 'user-1')).rejects.toThrow(NotFoundException);
    });

    // P0 fix: PeriodicChargeRateConfig.ratesJson is authored in VND only — applying it as-is to a
    // non-VND contract would bill the raw VND figure as if it were USD/MMK.
    it('rejects a non-VND contract instead of silently mis-billing the VND-authored rate', async () => {
      prisma.periodicChargeEntry.findFirst.mockResolvedValue(baseEntry({ contract: { ...CONTRACT, currencyCode: 'USD' } }));
      await expect(service.saveDraft('entry-1', { headcount: 75 }, undefined, 'user-1')).rejects.toThrow(BadRequestException);
      await expect(service.saveDraft('entry-1', { headcount: 75 }, undefined, 'user-1')).rejects.toThrow(/VND/);
    });

    it('still allows a VND contract through (no false-positive currency block)', async () => {
      prisma.periodicChargeEntry.findFirst.mockResolvedValue(baseEntry());
      const result = await service.saveDraft('entry-1', { headcount: 75 }, undefined, 'user-1');
      expect(result.status).toBe('DRAFT');
    });

    // Business rule: MANAGEMENT_FEE_SURCHARGE only applies to Office-category leases.
    it('rejects MANAGEMENT_FEE_SURCHARGE for a MALL-category contract (defense in depth, even if periodicChargeTypes was set incorrectly)', async () => {
      prisma.periodicChargeEntry.findFirst.mockResolvedValue(
        baseEntry({ contract: { ...CONTRACT, unit: { mallId: 'mall-1', mall: { leaseCategory: 'MALL' } } } }),
      );
      await expect(service.saveDraft('entry-1', { headcount: 75 }, undefined, 'user-1')).rejects.toThrow(/OFFICE/);
    });

    it('does not apply the OFFICE-only guard to UTILITY/AFTER_HOURS_COOLING', async () => {
      prisma.periodicChargeEntry.findFirst.mockResolvedValue(
        baseEntry({
          chargeType: 'AFTER_HOURS_COOLING',
          contract: { ...CONTRACT, unit: { mallId: 'mall-1', mall: { leaseCategory: 'MALL' } } },
        }),
      );
      prisma.periodicChargeRateConfig.findFirst.mockResolvedValue({ ratesJson: { hourlyRate: 220000 } });
      const result = await service.saveDraft('entry-1', { hours: 10 }, undefined, 'user-1');
      expect(result.status).toBe('DRAFT');
      expect(result.subtotal).toBe(10 * 220000);
    });
  });

  describe('confirm / confirmNoCharge / reopen state machine', () => {
    it('confirm only succeeds from DRAFT', async () => {
      prisma.periodicChargeEntry.findFirst.mockResolvedValue(baseEntry({ status: 'DRAFT' }));
      const result = await service.confirm('entry-1', 'user-1');
      expect(result.status).toBe('CONFIRMED');
    });

    it('confirm rejects from PENDING', async () => {
      prisma.periodicChargeEntry.findFirst.mockResolvedValue(baseEntry({ status: 'PENDING' }));
      await expect(service.confirm('entry-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('confirmNoCharge accepts PENDING or DRAFT but rejects CONFIRMED', async () => {
      prisma.periodicChargeEntry.findFirst.mockResolvedValue(baseEntry({ status: 'PENDING' }));
      const result = await service.confirmNoCharge('entry-1', 'user-1');
      expect(result.status).toBe('NO_CHARGE');
      expect(result.subtotal).toBe(0);

      prisma.periodicChargeEntry.findFirst.mockResolvedValue(baseEntry({ status: 'CONFIRMED' }));
      await expect(service.confirmNoCharge('entry-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('reopen only succeeds from CONFIRMED', async () => {
      prisma.periodicChargeEntry.findFirst.mockResolvedValue(baseEntry({ status: 'CONFIRMED' }));
      const result = await service.reopen('entry-1', 'user-1');
      expect(result.status).toBe('DRAFT');

      prisma.periodicChargeEntry.findFirst.mockResolvedValue(baseEntry({ status: 'INVOICED' }));
      await expect(service.reopen('entry-1', 'user-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('generatePendingForPeriod', () => {
    it('is idempotent — skips a contract/chargeType/period that already has an entry', async () => {
      prisma.contract.findMany.mockResolvedValue([{ id: 'contract-1', periodicChargeTypes: ['UTILITY'] }]);
      prisma.periodicChargeEntry.findUnique.mockResolvedValue({ id: 'existing' });
      const result = await service.generatePendingForPeriod('2026-08');
      expect(result.created).toBe(0);
      expect(prisma.periodicChargeEntry.create).not.toHaveBeenCalled();
    });

    it('creates one PENDING entry per contract charge type not yet generated', async () => {
      prisma.contract.findMany.mockResolvedValue([
        { id: 'contract-1', periodicChargeTypes: ['UTILITY', 'AFTER_HOURS_COOLING'] },
      ]);
      prisma.periodicChargeEntry.findUnique.mockResolvedValue(null);
      const result = await service.generatePendingForPeriod('2026-08');
      expect(result.created).toBe(2);
      expect(prisma.periodicChargeEntry.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('rate config CRUD (admin configuration surface)', () => {
    it('creates a rate config when its required keys are present and no active overlap exists', async () => {
      prisma.periodicChargeRateConfig.findFirst.mockResolvedValue(null); // no overlap
      const result = await service.createRate({
        mallId: 'mall-1', chargeType: 'AFTER_HOURS_COOLING',
        ratesJson: { hourlyRate: 220000 }, effectiveFrom: '2026-01-01',
      });
      expect(result.ratesJson).toEqual({ hourlyRate: 220000 });
      expect(prisma.periodicChargeRateConfig.create).toHaveBeenCalledTimes(1);
    });

    it('rejects ratesJson missing a required key for the chargeType', async () => {
      await expect(service.createRate({
        mallId: 'mall-1', chargeType: 'UTILITY',
        ratesJson: { electricityUnitPrice: 3500 }, effectiveFrom: '2026-01-01', // missing waterUnitPrice
      })).rejects.toThrow(BadRequestException);
      expect(prisma.periodicChargeRateConfig.create).not.toHaveBeenCalled();
    });

    it('rejects ratesJson with a key that does not belong to the chargeType', async () => {
      await expect(service.createRate({
        mallId: 'mall-1', chargeType: 'AFTER_HOURS_COOLING',
        ratesJson: { hourlyRate: 220000, surchargePerPerson: 150000 }, effectiveFrom: '2026-01-01',
      })).rejects.toThrow(BadRequestException);
    });

    it('rejects effectiveTo before effectiveFrom', async () => {
      await expect(service.createRate({
        mallId: 'mall-1', chargeType: 'AFTER_HOURS_COOLING',
        ratesJson: { hourlyRate: 220000 }, effectiveFrom: '2026-06-01', effectiveTo: '2026-01-01',
      })).rejects.toThrow(BadRequestException);
    });

    it('rejects a new rate whose effective range overlaps an existing active rate for the same mall+chargeType', async () => {
      prisma.periodicChargeRateConfig.findFirst.mockResolvedValue({ id: 'existing-rate' }); // overlap found
      await expect(service.createRate({
        mallId: 'mall-1', chargeType: 'AFTER_HOURS_COOLING',
        ratesJson: { hourlyRate: 250000 }, effectiveFrom: '2026-03-01',
      })).rejects.toThrow(ConflictException);
      expect(prisma.periodicChargeRateConfig.create).not.toHaveBeenCalled();
    });

    it('deactivates an existing rate config', async () => {
      prisma.periodicChargeRateConfig.findUnique.mockResolvedValue({ id: 'rate-1', isActive: true });
      const result = await service.deactivateRate('rate-1');
      expect(result.isActive).toBe(false);
    });

    it('throws when deactivating a nonexistent rate config', async () => {
      prisma.periodicChargeRateConfig.findUnique.mockResolvedValue(null);
      await expect(service.deactivateRate('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
