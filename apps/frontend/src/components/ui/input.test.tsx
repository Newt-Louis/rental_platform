import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Controller, useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { Input } from './input';

function NumericForm({ onSubmit }: { onSubmit: (data: { price: string }) => void }) {
  const { control, handleSubmit } = useForm<{ price: string }>({
    defaultValues: { price: '500000' },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Controller
        name="price"
        control={control}
        render={({ field }) => <Input aria-label="Giá" type="number" {...field} />}
      />
      <button type="submit">Lưu</button>
    </form>
  );
}

describe('numeric Input', () => {
  it('submits the raw numeric value after editing a formatted value', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<NumericForm onSubmit={onSubmit} />);

    const input = screen.getByRole('textbox', { name: 'Giá' });
    expect(input).toHaveValue('500,000');
    await user.clear(input);
    await user.type(input, '650000');
    await user.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(onSubmit).toHaveBeenCalledWith(
      { price: '650000' },
      expect.anything(),
    );
  });
});
