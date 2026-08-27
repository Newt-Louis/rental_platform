import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog, DialogContent, DialogTitle } from './dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

describe('Select inside a dialog', () => {
  it('renders above the dialog overlay and allows choosing an item', () => {
    const onChange = vi.fn();
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Tạo yêu cầu</DialogTitle>
          <Select onValueChange={onChange}>
            <SelectTrigger aria-label="Khách thuê"><SelectValue placeholder="Chọn khách thuê" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tenant-1">Khách thuê A</SelectItem>
              <SelectItem value="tenant-2">Khách thuê B</SelectItem>
            </SelectContent>
          </Select>
        </DialogContent>
      </Dialog>,
    );

    fireEvent.click(screen.getByLabelText('Khách thuê'));
    const option = screen.getByText('Khách thuê B');
    expect(option.closest('[data-radix-select-viewport]')?.parentElement).toHaveClass('z-[200]');
    fireEvent.click(option);
    expect(onChange).toHaveBeenCalledWith('tenant-2');
  });
});
