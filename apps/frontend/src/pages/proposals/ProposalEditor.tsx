import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { proposalsApi } from '@/api';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  X, FileDown, Save, Upload, Image, Lock, RotateCcw, AlertTriangle, RefreshCw,
  Eye, EyeOff, Maximize2, Minimize2, GripVertical,
} from 'lucide-react';
import { exportOfficialProposalPdf, proposalErrorMessage, ROUTING_REASON_LABELS } from './proposalPdf';
import type {
  ProposalDocumentItemKey,
  ProposalDocumentModel,
  SaveProposalDocumentContentPayload,
} from './proposalDocument.types';

/**
 * CR-PROPOSAL-DOCUMENT-SOURCE-001 / CR-PROPOSAL-MAPPING-002 — Tờ trình editor.
 *
 * Renders the canonical document from GET /proposals/:id/document. It does not
 * map Proposal fields itself any more: business facts arrive as text from the
 * server and are shown read-only; only editorial wording, notes, row order and
 * images are editable. The official PDF is the server's, for every screen.
 */

const COLORS = ['#1a237e', '#1e3a5f', '#2c3e50', '#1b5e20', '#4a148c', '#212121'];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
/** Standard clauses the author usually leaves alone (formerly rows 12–16). */
const STANDARD_CLAUSES: ProposalDocumentItemKey[] = ['UTILITIES', 'OPERATING_HOURS', 'AFTER_HOURS', 'EXCHANGE_RATE', 'PAYMENT'];

export const LIVE_DIFFERS_MESSAGE = 'Proposal hiện tại đã thay đổi so với tờ trình đã trình duyệt.';

export const STALE_DOCUMENT_MESSAGE =
  'Thông tin Proposal đã thay đổi sau lần lưu nội dung tờ trình gần nhất. Vui lòng kiểm tra lại nội dung trước khi xuất hoặc trình duyệt.';

interface DraftState {
  docNumber: string;
  documentDate: string;
  subject: string;
  preamble: string[];
  bodyIntro: string;
  closingLine: string;
  items: Partial<Record<ProposalDocumentItemKey, { narrativeText: string | null; note: string }>>;
  itemOrder: ProposalDocumentItemKey[];
  logoDataUrl: string | null;
  layoutImageDataUrl: string | null;
  primaryColor: string;
}

function draftFromModel(model: ProposalDocumentModel): DraftState {
  return {
    docNumber: model.header.docNumber,
    documentDate: model.header.documentDate ?? '',
    subject: model.header.subject,
    preamble: [...model.preamble],
    bodyIntro: model.bodyIntro,
    closingLine: model.closingLine,
    // Untouched rows hold null and display the template, so template wording keeps
    // following the facts if they are refreshed while the editor is open.
    items: Object.fromEntries(model.items.map((i) => [i.key, { narrativeText: i.narrativeOverridden ? i.narrativeText : null, note: i.note }])),
    itemOrder: model.items.map((i) => i.key),
    logoDataUrl: model.presentation.logoDataUrl,
    layoutImageDataUrl: model.presentation.layoutImageDataUrl,
    primaryColor: model.presentation.primaryColor,
  };
}

export function buildSavePayload(model: ProposalDocumentModel, draft: DraftState): SaveProposalDocumentContentPayload {
  return {
    expectedContentVersion: model.sync.contentVersion,
    reviewedFingerprint: model.sync.sourceFingerprint,
    content: {
      docNumber: draft.docNumber,
      documentDate: draft.documentDate || null,
      subject: draft.subject,
      preamble: draft.preamble,
      bodyIntro: draft.bodyIntro,
      closingLine: draft.closingLine,
      items: model.items.map((item) => ({
        key: item.key,
        note: draft.items[item.key]?.note ?? '',
        // Fact rows never send wording: the server would refuse it.
        ...(item.narrativeEditable ? { narrativeText: draft.items[item.key]?.narrativeText ?? null } : {}),
      })),
      itemOrder: draft.itemOrder,
      logoDataUrl: draft.logoDataUrl,
      layoutImageDataUrl: draft.layoutImageDataUrl,
      primaryColor: draft.primaryColor,
    },
  };
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

// ── Auto-growing text field ─────────────────────────────────────────────────

function DocText({ value, onChange, readOnly, label, className = '', singleLine = false }: {
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
  label: string;
  className?: string;
  singleLine?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !el.scrollHeight) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      aria-label={label}
      value={value}
      readOnly={readOnly}
      rows={1}
      onChange={(e) => onChange(singleLine ? e.target.value.replace(/\n/g, ' ') : e.target.value)}
      className={`block w-full resize-none overflow-hidden bg-transparent rounded px-1 leading-snug ${readOnly ? '' : 'hover:bg-blue-50 focus:bg-blue-50 focus:outline-none focus:ring-1 focus:ring-blue-300'} ${className}`}
      style={{ font: 'inherit' }}
    />
  );
}

// ── Main Editor ──────────────────────────────────────────────────────────────

