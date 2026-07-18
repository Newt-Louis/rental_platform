import { BookingController } from './booking.controller';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

describe('BookingController mall access', () => {
  const bookingService: any = {
    findAll: jest.fn(), getStats: jest.fn(), findOne: jest.fn(),
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

  it('restricts the manual expiry endpoint to admins', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, BookingController.prototype.expireOverdue);
    expect(roles).toEqual(['ADMIN']);
  });
});
