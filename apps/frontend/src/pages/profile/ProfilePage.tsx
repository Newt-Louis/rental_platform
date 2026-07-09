import { useState } from 'react';
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

export default function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const { toast } = useToast();

  const [infoForm, setInfoForm] = useState({
    fullName: user?.fullName ?? '',
    phone: user?.phone ?? '',
    department: user?.department ?? '',
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
        department: infoForm.department,
      });
      setUser({ ...user, ...updated });
      toast({ title: 'Cập nhật thành công' });
    } catch {
      toast({ title: 'Cập nhật thất bại', variant: 'destructive' });
    } finally {
      setInfoLoading(false);
    }
  };

  const handlePwSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      toast({ title: 'Mật khẩu xác nhận không khớp', variant: 'destructive' });
      return;
    }
    if (pwForm.newPassword.length < 6) {
      toast({ title: 'Mật khẩu phải có ít nhất 6 ký tự', variant: 'destructive' });
      return;
    }
    setPwLoading(true);
    try {
      await usersApi.resetPassword(user.id, pwForm.newPassword);
      setPwForm({ newPassword: '', confirmPassword: '' });
      toast({ title: 'Đổi mật khẩu thành công' });
    } catch {
      toast({ title: 'Đổi mật khẩu thất bại', variant: 'destructive' });
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Thông tin tài khoản</h1>
        <p className="text-sm text-gray-500 mt-0.5">Quản lý thông tin cá nhân và mật khẩu</p>
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
              <div className="text-xs text-gray-400 mt-0.5">{user?.role}</div>
            </div>
          </div>
        </CardHeader>

        <Separator />

        <CardContent className="pt-5">
          <CardTitle className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-4">
            <User size={15} /> Thông tin cá nhân
          </CardTitle>
          <form onSubmit={handleInfoSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={user?.email ?? ''} disabled className="bg-gray-50 text-gray-500" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fullName">Họ tên</Label>
                <Input
                  id="fullName"
                  value={infoForm.fullName}
                  onChange={(e) => setInfoForm((f) => ({ ...f, fullName: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Số điện thoại</Label>
                <Input
                  id="phone"
                  value={infoForm.phone}
                  onChange={(e) => setInfoForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="Chưa cập nhật"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="department">Phòng ban</Label>
                <Input
                  id="department"
                  value={infoForm.department}
                  onChange={(e) => setInfoForm((f) => ({ ...f, department: e.target.value }))}
                  placeholder="Chưa cập nhật"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={infoLoading} size="sm">
                {infoLoading ? 'Đang lưu...' : 'Lưu thay đổi'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <CardTitle className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-4">
            <KeyRound size={15} /> Đổi mật khẩu
          </CardTitle>
          <form onSubmit={handlePwSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="newPassword">Mật khẩu mới</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={pwForm.newPassword}
                  onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))}
                  placeholder="Ít nhất 6 ký tự"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Xác nhận mật khẩu</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={pwForm.confirmPassword}
                  onChange={(e) => setPwForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                  placeholder="Nhập lại mật khẩu"
                  required
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={pwLoading} size="sm" variant="outline">
                {pwLoading ? 'Đang đổi...' : 'Đổi mật khẩu'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
