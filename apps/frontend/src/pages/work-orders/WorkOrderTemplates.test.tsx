import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import WorkOrderTemplates from './WorkOrderTemplates';

vi.mock('@/api', () => ({
  workOrdersApi: {
    templates: vi.fn().mockResolvedValue([]),
    createTemplate: vi.fn(),
    runTemplate: vi.fn(),
    toggleTemplate: vi.fn(),
  },
}));

describe('WorkOrderTemplates localization', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  afterAll(async () => {
    await i18n.changeLanguage('vi');
  });

  it('uses the active locale for the recurring-template workspace', async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <WorkOrderTemplates mallId="mall-1" mallName="THISO Mall Sala" users={[]} />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Work order templates and recurring schedules')).toBeInTheDocument();
    expect(screen.queryByText('Mẫu công việc và lịch định kỳ')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create template' }));

    expect(screen.getByRole('heading', { name: 'Create recurring work order template' })).toBeInTheDocument();
    expect(screen.getByText('THISO Mall Sala')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save template' })).toBeInTheDocument();
  });
});
