import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/auth.store';
import { getDefaultHomePath } from '@/lib/permissions';

export default function NotFoundPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <p className="text-sm font-semibold text-muted-foreground">404</p>
        <h1 className="text-2xl font-bold text-foreground">Không tìm thấy trang</h1>
        <p className="text-sm text-muted-foreground">
          Đường dẫn không tồn tại hoặc chức năng đã được chuyển sang vị trí khác.
        </p>
        <Button onClick={() => navigate(getDefaultHomePath(user?.role), { replace: true })}>
          Về trang chính
        </Button>
      </div>
    </div>
  );
}
