import { useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getDefaultHomePath } from '@/lib/permissions';
import { useAuthStore } from '@/store/auth.store';
import { useTranslation } from 'react-i18next';

export default function ForbiddenPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { t } = useTranslation('auth');

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="p-4 rounded-full bg-red-50 mb-4">
        <ShieldAlert className="h-10 w-10 text-red-500" />
      </div>
      <h1 className="text-xl font-bold text-gray-900 mb-2">{t('forbidden.title')}</h1>
      <p className="text-sm text-gray-500 max-w-md mb-6">
        Tài khoản <span className="font-medium">{user?.role}</span> {t('forbidden.description')}
      </p>
      <Button onClick={() => navigate(getDefaultHomePath(user?.role))}>
        {t('forbidden.backHome')}
      </Button>
    </div>
  );
}
