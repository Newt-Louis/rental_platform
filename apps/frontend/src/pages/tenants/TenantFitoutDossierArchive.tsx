import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Archive, Download, FileText, Search } from 'lucide-react';
import { tenantsApi } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { openAuthenticatedFile } from '@/lib/downloadFile';
import { getFitoutSubmittalAttachmentPath } from '@/pages/fitout/fitoutPresentation';

function fmtDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function TenantFitoutDossierArchive({ tenantId }: { tenantId?: string }) {
  const { t } = useTranslation('tenants');
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const archiveQuery = useQuery({
    queryKey: ['tenant-fitout-archive', tenantId ?? 'authorized', debouncedSearch, page],
    queryFn: () => tenantId
      ? tenantsApi.getFitoutArchive(tenantId, { search: debouncedSearch || undefined, page, limit: 20 })
      : tenantsApi.searchFitoutArchive({ search: debouncedSearch || undefined, page, limit: 20 }),
  });

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
        <div className="flex items-start gap-2">
          <Archive size={16} className="mt-0.5 shrink-0 text-blue-600" />
          <div>
            <div className="text-sm font-semibold text-blue-950">{t('fitoutArchive.title')}</div>
            <div className="mt-0.5 text-xs leading-5 text-blue-700">{t('fitoutArchive.description')}</div>
          </div>
        </div>
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('fitoutArchive.searchPlaceholder')} className="h-9 pl-9 text-sm" />
      </div>

      {archiveQuery.isLoading ? (
        <div className="space-y-2"><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /></div>
      ) : archiveQuery.isError ? (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-center">
          <AlertCircle size={22} className="mx-auto mb-2 text-red-400" />
          <p className="text-sm text-red-700">{t('fitoutArchive.loadError')}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => archiveQuery.refetch()}>{t('list.retry')}</Button>
        </div>
      ) : (archiveQuery.data?.data?.length ?? 0) === 0 ? (
        <div className="py-10 text-center text-gray-400">
          <Archive size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">{t('fitoutArchive.empty')}</p>
          <p className="mt-1 text-xs">{search ? t('fitoutArchive.noSearchResults') : t('fitoutArchive.emptyDescription')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-xs text-gray-400">{t('fitoutArchive.resultCount', { count: archiveQuery.data.total })}</div>
          {archiveQuery.data.data.map((dossier: any) => (
            <div key={dossier.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="break-words text-sm font-semibold text-gray-900">{dossier.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                    {dossier.tenant?.brandName && <><span className="font-medium text-blue-700">{dossier.tenant.brandName}</span><span>·</span></>}
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">{dossier.formType?.code}</span>
                    <span>{dossier.formType?.name}</span><span>·</span>
                    <span>{t('fitoutArchive.revision', { revision: dossier.revisionNo })}</span>
                  </div>
                </div>
                <Badge className="shrink-0 border-0 bg-green-100 text-green-700">{t(`fitoutArchive.status.${dossier.status}`)}</Badge>
              </div>

              <div className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-2.5 text-xs text-gray-600 sm:grid-cols-2">
                <div><span className="text-gray-400">{t('fitoutArchive.unit')}</span><div className="font-medium text-gray-800">{dossier.project?.unit?.code}{dossier.project?.unit?.name ? ` · ${dossier.project.unit.name}` : ''}</div></div>
                <div><span className="text-gray-400">{t('fitoutArchive.contract')}</span><div className="font-medium text-gray-800">{dossier.project?.contract?.contractNumber ?? '—'}</div></div>
                <div><span className="text-gray-400">{t('fitoutArchive.stage')}</span><div className="font-medium text-gray-800">{dossier.stageCode}</div></div>
                <div><span className="text-gray-400">{t('fitoutArchive.completedAt')}</span><div className="font-medium text-gray-800">{fmtDate(dossier.updatedAt)}</div></div>
              </div>

              <div className="mt-3">
                <div className="mb-2 text-xs font-semibold text-gray-500">{t('fitoutArchive.attachments', { count: dossier.attachments?.length ?? 0 })}</div>
                {dossier.attachments?.length ? <div className="space-y-1.5">
                  {dossier.attachments.map((attachment: any) => (
                    <button key={attachment.id} type="button"
                      onClick={() => openAuthenticatedFile(getFitoutSubmittalAttachmentPath(attachment.id)).catch(() => toast({ title: t('fitoutArchive.openError'), variant: 'destructive' }))}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2 text-left hover:border-blue-200 hover:bg-blue-50/40">
                      <div className="flex min-w-0 items-center gap-2"><FileText size={14} className="shrink-0 text-blue-500" /><div className="min-w-0">
                        <div className="truncate text-xs font-medium text-gray-800">{attachment.fileName}</div>
                        <div className="text-[11px] text-gray-400">{attachment.documentType} · {t('fitoutArchive.version', { version: attachment.version })}{attachment.isLatest ? ` · ${t('fitoutArchive.latest')}` : ''}</div>
                      </div></div><Download size={13} className="shrink-0 text-gray-400" />
                    </button>
                  ))}
                </div> : <div className="rounded-lg border border-dashed p-3 text-center text-xs text-gray-400">{t('fitoutArchive.noAttachments')}</div>}
              </div>

              {dossier.workflow?.steps?.length > 0 && <details className="mt-3 border-t border-gray-100 pt-3">
                <summary className="cursor-pointer text-xs font-semibold text-blue-700">{t('fitoutArchive.approvalHistory', { count: dossier.workflow.steps.length })}</summary>
                <div className="mt-2 space-y-2">{dossier.workflow.steps.map((step: any) => <div key={step.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
                  <div className="flex items-start justify-between gap-2"><div className="font-medium text-gray-800">{step.stepOrder}. {step.stepName}</div><span className="shrink-0 text-gray-500">{t(`fitoutArchive.approvalStatus.${step.status}`, { defaultValue: step.status })}</span></div>
                  <div className="mt-0.5 text-gray-500">{step.approver?.fullName ?? step.approverRole}{step.decidedAt ? ` · ${fmtDate(step.decidedAt)}` : ''}</div>
                  {step.comment && <div className="mt-1 break-words text-gray-600">{step.comment}</div>}
                </div>)}</div>
              </details>}

              {dossier.comments?.length > 0 && <details className="mt-3 border-t border-gray-100 pt-3">
                <summary className="cursor-pointer text-xs font-semibold text-blue-700">{t('fitoutArchive.comments', { count: dossier.comments.length })}</summary>
                <div className="mt-2 space-y-2">{dossier.comments.map((comment: any) => <div key={comment.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
                  <div className="flex flex-wrap items-center gap-1 text-gray-500"><span className="font-medium text-gray-700">{comment.author?.fullName}</span><span>·</span><span>{fmtDate(comment.createdAt)}</span></div>
                  <div className="mt-1 break-words text-gray-700">{comment.body}</div>
                </div>)}</div>
              </details>}
            </div>
          ))}

          {archiveQuery.data.totalPages > 1 && <div className="flex items-center justify-between border-t pt-3">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{t('list.prev')}</Button>
            <span className="text-xs text-gray-500">{t('list.page', { current: page, total: archiveQuery.data.totalPages })}</span>
            <Button variant="outline" size="sm" disabled={page >= archiveQuery.data.totalPages} onClick={() => setPage((value) => value + 1)}>{t('list.next')}</Button>
          </div>}
        </div>
      )}
    </div>
  );
}
