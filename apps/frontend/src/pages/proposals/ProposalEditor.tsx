import { useState, useRef, useCallback, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { proposalsApi } from '@/api';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  X, Printer, Save, Upload, Image, Type,
  Plus, Trash2, Eye, EyeOff, Maximize2, Minimize2, GripVertical,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DocItem {
  label: string;
  content: string;
  note: string;
  locked?: boolean; // standard clauses user shouldn't accidentally delete
}

interface Signatory {
  title: string;
  name: string;
}

export interface EditorContent {
  logoBase64: string;
  layoutImageBase64: string;
  font: string;
  primaryColor: string;
  docNumber: string;
  dateDay: string;
  dateMonth: string;
  dateYear: string;
  brandTitle: string;      // "1.1 Thương hiệu ..."
  preamble: string[];
  bodyIntro: string;
  items: DocItem[];
  signatories: Signatory[];
  closingLine: string;
}

// ── Font options ───────────────────────────────────────────────────────────────

const FONTS = [
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Roboto', value: 'Roboto, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Courier New', value: '"Courier New", monospace' },
];

const COLORS = ['#1a237e', '#1e3a5f', '#2c3e50', '#1b5e20', '#4a148c', '#212121'];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(d?: string | null) {
  if (!d) return '…/…/20……';
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtMoney(v: number, currency = 'VND') {
  if (currency === 'USD') return `$${v?.toLocaleString('en-US', { maximumFractionDigits: 2 })} USD`;
  return `${v?.toLocaleString('vi-VN')} VND`;
}

function initEditorContent(p: any): EditorContent {
  const isUSD = (p.rentCurrency ?? 'VND') === 'USD';
  const fmtR = (v: number) => fmtMoney(v, p.rentCurrency ?? 'VND');
  const fmtS = (v: number) => fmtMoney(v, isUSD ? 'USD' : 'VND');

  const brandName = p.tenant?.brandName ?? p.lead?.brandName ?? '[…]';
  const companyName = p.tenant?.companyName ?? p.lead?.company ?? '[…]';
  const industry = p.tenant?.preferredCategory ?? p.lead?.category ?? '[…]';
  const unitCode = p.unit?.code ?? '[…]';
  const floorName = p.unit?.floor?.name ?? '[…]';
  const zoneName = p.unit?.zone?.name ?? '';
  const unitLocation = zoneName ? `${unitCode}, ${zoneName}, ${floorName}` : `${unitCode}, ${floorName}`;
  const mallName = p.unit?.floor?.mall?.name ?? p.unit?.mall?.name ?? 'Thiso Mall';
  const termYears = Math.round((p.term ?? 0) / 12);
  const depositMonths = p.deposit ?? 3;
  const depositWord = depositMonths === 3 ? 'ba' : depositMonths === 2 ? 'hai' : depositMonths === 1 ? 'một' : String(depositMonths);

  const saved: EditorContent | null = p.editorContent ?? null;

  const today = new Date();

  const defaultItems: DocItem[] = [
    { label: 'Tên Pháp nhân', content: companyName, note: '' },
    { label: 'Tên Thương hiệu', content: brandName, note: '' },
    { label: 'Ngành hàng Kinh doanh', content: industry, note: '' },
    { label: 'Mô hình Kinh doanh', content: p.businessModel ?? '[…]', note: '' },
    { label: 'Vị trí chào thuê', content: unitLocation, note: 'Layout chi tiết đính kèm phần II' },
    {
      label: 'Diện tích',
      content: `Tổng diện tích: ${(p.area ?? 0).toLocaleString('vi-VN')} m²\nDiện tích này được tạm tính vào thời điểm Bên Cho Thuê phát hành Thư Đề Nghị Cho Thuê. Diện Tích Thuê thực tế sẽ xác nhận sau khi đo đạc và các Bên xác nhận vào Ngày Bàn giao Mặt bằng.`,
      note: '',
    },
    { label: 'Thời hạn thuê', content: `${termYears} năm (${p.term ?? 0} tháng) kể từ Ngày Bàn giao.`, note: '' },
    {
      label: 'Ngày bắt đầu tính Tiền thuê',
      content: '• Ngày bắt đầu tính Tiền thuê là Ngày Bàn giao.\n• Tiền thuê trong Thời hạn hoàn thiện nội thất (từ Ngày Bàn giao đến trước ngày Khai trương): Bên Thuê sẽ không phải thanh toán Tiền Thuê, Phí Dịch vụ và Phí hỗ trợ Kinh doanh.',
      note: '',
    },
    {
      label: 'Giá thuê\n(Chưa bao gồm Thuế GTGT)',
      content: `Năm 1 của Thời hạn thuê:\nGiá thuê: ${fmtR(p.rentPerSqm ?? 0)}/m²/tháng\nTừ năm 2 trở đi, giá thuê tăng ${p.escalationPercent ?? 5}% so với năm liền kề trước đó.`,
      note: '',
    },
    { label: 'Phí Dịch vụ', content: `${fmtS(p.serviceFeeSqm ?? p.camPerSqm ?? 0)}/m²/tháng\n(Chưa bao gồm Thuế GTGT).`, note: '' },
    { label: 'Phí hỗ trợ Kinh doanh', content: `${fmtS(p.businessSupportFeeSqm ?? 0)}/m²/tháng\n(Chưa bao gồm Thuế GTGT).`, note: '' },
    {
      label: 'Phí tiện ích',
      content: 'Các Phí tiện ích: điện, nước, gas, … trong phần Diện Tích Thuê của Khách thuê sẽ được tính theo đồng hồ tiêu thụ được cấp tại khu vực thuê và được thanh toán bởi Bên Thuê.',
      note: '',
      locked: true,
    },
    {
      label: 'Thời gian hoạt động của TTTM',
      content: p.operatingHours ?? 'Thứ 2 – Thứ 6:   10:00 – 22:00\nThứ 7 – Chủ nhật: 09:30 – 22:00',
      note: '',
      locked: true,
    },
    {
      label: 'Phí Dịch vụ ngoài giờ',
      content: p.afterHoursFee
        ? `Phí ngoài giờ: ${fmtS(p.afterHoursFee)}/giờ. Các chi phí liên quan đến hoạt động ngoài giờ sẽ được Bên Thuê thanh toán theo quy định của TTTM.`
        : 'Các chi phí liên quan đến hoạt động ngoài giờ sẽ được Bên Thuê thanh toán theo quy định của TTTM.',
      note: '',
      locked: true,
    },
    {
      label: 'Tỷ giá',
      content: '• Tỷ giá áp dụng cho Tiền thuê là tỷ giá bán ra của Ngân hàng TMCP Ngoại Thương Việt Nam vào ngày Bên Cho Thuê ban hành Thư Đề Nghị Cho Thuê/ Hợp Đồng Thuê.\n• Tỷ giá áp dụng cho Phí Dịch vụ và Phí hỗ trợ Kinh doanh là tỷ giá áp dụng đồng nhất cho Khách thuê tại TTTM: tỷ giá 26.340 VND/USD.',
      note: '',
      locked: true,
    },
    {
      label: 'Thanh toán Tiền thuê',
      content: '• Bên Thuê thanh toán Tiền thuê cho Bên Cho Thuê trong vòng 05 (năm) ngày đầu tiên của mỗi Tháng.\n• Tiền thuê bao gồm: Tiền thuê, Phí Dịch vụ, Phí hỗ trợ Kinh doanh và các chi phí phát sinh (đã bao gồm Thuế GTGT).',
      note: '',
      locked: true,
    },
    {
      label: 'Tiền Đặt Cọc',
      content: (() => {
        const leaseDeposit = p.depositLease
          ? `Tiền Đặt cọc: ${fmtR(p.depositLease)} (tương đương ${depositMonths} tháng tiền thuê và Phí Dịch vụ)`
          : `Tiền Đặt cọc tương đương ${depositMonths} (${depositWord}) tháng Tiền thuê và Phí Dịch vụ`;
        const fitoutParts: string[] = [];
        if (p.depositFitout) fitoutParts.push(`Cọc thi công: ${fmtR(p.depositFitout)}`);
        if (p.fitoutFee) fitoutParts.push(`Phí thi công: ${fmtR(p.fitoutFee)}`);
        const extra = fitoutParts.length ? '\n' + fitoutParts.join('\n') : '';
        return `${leaseDeposit} (không bao gồm Thuế GTGT) và sẽ được thanh toán trong vòng 07 (bảy) ngày kể từ ngày ký Thư Đề Nghị Cho Thuê.${extra}`;
      })(),
      note: '',
    },
    {
      label: 'Thời hạn hoàn thiện nội thất',
      content: `Dự kiến ${p.fitoutDays ?? 90} ngày kể từ Ngày Bàn giao.\nNgày Khai trương dự kiến: ${fmtDate(p.openingDate)}`,
      note: '',
    },
    {
      label: 'Phí Thi công',
      content: 'Bên Thuê thanh toán cho Bên Cho Thuê trước Ngày Bàn giao. Trong trường hợp có ngày ngưng thi công thực tế do lỗi của Bên Cho Thuê, Bên Cho Thuê sẽ giảm trừ phần Tiền Phí thi công cho những ngày ngưng thi công thực tế vào Tiền thuê của tháng đầu tiên của Thời hạn thuê.',
      note: '',
    },
    {
      label: 'Ngày Bàn giao Mặt bằng',
      content: p.handoverDate
        ? `Dự kiến ngày ${fmtDate(p.handoverDate)} hoặc một ngày khác theo thông báo của Trung tâm thương mại ${mallName} bằng văn bản trước 07 (bảy) ngày.`
        : `Dự kiến ngày …/…/20…… hoặc một ngày khác theo thông báo của Trung tâm thương mại ${mallName} bằng văn bản trước 07 (bảy) ngày.`,
      note: '',
    },
    { label: 'Điều kiện đặc biệt', content: p.specialConditions ?? p.notes ?? '[…]', note: '' },
  ];

  const year = new Date().getFullYear();
  const seq = p.proposalNumber?.split('-')[2] ?? '…';

  return saved ?? {
    logoBase64: '',
    layoutImageBase64: '',
    font: '"Times New Roman", Times, serif',
    primaryColor: '#1a237e',
    docNumber: `${seq}/${year}/TTr-CTTTTM`,
    dateDay: String(today.getDate()).padStart(2, '0'),
    dateMonth: String(today.getMonth() + 1).padStart(2, '0'),
    dateYear: String(today.getFullYear()),
    brandTitle: `Thương hiệu ${brandName}`,
    preamble: [
      `Căn cứ nhu cầu thuê mặt bằng kinh doanh của Khách Thuê ${brandName} thuộc Công ty ${companyName} tại Dự Án Trung Tâm Thương Mại ${mallName};`,
      `Căn cứ kế hoạch chốt thuê cho các Khách Thuê tại TTTM ${mallName};`,
      'Căn cứ các yêu cầu đề xuất, điều kiện thoả thuận, phạm vi công việc đã được Các Bên thống nhất.',
    ],
    bodyIntro: `Phòng cho thuê TTTM kính trình Ban Tổng Giám Đốc phê duyệt Đề xuất Cho Thuê cho Khách Thuê ${brandName} tại TTTM ${mallName}, bao gồm các nội dung chính sau:`,
    items: defaultItems,
    signatories: [
      { title: 'TRƯỞNG PHÒNG CHO THUÊ TTTM', name: p.createdBy?.fullName ?? 'PHẠM THỊ KHÁNH TRANG' },
      { title: 'BAN KẾ TOÁN THISO', name: 'NGUYỄN ĐÌNH CÔNG' },
      { title: 'PHÓ TỔNG GIÁM ĐỐC THƯỜNG TRỰC THISO', name: 'TRẦN VIÊN NGỌC OANH' },
    ],
    closingLine: 'Phòng cho thuê TTTM kính trình Ban Tổng Giám đốc xem xét và phê duyệt.',
  };
}

// ── EditableCell ───────────────────────────────────────────────────────────────

function EditableCell({ value, onChange, multiline = true, className = '' }: {
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

  if (editing) {
    const rows = Math.max(2, draft.split('\n').length + 1);
    return multiline ? (
      <textarea
        ref={ref as React.RefObject<HTMLTextAreaElement>}
        value={draft}
        rows={rows}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { onChange(draft); setEditing(false); }}
        onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
        className={`w-full resize-none border border-blue-400 rounded bg-blue-50 p-1 text-sm focus:outline-none ${className}`}
      />
    ) : (
      <input
        ref={ref as React.RefObject<HTMLInputElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { onChange(draft); setEditing(false); }}
        onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(value); setEditing(false); } else if (e.key === 'Enter') { onChange(draft); setEditing(false); } }}
        className={`w-full border border-blue-400 rounded bg-blue-50 px-2 py-0.5 text-sm focus:outline-none ${className}`}
      />
    );
  }

  return (
    <div
      onClick={() => { setDraft(value); setEditing(true); }}
      className={`cursor-text hover:bg-blue-50 hover:ring-1 hover:ring-blue-200 rounded px-1 min-h-[20px] whitespace-pre-wrap text-sm group relative ${className}`}
      title="Click để chỉnh sửa"
    >
      {value || <span className="text-gray-300 italic text-xs">[trống — click để nhập]</span>}
      <span className="absolute top-0 right-0 text-[9px] text-blue-300 opacity-0 group-hover:opacity-100 px-1">✎</span>
    </div>
  );
}

