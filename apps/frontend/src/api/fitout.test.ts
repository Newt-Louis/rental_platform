import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/axios';
import { fitoutChangeOrderApi } from './fitout';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

describe('Fitout Change Order API contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('leaves currency inheritance to the authoritative Contract on the backend', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'change-1', currency: 'USD' } });

    await fitoutChangeOrderApi.create({
      projectId: 'fitout-1',
      title: 'Additional storefront work',
      reason: 'Approved tenant request',
      estimatedCost: '1250.25',
      scheduleImpactDays: 2,
    });

    expect(api.post).toHaveBeenCalledWith(
      '/fitouts/fitout-1/controls/change-orders',
      {
        title: 'Additional storefront work',
        reason: 'Approved tenant request',
        proposedAmount: '1250.25',
        scheduleImpactDays: 2,
      },
    );
  });
});
