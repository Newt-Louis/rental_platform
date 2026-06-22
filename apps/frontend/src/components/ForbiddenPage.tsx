import { useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getDefaultHomePath } from '@/lib/permissions';
import { useAuthStore } from '@/store/auth.store';

export default function ForbiddenPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="p-4 rounded-full bg-red-50 mb-4">
        <ShieldAlert className="h-10 w-10 text-red-500" />
      </div>
      <h1 className="text-xl font-bold text-gray-900 mb-2">Không có quyền truy cập</h1>
      <p className="text-sm text-gray-500 max-w-md mb-6">
        Tài khoản <span className="font-medium">{user?.role}</span> không được phép truy cập trang này.
        Liên hệ quản trị viên nếu bạn cần quyền truy cập.
      </p>
      <Button onClick={() => navigate(getDefaultHomePath(user?.role))}>
        Về trang chủ
      </Button>
    </div>
  );
}
