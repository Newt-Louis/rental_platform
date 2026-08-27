import { ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { TenantsService } from './tenants.service';

describe('TenantsService portal account lifecycle', () => {
  const tenantDto = {
    companyName: 'Công ty ABC',
    brandName: 'ABC',
    contactName: 'Nguyễn Văn A',
    contactEmail: ' Portal@Example.com ',
    contactPhone: '0912345678',
  };

  function setup() {
    const tx = {
      tenant: { create: jest.fn().mockResolvedValue({ id: 'tenant-1', ...tenantDto, contactEmail: 'portal@example.com', isPortalUser: true }), update: jest.fn() },
      user: { create: jest.fn(), update: jest.fn() },
    };
    const prisma: any = {
      tenant: { findUnique: jest.fn() },
      user: { findUnique: jest.fn(), update: jest.fn() },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const email: any = { sendMail: jest.fn().mockResolvedValue({ messageId: 'mail-1' }) };
    return { service: new TenantsService(prisma, email), prisma, email, tx };
  }

  it('creates the tenant and its linked TENANT user in one transaction', async () => {
    const { service, prisma, tx, email } = setup();
    prisma.tenant.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);

    const result: any = await service.create(tenantDto);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.tenant.create).toHaveBeenCalledWith({ data: expect.objectContaining({ contactEmail: 'portal@example.com', isPortalUser: true }) });
    expect(tx.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: 'portal@example.com', role: 'TENANT', tenantId: 'tenant-1', mustChangePassword: true }),
    });
    expect(email.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'portal@example.com' }));
    expect(result.portalAccount).toEqual(expect.objectContaining({ email: 'portal@example.com', emailSent: true }));
  });

  it('does not create a tenant when the portal email belongs to another account', async () => {
    const { service, prisma } = setup();
    prisma.tenant.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ id: 'staff-1', role: 'ADMIN', tenantId: null });

    await expect(service.create(tenantDto)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('sets an administrator-provided password and clears an outstanding invitation', async () => {
    const { service, prisma } = setup();
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-1', brandName: 'ABC', contactName: 'A', deletedAt: null,
      portalUsers: [{ id: 'user-1', email: 'portal@example.com' }],
    });

    await service.setPortalPassword('tenant-1', 'NewPassword123!');

    const update = prisma.user.update.mock.calls[0][0];
    expect(await bcrypt.compare('NewPassword123!', update.data.password)).toBe(true);
    expect(update.data).toEqual(expect.objectContaining({ inviteTokenHash: null, inviteExpiresAt: null, mustChangePassword: false, isActive: true }));
  });

  it('provisions a portal account for an existing tenant without a second admin workflow', async () => {
    const { service, prisma, tx, email } = setup();
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-1', brandName: 'ABC', contactName: 'A', contactEmail: 'Portal@Example.com',
      contactPhone: null, deletedAt: null, portalUsers: [],
    });
    prisma.user.findUnique.mockResolvedValue(null);

    const result = await service.createPortalAccount('tenant-1');

    expect(tx.tenant.update).toHaveBeenCalledWith({ where: { id: 'tenant-1' }, data: { isPortalUser: true, contactEmail: 'portal@example.com' } });
    expect(tx.user.create).toHaveBeenCalledWith({ data: expect.objectContaining({ email: 'portal@example.com', tenantId: 'tenant-1', role: 'TENANT' }) });
    expect(email.sendMail).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ email: 'portal@example.com', emailSent: true }));
  });
});
