import { LoaderCircle } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';

interface LoadingButtonProps extends ButtonProps {
  loading?: boolean;
  loadingText?: string;
}

export function LoadingButton({
  loading = false,
  loadingText = 'Đang xử lý…',
  disabled,
  children,
  ...props
}: LoadingButtonProps) {
  return (
    <Button disabled={disabled || loading} aria-busy={loading} {...props}>
      {loading && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
      {loading ? loadingText : children}
    </Button>
  );
}

