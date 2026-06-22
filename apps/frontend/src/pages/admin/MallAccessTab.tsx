import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mallAccessApi, usersApi, spacesApi } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { Building2, Plus, Trash2, Shield } from 'lucide-react';

const GRANT_ROLES = [
  'MALL_DIRECTOR',
  'LEASING_MANAGER',
  'LEASING_EXECUTIVE',
  'FINANCE',
  'LEGAL',
  'OPERATION',
];

export function MallAccessTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedMallId, setSelectedMallId] = useState('');
  const [grantUserId, setGrantUserId] = useState('');
  const [grantRole, setGrantRole] = useState('LEASING_EXECUTIVE');

  const { data: mallsData } = useQuery({ queryKey: ['malls'], queryFn: spacesApi.listMalls });
  const malls: any[] = mallsData?.data ?? mallsData ?? [];

  const { data: usersData } = useQuery({ queryKey: ['users'], queryFn: () => usersApi.listUsers() });
  const users: any[] = usersData?.data ?? usersData ?? [];

  const { data: mallUsers, isLoading } = useQuery({
    queryKey: ['mall-access', selectedMallId],
    queryFn: () => mallAccessApi.getUsersForMall(selectedMallId),
    enabled: !!selectedMallId,
  });

  const grantMutation = useMutation({
    mutationFn: () =>
      mallAccessApi.grant({ userId: grantUserId, mallId: selectedMallId, role: grantRole }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mall-access', selectedMallId] });
      setGrantUserId('');
      toast({ title: 'Đã cấp quyền truy cập mall' });
    },
    onError: () => toast({ title: 'Lỗi cấp quyền', variant: 'destructive' }),
  });

  const revokeMutation = useMutation({
    mutationFn: ({ userId, mallId }: { userId: string; mallId: string }) =>
      mallAccessApi.revoke(userId, mallId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mall-access', selectedMallId] });
      toast({ title: 'Đã thu hồi quyền' });
    },
  });

  const accessList: any[] = Array.isArray(mallUsers) ? mallUsers : mallUsers?.data ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield size={16} />
            Phân quyền truy cập theo Mall (UserMallAccess)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-gray-500 mb-4">
            User không phải ADMIN/CEO chỉ thao tác được dữ liệu mall được gán quyền.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <Select value={selectedMallId} onValueChange={setSelectedMallId}>
              <SelectTrigger className="sm:w-64">
                <SelectValue placeholder="Chọn mall..." />
              </SelectTrigger>
              <SelectContent>
                {malls.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedMallId && (
            <>
              <div className="flex flex-col sm:flex-row gap-2 p-3 bg-gray-50 rounded-lg mb-4">
                <Select value={grantUserId} onValueChange={setGrantUserId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Chọn user..." />
                  </SelectTrigger>
                  <SelectContent>
                    {users
                      .filter((u) => !['ADMIN', 'CEO', 'TENANT'].includes(u.role))
                      .map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.fullName} ({u.email})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Select value={grantRole} onValueChange={setGrantRole}>
                  <SelectTrigger className="sm:w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GRANT_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  className="gap-1 shrink-0"
                  disabled={!grantUserId || grantMutation.isPending}
                  onClick={() => grantMutation.mutate()}
                >
                  <Plus size={14} /> Cấp quyền
                </Button>
              </div>

              {isLoading ? (
                <Skeleton className="h-32" />
              ) : (
                <div className="divide-y border rounded-lg">
                  {accessList.map((u: any) => (
                    <div key={u.id} className="flex items-center justify-between p-3">
                      <div>
                        <p className="text-sm font-medium">{u.fullName}</p>
                        <p className="text-xs text-gray-400">{u.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{u.mallRole ?? u.role}</Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-red-500"
                          onClick={() => revokeMutation.mutate({ userId: u.id, mallId: selectedMallId })}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {accessList.length === 0 && (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      <Building2 size={32} className="mx-auto mb-2 opacity-30" />
                      Chưa có user nào được gán quyền mall này
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
