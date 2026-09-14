/* eslint-disable @typescript-eslint/no-var-requires */
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ProposalPdfService {
  private readonly logger = new Logger(ProposalPdfService.name);

  generateProposalPdf(proposal: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const PdfPrinter = require('pdfmake');
        const vfs: Record<string, string> = require('pdfmake/build/vfs_fonts');

        const fonts = {
          Roboto: {
            normal: Buffer.from(vfs['Roboto-Regular.ttf'], 'base64'),
            bold: Buffer.from(vfs['Roboto-Medium.ttf'], 'base64'),
            italics: Buffer.from(vfs['Roboto-Italic.ttf'], 'base64'),
            bolditalics: Buffer.from(vfs['Roboto-MediumItalic.ttf'], 'base64'),
          },
        };

        const printer = new PdfPrinter(fonts);

        // ── Helpers ─────────────────────────────────────────────────────────────
        const fmtDate = (d?: string | Date | null) =>
          d ? new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '…/…/20……';
        const fmtDateFull = (d?: string | Date | null) => {
          if (!d) return { day: '…', month: '…', year: '20……' };
          const dt = new Date(d);
          return {
            day: String(dt.getDate()).padStart(2, '0'),
            month: String(dt.getMonth() + 1).padStart(2, '0'),
            year: String(dt.getFullYear()),
          };
        };
        const today = fmtDateFull(new Date());

        const isUSD = (proposal.rentCurrency ?? 'VND') === 'USD';
        // Any currency other than USD used to fall through to a hardcoded "VND"
        // label, so an MMK proposal printed its amounts as VND on a document the
        // customer signs off. Label with the proposal's real currency instead.
        const fmtMoney = (v: number, currency?: string) => {
          const cur = currency ?? proposal.rentCurrency ?? 'VND';
          if (cur === 'USD') return `$${v?.toLocaleString('en-US', { minimumFractionDigits: 0 })} USD`;
          if (cur === 'VND') return `${v?.toLocaleString('vi-VN')} VND`;
          return `${v?.toLocaleString('vi-VN')} ${cur}`;
        };
        const fmtRent = (v: number) => fmtMoney(v, proposal.rentCurrency ?? 'VND');

        // ── Source data ──────────────────────────────────────────────────────────
        const brandName = proposal.tenant?.brandName ?? proposal.lead?.brandName ?? '[…]';
        const companyName = proposal.tenant?.companyName ?? proposal.lead?.company ?? '[…]';
        const industry = proposal.tenant?.preferredCategory ?? proposal.lead?.category ?? '[…]';
        const unitCode = proposal.unit?.code ?? '[…]';
        const floorName = proposal.unit?.floor?.name ?? '[…]';
        const zoneName = proposal.unit?.zone?.name ?? '';
        const unitLocation = zoneName ? `${unitCode}, ${zoneName}, ${floorName}` : `${unitCode}, ${floorName}`;
        const mallName = proposal.unit?.floor?.mall?.name ?? proposal.unit?.mall?.name ?? 'Thiso Mall';

        const businessModel = proposal.businessModel ?? '[…]';
        const area = proposal.area ?? 0;
        const termMonths = proposal.term ?? 0;
        const termYears = (termMonths / 12).toFixed(0);
        const rentPerSqm = proposal.rentPerSqm ?? 0;
        const serviceFeeSqm = proposal.serviceFeeSqm ?? proposal.camPerSqm ?? 0;
        const businessSupportFeeSqm = proposal.businessSupportFeeSqm ?? 0;
        const depositMonths = proposal.deposit ?? 3;
        const fitoutDays = proposal.fitoutDays ?? 90;
        const escalation = proposal.escalationPercent ?? 5;
        const handoverDate = proposal.handoverDate ? fmtDateFull(proposal.handoverDate) : null;
        const openingDate = proposal.openingDate ? fmtDate(proposal.openingDate) : `…/…/20……`;
        const specialConditions = proposal.specialConditions ?? proposal.notes ?? '[…]';
        const approvalSteps = (proposal.approvalWorkflow?.steps ?? []) as any[];
        const signatureSteps = approvalSteps.filter((step) => step.status === 'APPROVED' && step.approver);
        const signatureCells = (signatureSteps.length ? signatureSteps : approvalSteps).map((step) => ({
          stack: [
            { text: step.stepName?.toUpperCase() ?? step.approverRole, fontSize: 8, bold: true, alignment: 'center' },
            { text: '\n\n', fontSize: 8 },
            { text: step.approver?.fullName ?? 'CHƯA DUYỆT', fontSize: 9, bold: true, alignment: 'center' },
            { text: step.decidedAt ? `Duyệt lúc ${new Date(step.decidedAt).toLocaleString('vi-VN')}` : 'Đang chờ phê duyệt', fontSize: 7, color: '#555', alignment: 'center', margin: [0, 3, 0, 0] },
            ...(step.comment ? [{ text: `Ý kiến: ${step.comment}`, fontSize: 7, italics: true, color: '#555', alignment: 'center', margin: [0, 2, 0, 0] }] : []),
          ],
          alignment: 'center',
          fillColor: '#fafafa',
        }));

        // Document number
        const year = new Date().getFullYear();
        const docNumber = `${proposal.proposalNumber?.split('-')[2] ?? '…'}/${year}/TTr-CTTTTM`;

        // ── Table row builder ────────────────────────────────────────────────────
        const row = (stt: string | number, label: string, content: any, note = '') => ([
          { text: String(stt), alignment: 'center', fontSize: 9 },
          { text: label, fontSize: 9, bold: false },
          typeof content === 'string'
            ? { text: content, fontSize: 9 }
            : { stack: content, fontSize: 9 },
          { text: note, fontSize: 8, color: '#555', italics: true },
        ]);

        // ── Build item 8 text ────────────────────────────────────────────────────
        const item8Lines = [
          '• Ngày bắt đầu tính Tiền thuê là Ngày Bàn giao.',
          '• Tiền thuê trong Thời hạn hoàn thiện nội thất (từ Ngày Bàn giao đến trước ngày Khai trương): Bên Thuê sẽ không phải thanh toán Tiền Thuê, Phí Dịch vụ và Phí hỗ trợ Kinh doanh.',
        ];

        // ── Signature block ──────────────────────────────────────────────────────
        const signCol = (title: string, name: string) => ({
          width: '33%',
          stack: [
            { text: title, fontSize: 9, bold: true, alignment: 'center' },
            { text: '\n\n\n\n\n' },
            { text: name, fontSize: 9, bold: true, alignment: 'center' },
          ],
          border: [true, true, true, true],
        });

        const docDefinition: any = {
          pageSize: 'A4',
          pageMargins: [50, 50, 40, 60],
          defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.4 },

          footer: (_currentPage: number, pageCount: number) => ({
            text: `Trang ${_currentPage} | ${pageCount}`,
            fontSize: 9, alignment: 'right', margin: [0, 10, 40, 0], color: '#888',
          }),

          content: [
            // ── Letterhead ───────────────────────────────────────────────────────
            {
              columns: [
                {
                  width: '*',
                  stack: [
                    { text: 'KHỐI KINH DOANH BĐS TM & DV', fontSize: 10, bold: true, alignment: 'center' },
                    { text: 'PHÒNG CHO THUÊ TTTM', fontSize: 10, bold: true, alignment: 'center' },
                  ],
                },
                {
                  width: '*',
                  stack: [
                    { text: `Số/No: ${docNumber}`, fontSize: 9, alignment: 'right' },
                    { text: `TP.HCM, ngày ${today.day} tháng ${today.month} năm ${today.year}`, fontSize: 9, alignment: 'right', italics: true },
                  ],
                },
              ],
              margin: [0, 0, 0, 16] as [number, number, number, number],
            },

            // ── Title ────────────────────────────────────────────────────────────
            { text: 'TỜ TRÌNH', fontSize: 14, bold: true, alignment: 'center', margin: [0, 0, 0, 6] as [number, number, number, number] },
            {
              text: `V/v: Phê duyệt xác nhận thông tin Thư Đề Nghị Cho Thuê/ Hợp Đồng Thuê gửi đến Khách thuê Công ty ${companyName} với tên thương hiệu ${brandName} tại vị trí thuê ${unitCode}, ${floorName} thuộc Dự Án Trung Tâm Thương Mại ${mallName}`,
              fontSize: 10, bold: true, alignment: 'center', margin: [20, 0, 20, 16] as [number, number, number, number],
            },

            // ── Addressee ────────────────────────────────────────────────────────
            { text: 'KÍNH GỬI: BAN TỔNG GIÁM ĐỐC', fontSize: 11, bold: true, alignment: 'center', margin: [0, 0, 0, 12] as [number, number, number, number] },

            // ── Preamble bullets ─────────────────────────────────────────────────
            {
              ul: [
                `Căn cứ nhu cầu thuê mặt bằng kinh doanh của Khách Thuê ${brandName} thuộc Công ty ${companyName} tại Dự Án Trung Tâm Thương Mại ${mallName};`,
                `Căn cứ kế hoạch chốt thuê cho các Khách Thuê tại TTTM ${mallName};`,
                `Căn cứ các yêu cầu đề xuất, điều kiện thoả thuận, phạm vi công việc đã được Các Bên thống nhất.`,
              ],
              fontSize: 10,
              margin: [20, 0, 0, 10] as [number, number, number, number],
            },
            {
              text: `Phòng cho thuê TTTM kính trình Ban Tổng Giám Đốc phê duyệt Đề xuất Cho Thuê cho Khách Thuê ${brandName} tại TTTM ${mallName}, bao gồm các nội dung chính sau:`,
              fontSize: 10, margin: [0, 0, 0, 16] as [number, number, number, number],
            },

            // ── Section I ────────────────────────────────────────────────────────
            { text: 'I.   CÁC ĐIỀU KHOẢN CHI TIẾT ĐÃ THỎA THUẬN GIỮA HAI BÊN:', fontSize: 10, bold: true, margin: [0, 0, 0, 6] as [number, number, number, number] },
            { text: `1.1  Thương hiệu ${brandName}`, fontSize: 10, bold: true, margin: [20, 0, 0, 6] as [number, number, number, number] },

            // ── Main table 21 items ──────────────────────────────────────────────
            {
              table: {
                headerRows: 1,
                widths: [22, 120, '*', 90],
                body: [
                  // Header
                  [
                    { text: 'STT', bold: true, fontSize: 9, fillColor: '#f0f0f0', alignment: 'center' },
                    { text: 'HẠNG MỤC', bold: true, fontSize: 9, fillColor: '#f0f0f0', alignment: 'center' },
                    { text: 'ĐIỀU KIỆN THƯƠNG MẠI', bold: true, fontSize: 9, fillColor: '#f0f0f0', alignment: 'center' },
                    { text: 'GHI CHÚ', bold: true, fontSize: 9, fillColor: '#f0f0f0', alignment: 'center' },
                  ],
                  // 1
                  row(1, 'Tên Pháp nhân', companyName),
                  // 2
                  row(2, 'Tên Thương hiệu', brandName),
                  // 3
                  row(3, 'Ngành hàng Kinh doanh', industry),
                  // 4
                  row(4, 'Mô hình Kinh doanh', businessModel),
                  // 5
                  row(5, 'Vị trí chào thuê', unitLocation, 'Layout chi tiết đính kèm phần II'),
                  // 6
                  row(6, 'Diện tích', [
                    { text: `Tổng diện tích: ${area.toLocaleString('vi-VN')} m²`, bold: false },
                    { text: 'Diện tích này được tạm tính vào thời điểm Bên Cho Thuê phát hành Thư Đề Nghị Cho Thuê. Diện Tích Thuê thực tế sẽ xác nhận sau khi đo đạc và các Bên xác nhận vào Ngày Bàn giao Mặt bằng.', fontSize: 8, color: '#555', margin: [0, 2, 0, 0] as [number, number, number, number] },
                  ]),
                  // 7
                  row(7, 'Thời hạn thuê', `${termYears} năm (${termMonths} tháng) kể từ Ngày Bàn giao.`),
                  // 8
                  row(8, 'Ngày bắt đầu tính Tiền thuê', item8Lines.join('\n')),
                  // 9
                  row(9, 'Giá thuê\n(Chưa bao gồm Thuế GTGT)', [
                    { text: `Năm 1 của Thời hạn thuê:` },
                    { text: `Giá thuê: ${fmtRent(rentPerSqm)}/m²/tháng`, bold: true, margin: [0, 2, 0, 2] as [number, number, number, number] },
                    { text: `Từ năm 2 trở đi, giá thuê tăng ${escalation}% so với năm liền kề trước đó.`, fontSize: 8, color: '#555' },
                  ]),
                  // 10
                  row(10, 'Phí Dịch vụ', `${fmtMoney(serviceFeeSqm, isUSD ? 'USD' : 'VND')}/m²/tháng\n(Chưa bao gồm Thuế GTGT).`),
                  // 11
                  row(11, 'Phí hỗ trợ Kinh doanh', `${fmtMoney(businessSupportFeeSqm, isUSD ? 'USD' : 'VND')}/m²/tháng\n(Chưa bao gồm Thuế GTGT).`),
                  // 12
                  row(12, 'Phí tiện ích', 'Các Phí tiện ích: điện, nước, gas, … trong phần Diện Tích Thuê của Khách thuê sẽ được tính theo đồng hồ tiêu thụ được cấp tại khu vực thuê và được thanh toán bởi Bên Thuê.'),
                  // 13
                  row(13, 'Thời gian hoạt động của TTTM', 'Thứ 2 – Thứ 6:   10:00 – 22:00\nThứ 7 – Chủ nhật: 09:30 – 22:00'),
                  // 14
                  row(14, 'Phí Dịch vụ ngoài giờ', 'Các chi phí liên quan đến hoạt động ngoài giờ sẽ được Bên Thuê thanh toán theo quy định của TTTM.'),
                  // 15
                  row(15, 'Tỷ giá', [
                    { text: '• Tỷ giá áp dụng cho Tiền thuê là tỷ giá bán ra của Ngân hàng TMCP Ngoại Thương Việt Nam vào ngày Bên Cho Thuê ban hành Thư Đề Nghị Cho Thuê/ Hợp Đồng Thuê.' },
                    { text: '• Tỷ giá áp dụng cho Phí Dịch vụ và Phí hỗ trợ Kinh doanh là tỷ giá áp dụng đồng nhất cho Khách thuê tại TTTM: tỷ giá 26.340 VND/USD.', margin: [0, 3, 0, 0] as [number, number, number, number] },
                  ]),
                  // 16
                  row(16, 'Thanh toán Tiền thuê', [
                    { text: '• Bên Thuê thanh toán Tiền thuê cho Bên Cho Thuê trong vòng 05 (năm) ngày đầu tiên của mỗi Tháng.' },
                    { text: '• Tiền thuê bao gồm: Tiền thuê, Phí Dịch vụ, Phí hỗ trợ Kinh doanh và các chi phí phát sinh nếu có (đã bao gồm Thuế GTGT).', margin: [0, 3, 0, 0] as [number, number, number, number] },
                  ]),
                  // 17
                  row(17, 'Tiền Đặt Cọc', `Tiền Đặt cọc tương đương ${depositMonths} (${depositMonths === 3 ? 'ba' : depositMonths === 2 ? 'hai' : depositMonths === 1 ? 'một' : String(depositMonths)}) tháng Tiền thuê và Phí Dịch vụ (không bao gồm Thuế GTGT) và sẽ được thanh toán trong vòng 07 (bảy) ngày kể từ ngày ký Thư Đề Nghị Cho Thuê.`),
                  // 18
                  row(18, 'Thời hạn hoàn thiện nội thất', `Dự kiến ${fitoutDays} ngày kể từ Ngày Bàn giao.\nNgày Khai trương dự kiến: ${openingDate}`),
                  // 19
                  row(19, 'Phí Thi công', 'Bên Thuê thanh toán cho Bên Cho Thuê trước Ngày Bàn giao. Trong trường hợp có ngày ngưng thi công thực tế do lỗi của Bên Cho Thuê, Bên Cho Thuê sẽ giảm trừ phần Tiền Phí thi công cho những ngày ngưng thi công thực tế vào Tiền thuê của tháng đầu tiên của Thời hạn thuê.'),
                  // 20
                  row(20, 'Ngày Bàn giao Mặt bằng', handoverDate
                    ? `Dự kiến ngày ${handoverDate.day}/${handoverDate.month}/${handoverDate.year} hoặc một ngày khác theo thông báo của Trung tâm thương mại ${mallName} bằng văn bản trước 07 (bảy) ngày.`
                    : `Dự kiến ngày …/…/20…… hoặc một ngày khác theo thông báo của Trung tâm thương mại ${mallName} bằng văn bản trước 07 (bảy) ngày.`),
                  // 21
                  row(21, 'Điều kiện đặc biệt', specialConditions),
                ],
              },
              layout: {
                hLineColor: '#999',
                vLineColor: '#999',
                hLineWidth: () => 0.5,
                vLineWidth: () => 0.5,
                paddingLeft: () => 5,
                paddingRight: () => 5,
                paddingTop: () => 4,
                paddingBottom: () => 4,
              },
              margin: [0, 0, 0, 20] as [number, number, number, number],
            },

            // ── Section II ───────────────────────────────────────────────────────
            { text: 'II.  LAYOUT MẶT BẰNG NHƯ SAU:', fontSize: 10, bold: true, margin: [0, 0, 0, 6] as [number, number, number, number] },
            {
              canvas: [{
                type: 'rect', x: 0, y: 0, w: 480, h: 200,
                lineWidth: 0.5, lineColor: '#ccc', dash: { length: 4 },
              }],
              margin: [0, 0, 0, 8] as [number, number, number, number],
            },
            { text: '(Đính kèm layout mặt bằng)', fontSize: 9, color: '#888', alignment: 'center', margin: [0, 0, 0, 20] as [number, number, number, number] },

            // ── Closing line ─────────────────────────────────────────────────────
            {
              text: 'Phòng cho thuê TTTM kính trình Ban Tổng Giám đốc xem xét và phê duyệt.',
              fontSize: 10, margin: [0, 0, 0, 16] as [number, number, number, number],
            },

            // ── Signature block ──────────────────────────────────────────────────
            {
              table: {
                widths: signatureCells.length ? signatureCells.map(() => '*') : ['*'],
                body: [signatureCells.length ? signatureCells : [{ text: 'Chưa có thông tin phê duyệt', alignment: 'center', fontSize: 9 }]],
              },
              layout: {
                hLineColor: '#999',
                vLineColor: '#999',
                hLineWidth: () => 0.5,
                vLineWidth: () => 0.5,
                paddingTop: () => 8,
                paddingBottom: () => 8,
                paddingLeft: () => 4,
                paddingRight: () => 4,
              },
            },
          ],
        };

        const pdfDoc = printer.createPdfKitDocument(docDefinition);
        const chunks: Buffer[] = [];
        pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
        pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
        pdfDoc.on('error', (err: Error) => reject(err));
        pdfDoc.end();
      } catch (err) {
        this.logger.error(`PDF generation failed: ${(err as Error).message}`);
        reject(err);
      }
    });
  }
}
