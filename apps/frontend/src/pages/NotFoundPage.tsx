import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/auth.store';
import { getDefaultHomePath } from '@/lib/permissions';
import { useTranslation } from 'react-i18next';

export default function NotFoundPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { t } = useTranslation('auth');

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <p className="text-sm font-semibold text-muted-foreground">404</p>
        <h1 className="text-2xl font-bold text-foreground">{t('notFound.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('notFound.description')}
        </p>
        <Button onClick={() => navigate(getDefaultHomePath(user?.role), { replace: true })}>
          {t('notFound.backHome')}
        </Button>
      </div>
    </div>
  );
}
