import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sapApi } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { Cpu, RefreshCw, CheckCircle, XCircle, Clock, Link2, AlertCircle, Scale, FlaskConical } from 'lucide-react';

const STATUS_MAP = {
  PENDING: { label: 'Pending', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  SUCCESS: { label: 'Success', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  FAILED: { label: 'Failed', color: 'bg-red-100 text-red-700', icon: XCircle },
  RETRYING: { label: 'Retrying', color: 'bg-gray-100 text-gray-700', icon: RefreshCw },
};

export default function SapPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [mappingForm, setMappingForm] = useState({ entityType: 'TENANT', entityId: '', sapRef: '', sapCompanyCode: '1000' });

  const { data: logsData, isLoading } = useQuery({
    queryKey: ['sap-logs'],
    queryFn: () => sapApi.getLogs({ limit: 50 }),
    refetchInterval: 15_000,
  });

  const { data: mappingsData } = useQuery({
    queryKey: ['sap-mappings'],
    queryFn: () => sapApi.listMappings({ limit: 50 }),
  });

  const { data: mappingSummary } = useQuery({
    queryKey: ['sap-mapping-summary'],
    queryFn: () => sapApi.getMappingSummary(),
  });

  const { data: sapStats } = useQuery({
    queryKey: ['sap-stats'],
    queryFn: () => sapApi.getStats(),
  });

  const { data: reconciliationData, isLoading: reconLoading } = useQuery({
    queryKey: ['sap-reconciliation'],
    queryFn: () => sapApi.listReconciliation({ limit: 50 }),
    refetchInterval: 30_000,
  });

  const runReconciliationMutation = useMutation({
    mutationFn: () => sapApi.runReconciliation(),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['sap-reconciliation'] });
      toast({
        title: 'Đối soát hoàn tất',
        description: `Khớp: ${r?.matched ?? 0}, lệch: ${r?.mismatched ?? 0}`,
      });
    },
  });

  const syncPendingMutation = useMutation({
    mutationFn: () => sapApi.syncPendingMappings(),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['sap-mappings'] });
      toast({ title: `Đã xử lý ${r?.processed ?? 0} mapping` });
    },
  });

  const upsertMappingMutation = useMutation({
    mutationFn: (dto: typeof mappingForm) => sapApi.upsertMapping(dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sap-mappings'] });
      setMappingForm({ entityType: 'TENANT', entityId: '', sapRef: '', sapCompanyCode: '1000' });
      toast({ title: 'Đã lưu mapping' });
    },
    onError: () => toast({ title: 'Lỗi', variant: 'destructive' }),
  });

  const logs = logsData?.data ?? [];
  const mappings: any[] = (mappingsData as any)?.data ?? mappingsData ?? [];
  const summary = (mappingSummary as any)?.data ?? mappingSummary ?? {};
  const sapEnabled = (sapStats as any)?.enabled ?? (sapStats as any)?.data?.enabled ?? false;
  const reconciliationRecords: any[] =
    (reconciliationData as any)?.data ?? reconciliationData ?? [];
  const mismatchCount = reconciliationRecords.filter((r) => r.status === 'MISMATCH').length;
  const matchedCount = reconciliationRecords.filter((r) => r.status === 'MATCHED').length;

  const successCount = logs.filter((l: any) => l.status === 'SUCCESS').length;
  const failedCount = logs.filter((l: any) => l.status === 'FAILED').length;
  const pendingCount = logs.filter((l: any) => l.status === 'PENDING').length;
  const pendingMappings = mappings.filter((m: any) => m.syncStatus === 'PENDING' || m.syncStatus === 'FAILED').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">SAP Integration</h1>
            {sapEnabled ? (
              <Badge className="bg-green-100 text-green-700 border-0 gap-1">
                <CheckCircle size={12} /> Live
              </Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-800 border-0 gap-1">
                <FlaskConical size={12} /> Demo mode — SAP_ENABLED=false
              </Badge>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">Đồng bộ dữ liệu với SAP FI/CO</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() => runReconciliationMutation.mutate()}
            disabled={runReconciliationMutation.isPending}
          >
            <Scale size={14} /> Chạy đối soát
          </Button>
          {pendingMappings > 0 && (
            <Button size="sm" variant="outline" className="gap-2 border-orange-300 text-orange-600"
              onClick={() => syncPendingMutation.mutate()} disabled={syncPendingMutation.isPending}>
              <AlertCircle size={14} /> Sync {pendingMappings} pending
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-2" onClick={() => qc.invalidateQueries({ queryKey: ['sap-logs'] })}>
            <RefreshCw size={14} /> Làm mới
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-green-600">{successCount}</p>
            <p className="text-xs text-gray-500 mt-1">Log thành công</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-red-500">{failedCount}</p>
            <p className="text-xs text-gray-500 mt-1">Log thất bại</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
            <p className="text-xs text-gray-500 mt-1">Log đang chờ</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-purple-600">{mappings.length}</p>
            <p className="text-xs text-gray-500 mt-1">SAP Mappings</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="reconciliation">
        <TabsList className="mb-4 flex-wrap h-auto">
          <TabsTrigger value="reconciliation" className="gap-1">
            Đối soát
            {mismatchCount > 0 && (
              <Badge className="ml-1 bg-red-500 text-white border-0 text-[10px] px-1.5">{mismatchCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="mappings">Entity Mappings</TabsTrigger>
          <TabsTrigger value="logs">Integration Log</TabsTrigger>
          <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
        </TabsList>

        <TabsContent value="reconciliation">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold text-green-600">{matchedCount}</p>
                <p className="text-xs text-gray-500 mt-1">Khớp (MATCHED)</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold text-red-500">{mismatchCount}</p>
                <p className="text-xs text-gray-500 mt-1">Lệch (MISMATCH)</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold text-gray-600">{reconciliationRecords.length}</p>
                <p className="text-xs text-gray-500 mt-1">Tổng bản ghi</p>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Scale size={14} /> Hàng đợi ngoại lệ đối soát
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {reconLoading ? (
                <Skeleton className="h-48 m-4" />
              ) : (
                <div className="divide-y">
                  {reconciliationRecords.map((rec: any) => (
                    <div key={rec.id} className="flex items-center justify-between p-4 hover:bg-gray-50">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{rec.entityType}</Badge>
                          <span className="text-xs font-mono text-gray-400">{rec.entityId?.slice(0, 12)}…</span>
                        </div>
                        <p className="text-sm mt-1">
                          Platform: <strong>{rec.ourAmount?.toLocaleString('vi-VN')}</strong>
                          {' · '}
                          SAP: <strong>{rec.sapAmount?.toLocaleString('vi-VN') ?? '—'}</strong>
                        </p>
                        <p className="text-xs text-gray-400">Ref: {rec.sapRef}</p>
                      </div>
                      <Badge
                        className={`border-0 text-xs ${
                          rec.status === 'MATCHED'
                            ? 'bg-green-100 text-green-700'
                            : rec.status === 'MISMATCH'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {rec.status}
                      </Badge>
                    </div>
                  ))}
                  {reconciliationRecords.length === 0 && (
                    <div className="text-center py-12 text-gray-400">
                      <Scale size={36} className="mx-auto mb-2 opacity-20" />
                      <p>Chưa có bản ghi đối soát — bấm &quot;Chạy đối soát&quot;</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mappings">
          {/* Add mapping form */}
          <Card className="mb-4">
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Link2 size={14} /> Thêm / cập nhật SAP Mapping</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <select className="h-9 border border-input rounded-md px-3 text-sm bg-white"
                  value={mappingForm.entityType}
                  onChange={(e) => setMappingForm((f) => ({ ...f, entityType: e.target.value }))}>
                  {['TENANT', 'CONTRACT', 'INVOICE', 'PAYMENT'].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <Input placeholder="Entity ID (UUID)" value={mappingForm.entityId}
                  onChange={(e) => setMappingForm((f) => ({ ...f, entityId: e.target.value }))} className="h-9 text-sm" />
                <Input placeholder="SAP Ref (BP / Doc Number)" value={mappingForm.sapRef}
                  onChange={(e) => setMappingForm((f) => ({ ...f, sapRef: e.target.value }))} className="h-9 text-sm" />
                <Input placeholder="Company Code" value={mappingForm.sapCompanyCode}
                  onChange={(e) => setMappingForm((f) => ({ ...f, sapCompanyCode: e.target.value }))} className="h-9 text-sm" />
              </div>
              <Button size="sm" className="mt-3"
                disabled={!mappingForm.entityId || !mappingForm.sapRef || upsertMappingMutation.isPending}
                onClick={() => upsertMappingMutation.mutate(mappingForm)}>
                Lưu Mapping
              </Button>
            </CardContent>
          </Card>

          {/* Mapping summary by type */}
          {Object.keys(summary).length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {Object.entries(summary).map(([etype, counts]: [string, any]) => (
                <Card key={etype}>
                  <CardContent className="pt-3 pb-3">
                    <div className="text-xs font-semibold text-gray-500 mb-1">{etype}</div>
                    <div className="flex gap-2 flex-wrap">
                      {Object.entries(counts).map(([status, count]: [string, any]) => (
                        <Badge key={status} className={`text-xs border-0 ${status === 'SYNCED' ? 'bg-green-100 text-green-700' : status === 'FAILED' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {status}: {count}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {mappings.map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between p-3 hover:bg-gray-50">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{m.entityType}</Badge>
                        <span className="text-xs font-mono text-gray-500">{m.entityId?.slice(0, 12)}…</span>
                      </div>
                      <div className="text-sm font-medium mt-0.5">SAP: {m.sapRef} <span className="text-gray-400 text-xs">({m.sapCompanyCode})</span></div>
                    </div>
                    <div className="text-right">
                      <Badge className={`border-0 text-xs ${m.syncStatus === 'SYNCED' ? 'bg-green-100 text-green-700' : m.syncStatus === 'FAILED' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {m.syncStatus}
                      </Badge>
                      <div className="text-xs text-gray-400 mt-0.5">{new Date(m.lastSyncAt).toLocaleDateString('vi-VN')}</div>
                    </div>
                  </div>
                ))}
                {mappings.length === 0 && (
                  <div className="text-center py-10 text-gray-400"><Link2 size={36} className="mx-auto mb-2 opacity-20" /><p>Chưa có mapping</p></div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardContent className="p-0">
              {isLoading ? <Skeleton className="h-64 m-4" /> : (
                <div className="divide-y">
                  {logs.map((log: any) => {
                    const st = STATUS_MAP[log.status as keyof typeof STATUS_MAP];
                    const Icon = st?.icon ?? Clock;
                    return (
                      <div key={log.id} className="flex items-start gap-3 p-4 hover:bg-gray-50">
                        <Icon size={16} className={`mt-0.5 shrink-0 ${log.status === 'SUCCESS' ? 'text-green-500' : log.status === 'FAILED' ? 'text-red-500' : 'text-yellow-500'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <Badge className={`${st?.color} border-0 text-xs`}>{st?.label}</Badge>
                            <Badge variant="outline" className="text-xs">{log.entityType}</Badge>
                            <span className="text-xs text-gray-400 font-mono">{log.endpoint}</span>
                          </div>
                          {log.errorMessage && <p className="text-xs text-red-500">{log.errorMessage}</p>}
                          <p className="text-xs text-gray-400 mt-0.5">{new Date(log.createdAt).toLocaleString('vi-VN')}</p>
                        </div>
                      </div>
                    );
                  })}
                  {logs.length === 0 && (
                    <div className="text-center py-12 text-gray-400">
                      <Cpu size={40} className="mx-auto mb-2 opacity-30" /><p>Chưa có log nào</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="endpoints">
          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'FI – Customer Master', endpoint: '/sap/fi/customers' },
                  { label: 'FI – Invoice (AR)', endpoint: '/sap/fi/invoices' },
                  { label: 'FI – Payment (AR)', endpoint: '/sap/fi/payments' },
                  { label: 'CO – Cost Center', endpoint: '/sap/co/costcenters' },
                ].map((e, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">{e.label}</p>
                      <p className="text-xs text-gray-400 font-mono">{e.endpoint}</p>
                    </div>
                    <Badge className="bg-green-100 text-green-700 border-0 text-xs">Online</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
