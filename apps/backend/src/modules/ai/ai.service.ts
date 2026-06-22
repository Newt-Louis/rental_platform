import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const SYSTEM_PROMPT = `Bạn là trợ lý AI chuyên nghiệp của THISO Leasing Platform — nền tảng quản lý cho thuê mặt bằng thương mại tại Việt Nam.

Nhiệm vụ của bạn:
- Trả lời các câu hỏi về tình trạng vận hành mall: lấp đầy, hợp đồng, doanh thu, công nợ, ticket
- Phân tích xu hướng và đưa ra khuyến nghị kinh doanh cụ thể
- Sử dụng dữ liệu thực được cung cấp trong context để trả lời chính xác
- Trả lời bằng tiếng Việt, ngắn gọn, dùng markdown (bold, danh sách) khi cần

Quy tắc:
- CHỈ dựa vào dữ liệu được cung cấp, không bịa số liệu
- Nếu không có dữ liệu, nói rõ "Chưa có dữ liệu"
- Đề xuất hành động cụ thể, không chung chung`;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private prisma: PrismaService) {}

  async chat(message: string, history: { role: string; content: string }[]) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'AI service chưa được cấu hình. Vui lòng liên hệ Admin để cài đặt ANTHROPIC_API_KEY.',
      );
    }

    const context = await this.buildContext(message);

    const messages = [
      ...history.slice(-8).map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      {
        role: 'user' as const,
        content: context
          ? `[Dữ liệu hệ thống hiện tại]\n${context}\n\n[Câu hỏi]\n${message}`
          : message,
      },
    ];

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        this.logger.error(`Claude API error ${response.status}: ${err.substring(0, 300)}`);
        throw new Error(`Claude API ${response.status}`);
      }

      const data = (await response.json()) as any;
      const reply: string = data.content?.[0]?.text ?? 'Không có phản hồi từ AI.';

      return { reply, timestamp: new Date().toISOString() };
    } catch (error) {
      this.logger.error(`AI chat failed: ${error.message}`);
      throw new ServiceUnavailableException('AI service tạm thời không khả dụng. Vui lòng thử lại.');
    }
  }

  async chatStream(message: string, history: { role: string; content: string }[], onChunk: (text: string) => void): Promise<void> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

    const context = await this.buildContext(message);
    const messages = [
      ...history.slice(-8).map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      {
        role: 'user' as const,
        content: context ? `[Dữ liệu hệ thống hiện tại]\n${context}\n\n[Câu hỏi]\n${message}` : message,
      },
    ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'messages-2023-12-15',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        stream: true,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API ${response.status}: ${err.substring(0, 200)}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      const lines = buf.split('\n');
      buf = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5).trim();
        if (raw === '[DONE]') return;
        try {
          const ev = JSON.parse(raw);
          if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
            onChunk(ev.delta.text);
          }
        } catch {}
      }
    }
  }

  private async buildContext(message: string): Promise<string> {
    const lower = message.toLowerCase();
    const parts: string[] = [];

    try {
      if (lower.includes('lấp đầy') || lower.includes('occupancy') || lower.includes('vacant') || lower.includes('trống')) {
        const units = await this.prisma.unit.findMany({ where: { isActive: true }, select: { status: true, areaNLA: true } });
        const total = units.length;
        const occupied = units.filter((u) => u.status === 'OCCUPIED').length;
        const vacant = units.filter((u) => u.status === 'VACANT').length;
        const booking = units.filter((u) => u.status === 'BOOKING').length;
        const negotiating = units.filter((u) => u.status === 'NEGOTIATING').length;
        const contracted = units.filter((u) => u.status === 'CONTRACTED').length;
        const fitout = units.filter((u) => u.status === 'UNDER_FITOUT').length;
        const totalArea = units.reduce((s, u) => s + u.areaNLA, 0);
        const vacantArea = units.filter((u) => u.status === 'VACANT').reduce((s, u) => s + u.areaNLA, 0);
        parts.push(`Tỷ lệ lấp đầy: ${total > 0 ? ((occupied / total) * 100).toFixed(1) : 0}% (${occupied}/${total} lô)\nTrống: ${vacant} | Booking: ${booking} | Thương thảo: ${negotiating} | Hợp đồng: ${contracted} | Thi công: ${fitout} | Đang thuê: ${occupied}\nTổng diện tích: ${totalArea.toLocaleString('vi-VN')} m² | Diện tích trống: ${vacantArea.toLocaleString('vi-VN')} m²`);
      }

      if (lower.includes('hợp đồng') || lower.includes('contract') || lower.includes('hết hạn') || lower.includes('expire')) {
        const today = new Date();
        const d30 = new Date(today); d30.setDate(d30.getDate() + 30);
        const d90 = new Date(today); d90.setDate(d90.getDate() + 90);
        const d180 = new Date(today); d180.setDate(d180.getDate() + 180);
        const [active, exp30, exp90, exp180, expiring] = await Promise.all([
          this.prisma.contract.count({ where: { isActive: true, status: 'ACTIVE' } }),
          this.prisma.contract.count({ where: { isActive: true, status: { in: ['ACTIVE', 'EXPIRING'] }, endDate: { lte: d30 } } }),
          this.prisma.contract.count({ where: { isActive: true, status: { in: ['ACTIVE', 'EXPIRING'] }, endDate: { lte: d90 } } }),
          this.prisma.contract.count({ where: { isActive: true, status: { in: ['ACTIVE', 'EXPIRING'] }, endDate: { lte: d180 } } }),
          this.prisma.contract.findMany({
            where: { isActive: true, status: { in: ['ACTIVE', 'EXPIRING'] }, endDate: { lte: d90 } },
            include: { tenant: { select: { brandName: true } }, unit: { select: { code: true } } },
            orderBy: { endDate: 'asc' },
            take: 5,
          }),
        ]);
        const expiringList = expiring.map((c) => `  - ${c.tenant.brandName} (lô ${c.unit.code}) hết hạn ${new Date(c.endDate).toLocaleDateString('vi-VN')}`).join('\n');
        parts.push(`Hợp đồng đang hoạt động: ${active}\nSắp hết hạn 30 ngày: ${exp30} | 90 ngày: ${exp90} | 180 ngày: ${exp180}\nTop hết hạn gần nhất:\n${expiringList}`);
      }

      if (lower.includes('công nợ') || lower.includes('overdue') || lower.includes('hóa đơn') || lower.includes('invoice') || lower.includes('thanh toán')) {
        const overdue = await this.prisma.invoice.findMany({
          where: { isActive: true, status: 'OVERDUE' },
          include: { tenant: { select: { brandName: true } } },
          orderBy: { totalAmount: 'desc' },
          take: 5,
        });
        const allOverdue = await this.prisma.invoice.aggregate({ where: { isActive: true, status: 'OVERDUE' }, _sum: { totalAmount: true }, _count: true });
        const issued = await this.prisma.invoice.aggregate({ where: { isActive: true, status: 'ISSUED' }, _sum: { totalAmount: true }, _count: true });
        const topDebt = overdue.map((i) => `  - ${i.tenant.brandName}: ${i.totalAmount.toLocaleString('vi-VN')} VNĐ`).join('\n');
        parts.push(`Hóa đơn quá hạn: ${allOverdue._count} hóa đơn, tổng: ${(allOverdue._sum.totalAmount ?? 0).toLocaleString('vi-VN')} VNĐ\nĐang chờ thanh toán: ${issued._count} hóa đơn, tổng: ${(issued._sum.totalAmount ?? 0).toLocaleString('vi-VN')} VNĐ\nTop công nợ lớn nhất:\n${topDebt}`);
      }

      if (lower.includes('doanh thu') || lower.includes('revenue') || lower.includes('sales') || lower.includes('kinh doanh')) {
        const today = new Date();
        const period = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        const prevMonth = today.getMonth() === 0 ? 12 : today.getMonth();
        const prevYear = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();
        const prevPeriod = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
        const [curr, prev] = await Promise.all([
          this.prisma.salesTurnover.aggregate({ where: { period }, _sum: { grossSales: true, netSales: true }, _count: true }),
          this.prisma.salesTurnover.aggregate({ where: { period: prevPeriod }, _sum: { grossSales: true }, _count: true }),
        ]);
        const currTotal = curr._sum.grossSales ?? 0;
        const prevTotal = prev._sum.grossSales ?? 0;
        const growth = prevTotal > 0 ? (((currTotal - prevTotal) / prevTotal) * 100).toFixed(1) : 'N/A';
        parts.push(`Doanh thu tháng ${period}: ${currTotal.toLocaleString('vi-VN')} VNĐ (${curr._count} khách thuê báo cáo)\nTháng trước (${prevPeriod}): ${prevTotal.toLocaleString('vi-VN')} VNĐ\nTăng trưởng: ${growth}%`);
      }

      if (lower.includes('ticket') || lower.includes('yêu cầu') || lower.includes('vận hành') || lower.includes('sự cố')) {
        const [open, urgent, byType] = await Promise.all([
          this.prisma.ticket.count({ where: { isActive: true, status: { notIn: ['CLOSED', 'RESOLVED'] } } }),
          this.prisma.ticket.count({ where: { isActive: true, priority: 'URGENT', status: { notIn: ['CLOSED', 'RESOLVED'] } } }),
          this.prisma.ticket.groupBy({ by: ['type'], where: { isActive: true, status: { notIn: ['CLOSED', 'RESOLVED'] } }, _count: true }),
        ]);
        const byTypeStr = byType.map((t) => `  - ${t.type}: ${t._count}`).join('\n');
        parts.push(`Ticket đang mở: ${open} (khẩn cấp: ${urgent})\nPhân loại:\n${byTypeStr}`);
      }

      if (lower.includes('khách thuê') || lower.includes('tenant') || lower.includes('thương hiệu')) {
        const [total, byCategory] = await Promise.all([
          this.prisma.tenant.count({ where: { isActive: true } }),
          this.prisma.tenant.groupBy({ by: ['category'], where: { isActive: true }, _count: true, orderBy: { _count: { category: 'desc' } }, take: 5 }),
        ]);
        const catStr = byCategory.map((c) => `  - ${c.category ?? 'Khác'}: ${c._count}`).join('\n');
        parts.push(`Tổng khách thuê hoạt động: ${total}\nPhân loại ngành hàng:\n${catStr}`);
      }

      if (lower.includes('proposal') || lower.includes('đề xuất') || lower.includes('duyệt') || lower.includes('phê duyệt')) {
        const [pending, approved, draft] = await Promise.all([
          this.prisma.proposal.count({ where: { isActive: true, status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }),
          this.prisma.proposal.count({ where: { isActive: true, status: 'APPROVED', createdAt: { gte: new Date(Date.now() - 30 * 24 * 3600000) } } }),
          this.prisma.proposal.count({ where: { isActive: true, status: 'DRAFT' } }),
        ]);
        parts.push(`Proposal đang chờ duyệt: ${pending} | Draft: ${draft}\nĐã duyệt trong 30 ngày: ${approved}`);
      }
    } catch (err) {
      this.logger.warn(`Failed to build context: ${err.message}`);
    }

    return parts.join('\n\n');
  }

  async getSuggestions() {
    try {
      const [expiringContracts, overdueInvoices, openTickets, vacantUnits] = await Promise.all([
        this.prisma.contract.count({ where: { isActive: true, status: { in: ['ACTIVE', 'EXPIRING'] }, endDate: { lte: new Date(Date.now() + 90 * 24 * 3600000) } } }),
        this.prisma.invoice.count({ where: { isActive: true, status: 'OVERDUE' } }),
        this.prisma.ticket.count({ where: { isActive: true, priority: 'URGENT', status: { notIn: ['CLOSED', 'RESOLVED'] } } }),
        this.prisma.unit.count({ where: { isActive: true, status: 'VACANT' } }),
      ]);

      return [
        `Tỷ lệ lấp đầy và diện tích trống hiện tại?`,
        expiringContracts > 0
          ? `${expiringContracts} hợp đồng sắp hết hạn trong 90 ngày — nên xử lý thế nào?`
          : 'Có bao nhiêu hợp đồng sắp hết hạn trong 90 ngày?',
        overdueInvoices > 0
          ? `Tổng công nợ quá hạn từ ${overdueInvoices} hóa đơn là bao nhiêu?`
          : 'Tổng công nợ quá hạn hiện tại?',
        openTickets > 0
          ? `Đang có ${openTickets} ticket khẩn cấp — tóm tắt tình hình?`
          : 'Ticket vận hành nào đang cần xử lý gấp?',
        vacantUnits > 0
          ? `${vacantUnits} lô đang trống — đề xuất chiến lược lấp đầy?`
          : 'Doanh thu tháng này so với tháng trước thế nào?',
        'Phân tích xu hướng thị trường cho thuê mặt bằng thương mại hiện nay?',
      ];
    } catch {
      return [
        'Tỷ lệ lấp đầy hiện tại là bao nhiêu?',
        'Có bao nhiêu hợp đồng sắp hết hạn trong 90 ngày?',
        'Tổng công nợ quá hạn là bao nhiêu?',
        'Doanh thu tháng này là bao nhiêu?',
        'Có bao nhiêu ticket vận hành đang mở?',
        'Đề xuất chiến lược lấp đầy cho các lô trống?',
      ];
    }
  }
}
