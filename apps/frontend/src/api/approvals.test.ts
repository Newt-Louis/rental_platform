import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/axios';
import { approvalsApi } from './approvals';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('approvalsApi pagination contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('preserves pending items and pagination metadata', async () => {
    const response = { data: { data: [{ id: 'step-1' }], total: 5, page: 1, limit: 15, totalPages: 1 } };
    vi.mocked(api.get).mockResolvedValue(response);

    await expect(approvalsApi.pending({ page: 1, limit: 15 })).resolves.toEqual(response.data);
  });

  it('preserves history items and pagination metadata', async () => {
    const response = { data: { data: [{ id: 'step-2' }], total: 1, page: 1, limit: 25, totalPages: 1 } };
    vi.mocked(api.get).mockResolvedValue(response);

    await expect(approvalsApi.history({ status: 'APPROVED' })).resolves.toEqual(response.data);
  });

  it('returns the complete workflow dossier', async () => {
    const response = { data: { id: 'workflow-1', status: 'APPROVED', steps: [{ id: 'step-1', approver: { fullName: 'Admin' } }] } };
    vi.mocked(api.get).mockResolvedValue(response);

    await expect(approvalsApi.getWorkflow('workflow-1')).resolves.toEqual(response.data);
    expect(api.get).toHaveBeenCalledWith('/approvals/workflow-1');
  });
});
