import type { ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './button';
import { EmptyState } from './empty-state';
import { Skeleton } from './skeleton';

interface AsyncStateProps {
  isLoading: boolean;
  isError?: boolean;
  isEmpty?: boolean;
  onRetry?: () => void;
  loading?: ReactNode;
  children: ReactNode;
  errorTitle?: string;
  errorDescription?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
}

export function AsyncState({
  isLoading,
  isError = false,
  isEmpty = false,
  onRetry,
  loading,
  children,
  errorTitle = 'Không thể tải dữ liệu',
  errorDescription = 'Kiểm tra kết nối và thử tải lại.',
  emptyTitle = 'Chưa có dữ liệu',
  emptyDescription,
  emptyAction,
}: AsyncStateProps) {
  if (isLoading) {
    return (
      <div role="status" aria-label="Đang tải dữ liệu">
        {loading ?? <Skeleton className="h-48 w-full" />}
      </div>
    );
  }

  if (isError) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <AlertCircle size={28} className="mx-auto mb-2 text-red-500" aria-hidden="true" />
        <h3 className="font-semibold text-red-800">{errorTitle}</h3>
        <p className="mt-1 text-sm text-red-700">{errorDescription}</p>
        {onRetry && (
          <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={onRetry}>
            <RefreshCw size={14} aria-hidden="true" /> Thử lại
          </Button>
        )}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  return <>{children}</>;
}
