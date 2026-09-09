import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { RoleRoute } from './RoleRoute';
import { useAuthStore } from '@/store/auth.store';
import { usePermissionsStore } from '@/store/permissions.store';

describe('RoleRoute dynamic permissions', () => {
  afterEach(() => {
    cleanup();
    act(() => {
      usePermissionsStore.getState().reset();
      useAuthStore.setState({ user: null });
    });
  });

  it('repaints the current Fitout route when the live matrix revokes access', () => {
    useAuthStore.setState({ user: { role: 'OPERATION' } as any });
    usePermissionsStore.getState().setAllowedModules(['fitout']);
    render(
      <MemoryRouter initialEntries={['/fitout']}>
        <RoleRoute><div>fitout-workspace</div></RoleRoute>
      </MemoryRouter>,
    );
    expect(screen.getByText('fitout-workspace')).toBeInTheDocument();

    act(() => usePermissionsStore.getState().setAllowedModules([]));

    expect(screen.queryByText('fitout-workspace')).not.toBeInTheDocument();
  });
});
