import { SlotsController } from './slots.controller';

describe('SlotsController mall access', () => {
  const slotsService: any = { listAllBookings: jest.fn(), createBooking: jest.fn() };
  const mallAccess: any = {
    assertMallAccess: jest.fn(), getAccessibleMallIds: jest.fn(),
    extractAndValidateMallAccess: jest.fn(),
  };
  let controller: SlotsController;

  beforeEach(() => {
    jest.clearAllMocks();
    mallAccess.getAccessibleMallIds.mockResolvedValue(['mall-1']);
    controller = new SlotsController(slotsService, mallAccess);
  });

  it('scopes the manager list to assigned malls', async () => {
    await controller.listAllBookings(undefined, undefined, 'PENDING', undefined, undefined, undefined, {
      id: 'user-1', role: 'LEASING_EXECUTIVE',
    });
    expect(slotsService.listAllBookings).toHaveBeenCalledWith({
      unitId: undefined, mallIds: ['mall-1'], status: 'PENDING', type: undefined, from: undefined, to: undefined,
    });
  });

  it('checks slot access and records the canonical user id when creating', async () => {
    await controller.createBooking('slot-1', {} as any, { id: 'user-1', sub: 'legacy-sub', role: 'LEASING_EXECUTIVE' });
    expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith(
      'user-1', 'LEASING_EXECUTIVE', { slotId: 'slot-1' },
    );
    expect(slotsService.createBooking).toHaveBeenCalledWith('slot-1', {}, 'user-1');
  });
});
