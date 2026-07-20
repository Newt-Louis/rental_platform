import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/auth.store';
import { authApi, brandingApi } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { getDefaultHomePath } from '@/lib/permissions';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

interface LoginForm {
  email: string;
  password: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const { toast } = useToast();
  const { t } = useTranslation('auth');
  const [loading, setLoading] = useState(false);

  const { data: branding } = useQuery({
    queryKey: ['branding-settings'],
    queryFn: brandingApi.getSettings,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>();

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    try {
      const res = await authApi.login(data.email, data.password);
      login(res.accessToken, res.user);
      navigate(getDefaultHomePath(res.user.role), { replace: true });
    } catch (err: any) {
      toast({
        title: t('login.loginFailed'),
        description: err?.response?.data?.message ?? t('login.invalidCredentials'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-gray-900 flex items-center justify-center p-4 relative bg-cover bg-center"
      style={branding?.backgroundUrl ? { backgroundImage: `url(${branding.backgroundUrl})` } : undefined}
    >
      {branding?.backgroundUrl && <div className="absolute inset-0 bg-black/60" />}

      <div className="absolute top-4 right-4 z-10">
        <LanguageSwitcher />
      </div>

      <div className="w-full max-w-md relative">
        <div className="flex items-center justify-center gap-3 mb-8">
          {branding?.logoUrl ? (
            <img src={branding.logoUrl} alt="Logo" className="h-14 max-w-[200px] object-contain" />
          ) : (
            <>
              <div className="bg-gray-700 p-3 rounded-xl">
                <Building2 size={28} className="text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-widest">THISO</h1>
                <p className="text-gray-400 text-sm">Leasing Platform</p>
              </div>
            </>
          )}
        </div>

        <Card className="shadow-2xl border-0">
          <CardHeader>
            <CardTitle>{t('login.title')}</CardTitle>
            <CardDescription>{t('login.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t('login.emailLabel')}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t('login.emailPlaceholder')}
                  {...register('email', { required: t('login.emailRequired') })}
                />
                {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t('login.passwordLabel')}</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder={t('login.passwordPlaceholder')}
                  {...register('password', { required: t('login.passwordRequired') })}
                />
                {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t('login.loginLoading') : t('login.loginButton')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
