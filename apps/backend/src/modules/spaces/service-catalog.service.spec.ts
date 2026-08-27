import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { ServiceCatalogService } from './service-catalog.service';
import { PrismaService } from '../../prisma/prisma.service';

const makeCatalogItem = (overrides: any = {}) => ({
  id: 'svc-1',
  mallId: 'mall-1',
  serviceCode: 'LED_SCREEN',
  name: 'LED Screen',
  unit: 'tháng',
  defaultPrice: 5000000,
  currency: 'VND',
  description: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('ServiceCatalogService', () => {
  let service: ServiceCatalogService;

  const prisma = {
    servicePriceCatalog: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    proposalService: {
      findMany: jest.fn(),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
    proposal: { findUnique: jest.fn() },
    $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
  } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceCatalogService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(ServiceCatalogService);
  });

  // ─── getCatalog ───────────────────────────────────────────────────────────

  describe('getCatalog', () => {
    it('returns catalog items for a mall', async () => {
      prisma.servicePriceCatalog.findMany.mockResolvedValue([makeCatalogItem()]);

      const result = await service.getCatalog('mall-1');
      expect(result).toHaveLength(1);
      expect(prisma.servicePriceCatalog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ mallId: 'mall-1' }) }),
      );
    });

    it('filters inactive items when onlyActive=true', async () => {
      prisma.servicePriceCatalog.findMany.mockResolvedValue([]);

      await service.getCatalog('mall-1', true);
      expect(prisma.servicePriceCatalog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        }),
      );
    });
  });

  // ─── createCatalogItem ────────────────────────────────────────────────────

  describe('createCatalogItem', () => {
    it('creates a catalog item', async () => {
      prisma.servicePriceCatalog.findFirst.mockResolvedValue(null);
      prisma.servicePriceCatalog.create.mockResolvedValue(makeCatalogItem());

      const result = await service.createCatalogItem('mall-1', {
        serviceCode: 'LED_SCREEN',
        name: 'LED Screen',
        unit: 'tháng',
        defaultPrice: 5000000,
        currency: 'VND',
      });

      expect(result.serviceCode).toBe('LED_SCREEN');
    });

    it('throws ConflictException if serviceCode already exists in mall', async () => {
      prisma.servicePriceCatalog.findFirst.mockResolvedValue(makeCatalogItem());

      await expect(
        service.createCatalogItem('mall-1', {
          serviceCode: 'LED_SCREEN',
          name: 'Duplicate',
          unit: 'tháng',
          defaultPrice: 1000,
          currency: 'VND',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── updateCatalogItem ────────────────────────────────────────────────────

  describe('updateCatalogItem', () => {
    it('updates price of catalog item', async () => {
      prisma.servicePriceCatalog.findUnique.mockResolvedValue(makeCatalogItem());
      prisma.servicePriceCatalog.update.mockResolvedValue(makeCatalogItem({ defaultPrice: 6000000 }));

      const result = await service.updateCatalogItem('svc-1', { defaultPrice: 6000000 });
      expect(result.defaultPrice).toBe(6000000);
    });

    it('throws NotFoundException for nonexistent item', async () => {
      prisma.servicePriceCatalog.findUnique.mockResolvedValue(null);

      await expect(service.updateCatalogItem('nonexistent', { defaultPrice: 1 })).rejects.toThrow(NotFoundException);
    });
  });

  // ─── syncProposalServices ─────────────────────────────────────────────────

  describe('syncProposalServices', () => {
    it('replaces proposal services (delete + create)', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ id: 'prop-1', isActive: true });
      prisma.proposalService.deleteMany.mockResolvedValue({ count: 2 });
      prisma.proposalService.createMany.mockResolvedValue({ count: 1 });
      prisma.proposalService.findMany.mockResolvedValue([
        { id: 's1', serviceCode: 'LED_SCREEN', name: 'LED Screen', quantity: 1, unitPrice: 5000000, totalPrice: 5000000, currency: 'VND' },
      ]);

      const services = [
        { serviceCode: 'LED_SCREEN', name: 'LED Screen', quantity: 1, unit: 'tháng', unitPrice: 5000000, totalPrice: 5000000, currency: 'VND' },
      ];

      await service.syncProposalServices('prop-1', services);

      expect(prisma.proposalService.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { proposalId: 'prop-1' } }),
      );
      expect(prisma.proposalService.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ proposalId: 'prop-1', serviceCode: 'LED_SCREEN' }),
          ]),
        }),
      );
    });

    it('throws NotFoundException if proposal does not exist', async () => {
      prisma.proposal.findUnique.mockResolvedValue(null);

      await expect(service.syncProposalServices('nonexistent', [])).rejects.toThrow(NotFoundException);
    });

    it('validates that totalPrice matches quantity × unitPrice', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ id: 'prop-1', isActive: true });

      const services = [
        { serviceCode: 'LED', name: 'LED', quantity: 2, unit: 'tháng', unitPrice: 1000, totalPrice: 9999, currency: 'VND' },
      ];

      await expect(service.syncProposalServices('prop-1', services)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── getProposalServices ──────────────────────────────────────────────────

  describe('getProposalServices', () => {
    it('returns all services for a proposal with total', async () => {
      prisma.proposalService.findMany.mockResolvedValue([
        { id: 's1', serviceCode: 'LED', name: 'LED', quantity: 1, unitPrice: 5000000, totalPrice: 5000000, currency: 'VND' },
        { id: 's2', serviceCode: 'MKT', name: 'MKT', quantity: 1, unitPrice: 2000000, totalPrice: 2000000, currency: 'VND' },
      ]);

      const result = await service.getProposalServices('prop-1');
      expect(result.services).toHaveLength(2);
      expect(result.totalVND).toBe(7000000);
    });
  });
});
