import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AsyncState } from './async-state';

describe('AsyncState', () => {
  it('announces loading and hides content', () => {
    render(<AsyncState isLoading><div>Nội dung</div></AsyncState>);
    expect(screen.getByRole('status', { name: 'Đang tải dữ liệu' })).toBeInTheDocument();
    expect(screen.queryByText('Nội dung')).not.toBeInTheDocument();
  });

  it('shows an actionable error and retries', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(<AsyncState isLoading={false} isError onRetry={retry}><div>Nội dung</div></AsyncState>);
    expect(screen.getByRole('alert')).toHaveTextContent('Không thể tải dữ liệu');
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('distinguishes empty data from an error', () => {
    render(
      <AsyncState isLoading={false} isEmpty emptyTitle="Chưa có giao dịch">
        <div>Nội dung</div>
      </AsyncState>,
    );
    expect(screen.getByText('Chưa có giao dịch')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