// ── Main Editor ────────────────────────────────────────────────────────────────

export function ProposalEditorDialog({ proposal, onClose }: {
  proposal: any;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [doc, setDoc] = useState<EditorContent>(() => initEditorContent(proposal));
  const [sidebar, setSidebar] = useState<'settings' | 'signatories' | 'style'>('settings');
  const [showLockedItems, setShowLockedItems] = useState(true);

  // GAP #41, #91–94 — editable proposal fields (saved separately from editorContent)
  const [extraFields, setExtraFields] = useState({
    utilityFee:      proposal.utilityFee      ?? 0,
    operatingHours:  proposal.operatingHours  ?? '',
    afterHoursFee:   proposal.afterHoursFee   ?? 0,
    paymentTermDays: proposal.paymentTermDays ?? 30,
    depositLease:    proposal.depositLease    ?? 0,  // 0 = tính tự động từ deposit × monthlyRent
    depositFitout:   proposal.depositFitout   ?? 0,
    fitoutFee:       proposal.fitoutFee       ?? 0,
  });
  const setEF = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setExtraFields((f) => ({ ...f, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value }));

  const extraFieldsPayload = () => ({
      utilityFee:      extraFields.utilityFee,
      operatingHours:  extraFields.operatingHours || undefined,
      afterHoursFee:   extraFields.afterHoursFee,
      paymentTermDays: extraFields.paymentTermDays,
      // depositLease = 0 → gửi null → DB lưu null → tính tự động
      depositLease:    extraFields.depositLease > 0 ? extraFields.depositLease : null,
      depositFitout:   extraFields.depositFitout,
      fitoutFee:       extraFields.fitoutFee,
  });

  const refreshProposal = () => {
    qc.invalidateQueries({ queryKey: ['proposal-detail', proposal.id] });
    qc.invalidateQueries({ queryKey: ['proposal-versions', proposal.id] });
    qc.invalidateQueries({ queryKey: ['proposals'] });
  };

  const saveExtraMutation = useMutation({
    mutationFn: () => proposalsApi.updateDocFields(proposal.id, extraFieldsPayload()),
    onSuccess: () => { refreshProposal(); toast({ title: 'Đã lưu phí & điều khoản' }); },
    onError: (error: any) => toast({ title: error?.response?.data?.message ?? 'Lỗi khi lưu', variant: 'destructive' }),
  });
  const printAreaRef = useRef<HTMLDivElement>(null);

  // Draggable window
  const [maximized, setMaximized] = useState(true);
  const [winOffset, setWinOffset] = useState({ x: 0, y: 0 });
  const isDraggingWin = useRef(false);
  const winDragStart = useRef({ mx: 0, my: 0, ox: 0, oy: 0 });

  // Row drag-to-reorder
  const [rowDragIdx, setRowDragIdx] = useState<number | null>(null);
  const [rowDropIdx, setRowDropIdx] = useState<number | null>(null);

  // Window drag listeners
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

  const update = useCallback(<K extends keyof EditorContent>(key: K, value: EditorContent[K]) => {
    setDoc((d) => ({ ...d, [key]: value }));
  }, []);

  const reorderItems = useCallback((from: number, to: number) => {
    setDoc((d) => {
      const items = [...d.items];
      const [moved] = items.splice(from, 1);
      items.splice(to, 0, moved);
      return { ...d, items };
    });
  }, []);

  const updateItem = useCallback((idx: number, field: 'content' | 'note' | 'label', value: string) => {
    setDoc((d) => ({
      ...d,
      items: d.items.map((item, i) => i === idx ? { ...item, [field]: value } : item),
    }));
  }, []);

  const updateSignatory = useCallback((idx: number, field: 'title' | 'name', value: string) => {
    setDoc((d) => ({
      ...d,
      signatories: d.signatories.map((s, i) => i === idx ? { ...s, [field]: value } : s),
    }));
  }, []);

  const updatePreamble = useCallback((idx: number, value: string) => {
    setDoc((d) => ({ ...d, preamble: d.preamble.map((p, i) => i === idx ? value : p) }));
  }, []);

  // File upload helpers
  const toBase64 = (file: File): Promise<string> =>
    new Promise((res) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result as string);
      reader.readAsDataURL(file);
    });

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const b64 = await toBase64(file);
    update('logoBase64', b64);
  };

  const handleLayoutImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const b64 = await toBase64(file);
    update('layoutImageBase64', b64);
  };

  // Save to DB
  const saveMutation = useMutation({
    mutationFn: () => Promise.all([
      proposalsApi.saveEditorContent(proposal.id, doc),
      proposalsApi.updateDocFields(proposal.id, extraFieldsPayload()),
    ]),
    onSuccess: () => { refreshProposal(); toast({ title: 'Đã lưu toàn bộ nội dung Proposal' }); },
    onError: (error: any) => toast({ title: error?.response?.data?.message ?? 'Lỗi khi lưu Proposal', variant: 'destructive' }),
  });

  // Print
  const handlePrint = () => {
    if (!printAreaRef.current) {
      toast({ title: 'Không tìm thấy nội dung để in', variant: 'destructive' });
      return;
    }
    const printWindow = window.open('', '_blank', 'width=1000,height=800');
    if (!printWindow) {
      toast({ title: 'Trình duyệt đang chặn cửa sổ in. Vui lòng cho phép popup.', variant: 'destructive' });
      return;
    }
    printWindow.opener = null;
    printWindow.document.open();
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${proposal.proposalNumber}</title><style>
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: white; }
      body { font-family: ${JSON.stringify(doc.font)}; color: #111; }
      .no-print { display: none !important; }
      #proposal-print-area { width: 210mm; margin: 0 auto; box-shadow: none !important; }
      textarea, input { border: 0; resize: none; font: inherit; color: inherit; background: transparent; }
      @page { size: A4; margin: 0; }
      @media print { #proposal-print-area { margin: 0; } }
    </style></head><body>${printAreaRef.current.outerHTML}</body></html>`);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  };

  const addSignatory = () => {
    setDoc((d) => ({ ...d, signatories: [...d.signatories, { title: 'CHỨC DANH', name: 'HỌ VÀ TÊN' }] }));
  };

  const removeSignatory = (idx: number) => {
    setDoc((d) => ({ ...d, signatories: d.signatories.filter((_, i) => i !== idx) }));
  };

  const primaryHex = doc.primaryColor;

  return (
    <>
      {/* Backdrop khi chế độ cửa sổ (nhấn ra ngoài không đóng vì có nội dung) */}
      {!maximized && <div className="fixed inset-0 z-[199] bg-black/30 pointer-events-none" />}
      <div
        className={`fixed z-[200] bg-white flex flex-col ${maximized ? 'inset-0' : 'shadow-2xl rounded-lg overflow-hidden'}`}
        style={maximized ? {} : {
          left: `calc(5vw + ${winOffset.x}px)`,
          top: `calc(4vh + ${winOffset.y}px)`,
          width: '90vw',
          height: '92vh',
        }}
      >
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div
        className={`no-print flex items-center gap-2 px-4 py-2 bg-gray-900 text-white shrink-0 select-none ${!maximized ? 'cursor-move' : ''}`}
        onMouseDown={(e) => {
          if (maximized) return;
          const target = e.target as HTMLElement;
          if (target.closest('button,select,label,input,a')) return;
          isDraggingWin.current = true;
          winDragStart.current = { mx: e.clientX, my: e.clientY, ox: winOffset.x, oy: winOffset.y };
        }}
      >
        <span className="font-semibold text-sm text-gray-300 whitespace-nowrap">Tờ Trình</span>
        <span className="text-gray-500 text-xs font-mono hidden sm:block">{proposal.proposalNumber}</span>

        <div className="ml-auto flex items-center gap-1.5">
          {/* Font selector */}
          <div className="relative">
            <select
              value={doc.font}
              onChange={(e) => update('font', e.target.value)}
              className="text-xs bg-gray-700 text-white border-0 rounded px-2 py-1.5 cursor-pointer appearance-none pr-5"
              style={{ maxWidth: '130px' }}
            >
              {FONTS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <Type size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          <div className="w-px h-5 bg-gray-600" />

          {/* Sidebar tabs */}
          {(['settings', 'signatories', 'style'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setSidebar(tab)}
              className={`text-xs px-2 py-1.5 rounded transition-colors whitespace-nowrap ${sidebar === tab ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
            >
              {tab === 'settings' ? '⚙ Cài đặt' : tab === 'signatories' ? '✍ Ký tên' : '🎨 Style'}
            </button>
          ))}

          <div className="w-px h-5 bg-gray-600" />

          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-xs gap-1.5 h-8 whitespace-nowrap"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            <Save size={13} /> {saveMutation.isPending ? 'Đang lưu...' : 'Lưu'}
          </Button>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-xs gap-1.5 h-8 whitespace-nowrap"
            onClick={handlePrint}
          >
            <Printer size={13} /> In / PDF
          </Button>

          <div className="w-px h-5 bg-gray-600" />

          <button
            onClick={() => { setMaximized((m) => !m); setWinOffset({ x: 0, y: 0 }); }}
            className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
            title={maximized ? 'Thu nhỏ cửa sổ (có thể kéo)' : 'Phóng to toàn màn hình'}
          >
            {maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* Document area */}
        <div className="flex-1 overflow-auto bg-gray-300 p-6">
          <div
            id="proposal-print-area"
            ref={printAreaRef}
            style={{ fontFamily: doc.font }}
            className="bg-white mx-auto shadow-xl"
            css-width="210mm"
          >
            <div style={{ width: '210mm', minHeight: '297mm', padding: '18mm 14mm 18mm 20mm', margin: '0 auto', fontFamily: doc.font, fontSize: '10pt', lineHeight: '1.5' }}>

              {/* ── Letterhead ─── */}
              <table style={{ width: '100%', marginBottom: '12pt' }}>
                <tbody>
                  <tr>
                    <td style={{ width: '60px', verticalAlign: 'top', paddingRight: '8pt' }}>
                      {doc.logoBase64 ? (
                        <img src={doc.logoBase64} alt="logo" style={{ maxWidth: '60px', maxHeight: '60px', objectFit: 'contain' }} />
                      ) : (
                        <label className="no-print cursor-pointer block w-16 h-16 border-2 border-dashed border-gray-300 rounded flex items-center justify-center hover:border-blue-400 transition-colors" title="Upload logo">
                          <div className="text-center">
                            <Image size={18} className="mx-auto text-gray-300" />
                            <div className="text-[9px] text-gray-400 mt-0.5">Logo</div>
                          </div>
                          <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                        </label>
                      )}
                    </td>
                    <td style={{ verticalAlign: 'top', textAlign: 'center' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '10pt' }}>KHỐI KINH DOANH BĐS TM & DV</div>
                      <div style={{ fontWeight: 'bold', fontSize: '10pt' }}>PHÒNG CHO THUÊ TTTM</div>
                    </td>
                    <td style={{ verticalAlign: 'top', textAlign: 'right', whiteSpace: 'nowrap', width: '200px' }}>
                      <div style={{ fontSize: '9pt' }}>
                        Số/No: <EditableCell value={doc.docNumber} onChange={(v) => update('docNumber', v)} multiline={false} className="inline-block min-w-[100px]" />
                      </div>
                      <div style={{ fontSize: '9pt', fontStyle: 'italic', marginTop: '2pt' }}>
                        TP.HCM, ngày{' '}
                        <EditableCell value={doc.dateDay} onChange={(v) => update('dateDay', v)} multiline={false} className="inline-block w-8 text-center" /> tháng{' '}
                        <EditableCell value={doc.dateMonth} onChange={(v) => update('dateMonth', v)} multiline={false} className="inline-block w-8 text-center" /> năm{' '}
                        <EditableCell value={doc.dateYear} onChange={(v) => update('dateYear', v)} multiline={false} className="inline-block w-16 text-center" />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* ── Title ─── */}
              <div style={{ textAlign: 'center', marginBottom: '6pt' }}>
                <div style={{ fontSize: '14pt', fontWeight: 'bold' }}>TỜ TRÌNH</div>
              </div>

              {/* ── Addressee ─── */}
              <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '11pt', marginBottom: '10pt' }}>
                KÍNH GỬI: BAN TỔNG GIÁM ĐỐC
              </div>

              {/* ── Preamble ─── */}
              <ul style={{ margin: '0 0 8pt 20pt', padding: 0 }}>
                {doc.preamble.map((p, i) => (
                  <li key={i} style={{ marginBottom: '4pt', fontSize: '10pt' }}>
                    <EditableCell value={p} onChange={(v) => updatePreamble(i, v)} multiline={false} />
                  </li>
                ))}
              </ul>

              {/* ── Body intro ─── */}
              <div style={{ marginBottom: '10pt' }}>
                <EditableCell value={doc.bodyIntro} onChange={(v) => update('bodyIntro', v)} multiline={false} />
              </div>

              {/* ── Section I ─── */}
              <div style={{ fontWeight: 'bold', marginBottom: '4pt' }}>
                I.&nbsp;&nbsp;&nbsp;CÁC ĐIỀU KHOẢN CHI TIẾT ĐÃ THỎA THUẬN GIỮA HAI BÊN:
              </div>
              <div style={{ fontWeight: 'bold', marginLeft: '20pt', marginBottom: '6pt' }}>
                1.1&nbsp;&nbsp;<EditableCell value={doc.brandTitle} onChange={(v) => update('brandTitle', v)} multiline={false} className="inline-block" />
              </div>

              {/* ── Table ─── */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt', marginBottom: '14pt' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f0f0f0' }}>
                    {/* Drag handle col — ẩn khi in */}
                    <th className="no-print" style={{ border: '0.5pt solid #999', padding: '2pt', width: '14pt' }} />
                    <th style={{ border: '0.5pt solid #999', padding: '4pt 3pt', textAlign: 'center', width: '22pt' }}>STT</th>
                    <th style={{ border: '0.5pt solid #999', padding: '4pt 3pt', textAlign: 'center', width: '100pt' }}>HẠNG MỤC</th>
                    <th style={{ border: '0.5pt solid #999', padding: '4pt 3pt', textAlign: 'center' }}>ĐIỀU KIỆN THƯƠNG MẠI</th>
                    <th style={{ border: '0.5pt solid #999', padding: '4pt 3pt', textAlign: 'center', width: '80pt' }}>GHI CHÚ</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.items.map((item, idx) => (
                    (!item.locked || showLockedItems) && (
                      <tr
                        key={idx}
                        draggable
                        onDragStart={() => setRowDragIdx(idx)}
                        onDragOver={(e) => { e.preventDefault(); setRowDropIdx(idx); }}
                        onDrop={() => {
                          if (rowDragIdx !== null && rowDropIdx !== null && rowDragIdx !== rowDropIdx) {
                            reorderItems(rowDragIdx, rowDropIdx);
                          }
                          setRowDragIdx(null); setRowDropIdx(null);
                        }}
                        onDragEnd={() => { setRowDragIdx(null); setRowDropIdx(null); }}
                        style={{
                          backgroundColor: rowDropIdx === idx && rowDragIdx !== idx
                            ? '#dbeafe'
                            : idx % 2 === 0 ? 'transparent' : '#fafafa',
                          opacity: rowDragIdx === idx ? 0.4 : 1,
                          outline: rowDropIdx === idx && rowDragIdx !== idx ? '2px solid #3b82f6' : undefined,
                        }}
                      >
                        {/* Drag handle */}
                        <td
                          className="no-print"
                          style={{ border: '0.5pt solid #ddd', padding: '2pt', textAlign: 'center', cursor: 'grab', verticalAlign: 'middle', width: '14pt' }}
                          title="Kéo để đổi thứ tự"
                        >
                          <GripVertical size={11} style={{ margin: '0 auto', color: '#bbb', display: 'block' }} />
                        </td>
                        <td style={{ border: '0.5pt solid #999', padding: '3pt', textAlign: 'center', verticalAlign: 'top' }}>{idx + 1}</td>
                        <td style={{ border: '0.5pt solid #999', padding: '3pt', verticalAlign: 'top' }}>
                          <EditableCell value={item.label} onChange={(v) => updateItem(idx, 'label', v)} multiline={false} />
                        </td>
                        <td style={{ border: '0.5pt solid #999', padding: '3pt', verticalAlign: 'top' }}>
                          <EditableCell value={item.content} onChange={(v) => updateItem(idx, 'content', v)} />
                        </td>
                        <td style={{ border: '0.5pt solid #999', padding: '3pt', verticalAlign: 'top', fontSize: '8pt', color: '#555', fontStyle: 'italic' }}>
                          <EditableCell value={item.note} onChange={(v) => updateItem(idx, 'note', v)} />
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>

              {/* ── Section II ─── */}
              <div style={{ fontWeight: 'bold', marginBottom: '8pt' }}>
                II.&nbsp;&nbsp;LAYOUT MẶT BẰNG NHƯ SAU:
              </div>

              {doc.layoutImageBase64 ? (
                <div style={{ marginBottom: '12pt', position: 'relative' }}>
                  <img src={doc.layoutImageBase64} alt="layout" style={{ maxWidth: '100%', border: '0.5pt solid #ccc' }} />
                  <button
                    className="no-print absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                    onClick={() => update('layoutImageBase64', '')}
                  >×</button>
                </div>
              ) : (
                <label className="no-print cursor-pointer block border-2 border-dashed border-gray-300 rounded p-8 text-center mb-12 hover:border-blue-400 transition-colors" style={{ marginBottom: '12pt' }}>
                  <Image size={32} className="mx-auto text-gray-300 mb-2" />
                  <div className="text-sm text-gray-400">Click để upload layout mặt bằng</div>
                  <div className="text-xs text-gray-300 mt-1">PNG, JPG, PDF screenshot...</div>
                  <input type="file" accept="image/*" className="hidden" onChange={handleLayoutImageUpload} />
                </label>
              )}

              {/* ── Closing ─── */}
              <div style={{ marginBottom: '14pt' }}>
                <EditableCell value={doc.closingLine} onChange={(v) => update('closingLine', v)} multiline={false} />
              </div>

              {/* ── Signatories ─── */}
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    {doc.signatories.map((sig, idx) => (
                      <td key={idx} style={{ border: '0.5pt solid #999', padding: '8pt 4pt', textAlign: 'center', width: `${100 / doc.signatories.length}%`, verticalAlign: 'top', position: 'relative' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '9pt', marginBottom: '60pt' }}>
                          <EditableCell value={sig.title} onChange={(v) => updateSignatory(idx, 'title', v)} multiline={false} className="text-center" />
                        </div>
                        <div style={{ fontWeight: 'bold', fontSize: '9pt' }}>
                          <EditableCell value={sig.name} onChange={(v) => updateSignatory(idx, 'name', v)} multiline={false} className="text-center" />
                        </div>
                        {doc.signatories.length > 1 && (
                          <button
                            className="no-print absolute top-1 right-1 text-red-400 hover:text-red-600"
                            onClick={() => removeSignatory(idx)}
                            title="Xóa"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>

            </div>
          </div>
        </div>

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <div className="no-print w-72 bg-white border-l border-gray-200 overflow-y-auto flex flex-col shrink-0">
          <div className="p-4 space-y-5 text-sm flex-1">

            {sidebar === 'settings' && (
              <>
                {/* Logo */}
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Logo công ty</div>
                  {doc.logoBase64 ? (
                    <div className="relative inline-block">
                      <img src={doc.logoBase64} alt="logo" className="h-12 object-contain border rounded" />
                      <button
                        onClick={() => update('logoBase64', '')}
                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]"
                      >×</button>
                    </div>
                  ) : (
                    <label className="cursor-pointer flex items-center gap-2 text-xs text-blue-600 hover:text-blue-700 border border-dashed border-blue-300 rounded p-2 hover:bg-blue-50">
                      <Upload size={14} /> Upload logo (PNG, JPG)
                      <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                    </label>
                  )}
                </div>

                {/* Layout image */}
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Ảnh layout mặt bằng (Mục II)</div>
                  {doc.layoutImageBase64 ? (
                    <div className="relative">
                      <img src={doc.layoutImageBase64} alt="layout" className="w-full border rounded" />
                      <button
                        onClick={() => update('layoutImageBase64', '')}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                      >×</button>
                    </div>
                  ) : (
                    <label className="cursor-pointer flex items-center gap-2 text-xs text-blue-600 hover:text-blue-700 border border-dashed border-blue-300 rounded p-2 hover:bg-blue-50">
                      <Image size={14} /> Upload layout mặt bằng
                      <input type="file" accept="image/*" className="hidden" onChange={handleLayoutImageUpload} />
                    </label>
                  )}
                </div>

                {/* GAP #41, #91–94 — Phí & Điều khoản bổ sung */}
                <div className="border-t border-gray-100 pt-3">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Phí & Điều khoản</div>
                  <div className="space-y-2">
                    <div>
                      <label className="text-[11px] text-gray-500 block mb-0.5">Giờ hoạt động (mục 13)</label>
                      <input value={extraFields.operatingHours} onChange={setEF('operatingHours')}
                        placeholder="10:00–22:00 hàng ngày" className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] text-gray-500 block mb-0.5">Phí tiện ích/tháng (₫)</label>
                        <input type="number" value={extraFields.utilityFee} onChange={setEF('utilityFee')}
                          className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </div>
                      <div>
                        <label className="text-[11px] text-gray-500 block mb-0.5">Phí ngoài giờ/giờ (₫)</label>
                        <input type="number" value={extraFields.afterHoursFee} onChange={setEF('afterHoursFee')}
                          className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-500 block mb-0.5">Thanh toán trong vòng (ngày) — mục 16</label>
                      <input type="number" value={extraFields.paymentTermDays} onChange={setEF('paymentTermDays')}
                        className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    </div>
                    <div className="text-[11px] text-gray-400 font-medium mt-1">Cọc & Phí thi công (mục 17, 19)</div>
                    <div className="grid grid-cols-1 gap-2">
                      <div>
                        <label className="text-[11px] text-gray-500 block mb-0.5">Cọc thuê (VND) — 0 = tính tự động</label>
                        <input type="number" min={0} value={extraFields.depositLease} onChange={setEF('depositLease')}
                          placeholder="0 = tự tính từ deposit × monthlyRent" className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] text-gray-500 block mb-0.5">Cọc thi công (VND)</label>
                          <input type="number" value={extraFields.depositFitout} onChange={setEF('depositFitout')}
                            className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                        </div>
                        <div>
                          <label className="text-[11px] text-gray-500 block mb-0.5">Phí thi công (VND)</label>
                          <input type="number" value={extraFields.fitoutFee} onChange={setEF('fitoutFee')}
                            className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                        </div>
                      </div>
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

                {/* Show/hide locked items */}
                <div>
                  <button
                    onClick={() => setShowLockedItems(!showLockedItems)}
                    className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-800"
                  >
                    {showLockedItems ? <Eye size={13} /> : <EyeOff size={13} />}
                    {showLockedItems ? 'Ẩn' : 'Hiện'} điều khoản chuẩn (12–16)
                  </button>
                </div>

                {/* Info hint */}
                <div className="text-xs text-gray-400 bg-gray-50 rounded p-2">
                  <span className="font-medium">💡 Tip:</span> Click vào bất kỳ ô nào trong tài liệu để chỉnh sửa nội dung. Nhấn <kbd className="bg-white border rounded px-1">Esc</kbd> để hủy, <kbd className="bg-white border rounded px-1">blur</kbd> để lưu.
                </div>
              </>
            )}

            {sidebar === 'signatories' && (
              <>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Người ký duyệt</div>
                {doc.signatories.map((sig, idx) => (
                  <div key={idx} className="border rounded-lg p-3 space-y-2 bg-gray-50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-600">Người ký #{idx + 1}</span>
                      {doc.signatories.length > 1 && (
                        <button onClick={() => removeSignatory(idx)} className="text-red-400 hover:text-red-600">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Chức danh</label>
                      <input
                        value={sig.title}
                        onChange={(e) => updateSignatory(idx, 'title', e.target.value)}
                        className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Họ và tên</label>
                      <input
                        value={sig.name}
                        onChange={(e) => updateSignatory(idx, 'name', e.target.value)}
                        className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                  </div>
                ))}
                <button
                  onClick={addSignatory}
                  className="w-full flex items-center justify-center gap-2 text-xs text-blue-600 border border-dashed border-blue-300 rounded p-2 hover:bg-blue-50"
                >
                  <Plus size={13} /> Thêm người ký
                </button>
              </>
            )}

            {sidebar === 'style' && (
              <>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Font chữ</div>
                <div className="space-y-1">
                  {FONTS.map((f) => (
                    <button
                      key={f.value}
                      onClick={() => update('font', f.value)}
                      style={{ fontFamily: f.value }}
                      className={`w-full text-left px-3 py-2 rounded text-sm border transition-colors ${doc.font === f.value ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 hover:bg-gray-50'}`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-4 mb-2">Màu chủ đề</div>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => update('primaryColor', c)}
                      className={`w-8 h-8 rounded-full border-4 transition-transform hover:scale-110 ${doc.primaryColor === c ? 'border-gray-800 scale-110' : 'border-gray-200'}`}
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <label className="text-xs text-gray-500">Màu tùy chỉnh:</label>
                  <input
                    type="color"
                    value={doc.primaryColor}
                    onChange={(e) => update('primaryColor', e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-gray-200"
                  />
                  <span className="text-xs font-mono text-gray-600">{doc.primaryColor}</span>
                </div>

                <div className="mt-4 text-xs text-gray-400 bg-gray-50 rounded p-2">
                  Màu chủ đề áp dụng cho tiêu đề, đường kẻ và các nhấn mạnh trong tài liệu.
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t bg-gray-50 space-y-2">
            <Button
              className="w-full gap-2 text-sm bg-green-600 hover:bg-green-700"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              <Save size={14} /> {saveMutation.isPending ? 'Đang lưu...' : 'Lưu vào hệ thống'}
            </Button>
            <Button
              variant="outline"
              className="w-full gap-2 text-sm"
              onClick={handlePrint}
            >
              <Printer size={14} /> In / Xuất PDF
            </Button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
