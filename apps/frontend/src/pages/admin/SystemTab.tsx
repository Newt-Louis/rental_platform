import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Clock3, RefreshCw, Server, Settings2 } from 'lucide-react';
import { healthApi, type ComponentStatus } from '@/api/health';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const COMPONENTS = [
  { key: 'database', label: 'Cơ sở dữ liệu', description: 'Kho dữ liệu nghiệp vụ bắt buộc' },
  { key: 'redis', label: 'Redis', description: 'Cache và tác vụ nền' },
  { key: 'ai', label: 'Dịch vụ AI', description: 'Phân tích bản vẽ và trợ lý AI' },
  { key: 'email', label: 'Email', description: 'Gửi thông báo ra ngoài hệ thống' },
  { key: 'sap', label: 'Tích hợp SAP', description: 'Đồng bộ dữ liệu với SAP' },
] as const;

function statusPresentation(status: ComponentStatus) {
  if (status === 'up' || status === 'configured' || status === 'enabled') {
    return { label: status === 'up' ? 'Đang hoạt động' : 'Đã cấu hình', className: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2 };
  }
  if (status === 'down') {
    return { label: 'Không khả dụng', className: 'bg-red-50 text-red-700', icon: AlertCircle };
  }
  return { label: 'Chưa bật', className: 'bg-slate-100 text-slate-600', icon: Settings2 };
}

export function SystemTab() {
  const health = useQuery({
    queryKey: ['system-health'],
    queryFn: healthApi.get,
    refetchInterval: 30_000,
    retry: 1,
  });

  if (health.isLoading) {
    return <div className="space-y-3">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-xl" />)}</div>;
  }

  if (health.isError || !health.data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 text-red-600" size={20} />
          <div className="flex-1">
            <h3 className="font-semibold text-red-900">Không thể kiểm tra trạng thái hệ thống</h3>
            <p className="mt-1 text-sm text-red-700">Không đánh dấu dịch vụ là online khi chưa nhận được dữ liệu xác thực từ backend.</p>
          </div>
          <Button size="sm" variant="outline" className="gap-2" onClick={() => health.refetch()}>
            <RefreshCw size={14} /> Thử lại
          </Button>
        </div>
      </div>
    );
  }

  const data = health.data;
  const checkedAt = new Date(data.timestamp);

  return (
    <div className="space-y-5">
      <div className={`rounded-xl border p-4 ${data.status === 'ok' ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Server className={data.status === 'ok' ? 'text-emerald-600' : 'text-red-600'} size={22} />
            <div>
              <h2 className="font-semibold text-slate-900">{data.service}</h2>
              <p className="text-sm text-slate-600">{data.status === 'ok' ? 'Các thành phần bắt buộc đang sẵn sàng' : 'Hệ thống đang suy giảm, cần kiểm tra thành phần bên dưới'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-600">
            <span className="flex items-center gap-1"><Clock3 size={13} /> {Number.isNaN(checkedAt.getTime()) ? 'Không rõ thời điểm' : checkedAt.toLocaleString('vi-VN')}</span>
            <Button size="sm" variant="outline" className="h-8 gap-1" disabled={health.isFetching} onClick={() => health.refetch()}>
              <RefreshCw size={13} className={health.isFetching ? 'animate-spin' : ''} /> Làm mới
            </Button>
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="font-semibold text-slate-900">Dịch vụ và tích hợp</h3>
          <p className="mt-0.5 text-xs text-slate-500">Trạng thái được đọc trực tiếp từ health API; khóa bí mật không được nhập hoặc hiển thị tại đây.</p>
        </div>
        <div className="grid gap-px bg-slate-100 sm:grid-cols-2 xl:grid-cols-3">
          {COMPONENTS.map((component) => {
            const status = data.components[component.key];
            const presentation = statusPresentation(status);
            const Icon = presentation.icon;
            return (
              <div key={component.key} className="flex items-start justify-between gap-3 bg-white p-4">
                <div>
                  <div className="text-sm font-medium text-slate-900">{component.label}</div>
                  <div className="mt-1 text-xs text-slate-500">{component.description}</div>
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${presentation.className}`}>
                  <Icon size={12} /> {presentation.label}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        Secret và thông số triển khai được quản lý ngoài giao diện Admin. Hệ thống này chỉ xác nhận trạng thái cấu hình, không giả lập thao tác lưu API key.
      </div>
    </div>
  );
}
