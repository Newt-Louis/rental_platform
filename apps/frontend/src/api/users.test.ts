import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/axios';
import { usersApi } from './users';

vi.mock('@/lib/axios', () => ({ default: { get: vi.fn() } }));

/**
 * Every assignee picker in the app -- CRM, Tickets, Bookings, Patrol, Fitout --
 * maps or filters this result the moment it arrives, and they all share one
 * React Query cache key. A paginated envelope reaching any of them is not an
 * empty dropdown, it is `users.map is not a function` and a blank screen, which
 * is exactly what happened when the booking sheet wrote /users into that key.
 */
describe('usersApi.listAssignableUsers always hands back a list', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes a plain array straight through', async () => {
    const people = [{ id: 'u1', fullName: 'Chen Wei' }];
    vi.mocked(api.get).mockResolvedValue({ data: people });

    await expect(usersApi.listAssignableUsers()).resolves.toEqual(people);
  });

  it('unwraps a paginated envelope rather than handing one to a .map()', async () => {
    const people = [{ id: 'u1', fullName: 'Chen Wei' }];
    vi.mocked(api.get).mockResolvedValue({ data: { data: people, total: 19, page: 1, limit: 100 } });

    await expect(usersApi.listAssignableUsers()).resolves.toEqual(people);
  });

  it('degrades to an empty picker instead of throwing when the shape is unknown', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { unexpected: true } });

    await expect(usersApi.listAssignableUsers()).resolves.toEqual([]);
  });

  it('reads the endpoint that is open to every authenticated role', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });

    await usersApi.listAssignableUsers({ role: 'OPERATION' });

    expect(api.get).toHaveBeenCalledWith('/users/assignable', { params: { role: 'OPERATION' } });
  });
});
