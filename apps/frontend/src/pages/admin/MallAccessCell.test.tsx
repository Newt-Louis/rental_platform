import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MallAccessCell } from './AdminPage';
import type { User } from '@/types';
import i18n from '@/lib/i18n';

void i18n.changeLanguage('vi');

function makeUser(overrides: Partial<User>): User {
  return {
    id: 'u1',
    email: 'user@thiso.com',
    fullName: 'Test User',
    isActive: true,
    role: 'LEASING_EXECUTIVE',
    ...overrides,
  } as User;
}

describe('MallAccessCell', () => {
  it('shows a global badge for ADMIN', () => {
    render(<MallAccessCell user={makeUser({ role: 'ADMIN' })} />);
    expect(screen.getByText('Toàn hệ thống')).toBeInTheDocument();
  });

  it('shows a dash for TENANT', () => {
    render(<MallAccessCell user={makeUser({ role: 'TENANT' })} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows an unassigned label for a mall-scoped role with no grants', () => {
    render(<MallAccessCell user={makeUser({ role: 'LEASING_EXECUTIVE', mallAccess: [] })} />);
    expect(screen.getByText('Chưa gán Mall')).toBeInTheDocument();
  });

  it('shows one badge per mall for a mall-scoped role with grants', () => {
    render(
      <MallAccessCell
        user={makeUser({
          role: 'LEASING_EXECUTIVE',
          mallAccess: [
            { mall: { id: 'mall-1', name: 'THISO Mall Sala' } },
            { mall: { id: 'mall-2', name: 'THISO Mall Vivo' } },
          ],
        })}
      />,
    );
    expect(screen.getByText('THISO Mall Sala')).toBeInTheDocument();
    expect(screen.getByText('THISO Mall Vivo')).toBeInTheDocument();
  });
});