export function ProposalEditorDialog({ proposal, onClose }: {
  proposal: any;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const documentKey = ['proposal-document', proposal.id];

  const { data: model, isLoading, isError, refetch } = useQuery({
    queryKey: documentKey,
    queryFn: () => proposalsApi.getDocument(proposal.id),
  });

  const [draft, setDraft] = useState<DraftState | null>(null);
  const [baseline, setBaseline] = useState('');
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [sidebar, setSidebar] = useState<'settings' | 'approval' | 'style'>('settings');
  const [showStandardClauses, setShowStandardClauses] = useState(true);

  const resetDraftFrom = useCallback((m: ProposalDocumentModel) => {
    const next = draftFromModel(m);
    setDraft(next);
    setBaseline(JSON.stringify(next));
  }, []);

  // Seed the draft once. A later refetch (e.g. after "Lưu Phí & Điều khoản")
  // refreshes the facts but must not discard what the author is typing.
  useEffect(() => {
    if (model && !draft) resetDraftFrom(model);
  }, [model, draft, resetDraftFrom]);

  const dirty = !!draft && JSON.stringify(draft) !== baseline;
  const readOnly = !model || model.status !== 'DRAFT';

  // GAP #41, #91–94 — Proposal fields that feed the document (saved as facts).
  const [extraFields, setExtraFields] = useState({
    utilityFee:      proposal.utilityFee      ?? 0,
    operatingHours:  proposal.operatingHours  ?? '',
    afterHoursFee:   proposal.afterHoursFee   ?? 0,
    paymentTermDays: proposal.paymentTermDays ?? 30,
    depositLease:    proposal.depositLease    ?? 0,
    depositFitout:   proposal.depositFitout   ?? 0,
    fitoutFee:       proposal.fitoutFee       ?? 0,
  });
  const setEF = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setExtraFields((f) => ({ ...f, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value }));

  const refreshProposal = () => {
    qc.invalidateQueries({ queryKey: ['proposal-detail', proposal.id] });
    qc.invalidateQueries({ queryKey: ['proposal-versions', proposal.id] });
    qc.invalidateQueries({ queryKey: ['proposals'] });
    qc.invalidateQueries({ queryKey: documentKey });
  };

  // CR-PROPOSAL-DOCUMENT-FINALIZATION — a rejected Proposal starts a new document
  // cycle; the rejected version and its approval evidence stay as they were.
  const reviseMutation = useMutation({
    mutationFn: () => proposalsApi.startRevision(proposal.id),
    onSuccess: async () => {
      refreshProposal();
      const fresh = await refetch();
      if (fresh.data) resetDraftFrom(fresh.data);
      toast({ title: 'Đã tạo bản tờ trình mới. Kiểm tra, lưu và trình duyệt lại.' });
    },
    onError: (error) => toast({ title: proposalErrorMessage(error, 'Không thể tạo bản tờ trình mới'), variant: 'destructive' }),
  });

  const saveExtraMutation = useMutation({
    mutationFn: () => proposalsApi.updateDocFields(proposal.id, {
      utilityFee:      extraFields.utilityFee,
      operatingHours:  extraFields.operatingHours || undefined,
      afterHoursFee:   extraFields.afterHoursFee,
      paymentTermDays: extraFields.paymentTermDays,
      depositLease:    extraFields.depositLease > 0 ? extraFields.depositLease : null,
      depositFitout:   extraFields.depositFitout,
      fitoutFee:       extraFields.fitoutFee,
    }),
    onSuccess: () => { refreshProposal(); toast({ title: 'Đã lưu phí & điều khoản' }); },
    onError: (error) => toast({ title: proposalErrorMessage(error, 'Lỗi khi lưu'), variant: 'destructive' }),
  });

  const saveMutation = useMutation({
    mutationFn: () => proposalsApi.saveDocumentContent(proposal.id, buildSavePayload(model!, draft!)),
    onSuccess: (saved) => {
      qc.setQueryData(documentKey, saved);
      resetDraftFrom(saved);
      setConflictMessage(null);
      refreshProposal();
      toast({ title: 'Đã lưu và xác nhận nội dung tờ trình' });
    },
    onError: (error: any) => {
      const message = proposalErrorMessage(error, 'Lỗi khi lưu tờ trình');
      if (error?.response?.status === 409) setConflictMessage(message);
      toast({ title: message, variant: 'destructive' });
    },
  });

  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    if (!model) return;
    setExporting(true);
    try {
      // The official PDF is rendered from what is saved, so unsaved edits go first.
      if (dirty && !readOnly) {
        try { await saveMutation.mutateAsync(); } catch { return; } // save already reported why
      }
      await exportOfficialProposalPdf({
        id: model.proposalId,
        proposalNumber: model.proposalNumber,
        documentVersionId: model.version?.id ?? null,
        versionNumber: model.version?.versionNumber ?? null,
      });
    } catch (error) {
      toast({ title: proposalErrorMessage(error, 'Không thể xuất PDF tờ trình'), variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const reloadDocument = async () => {
    const fresh = await refetch();
    if (fresh.data) resetDraftFrom(fresh.data);
    setConflictMessage(null);
  };

  // Draggable window
  const [maximized, setMaximized] = useState(true);
  const [winOffset, setWinOffset] = useState({ x: 0, y: 0 });
  const isDraggingWin = useRef(false);
  const winDragStart = useRef({ mx: 0, my: 0, ox: 0, oy: 0 });
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDraggingWin.current) return;
      setWinOffset({
        x: winDragStart.current.ox + (e.clientX - winDragStart.current.mx),
        y: winDragStart.current.oy + (e.clientY - winDragStart.current.my),
      });
    };
    const onUp = () => { isDraggingWin.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  // Row drag-to-reorder
  const [rowDragKey, setRowDragKey] = useState<ProposalDocumentItemKey | null>(null);
  const [rowDropKey, setRowDropKey] = useState<ProposalDocumentItemKey | null>(null);

  const patch = useCallback((changes: Partial<DraftState>) => {
    setDraft((d) => (d ? { ...d, ...changes } : d));
  }, []);

  const updateItem = useCallback((key: ProposalDocumentItemKey, field: 'narrativeText' | 'note', value: string | null) => {
    setDraft((d) => d ? {
      ...d,
      items: { ...d.items, [key]: { narrativeText: d.items[key]?.narrativeText ?? null, note: d.items[key]?.note ?? '', [field]: value } },
    } : d);
  }, []);

  const moveItem = useCallback((from: ProposalDocumentItemKey, to: ProposalDocumentItemKey) => {
    setDraft((d) => {
      if (!d || from === to) return d;
      const order = [...d.itemOrder];
      const fromIdx = order.indexOf(from);
      const toIdx = order.indexOf(to);
      if (fromIdx < 0 || toIdx < 0) return d;
      order.splice(fromIdx, 1);
      order.splice(toIdx, 0, from);
      return { ...d, itemOrder: order };
    });
  }, []);

  const readImage = async (e: React.ChangeEvent<HTMLInputElement>, field: 'logoDataUrl' | 'layoutImageDataUrl') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    // The PDF renderer embeds PNG and JPEG only; anything else would break the official PDF.
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      toast({ title: 'Chỉ hỗ trợ ảnh PNG hoặc JPEG', variant: 'destructive' });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast({ title: 'Ảnh vượt quá 2 MB', variant: 'destructive' });
      return;
    }
    const dataUrl = await new Promise<string>((res) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result as string);
      reader.readAsDataURL(file);
    });
    patch({ [field]: dataUrl });
  };

  const orderedItems = useMemo(() => {
    if (!model || !draft) return [];
    const byKey = new Map(model.items.map((i) => [i.key, i]));
    const keys = [
      ...draft.itemOrder.filter((k) => byKey.has(k)),
      ...model.items.map((i) => i.key).filter((k) => !draft.itemOrder.includes(k)),
    ];
    return keys.map((k) => byKey.get(k)!);
  }, [model, draft]);

  const accent = draft?.primaryColor ?? '#1a237e';

  return (
    <>
      {!maximized && <div className="fixed inset-0 z-[199] bg-black/30 pointer-events-none" />}
      <div
        role="dialog"
        aria-label={`Tờ trình ${proposal.proposalNumber}`}
        className={`fixed z-[200] bg-white flex flex-col ${maximized ? 'inset-0' : 'shadow-2xl rounded-lg overflow-hidden'}`}
        style={maximized ? {} : { left: `calc(5vw + ${winOffset.x}px)`, top: `calc(4vh + ${winOffset.y}px)`, width: '90vw', height: '92vh' }}
      >
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div
        className={`flex items-center gap-2 px-4 py-2 bg-gray-900 text-white shrink-0 select-none ${!maximized ? 'cursor-move' : ''}`}
        onMouseDown={(e) => {
          if (maximized) return;
          if ((e.target as HTMLElement).closest('button,select,label,input,a')) return;
          isDraggingWin.current = true;
          winDragStart.current = { mx: e.clientX, my: e.clientY, ox: winOffset.x, oy: winOffset.y };
        }}
      >
        <span className="font-semibold text-sm text-gray-300 whitespace-nowrap">Tờ Trình</span>
        <span className="text-gray-500 text-xs font-mono hidden sm:block">{proposal.proposalNumber}</span>
        {dirty && <span className="text-[11px] text-amber-300 whitespace-nowrap">● Chưa lưu</span>}

        <div className="ml-auto flex items-center gap-1.5">
          {(['settings', 'approval', 'style'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setSidebar(tab)}
              className={`text-xs px-2 py-1.5 rounded transition-colors whitespace-nowrap ${sidebar === tab ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
            >
              {tab === 'settings' ? '⚙ Cài đặt' : tab === 'approval' ? '✍ Phê duyệt' : '🎨 Màu'}
            </button>
          ))}
          <div className="w-px h-5 bg-gray-600" />
          {!readOnly && (
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-xs gap-1.5 h-8 whitespace-nowrap"
              onClick={() => saveMutation.mutate()}
              disabled={!model || !draft || saveMutation.isPending}
            >
              <Save size={13} /> {saveMutation.isPending ? 'Đang lưu...' : 'Lưu & xác nhận'}
            </Button>
          )}
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-xs gap-1.5 h-8 whitespace-nowrap"
            onClick={handleExport}
            disabled={!model || exporting}
          >
            <FileDown size={13} /> {exporting ? 'Đang xuất...' : dirty && !readOnly ? 'Lưu & xuất PDF' : 'Xuất PDF chính thức'}
          </Button>
          <div className="w-px h-5 bg-gray-600" />
          <button
            onClick={() => { setMaximized((m) => !m); setWinOffset({ x: 0, y: 0 }); }}
            className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
            title={maximized ? 'Thu nhỏ cửa sổ (có thể kéo)' : 'Phóng to toàn màn hình'}
          >
            {maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button onClick={onClose} aria-label="Đóng" className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ── Banners ─────────────────────────────────────────────────────────── */}
      {model?.sync.documentStale && (
        <div role="alert" className="flex items-start gap-2 bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-900 shrink-0">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            {model.sync.staleReason === 'LEGACY_UNVERIFIED'
              ? <>Tờ trình được lưu bằng phiên bản cũ. Các mục số liệu nay lấy trực tiếp từ Proposal{model.sync.legacyContentNotImported.length ? ` (${model.sync.legacyContentNotImported.length} mục soạn tay trước đây không còn được dùng)` : ''}. Vui lòng kiểm tra lại nội dung trước khi xuất hoặc trình duyệt.</>
              : STALE_DOCUMENT_MESSAGE}
            {!readOnly && <span className="block text-xs text-amber-700 mt-0.5">Bấm “Lưu” sau khi kiểm tra để xác nhận tờ trình khớp với dữ liệu hiện tại.</span>}
          </div>
        </div>
      )}
      {model?.status === 'REJECTED' && (
        <div role="alert" className="flex items-center gap-2 bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-800 shrink-0">
          <AlertTriangle size={16} className="shrink-0" />
          <span className="flex-1">
            Tờ trình{model.version ? ` phiên bản ${model.version.versionNumber}` : ''} đã bị từ chối. Bản đã trình được giữ nguyên; tạo bản tờ trình mới để chỉnh sửa và trình lại.
          </span>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => reviseMutation.mutate()} disabled={reviseMutation.isPending}>
            {reviseMutation.isPending ? 'Đang tạo…' : 'Tạo bản tờ trình mới'}
          </Button>
        </div>
      )}
      {model?.version?.liveDiffers && (
        <div role="alert" className="flex items-start gap-2 bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-900 shrink-0">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{LIVE_DIFFERS_MESSAGE} Nội dung bên dưới là phiên bản {model.version.versionNumber} đã trình và không bị thay đổi.</span>
        </div>
      )}
      {conflictMessage && (
        <div role="alert" className="flex items-center gap-2 bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-800 shrink-0">
          <AlertTriangle size={16} className="shrink-0" />
          <span className="flex-1">{conflictMessage} Tải lại sẽ bỏ các thay đổi chưa lưu trên màn hình này.</span>
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={reloadDocument}>
            <RefreshCw size={12} /> Tải lại tờ trình
          </Button>
        </div>
      )}
      {!!model?.warnings.length && (
        <ul className="bg-gray-50 border-b px-4 py-1.5 text-xs text-gray-600 shrink-0 list-disc list-inside">
          {model.warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 overflow-auto bg-gray-300 p-6">
          {isLoading && <div className="text-center text-sm text-gray-600 py-20">Đang tải tờ trình…</div>}
          {isError && (
            <div className="text-center text-sm text-red-700 py-20">
              Không tải được tờ trình. <button className="underline" onClick={() => refetch()}>Thử lại</button>
            </div>
          )}
          {model && draft && (
            <div
              data-testid="proposal-document-preview"
              className="bg-white mx-auto shadow-xl"
              style={{ width: '210mm', minHeight: '297mm', padding: '18mm 14mm 18mm 20mm', fontFamily: 'Roboto, Arial, sans-serif', fontSize: '10pt', lineHeight: 1.45, color: '#111' }}
            >
              {/* Letterhead */}
              <div className="flex items-start gap-3 mb-4">
                {draft.logoDataUrl && <img src={draft.logoDataUrl} alt="logo" style={{ maxWidth: 60, maxHeight: 60, objectFit: 'contain' }} />}
                <div className="flex-1 text-center font-bold">
                  {model.header.organisationLines.map((l) => <div key={l}>{l}</div>)}
                </div>
                <div className="text-right" style={{ fontSize: '9pt', width: 230 }}>
                  <div className="flex items-center justify-end gap-1">
                    <span>Số/No:</span>
                    <input
                      aria-label="Số tờ trình"
                      value={draft.docNumber}
                      readOnly={readOnly}
                      onChange={(e) => patch({ docNumber: e.target.value })}
                      className="w-40 bg-transparent text-right rounded px-1 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-1 italic">
                    <span>{model.header.city ?? '……'}, ngày</span>
                    <input
                      type="date"
                      aria-label="Ngày tờ trình"
                      value={draft.documentDate}
                      readOnly={readOnly}
                      onChange={(e) => patch({ documentDate: e.target.value })}
                      className="bg-transparent rounded px-1 hover:bg-blue-50 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="text-center font-bold mb-1" style={{ fontSize: '14pt', color: accent }}>{model.header.title}</div>
              <DocText label="Trích yếu" value={draft.subject} readOnly={readOnly} onChange={(v) => patch({ subject: v })} className="text-center font-bold mb-3" />
              <div className="text-center font-bold mb-3" style={{ fontSize: '11pt' }}>{model.header.addressee}</div>

              <ul className="mb-2 ml-5 list-disc">
                {draft.preamble.map((line, i) => (
                  <li key={i}>
                    <DocText
                      label={`Căn cứ ${i + 1}`}
                      value={line}
                      readOnly={readOnly}
                      onChange={(v) => patch({ preamble: draft.preamble.map((p, j) => (j === i ? v : p)) })}
                    />
                  </li>
                ))}
              </ul>
              <DocText label="Đoạn mở đầu" value={draft.bodyIntro} readOnly={readOnly} onChange={(v) => patch({ bodyIntro: v })} className="mb-3" />

              <div className="font-bold mb-1" style={{ color: accent }}>I.&nbsp;&nbsp;&nbsp;CÁC ĐIỀU KHOẢN CHI TIẾT ĐÃ THỎA THUẬN GIỮA HAI BÊN:</div>
              <div className="font-bold mb-2 ml-5">1.1&nbsp;&nbsp;Thương hiệu {model.facts.party.brandName ?? 'Chưa xác định'}</div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt', marginBottom: '14pt' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f0f0f0' }}>
                    {!readOnly && <th style={{ border: '0.5pt solid #999', width: '14pt' }} />}
                    <th style={{ border: '0.5pt solid #999', padding: '4pt 3pt', width: '22pt' }}>STT</th>
                    <th style={{ border: '0.5pt solid #999', padding: '4pt 3pt', width: '100pt' }}>HẠNG MỤC</th>
                    <th style={{ border: '0.5pt solid #999', padding: '4pt 3pt' }}>ĐIỀU KIỆN THƯƠNG MẠI</th>
                    <th style={{ border: '0.5pt solid #999', padding: '4pt 3pt', width: '80pt' }}>GHI CHÚ</th>
                  </tr>
                </thead>
                <tbody>
                  {orderedItems.map((item, idx) => {
                    if (!showStandardClauses && STANDARD_CLAUSES.includes(item.key)) return null;
                    const local = draft.items[item.key];
                    const narrative = local?.narrativeText ?? item.defaultNarrativeText;
                    const overridden = narrative !== item.defaultNarrativeText;
                    const plainLabel = item.label.split('\n')[0];
                    return (
                      <tr
                        key={item.key}
                        data-testid={`doc-row-${item.key}`}
                        draggable={!readOnly}
                        onDragStart={() => setRowDragKey(item.key)}
                        onDragOver={(e) => { e.preventDefault(); setRowDropKey(item.key); }}
                        onDrop={() => { if (rowDragKey) moveItem(rowDragKey, item.key); setRowDragKey(null); setRowDropKey(null); }}
                        onDragEnd={() => { setRowDragKey(null); setRowDropKey(null); }}
                        style={{
                          backgroundColor: rowDropKey === item.key && rowDragKey !== item.key ? '#dbeafe' : undefined,
                          opacity: rowDragKey === item.key ? 0.4 : 1,
                        }}
                      >
                        {!readOnly && (
                          <td style={{ border: '0.5pt solid #ddd', textAlign: 'center', cursor: 'grab' }} title="Kéo để đổi thứ tự">
                            <GripVertical size={11} style={{ margin: '0 auto', color: '#bbb' }} />
                          </td>
                        )}
                        <td style={{ border: '0.5pt solid #999', padding: '3pt', textAlign: 'center', verticalAlign: 'top' }}>{idx + 1}</td>
                        <td style={{ border: '0.5pt solid #999', padding: '3pt', verticalAlign: 'top', whiteSpace: 'pre-line' }}>{item.label}</td>
                        <td style={{ border: '0.5pt solid #999', padding: '3pt', verticalAlign: 'top' }}>
                          {item.factText && (
                            <div
                              data-testid={`doc-fact-${item.key}`}
                              title="Lấy từ dữ liệu Proposal — sửa tại Proposal, không sửa trong tờ trình"
                              className="relative rounded bg-slate-50 px-1 pr-4"
                              style={{ whiteSpace: 'pre-line' }}
                            >
                              {item.factText}
                              <Lock size={9} className="absolute right-1 top-1 text-slate-400" aria-hidden />
                            </div>
                          )}
                          {item.narrativeEditable && (
                            <div className={item.factText ? 'mt-1' : ''}>
                              <DocText
                                label={`Nội dung ${plainLabel}`}
                                value={narrative ?? ''}
                                readOnly={readOnly}
                                onChange={(v) => updateItem(item.key, 'narrativeText', v)}
                              />
                              {overridden && !readOnly && (
                                <button
                                  type="button"
                                  onClick={() => updateItem(item.key, 'narrativeText', null)}
                                  className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-blue-600 hover:underline"
                                >
                                  <RotateCcw size={9} /> Khôi phục nội dung mẫu
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td style={{ border: '0.5pt solid #999', padding: '3pt', verticalAlign: 'top', fontSize: '8pt', color: '#555', fontStyle: 'italic' }}>
                          <DocText label={`Ghi chú ${plainLabel}`} value={local?.note ?? ''} readOnly={readOnly} onChange={(v) => updateItem(item.key, 'note', v)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="font-bold mb-2" style={{ color: accent }}>II.&nbsp;&nbsp;LAYOUT MẶT BẰNG NHƯ SAU:</div>
              {draft.layoutImageDataUrl ? (
                <img src={draft.layoutImageDataUrl} alt="layout" style={{ maxWidth: '100%', border: '0.5pt solid #ccc', marginBottom: '12pt' }} />
              ) : (
                <div className="text-center text-gray-400 mb-4" style={{ fontSize: '9pt' }}>(Chưa đính kèm layout mặt bằng)</div>
              )}

              <DocText label="Đoạn kết" value={draft.closingLine} readOnly={readOnly} onChange={(v) => patch({ closingLine: v })} className="mb-4" />

              <ApprovalBlock model={model} />
            </div>
          )}
        </div>

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <div className="w-72 bg-white border-l border-gray-200 overflow-y-auto flex flex-col shrink-0">
          <div className="p-4 space-y-5 text-sm flex-1">
            {sidebar === 'settings' && draft && (
              <>
                <ImagePicker
                  title="Logo công ty"
                  value={draft.logoDataUrl}
                  readOnly={readOnly}
                  onPick={(e) => readImage(e, 'logoDataUrl')}
                  onClear={() => patch({ logoDataUrl: null })}
                />
                <ImagePicker
                  title="Ảnh layout mặt bằng (Mục II)"
                  value={draft.layoutImageDataUrl}
                  readOnly={readOnly}
                  onPick={(e) => readImage(e, 'layoutImageDataUrl')}
                  onClear={() => patch({ layoutImageDataUrl: null })}
                />

                {!readOnly && (
                  <div className="border-t border-gray-100 pt-3">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Phí & Điều khoản</div>
                    <div className="text-[11px] text-gray-400 mb-2">Lưu vào Proposal; tờ trình tự cập nhật theo.</div>
                    <div className="space-y-2">
                      <Field label="Thời hạn thanh toán (ngày)">
                        <input type="number" min={0} value={extraFields.paymentTermDays} onChange={setEF('paymentTermDays')} className="w-full border rounded px-2 py-1 text-xs" />
                      </Field>
                      <Field label="Giờ hoạt động">
                        <input value={extraFields.operatingHours} onChange={setEF('operatingHours')} placeholder="10:00–22:00 hằng ngày" className="w-full border rounded px-2 py-1 text-xs" />
                      </Field>
                      <div className="grid grid-cols-2 gap-2">
                        <Field label={`Phí tiện ích/tháng (${proposal.rentCurrency ?? '—'})`}>
                          <input type="number" value={extraFields.utilityFee} onChange={setEF('utilityFee')} className="w-full border rounded px-2 py-1 text-xs" />
                        </Field>
                        <Field label={`Phí ngoài giờ/giờ (${proposal.rentCurrency ?? '—'})`}>
                          <input type="number" value={extraFields.afterHoursFee} onChange={setEF('afterHoursFee')} className="w-full border rounded px-2 py-1 text-xs" />
                        </Field>
                      </div>
                      <Field label={`Cọc thuê (${proposal.rentCurrency ?? '—'}) — 0 = tính theo số tháng`}>
                        <input type="number" min={0} value={extraFields.depositLease} onChange={setEF('depositLease')} className="w-full border rounded px-2 py-1 text-xs" />
                      </Field>
                      <div className="grid grid-cols-2 gap-2">
                        <Field label={`Cọc thi công (${proposal.rentCurrency ?? '—'})`}>
                          <input type="number" value={extraFields.depositFitout} onChange={setEF('depositFitout')} className="w-full border rounded px-2 py-1 text-xs" />
                        </Field>
                        <Field label={`Phí thi công (${proposal.rentCurrency ?? '—'})`}>
                          <input type="number" value={extraFields.fitoutFee} onChange={setEF('fitoutFee')} className="w-full border rounded px-2 py-1 text-xs" />
                        </Field>
                      </div>
                      <button
                        onClick={() => saveExtraMutation.mutate()}
                        disabled={saveExtraMutation.isPending}
                        className="w-full mt-1 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        {saveExtraMutation.isPending ? 'Đang lưu...' : 'Lưu Phí & Điều khoản'}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setShowStandardClauses(!showStandardClauses)}
                  className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-800"
                >
                  {showStandardClauses ? <EyeOff size={13} /> : <Eye size={13} />}
                  {showStandardClauses ? 'Ẩn' : 'Hiện'} điều khoản chuẩn khi soạn
                </button>
                <div className="text-xs text-gray-400 bg-gray-50 rounded p-2 space-y-1">
                  <div><Lock size={10} className="inline mr-1" />Ô có biểu tượng khoá lấy từ dữ liệu Proposal và không sửa trong tờ trình.</div>
                  <div>PDF chính thức luôn do hệ thống tạo — cùng một bản cho người lập, danh sách Proposal và màn phê duyệt.</div>
                </div>
              </>
            )}

            {sidebar === 'approval' && model && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Người lập & phê duyệt</div>
                <div className="text-xs text-gray-500">Lấy từ quy trình phê duyệt thực tế; không nhập tay.</div>
                <ApprovalList model={model} />
              </div>
            )}

            {sidebar === 'style' && draft && (
              <>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Màu tiêu đề</div>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      disabled={readOnly}
                      aria-label={`Màu ${c}`}
                      onClick={() => patch({ primaryColor: c })}
                      className={`w-8 h-8 rounded-full border-4 ${draft.primaryColor === c ? 'border-gray-800' : 'border-gray-200'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <div className="mt-3 text-xs text-gray-400 bg-gray-50 rounded p-2">
                  PDF chính thức dùng phông Roboto hỗ trợ đầy đủ tiếng Việt.
                </div>
              </>
            )}
          </div>

          <div className="p-3 border-t bg-gray-50 space-y-2">
            {model && <DocumentStatus model={model} />}
            {!readOnly && (
              <Button className="w-full gap-2 text-sm bg-green-600 hover:bg-green-700" onClick={() => saveMutation.mutate()} disabled={!model || !draft || saveMutation.isPending}>
                <Save size={14} /> {saveMutation.isPending ? 'Đang lưu...' : 'Lưu & xác nhận tờ trình'}
              </Button>
            )}
            <Button variant="outline" className="w-full gap-2 text-sm" onClick={handleExport} disabled={!model || exporting}>
              <FileDown size={14} /> Xuất PDF chính thức
            </Button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

/** Draft vs submitted, source freshness, and which version this is. */
/** Text and symbol carry the state; colour only reinforces it. */
const REVIEW_LABELS = {
  NOT_REVIEWED: { text: 'CHƯA XÁC NHẬN', icon: '○', cls: 'border-slate-300 bg-slate-50 text-slate-700' },
  REVIEWED: { text: 'ĐÃ XÁC NHẬN', icon: '✓', cls: 'border-green-300 bg-green-50 text-green-800' },
  STALE: { text: 'CẦN KIỂM TRA LẠI', icon: '!', cls: 'border-amber-300 bg-amber-50 text-amber-900' },
} as const;

function DocumentStatus({ model }: { model: ProposalDocumentModel }) {
  if (model.version) {
    return (
      <div data-testid="document-status" className="text-[11px] text-gray-600 space-y-0.5">
        <div className="font-semibold text-gray-700">Tờ trình đã trình · phiên bản {model.version.versionNumber}</div>
        <div>Trình lúc: {formatDateTime(model.version.submittedAt)}</div>
        <div>Người trình: {model.version.submittedByName ?? 'Không xác định'}</div>
        <div>Trạng thái phiên bản: {model.version.status}</div>
      </div>
    );
  }
  const review = REVIEW_LABELS[model.sync.reviewState];
  return (
    <div data-testid="document-status" className="text-[11px] text-gray-600 space-y-0.5">
      <div className="font-semibold text-gray-700">Bản nháp</div>
      <div data-testid="review-state" className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-semibold ${review.cls}`}>
        <span aria-hidden>{review.icon}</span> {review.text}
      </div>
      {model.sync.reviewState !== 'NOT_REVIEWED' && (
        <div>Xác nhận bởi: {model.sync.reviewedByName ?? 'Không xác định'}{model.sync.reviewedAt ? ` · ${formatDateTime(model.sync.reviewedAt)}` : ''}</div>
      )}
      <div>Dữ liệu nguồn: {model.sync.reviewState === 'STALE' || model.sync.documentStale ? 'đã thay đổi — cần kiểm tra lại' : model.sync.reviewState === 'REVIEWED' ? 'khớp với lần xác nhận gần nhất' : 'chưa được xác nhận'}</div>
      <div>Phiên bản nội dung: {model.sync.contentVersion}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] text-gray-500 block mb-0.5">{label}</span>
      {children}
    </label>
  );
}

function ImagePicker({ title, value, readOnly, onPick, onClear }: {
  title: string;
  value: string | null;
  readOnly: boolean;
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{title}</div>
      {value ? (
        <div className="relative inline-block">
          <img src={value} alt={title} className="max-h-24 object-contain border rounded" />
          {!readOnly && (
            <button onClick={onClear} aria-label={`Xoá ${title}`} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]">×</button>
          )}
        </div>
      ) : readOnly ? (
        <div className="text-xs text-gray-400">Không có</div>
      ) : (
        <label className="cursor-pointer flex items-center gap-2 text-xs text-blue-600 border border-dashed border-blue-300 rounded p-2 hover:bg-blue-50">
          {title.startsWith('Logo') ? <Upload size={14} /> : <Image size={14} />} Tải ảnh PNG/JPEG (≤ 2 MB)
          <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={onPick} />
        </label>
      )}
    </div>
  );
}

const PRESENTATION_LABEL = {
  APPROVED_BY: { text: 'Đã duyệt', cls: 'text-green-700' },
  REJECTED_BY: { text: 'Từ chối', cls: 'text-red-700' },
  EXPECTED_APPROVER: { text: 'Người duyệt dự kiến — chưa duyệt', cls: 'text-gray-500' },
  SKIPPED: { text: 'Bỏ qua', cls: 'text-gray-400' },
} as const;

/** Same wording as the official PDF (proposal-pdf.service approvalNotice). */
export function approvalNotice(approval: ProposalDocumentModel['approval']): string | null {
  if (approval.state === 'WITHDRAWN') return 'Tờ trình đã được thu hồi để chỉnh sửa — phiên bản này không còn hiệu lực phê duyệt.';
  if (approval.state !== 'NOT_SUBMITTED') return null;
  if (!approval.steps.length) {
    return approval.preview && !approval.preview.policyConfigured
      ? 'Chưa trình duyệt — Mall chưa cấu hình quy trình phê duyệt.'
      : 'Chưa trình duyệt — quy trình phê duyệt được xác định khi Proposal được trình.';
  }
  return 'Chưa trình duyệt — quy trình phê duyệt dự kiến theo cấu hình hiện tại, được chốt khi trình duyệt.';
}

const UNASSIGNED_APPROVER = 'Chưa có người phụ trách';

function RouteIssues({ model }: { model: ProposalDocumentModel }) {
  const issues = model.approval.preview?.issues ?? [];
  if (!issues.length) return null;
  return (
    <div role="alert" data-testid="route-preview-issues" className="rounded border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900">
      <div className="font-semibold">Chưa thể trình duyệt với cấu hình hiện tại:</div>
      <ul className="mt-1 list-disc pl-4">
        {issues.map((issue, i) => (
          <li key={i}>{issue.stepOrder ? `Bước ${issue.stepOrder}${issue.stepName ? ` (${issue.stepName})` : ''}: ` : ''}{ROUTING_REASON_LABELS[issue.reason] ?? issue.reason}</li>
        ))}
      </ul>
    </div>
  );
}

function ApprovalList({ model }: { model: ProposalDocumentModel }) {
  const notice = approvalNotice(model.approval);
  return (
    <ol className="space-y-2">
      <li className="border rounded p-2">
        <div className="text-[11px] font-semibold text-gray-500">NGƯỜI LẬP</div>
        <div className="font-medium">{model.facts.preparedBy.fullName ?? 'Không xác định'}</div>
      </li>
      {notice && <li data-testid="approval-notice" className="text-xs italic text-gray-500">{notice}</li>}
      <li className="list-none"><RouteIssues model={model} /></li>
      {model.approval.steps.map((s) => (
        <li key={`${s.stepOrder}-${s.stepName}`} data-testid={`approval-step-${s.stepOrder}`} className="border rounded p-2">
          <div className="text-[11px] font-semibold text-gray-500">{s.stepOrder}. {s.stepName}</div>
          <div className={`text-[11px] ${PRESENTATION_LABEL[s.presentation].cls}`}>{PRESENTATION_LABEL[s.presentation].text}</div>
          <div className="font-medium">{s.approverName ?? UNASSIGNED_APPROVER}</div>
          {s.decidedAt && <div className="text-[11px] text-gray-500">{formatDateTime(s.decidedAt)}</div>}
          {s.comment && <div className="text-[11px] italic text-gray-500">Ý kiến: {s.comment}</div>}
        </li>
      ))}
    </ol>
  );
}

function ApprovalBlock({ model }: { model: ProposalDocumentModel }) {
  const notice = approvalNotice(model.approval);
  const hasSteps = model.approval.steps.length > 0;
  return (
    <div data-testid="document-approval-block">
      {notice && hasSteps && <div className="mb-1 italic text-gray-500" style={{ fontSize: '8pt' }}>{notice}</div>}
      <div className="grid grid-cols-4 border-l border-t" style={{ borderColor: '#999', fontSize: '8pt' }}>
        <div className="border-r border-b p-2 text-center" style={{ borderColor: '#999' }}>
          <div className="font-bold">NGƯỜI LẬP</div>
          <div className="mt-6 font-bold" style={{ fontSize: '9pt' }}>{model.facts.preparedBy.fullName ?? 'Không xác định'}</div>
        </div>
        {notice && !hasSteps && (
          <div className="col-span-3 border-r border-b p-2 text-center italic text-gray-500" style={{ borderColor: '#999' }}>
            {notice}
          </div>
        )}
        {model.approval.steps.map((s) => (
          <div key={`${s.stepOrder}-${s.stepName}`} className="border-r border-b p-2 text-center" style={{ borderColor: '#999' }}>
            <div className="font-bold uppercase">{s.stepName}</div>
            <div className={PRESENTATION_LABEL[s.presentation].cls}>{PRESENTATION_LABEL[s.presentation].text}</div>
            <div className="mt-3" style={{ fontSize: '9pt' }}>{s.approverName ?? UNASSIGNED_APPROVER}</div>
            {s.decidedAt && <div className="text-gray-500">{formatDateTime(s.decidedAt)}</div>}
            {s.comment && <div className="italic text-gray-500">Ý kiến: {s.comment}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
