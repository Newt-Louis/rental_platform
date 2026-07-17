import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('exposes title and consequence description to assistive technology', () => {
    render(
      <ConfirmDialog
        open
        title="Xóa dòng chi phí?"
        description="Tổng tiền và thuế sẽ được tính lại."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Xóa dòng chi phí?' });
    expect(dialog).toHaveAccessibleDescription('Tổng tiền và thuế sẽ được tính lại.');
  });

  it('requires an explicit confirmation and supports business-specific labels', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Xóa lead?"
        description="Lead sẽ bị xóa khỏi pipeline."
        confirmLabel="Xóa lead"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Xóa lead' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('locks actions and communicates progress while mutation is pending', () => {
    render(
      <ConfirmDialog
        open
        title="Xóa dữ liệu?"
        description="Không thể hoàn tác."
        loading
        loadingLabel="Đang xóa..."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Đang xóa...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Hủy' })).toBeDisabled();
  });
});
