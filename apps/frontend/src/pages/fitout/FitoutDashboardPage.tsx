import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fitoutApi } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, AlertTriangle } from 'lucide-react';

// ─── Palette (categorical, fixed order — see dataviz skill palette.md) ────────
const CAT = {
  blue: '#2a78d6', aqua: '#1baf7a', yellow: '#eda100', green: '#008300',
  violet: '#4a3aa7', red: '#e34948', magenta: '#e87ba4', orange: '#eb6834',
};
const INK_PRIMARY = '#0b0b0b';
const INK_SECONDARY = '#52514e';
const INK_MUTED = '#898781';
const SURFACE_GAP = '#ffffff';

const ISSUE_STATUS_ORDER = ['OPENED', 'IN_PROGRESS', 'DONE', 'CLOSED', 'REOPENED', 'CANCELLED'];
const ISSUE_STATUS_COLOR: Record<string, string> = {
  OPENED: CAT.blue, IN_PROGRESS: CAT.aqua, DONE: CAT.yellow,
  CLOSED: CAT.green, REOPENED: CAT.violet, CANCELLED: CAT.red,
};
const SUBMITTAL_STATUS_ORDER = ['SUBMITTED', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'PUBLISHED', 'OBSOLETED'];
const SUBMITTAL_STATUS_COLOR: Record<string, string> = {
  SUBMITTED: CAT.blue, IN_PROGRESS: CAT.aqua, APPROVED: CAT.green,
  REJECTED: CAT.red, PUBLISHED: CAT.violet, OBSOLETED: CAT.orange,
};

function StatTile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-3xl font-semibold mt-1" style={{ color: INK_PRIMARY }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: INK_MUTED }}>{sub}</p>}
    </div>
  );
}

/** Part-to-whole horizontal stacked bar — categorical color, 2px surface gaps, legend + counts below (table-view twin). */
function StackedBreakdown({ title, order, colorMap, counts }: {
  title: string;
  order: string[];
  colorMap: Record<string, string>;
  counts: Record<string, number>;
}) {
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const present = order.filter((k) => (counts[k] ?? 0) > 0);

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: INK_MUTED }}>Chưa có dữ liệu</p>
        ) : (
          <>
            <div className="flex w-full h-6 rounded overflow-hidden" style={{ gap: 2, background: SURFACE_GAP }}>
              {present.map((key) => {
                const pct = ((counts[key] ?? 0) / total) * 100;
                return (
                  <div key={key} style={{ width: `${pct}%`, background: colorMap[key] }} title={`${key}: ${counts[key]}`} />
                );
              })}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
              {present.map((key) => (
                <span key={key} className="flex items-center gap-1.5 text-xs" style={{ color: INK_SECONDARY }}>
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: colorMap[key] }} />
                  {key} <span style={{ color: INK_MUTED }}>({counts[key]})</span>
                </span>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ProjectMeter({ progress }: { progress: number }) {
  return (
    <div className="w-full h-2 rounded-full" style={{ background: '#cde2fb' }}>
      <div className="h-full rounded-full" style={{ width: `${progress}%`, background: CAT.blue }} />
    </div>
  );
}

export default function FitoutDashboardPage() {
  const navigate = useNavigate();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['fitout-dashboard-overview'],
    queryFn: () => fitoutApi.getDashboardOverview(),
  });

  const { data: detail } = useQuery({
    queryKey: ['fitout-dashboard-detail', selectedProjectId],
    queryFn: () => fitoutApi.getProjectDashboard(selectedProjectId!),
    enabled: !!selectedProjectId,
  });

  const projects: any[] = overview?.projects ?? [];
  const nearestCountdown = projects
    .map((p) => p.expectedOpenDate ? Math.ceil((new Date(p.expectedOpenDate).getTime() - Date.now()) / 86400000) : null)
    .filter((d): d is number => d !== null && d >= 0)
    .sort((a, b) => a - b)[0];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate('/fitout')}>
          <ArrowLeft size={16} /> Quay lại
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard Fitout</h1>
          <p className="text-sm text-gray-500 mt-1">Tổng quan tiến độ toàn bộ dự án fitout</p>
        </div>
      </div>

      {selectedProjectId && detail ? (
        <div>
          <Button variant="outline" size="sm" className="mb-4 gap-1" onClick={() => setSelectedProjectId(null)}>
            <ArrowLeft size={13} /> Quay lại tổng quan
          </Button>
          <div className="mb-4">
            <h2 className="text-lg font-semibold">{detail.project.tenant} — {detail.project.unit}</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <StatTile label="Đếm ngược khai trương" value={detail.countdownDays != null ? `${detail.countdownDays}d` : '—'} />
            <StatTile label="Số ngày trễ (task chậm nhất)" value={`${detail.delayDays}d`} sub={detail.lateTaskCount > 0 ? `${detail.lateTaskCount} công việc chậm` : undefined} />
            <StatTile label="Hoàn thành (Gantt)" value={detail.completedPct != null ? `${detail.completedPct}%` : '—'} sub={`${detail.taskCount} công việc`} />
            <StatTile label="Rủi ro" value={detail.overdueMilestoneCount + detail.overdueIssueCount} sub="Milestone + vấn đề quá hạn" />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <StackedBreakdown title="Vấn đề theo trạng thái" order={ISSUE_STATUS_ORDER} colorMap={ISSUE_STATUS_COLOR} counts={detail.issueByStatus} />
            <StackedBreakdown title="Đệ trình theo trạng thái" order={SUBMITTAL_STATUS_ORDER} colorMap={SUBMITTAL_STATUS_COLOR} counts={detail.submittalByStatus} />
          </div>
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatTile label="Dự án đang hoạt động" value={overview?.totalActive ?? (overviewLoading ? '—' : 0)} />
            <StatTile label="Cảnh báo rủi ro" value={overview?.atRiskCount ?? 0} sub={overview?.atRiskCount ? 'có milestone quá hạn' : undefined} />
            <StatTile label="Tiến độ trung bình" value={`${overview?.avgProgress ?? 0}%`} />
            <StatTile label="Gần khai trương nhất" value={nearestCountdown != null ? `${nearestCountdown}d` : '—'} />
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Danh sách dự án</CardTitle></CardHeader>
            <CardContent>
              {overviewLoading ? (
                <p className="text-sm text-center py-6" style={{ color: INK_MUTED }}>Đang tải...</p>
              ) : (
                <div className="space-y-3">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      className="w-full text-left flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                      onClick={() => setSelectedProjectId(p.id)}
                    >
                      <div className="w-40 shrink-0">
                        <p className="text-sm font-medium truncate">{p.tenant}</p>
                        <p className="text-xs" style={{ color: INK_MUTED }}>{p.unit}</p>
                      </div>
                      <div className="flex-1">
                        <ProjectMeter progress={p.progress} />
                      </div>
                      <div className="w-12 text-right text-sm shrink-0" style={{ color: INK_SECONDARY }}>{p.progress}%</div>
                      <div className="w-6 shrink-0">
                        {p.isAtRisk && <AlertTriangle size={14} style={{ color: '#d03b3b' }} />}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
