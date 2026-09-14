import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fitoutApi, fitoutGanttApi } from '@/api';
import FitoutGanttPage from './FitoutGanttPage';

// Regression test for a variable-shadowing crash: the task row's `.map((t) => ...)`
// callback used `t` both as the task and as the outer useTranslation() function,
// so `t('gantt.saveProgress', ...)` inside the row called the task object instead
// of the translator -- "e is not a function" on every render once a task existed
// (bug report: /fitout/:id/gantt crashing in production for any project with tasks).
vi.mock('@/api', () => ({
  fitoutApi: { getFitout: vi.fn() },
  fitoutGanttApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { title?: string; defaultValue?: string }) =>
      opts?.title ? `${key}:${opts.title}` : opts?.defaultValue ?? key,
    i18n: { resolvedLanguage: 'vi-VN' },
  }),
}));

function renderAt(projectId: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[`/fitout/${projectId}/gantt`]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/fitout/:projectId/gantt" element={<FitoutGanttPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('FitoutGanttPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fitoutApi.getFitout).mockResolvedValue({ id: 'proj-1' } as never);
  });

  it('renders a task row (with a late task, exercising the aria-label translation calls) without crashing', async () => {
    vi.mocked(fitoutGanttApi.list).mockResolvedValue([
      {
        id: 'task-1',
        name: 'Lắp đặt biển hiệu',
        plannedStart: '2026-01-01',
        plannedEnd: '2026-01-10',
        percentComplete: 40,
        isLate: true,
      },
    ] as never);

    renderAt('proj-1');

    // Both aria-labels are rendered by calling t(...) -- the translator, not the
    // task -- so getting real strings back here (not a thrown TypeError that
    // would abort the render before these queries ever see the row) is the
    // actual regression check.
    expect(await screen.findByLabelText('gantt.saveProgress:Lắp đặt biển hiệu')).toBeInTheDocument();
    expect(screen.getByLabelText('gantt.deleteTask:Lắp đặt biển hiệu')).toBeInTheDocument();
  });
});
