import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/auth.store';
import { usersApi } from '@/api';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { User, KeyRound } from 'lucide-react';
import { roleTranslationKey } from '@/lib/erpEnumPresentation';

export default function ProfilePage() {
  const { t } = useTranslation(['profile', 'admin', 'common']);
  const { user, setUser } = useAuthStore();
  const { toast } = useToast();

  const [infoForm, setInfoForm] = useState({
    fullName: user?.fullName ?? '',
    phone: user?.phone ?? '',
  });
  const [infoLoading, setInfoLoading] = useState(false);

  const [pwForm, setPwForm] = useState({ newPassword: '', confirmPassword: '' });
  const [pwLoading, setPwLoading] = useState(false);

  const handleInfoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setInfoLoading(true);
    try {
      const updated = await usersApi.updateUser(user.id, {
        fullName: infoForm.fullName,
        phone: infoForm.phone,
      });
      setUser({ ...user, ...updated });
      toast({ title: t('saveSuccess') });
    } catch {
      toast({ title: t('saveError'), variant: 'destructive' });
    } finally {
      setInfoLoading(false);
    }
  };

  const handlePwSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      toast({ title: t('changePassword.passwordMismatch'), variant: 'destructive' });
      return;
    }
    if (pwForm.newPassword.length < 6) {
      toast({ title: t('changePassword.passwordTooShort'), variant: 'destructive' });
      return;
    }
    setPwLoading(true);
    try {
      await usersApi.resetPassword(user.id, pwForm.newPassword);
      setPwForm({ newPassword: '', confirmPassword: '' });
      toast({ title: t('changePassword.success') });
    } catch {
      toast({ title: t('changePassword.error'), variant: 'destructive' });
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{t('title')}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{t('subtitle')}</p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14">
              <AvatarFallback className="bg-gray-600 text-white text-lg">
                {user?.fullName?.charAt(0) ?? 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="font-medium text-gray-900">{user?.fullName}</div>
              <div className="text-sm text-gray-500">{user?.email}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {t(roleTranslationKey(user?.role))}
              </div>
            </div>
          </div>
        </CardHeader>

        <Separator />

        <CardContent className="pt-5">
          <CardTitle className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-4">
            <User size={15} /> {t('personalInfo')}
          </CardTitle>
          <form onSubmit={handleInfoSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={user?.email ?? ''} disabled className="bg-gray-50 text-gray-500" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fullName">{t('fields.fullName')}</Label>
                <Input
                  id="fullName"
                  value={infoForm.fullName}
                  onChange={(e) => setInfoForm((f) => ({ ...f, fullName: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">{t('fields.phone')}</Label>
                <Input
                  id="phone"
                  value={infoForm.phone}
                  onChange={(e) => setInfoForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder={t('phonePlaceholder')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="department">{t('fields.department')}</Label>
                <Input
                  id="department"
                  value={user?.departmentInfo?.name ?? ''}
                  placeholder={t('departmentPlaceholder')}
                  disabled
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={infoLoading} size="sm">
                {infoLoading ? t('saving') : t('saveChanges')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <CardTitle className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-4">
            <KeyRound size={15} /> {t('changePassword.title')}
          </CardTitle>
          <form onSubmit={handlePwSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="newPassword">{t('changePassword.newPassword')}</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={pwForm.newPassword}
                  onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))}
                  placeholder={t('changePassword.newPasswordPlaceholder')}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">{t('changePassword.confirmPassword')}</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={pwForm.confirmPassword}
                  onChange={(e) => setPwForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                  placeholder={t('changePassword.confirmPasswordPlaceholder')}
                  required
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={pwLoading} size="sm" variant="outline">
                {pwLoading ? t('changePassword.changing') : t('changePassword.changeBtn')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
