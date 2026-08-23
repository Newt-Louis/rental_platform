import { BookingController } from './booking.controller';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

describe('BookingController mall access', () => {
  const bookingService: any = {
    findAll: jest.fn(), findUnits: jest.fn(), getStats: jest.fn(), findOne: jest.fn(),
    expireOverdueBookings: jest.fn(),
  };
  const mallAccess: any = {
    assertMallAccess: jest.fn(), getAccessibleMallIds: jest.fn(),
    extractAndValidateMallAccess: jest.fn(),
  };
  let controller: BookingController;

  beforeEach(() => {
    jest.clearAllMocks();
    mallAccess.getAccessibleMallIds.mockResolvedValue(['mall-1', 'mall-2']);
    controller = new BookingController(bookingService, mallAccess);
  });

  it('scopes an unfiltered list to the malls assigned to the user', async () => {
    await controller.findAll({ status: 'ACTIVE' }, { id: 'user-1', role: 'LEASING_EXECUTIVE' });
    expect(bookingService.findAll).toHaveBeenCalledWith({
      status: 'ACTIVE', mallIds: ['mall-1', 'mall-2'],
    });
  });

  it('validates an explicitly requested mall', async () => {
    await controller.getStats('mall-1', { id: 'user-1', role: 'LEASING_EXECUTIVE' });
    expect(mallAccess.assertMallAccess).toHaveBeenCalledWith('user-1', 'LEASING_EXECUTIVE', 'mall-1');
    expect(bookingService.getStats).toHaveBeenCalledWith('mall-1', undefined);
  });

  it('validates resource access before returning booking details', async () => {
    await controller.findOne('booking-1', { id: 'user-1', role: 'LEASING_EXECUTIVE' });
    expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith(
      'user-1', 'LEASING_EXECUTIVE', { bookingId: 'booking-1' },
    );
    expect(bookingService.findOne).toHaveBeenCalledWith('booking-1');
  });

  it('scopes Unit Finder results to assigned Malls for normal staff', async () => {
    await controller.findUnits({ page: 1, limit: 20 }, { id: 'user-1', role: 'LEASING_EXECUTIVE' });
    expect(bookingService.findUnits).toHaveBeenCalledWith({
      page: 1, limit: 20, mallIds: ['mall-1', 'mall-2'],
    });
  });

  it('validates an explicit Unit Finder Mall before querying', async () => {
    await controller.findUnits(
      { mallId: 'mall-1', page: 1, limit: 20 },
      { id: 'admin-1', role: 'ADMIN' },
    );
    expect(mallAccess.assertMallAccess).toHaveBeenCalledWith('admin-1', 'ADMIN', 'mall-1');
    expect(bookingService.findUnits).toHaveBeenCalledWith({ mallId: 'mall-1', page: 1, limit: 20 });
  });

  it('does not query Unit Finder when Mall access is denied', async () => {
    mallAccess.assertMallAccess.mockRejectedValueOnce(new Error('denied'));
    await expect(controller.findUnits(
      { mallId: 'mall-x', page: 1, limit: 20 },
      { id: 'user-1', role: 'LEASING_EXECUTIVE' },
    )).rejects.toThrow('denied');
    expect(bookingService.findUnits).not.toHaveBeenCalled();
  });

  it('does not add a synthetic Mall restriction for an unrestricted ADMIN search', async () => {
    mallAccess.getAccessibleMallIds.mockResolvedValueOnce(null);
    await controller.findUnits({ page: 1, limit: 20 }, { id: 'admin-1', role: 'ADMIN' });
    expect(bookingService.findUnits).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it('restricts the manual expiry endpoint to admins', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, BookingController.prototype.expireOverdue);
    expect(roles).toEqual(['ADMIN']);
  });
});
