import { ConflictException } from '@nestjs/common';
import { CustomerStatus } from '@prisma/client';
import { CustomersService } from './customers.service';

describe('CustomersService Lead linking', () => {
  const prisma: any = {
    lead: { findUnique: jest.fn(), update: jest.fn() },
    customer: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  };
  let service: CustomersService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CustomersService(prisma);
  });

  it('creates and links a profile without forcing an early Lead to ACTIVE', async () => {
    const lead = {
      id: 'lead-1', brandName: 'Brand A', company: 'Company A', contactName: 'Nguyen A',
      phone: '0901', email: 'a@example.com', category: 'F&B', expectedArea: 120,
      expectedRent: 500000, source: 'WEBSITE', assignedToId: 'user-1', status: 'QUALIFIED',
      isActive: true, deletedAt: null, customerId: null, customer: null,
    };
    prisma.lead.findUnique.mockResolvedValue(lead);
    prisma.customer.findFirst.mockResolvedValue(null);
    prisma.customer.create.mockResolvedValue({ id: 'customer-1' });
    prisma.lead.update.mockResolvedValue({});
    prisma.customer.findUnique.mockResolvedValue({ id: 'customer-1', leads: [] });

    await service.createProfileFromLead('lead-1', 'user-1');

    expect(prisma.customer.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        companyName: 'Company A',
        contactName: 'Nguyen A',
        status: CustomerStatus.PROSPECT,
      }),
    }));
    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: 'lead-1' },
      data: { customerId: 'customer-1' },
    });
  });

  it('links the selected Lead while creating a manually editable customer profile', async () => {
    prisma.lead.findUnique.mockResolvedValue({
      id: 'lead-1', isActive: true, deletedAt: null, customerId: null,
    });
    prisma.customer.findFirst.mockResolvedValue(null);
    prisma.customer.create.mockResolvedValue({ id: 'customer-1', leads: [{ id: 'lead-1' }] });

    await service.create({
      leadId: 'lead-1', companyName: 'Edited Company', contactName: 'Edited Contact',
    }, 'user-1');

    expect(prisma.customer.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        companyName: 'Edited Company',
        contactName: 'Edited Contact',
        leads: { connect: { id: 'lead-1' } },
      }),
    }));
  });

  it('returns the linked profile instead of creating a duplicate', async () => {
    prisma.lead.findUnique.mockResolvedValue({
      id: 'lead-1', isActive: true, deletedAt: null, customerId: 'customer-1',
      customer: { id: 'customer-1', status: CustomerStatus.PROSPECT },
    });
    prisma.customer.findUnique.mockResolvedValue({ id: 'customer-1', leads: [] });

    await service.createProfileFromLead('lead-1', 'user-1');

    expect(prisma.customer.create).not.toHaveBeenCalled();
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  it('rejects linking a Lead that belongs to another customer profile', async () => {
    prisma.customer.findUnique.mockResolvedValue({ id: 'customer-1', leads: [] });
    prisma.lead.findUnique.mockResolvedValue({
      id: 'lead-1', isActive: true, deletedAt: null, customerId: 'customer-2',
    });

    await expect(service.syncFromLead('customer-1', 'lead-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
