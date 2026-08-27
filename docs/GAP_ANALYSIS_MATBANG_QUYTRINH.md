# Gap Analysis — Module Mặt bằng & Quy trình bán hàng

> Tài liệu **tạm thời** đối chiếu giữa hiện trạng hệ thống (schema Prisma + code frontend) với yêu cầu từ **cuộc họp 05.06.2026** và các tài liệu trong `docs/` (TIF, Tờ Trình xác nhận thuê, Tờ Trình điều chỉnh, Excel thông tin khách thuê, Excel tiến độ, Excel báo cáo đánh giá).
> Phạm vi: (1) tab **Mặt bằng** và (2) nhóm sidebar **"Quy trình bán hàng"** = Booking → Đề xuất → Phê duyệt → Hợp đồng → Khách thuê.

Ký hiệu cột **Trạng thái**:
- ✅ Đã có, dùng được ngay
- 🟡 Đã có 1 phần / cần verify hoặc mở rộng
- ❌ Chưa có

Ký hiệu cột **Nguồn**:
- **Meeting** = trích trực tiếp từ nội dung cuộc họp 05.06.2026 bạn gửi
- **TIF** = `docs/0. Form TIF - Tenancy Instruction Form (Ok).docx`
- **Tờ Trình XN** = `docs/Template_Tờ trình xác nhận thuê.docx`
- **Tờ Trình ĐC** = `docs/20260525_TTr Dieu chinh thong tin chot thue.docx`
- **Excel KT** = `docs/20260608_Thong tin Khach thue.xlsx`
- **Excel TĐ** = `docs/20260610_Tien do lam viec Khach thue.xlsx`
- **Excel BC** = `docs/THISO MALL_MẪU BÁO CÁO ĐÁNH GIÁ KHÁCH THUÊ.xlsx`
- **Suy luận** = không có trong tài liệu, bổ sung theo best practice / gap thấy từ code hiện tại

---

## 1. Tab MẶT BẰNG (`/spaces`)

### 1.1 Cấu trúc & phân loại mặt bằng

| # | Yêu cầu từ meeting / docs | Hiện tại | Trạng thái | Đề xuất bổ sung | Nguồn |
|---|---|---|---|---|---|
| 1 | Mã lô, diện tích, giá, status | `Unit.code`, `areaGFA`, `areaNLA`, `baseRentPerSqm`, `status` (VACANT/BOOKING/NEGOTIATING/CONTRACTED/UNDER_FITOUT/OCCUPIED) | ✅ | — | Meeting: *"mã lô, diện tích, giá, status"* + *"Status sảnh: trống, đang thương thảo, đang thi công"* |
| 2 | Gộp sảnh (merge nhiều unit thành 1) | Không có field / API | ❌ | Thêm `Unit.mergedFromIds Json?` + `Unit.isCombined Boolean`, API `POST /spaces/units/merge` và `split`, ghi `UnitHistory` | Meeting: *"có gộp sảnh"* |
| 3 | Phân loại "dài hạn / ngắn hạn / cả hai" ở cấp Unit | Chỉ có ở `UnitSlot.slotType` (SHORT/LONG/FLEXIBLE) | 🟡 | Thêm `Unit.leaseTermType` enum `LONG \| SHORT` (mặc định `LONG`); sảnh `LONG` ngầm cho phép cho thuê ngắn hạn khi trống, sảnh `SHORT` cấm cho thuê dài hạn | Meeting: *"Hình thức thuê: dài hạn (3-5y), ngắn"* + *"sảnh dài hạn có thể cho thuê ngắn hạn và k ngược lại"* |
| 4 | Loại mặt bằng: retail, LED, thang cuốn, sự kiện, quảng cáo | Chỉ 1 field `Unit.category` free text | ❌ | Enum `Unit.spaceType`: `RETAIL_UNIT`, `LED`, `ESCALATOR_WRAP`, `KIOSK_EVENT`, `ADVERTISING`, `SERVICE` | Meeting: *"mặt bằng, led, dịch vụ, thang cuốn"* + *"mô hình: sự kiện, quảng cáo, led"* |
| 5 | Sảnh linh động — thuê theo m² không cố định | Chưa có | ❌ | `Unit.isFlexibleArea Bool` + `minArea/maxArea`; pricing tính theo m² thực book | Meeting: *"sảnh có thể linh động k cố định, thuê theo diện tích"* |
| 6 | Sảnh phân 3 cấp (tier) | Chưa có | ❌ | `Unit.tier` enum `A|B|C` để mapping giá 3 mức | Meeting: *"sảnh 3 cấp"* |
| 7 | Diện tích trên HĐT vs diện tích thực tế | `areaGFA/areaNLA` trên Unit; Contract không phân biệt | 🟡 | Thêm `Contract.contractedArea` (chốt HĐ) vs `Contract.actualArea` (sau đo đạc bàn giao) | Excel KT (cột): *"Diện tích trên HĐT: 1,115 / Diện tích thực tế sử dụng: 1,375"* + Tờ Trình XN mục 6: *"Diện Tích Thuê thực tế sẽ xác nhận sau khi đo đạc"* |
| 8 | Ngành hàng, mô hình KD (kiot, cửa hàng) | `Unit.categoryId` → `Category`; `Proposal.businessModel` text | 🟡 | Chuyển `businessModel` sang enum: `SHOP`, `KIOSK`, `POP_UP`, `EVENT`, `CHAIN` | Meeting: *"ngành hàng, mô hình kinh doanh (kiot, cửa hàng)"* |
| 9 | Media (ảnh, floor plan, video, brochure) | `UnitMedia` + type enum | ✅ | — | Suy luận (best practice) |
| 10 | Digital map / interactive floor plan | `mapPosX/Y/W/H`, `mapPolygon` | ✅ | — | Suy luận (đã build sẵn) |
| 11 | Import CSV/Excel unit hàng loạt | `UnitImportLog` | ✅ | Verify UI có sẵn | Suy luận (bulk-import) |

### 1.2 Giá thuê & chính sách

| # | Yêu cầu từ meeting / docs | Hiện tại | Trạng thái | Đề xuất bổ sung | Nguồn |
|---|---|---|---|---|---|
| 12 | Giá config theo từng mall + ngành hàng | `CategoryMallPricing` (min/max/suggested per mall × category × floor × zone) | ✅ | — | Meeting: *"giá thuê config theo từng mall"* |
| 13 | Cùng sảnh — dài hạn / ngắn hạn có 2 giá khác nhau | `Unit.baseRentPerSqm` (long) + `UnitSlot.pricePerDaySqm` (short) là 2 model tách | 🟡 | Xác nhận `UnitSlot` được tạo tự động cho unit `leaseTermType=SHORT`; unit `LONG` tạo slot on-demand khi cần short-rent | Meeting: *"cùng sảnh có thể cho thuê ngắn dài mà có giá khác nhau"* |
| 14 | Giá cho "khách chưa thuê" khác "khách đã thuê" (short-term) | `SlotPricingRule` có WEEKEND/HOLIDAY/SEASONAL/MIN_DAYS | ❌ | Thêm ruleType `EXISTING_TENANT_DISCOUNT` / `LOYALTY_TIER`; check `customerId` có Contract active | Meeting: *"Khách chưa thuê có giá khác, đã thuê có giá khác"* + *"giảm giá cho khách thuê"* |
| 15 | Sảnh Y có config giá dịch vụ đi kèm (LED, thang cuốn, MKT, dịch vụ ngoài giờ) | `Proposal.serviceFeeSqm`, `businessSupportFeeSqm`, `marketingFee` scalar | ❌ | Bảng `ServicePriceCatalog` (mallId, serviceCode, unit, price) + `ProposalService[]` line items | Meeting: *"quản lý dịch vụ thuê để quản lý sảnh thuê các dịch vụ gì"* + *"phí thuê sảnh, dịch vụ (MKT), vận hành kinh doanh trong form"* + Tờ Trình XN mục 10-14 (Phí DV, Phí hỗ trợ KD, Phí tiện ích, Phí ngoài giờ) |
| 16 | Giá thuê hiển thị theo công thức, có thể edit | `Unit.baseRent/marketRent/askingRent` + `Proposal.rentPerSqm` editable | ✅ | UI verify có formula display (asking = base × 1.x) | Meeting: *"hiển thị giá theo công thức và có thể edit"* |
| 17 | Giá chính sách vs giá thực tế cho thuê → báo Ms.Oanh | `Unit.askingRentPerSqm` (policy) + `UnitBooking.proposedRentPerSqm` + `priceDeviationPercent` | 🟡 | Report so sánh policy vs actual theo mall/tenant/tháng cho leadership | Meeting: *"giá chính sách, giá cho thuê thực tế -> báo data này lên ms.Oanh"* |
| 18 | Escalation rate (tăng giá theo năm) | `Unit.escalationRate`, `Proposal.escalationPercent`, `Contract.escalationPercent` | ✅ | — | Tờ Trình XN mục 9: *"Từ năm 2 trở đi, giá thuê tăng 5% so với năm liền kề trước đó"* |

### 1.3 Trạng thái sảnh & lock

| # | Yêu cầu | Hiện tại | Trạng thái | Đề xuất | Nguồn |
|---|---|---|---|---|---|
| 19 | Status: trống / đang thương thảo / đang thi công | `UnitStatus` enum có đủ | ✅ | — | Meeting: *"Status sảnh: trống, đang thương thảo, đang thi công"* |
| 20 | "Đang thương thảo" → LOCK không cho book | `UnitStatus.NEGOTIATING` tồn tại | 🟡 | Verify service `bookings.create()` reject khi unit ở `NEGOTIATING/CONTRACTED/UNDER_FITOUT` | Meeting: *"status đang thương thảo là lock sảnh k cho book"* |
| 21 | Nhiều khách cùng book 1 unit theo priority | `UnitBooking.priority` | ✅ | — | Suy luận (đã build sẵn khi handle multi-lead) |
| 22 | Lịch sử "sảnh này khách nào thuê" | `UnitHistory` + `Contract.unitId` | ✅ | — | Meeting: *"lưu lịch sử sảnh cho khách nào thuê"* |
| 23 | Lịch sử "khách này đã thuê những sảnh nào" | `Contract` list by `tenantId` | ✅ | — | Meeting: *"lưu lịch sử khách đã thuê những sảnh nào"* |

### 1.4 Cảnh báo & báo cáo mặt bằng

| # | Yêu cầu | Hiện tại | Trạng thái | Đề xuất | Nguồn |
|---|---|---|---|---|---|
| 24 | Cảnh báo HĐ gần hết hạn (180/90/60/30 ngày) | Model `Notification` có, **cron chưa có** (ghi rõ trong IMPLEMENTATION.md § Known Limitations) | ❌ | Cron job daily 08:00 quét `Contract.endDate` và tạo Notification cho `managedBy` + `LEASING_MANAGER` | Meeting: *"cảnh báo thời gian gần hết hạn"* |
| 25 | Cảnh báo mốc thi công tránh trễ khai trương | `FitoutSlaPolicy` + `FitoutMilestone` (Wave 4) | 🟡 | Thêm rule alert "còn ≤ X ngày đến `openingDate`" cho từng project | Meeting: *"cảnh báo các mốc thời gian, đặc biệt là thi công (tránh trễ)"* |
| 26 | Report giá thuê trung bình theo tầng/mall | `/analytics/occupancy` | 🟡 | Verify có field `avgRentPerSqm` breakdown floor × mall | Meeting: *"report: giá thuê, tỉ lệ lấp đầy"* + *"báo cáo doanh thu, doanh số, tỉ lệ lấp đầy"* |
| 27 | Report tỉ lệ lấp đầy theo tầng/mall/ngành hàng | `OccupancyAnalyticsService.byMall/byFloor/byCategory` | ✅ | — | Meeting: *"report: giá thuê, tỉ lệ lắp đầy"* |
| 28 | Report tỉ lệ ngành hàng theo tầng, dự án | `OccupancyAnalyticsService.byCategory` | 🟡 | Verify có breakdown floor × category ratio (không chỉ tổng mall) | Meeting: *"quan tâm tỉ lệ ngành hàng theo tầng, dự án"* + Excel BC (sheet Ngành hàng × Tầng) |
| 29 | Doanh thu tính trên **tiền thuê sảnh** (khác doanh thu tenant) | `/reports/revenue` từ Invoice | 🟡 | Tách rõ 2 số: "Doanh thu tiền thuê" (billing) vs "Doanh thu tenant" (sales turnover) trên dashboard | Meeting: *"Doanh thu báo cáo trên tiền thuê sảnh"* |

---

## 2. Nhóm sidebar QUY TRÌNH BÁN HÀNG

### 2.1 Tab BOOKING (`/bookings`)

| # | Yêu cầu | Hiện tại | Trạng thái | Đề xuất | Nguồn |
|---|---|---|---|---|---|
| 30 | Tạm book unit trước khi làm tờ trình | `UnitBooking` (PENDING/ACTIVE/EXPIRED/CANCELLED/CONVERTED) | ✅ | — | Meeting: *"Có báo giá ban đầu, tạm book, làm tờ trình (1 form)"* |
| 31 | Ưu tiên nhiều khách trên 1 unit | `UnitBooking.priority` | ✅ | — | Suy luận (đã build sẵn) |
| 32 | Sale đề xuất giá lúc booking, chờ duyệt lệch giá | `proposedRentPerSqm`, `priceApprovalStatus`, `priceDeviationPercent` | ✅ | — | Meeting: *"giá chính sách, giá cho thuê thực tế -> báo data này lên ms.Oanh"* |
| 33 | Lock unit khi booking ACTIVE | Unit.status → BOOKING khi activate | 🟡 | Verify **cả 2 chiều**: (a) `bookings.activate()` → `Unit.status → BOOKING`; (b) khi booking `CANCELLED` hoặc `EXPIRED` → revert `Unit.status → VACANT`; cron expire cũng phải trigger revert | Meeting: *"status đang thương thảo là lock sảnh k cho book"* |
| 34 | 1 booking gồm nhiều dịch vụ (bỏ/thêm khi trình) | `SlotBooking` = 1 slot / booking, chưa có line items; `UnitBooking` không có dịch vụ đính kèm | ❌ | Model `BookingLine[]` (bookingId, serviceCode, name, qty, unitPrice, totalPrice) áp dụng cho **cả dài hạn và ngắn hạn** — dài hạn cần track dịch vụ kèm lô (LED, MKT...) ngay từ booking để carry-over khi convert sang Proposal | Meeting: *"1 HĐ book nhiều dịch vụ -> có thể bỏ or thêm dịch vụ khi trình ms. oanh"* |
| 35 | Cross-department handoff (a.Biên báo a.Sơn để book) | `BookingActivity` có 7 activity type (CREATED/ACTIVATED/PRIORITY_CHANGED/EXTENDED/NOTE_ADDED/CONVERTED/CANCELLED/EXPIRED), chưa có handoff | ❌ | Thêm `BookingActivityType.INTER_DEPT_REQUEST` vào enum; thêm `UnitBooking.reassignedToId String?`; API `PATCH /bookings/:id/reassign {assignedToId}`; ghi `BookingActivity.INTER_DEPT_REQUEST` + gửi in-app Notification đến người nhận mới | Meeting: *"a Biên phải liên hệ a Sơn để booking chứ k tự ý book"* |
| 36 | Lịch sử booking đầy đủ (audit) | `BookingActivity` | ✅ | — | Suy luận (best practice audit) |
| 37 | Booking cho **sảnh ngắn hạn** (theo ngày/giờ) | `SlotBooking` (DAILY/HOURLY/MONTHLY) | ✅ | — | Meeting mục Ngắn hạn |
| 38 | Booking hết hạn tự động release | `holdDays`, `expiresAt` có trong schema | 🟡 | Verify cron scan `expiresAt` → (a) `UnitBooking.status → EXPIRED`; (b) revert `Unit.status → VACANT`; (c) ghi `BookingActivity.EXPIRED`; (d) gửi Notification cho `assignedTo` (sale phụ trách) | Suy luận (best practice) |
| 89 | Tạo UnitBooking trực tiếp từ trang /bookings | BookingsPage chỉ có nút "Tạo booking slot" (SlotBooking), không có nút tạo UnitBooking dài hạn; phải vào SpacesPage hoặc CRM | ❌ | Thêm button "Tạo booking lô" trên BookingsPage → Dialog chọn Unit + Lead/Customer + requestedArea/Term/expectedRent + assignedTo | Suy luận (UX gap — sales không thể tạo booking dài hạn từ trang quản lý booking) |
| 90 | `ConvertToProposalDialog` thiếu fields mới | Dialog hiện chỉ có: area, term, startDate, rentPerSqm, camPerSqm, deposit (tháng), rentFree, escalation, notes | ❌ | Bổ sung sau khi các model được thêm: `documentType` (OTL vs Tờ Trình XN), `depositFitout`, `fitoutFee`, `utilityFee`, `operatingHours`, `afterHoursFee` → carry-over từ BookingLine dịch vụ | Suy luận (form convert sẽ bị thiếu khi các field mới được thêm vào Proposal) |

### 2.2 Tab ĐỀ XUẤT (`/proposals`) — Tờ Trình

| # | Yêu cầu | Hiện tại | Trạng thái | Đề xuất | Nguồn |
|---|---|---|---|---|---|
| 39 | Thư đề nghị cho thuê (OTL — Offer To Lease) tách biệt | Chỉ có `Proposal` chung, không phân biệt OTL / TIF | ❌ | Thêm `Proposal.documentType` enum: `OTL` \| `TIF` \| `TO_TRINH_XAC_NHAN` \| `TO_TRINH_DIEU_CHINH`; đồng thời thêm `otlNumber String?`, `otlSentDate DateTime?`, `otlSignedDate DateTime?` (xem #84); khi `documentType = OTL` → UI hiển thị form gọn (không cần 21 mục), khi `TO_TRINH_XAC_NHAN` → bật full 21 mục | Excel KT (cột "OTL" tách với "LA") + Meeting: *"Thương thảo thư đề nghị (ndung)"* |
| 40 | Tờ Trình xác nhận thuê — 21 mục theo template | `Proposal` field **đã có**: `businessModel` (4), `serviceFeeSqm` (10), `businessSupportFeeSqm` (11), `rentCurrency` (15), `exchangeRate/Source` (15), `fitoutDays` (18), `handoverDate` (20), `openingDate`, `specialConditions` (21), `deposit` (17, dạng số tháng), `contractedArea` (6), `term` (7), `startDate` (8), `rentPerSqm` (9), `editorContent` | 🟡 | Schema **thiếu 4 field cho 4 mục**: `utilityFee Float @default(0)` (mục 12 — Phí tiện ích), `operatingHours String?` (mục 13 — Giờ hoạt động, vd: "10:00–22:00"), `afterHoursFee Float @default(0)` (mục 14 — Phí ngoài giờ), `paymentTermDays Int @default(30)` (mục 16 — Điều khoản thanh toán). Sau khi thêm 4 field → verify ProposalEditor render đủ cả 21 mục | Tờ Trình XN (21 mục nguyên văn) |
| 41 | Cọc thuê + Cọc thi công + Phí thi công (3 khoản riêng) | `Contract.deposit` (1 field); `Proposal.deposit` (số tháng) — cả hai không phân biệt 3 khoản | ❌ | Tách thành: `depositLease Float` (tiền cọc thuê = N tháng × monthlyRent), `depositFitout Float` (cọc thi công — số tiền cố định), `fitoutFee Float` (phí thi công) — **thêm vào cả `Proposal` và `Contract`**; sửa `ConvertToProposalDialog` + `Contract` create form để nhập 3 khoản riêng | Excel KT (3 cột: "CỌC ĐẢM BẢO", "CỌC THI CÔNG", "PHÍ THI CÔNG") + Tờ Trình XN mục 17 & 19 |
| 42 | Tỷ giá VND/USD ghi vào Tờ Trình | `Proposal.rentCurrency`; **`exchangeRate Float?` và `exchangeRateSource String?` đã được thêm vào schema** (xác nhận từ schema.prisma line 691–692) | 🟡 | Schema đã xong. Verify UI ProposalEditor hiển thị 2 field nhập tỷ giá + nguồn khi `rentCurrency = 'USD'`; tự động fill tỷ giá mặc định từ config | Tờ Trình XN mục 15: *"tỷ giá bán ra của Ngân hàng TMCP Ngoại Thương VN... 26.340 VND/USD"* |
| 43 | Layout mặt bằng đính kèm Tờ Trình (PDF) | `UnitMedia` có FLOOR_PLAN | 🟡 | Link UnitMedia vào PDF export của Proposal | Tờ Trình XN cuối: *"LAYOUT MẶT BẰNG NHƯ SAU: [ảnh đính kèm]"* |
| 44 | Xuất PDF Proposal / Tờ Trình / TIF | **Chưa có** (IMPLEMENTATION.md § Known Limitations) | ❌ | Cần **3 template PDF độc lập** gắn với `documentType`: (a) **OTL template** — form ngắn gọn, tiếng Việt; (b) **Tờ Trình XN template** — đúng 21 mục, chữ ký 3 cấp (PTGĐ + TP Cho thuê + KT), kèm layout mặt bằng; (c) **TIF template** — tiếng Anh, theo cấu trúc file `Form TIF`. Dùng `pdfmake` (client-side) hoặc `puppeteer` (server-side); mỗi `documentType` map sang template renderer riêng | Tờ Trình XN + TIF (đều là văn bản chính thức) + #39 (documentType) |
| 45 | Sửa giá thẳng trong form Proposal | `rentPerSqm` editable | ✅ | — | Meeting: *"giá thuê có thể cao hoặc thấp hơn so với quy định nên dc edit giá trong form"* |
| 46 | Giá lệch quy định → trigger duyệt Ms.Oanh | Có `discount` field trigger workflow; `ApprovalPolicyRule.conditionType` là String (free text) nhưng chưa có rule `PRICE_OUT_OF_RANGE` được seed | 🟡 | (1) Thêm `ApprovalPolicyRule` record với `conditionType = 'PRICE_OUT_OF_RANGE'`; (2) Service logic: so sánh `Proposal.rentPerSqm` với `CategoryMallPricing.min/max` của mall × category × floor; (3) Nếu out-of-range → tự động insert CEO step vào workflow; nếu in-range → skip CEO step. **Cần seed rule vào DB khi deploy** | Meeting: *"giá thuê trong mức quy định thì k cần ms.Oanh duyệt, giá ngoài quy định cần ms.Oanh duyệt"* |
| 47 | Đính kèm file trong form Đề xuất | `UnifiedDocument` (entityType=PROPOSAL) | ✅ | Verify UI upload có sẵn ở ProposalsPage | Meeting: *"đính kèm file trong form"* |
| 48 | Versioning — snapshot các lần thương thảo | `ProposalVersion` + API compare (Wave 2) | ✅ | — | Suy luận (best practice compliance) |
| 49 | Nhiều kịch bản tài chính cho 1 Proposal | `ProposalScenario` | ✅ | — | Suy luận (đã build sẵn Wave 2) |
| 50 | Deal scoring | `DealScoreCriterion`, `ProposalDealScore` (Wave 2) | ✅ | — | Suy luận (đã build sẵn Wave 2) |
| 51 | Tờ Trình điều chỉnh chốt thuê (pre-signing) | `ContractAmendment` có nhưng dành cho post-signing; `ProposalAdjustment` chưa có trong schema | ❌ | **Khuyến nghị: model `ProposalAdjustment` mới** (proposalId, changeType `HANDOVER_DATE\|OPENING_DATE\|RENT\|OTHER`, fieldName, oldValue, newValue, reason, requestedById, approvedById, status `PENDING\|APPROVED\|REJECTED`, createdAt) — **không** extend `ContractAmendment` vì ngữ nghĩa khác (pre-sign điều chỉnh trước ký vs post-sign sửa sau khi ký). UI: hiển thị trên detail Proposal dạng "Yêu cầu điều chỉnh"; khi approved → cập nhật fields tương ứng trên Proposal | Tờ Trình ĐC (file `20260525_TTr Dieu chinh thong tin chot thue.docx` — điều chỉnh Ngày Bàn giao, Ngày Khai trương trước ký HĐ) |
| 91 | `Proposal.utilityFee` — Phí tiện ích (mục 12 Tờ Trình XN) | Chưa có field; hiện chỉ có `serviceFeeSqm` (DV) và `businessSupportFeeSqm` (hỗ trợ KD) | ❌ | Thêm `utilityFee Float @default(0)` vào model `Proposal` (đơn vị: VND/m²/tháng hoặc VND/tháng fixed); đồng thời thêm vào Contract | Tờ Trình XN mục 12: *"Phí Tiện ích (Điện, Nước)"* |
| 92 | `Proposal.operatingHours` — Giờ hoạt động (mục 13 Tờ Trình XN) | Chưa có field | ❌ | Thêm `operatingHours String?` vào model `Proposal` (ví dụ: "10:00–22:00 hàng ngày"); hiển thị trên Tờ Trình XN | Tờ Trình XN mục 13: *"Giờ hoạt động"* |
| 93 | `Proposal.afterHoursFee` — Phí ngoài giờ (mục 14 Tờ Trình XN) | Chưa có field | ❌ | Thêm `afterHoursFee Float @default(0)` vào model `Proposal` (phí/giờ khi hoạt động ngoài giờ quy định); đồng thời thêm vào Contract | Tờ Trình XN mục 14: *"Phí ngoài giờ"* |
| 94 | `Proposal.paymentTermDays` — Điều khoản thanh toán (mục 16 Tờ Trình XN) | Chưa có field riêng; `Contract.paymentTerm Int @default(30)` tồn tại nhưng chưa có ở Proposal | ❌ | Thêm `paymentTermDays Int @default(30)` vào model `Proposal`; carry-over sang Contract khi approve + convert | Tờ Trình XN mục 16: *"Thanh toán... trước... ngày"* |
| 95 | Post-approval → tự động tạo Contract draft | Sau khi tất cả ApprovalStep done (status APPROVED), không có trigger tạo Contract; user phải vào /contracts tạo thủ công | ❌ | Khi `ApprovalWorkflow.status → APPROVED` (all steps done) → auto-create `Contract` với status `DRAFT`, copy fields từ Proposal (unitId, tenantId, rent, cam, deposit, term, startDate, escalation, utilityFee, afterHoursFee, paymentTermDays, depositFitout, fitoutFee); notify `managedBy` để review và ký | Suy luận (workflow gap — link Proposal APPROVED → Contract) |

### 2.3 Tab PHÊ DUYỆT (`/approvals`)

| # | Yêu cầu | Hiện tại | Trạng thái | Đề xuất | Nguồn |
|---|---|---|---|---|---|
| 52 | Workflow **Dài hạn**: Sales → KT (a.Công) → c.Trang (TP Cho thuê) → Ms.Oanh (PTGĐ) | `ApprovalPolicyRule` engine + Role `FINANCE`, `LEASING_MANAGER`, `CEO` | 🟡 | Seed policy: `stepOrder 1 = FINANCE`, `2 = LEASING_MANAGER`, `3 = CEO`, `conditionType = DEAL_TYPE match LONG_TERM`. Cần **map user cụ thể** (a.Công, c.Trang, Ms.Oanh) vào `ApprovalStep.approverId` khi tạo workflow | Meeting: *"quy trình: sales -> K toán (a Công) -> chị Trang -> Ms. Oanh"* + Tờ Trình XN (ký bởi Trần Viên Ngọc Oanh - PTGĐ, Phạm Thị Khánh Trang - TP Cho thuê, Nguyễn Đình Công - KT) |
| 53 | Workflow **Ngắn hạn**: Sales → a.Biên → c.Hà → KT → Ms.Oanh | Chưa có role riêng cho a.Biên (sales ngắn hạn) vs a.Sơn (sales dài hạn) | ❌ | 2 lựa chọn: (a) Thêm role `SHORT_TERM_SALES_LEAD`, `SHORT_TERM_SALES_MANAGER`; (b) Dùng user tag / assignment cụ thể + `ApprovalPolicyRule.conditionType = DEAL_TYPE match SHORT_TERM` | Meeting (mục Ngắn hạn): *"sales -> a biên -> c Hà -> KT -> ms.Oanh"* |
| 54 | Chỉ Ms.Oanh ký tờ trình cuối cùng (last step) | `ApprovalStep.stepOrder` cuối | ✅ | — | Meeting: *"ms. oanh ký tờ trình"* |
| 55 | Giá trong ngưỡng → **không** cần Ms.Oanh duyệt | Rule engine chỉ có `DISCOUNT_PCT` | ❌ | Thêm `conditionType = PRICE_WITHIN_POLICY_RANGE` skip CEO step | Meeting: *"giá thuê trong mức quy định thì k cần ms.Oanh duyệt, giá ngoài quy định cần ms.Oanh duyệt"* |
| 56 | Ms.Oanh có thể bỏ/thêm dịch vụ khi trình duyệt | Chưa có UI edit-during-review | ❌ | Cho approver quyền edit `Proposal.services[]` với ghi audit vào `ContractEvent` / `AuditLog` | Meeting: *"1 HĐ book nhiều dịch vụ -> có thể bỏ or thêm dịch vụ khi trình ms. oanh"* |
| 57 | Ghi nhận comment tại mỗi step | `ApprovalStep.comment` | ✅ | — | Suy luận (best practice audit) |
| 58 | Approval theo mall (site nào duyệt site đó) | `UserMallAccess` (Wave 5) | 🟡 | Verify approval query filter theo `UserMallAccess.mallId` | Meeting: *"site nào thấy data site đó, trên khối thấy all data"* |

### 2.4 Tab HỢP ĐỒNG (`/contracts`)

| # | Yêu cầu | Hiện tại | Trạng thái | Đề xuất | Nguồn |
|---|---|---|---|---|---|
| 59 | CRUD hợp đồng + template + clause library | `Contract`, `ContractTemplate`, `ContractClause` (Wave 2) | ✅ | — | Suy luận (đã build sẵn Wave 2) |
| 60 | Amendment sau khi ký | `ContractAmendment` (Wave 2) | ✅ | — | Suy luận (đã build sẵn Wave 2) |
| 61 | Timeline sự kiện HĐ | `ContractEvent` (Wave 2) | ✅ | — | Suy luận (đã build sẵn Wave 2) |
| 62 | File đính kèm HĐ (bản gốc, scan, sửa đổi) | `ContractFile` + `UnifiedDocument` | ✅ | — | Meeting: *"đính kèm file trong form"* |
| 63 | eSign integration | **Chưa có** (Known Limitations) | ❌ | Tích hợp DocuSign / VSign — đánh dấu future work | Suy luận (best practice enterprise) |
| 64 | Cảnh báo hạn HĐ gần hết | `/contracts/expiring` API, **cron chưa có** | 🟡 | Cron daily gom `Contract.endDate` trong 180/90/60/30 ngày → Notification | Meeting: *"cảnh báo thời gian gần hết hạn"* |
| 65 | Renewal risk scoring | `RenewalRiskScore` (Wave 5) | ✅ | — | Suy luận (đã build sẵn Wave 5) |
| 66 | Phạt hủy sớm — auto tính theo policy | `ContractTermination.penaltyAmount` (nhập tay) | 🟡 | Thêm `TerminationPenaltyPolicy` (rule: N tháng rent, hoặc % deposit); auto-tính khi tạo termination | Meeting: *"có quy định về phạt khi khách hủy sớm so với HĐ"* |
| 67 | Status: ký HĐ / đang thương thảo / thi công / khai trương | `ContractStatus` + `UnitStatus` + `FitoutProject.status` | 🟡 | View timeline unified cho leadership theo từng tenant | Meeting: *"Status: ký HĐ, đang thương thảo, thi công, khai trương"* |
| 68 | Billing schedule tự động sinh từ HĐ | `BillingScheduleEntry` + cron (Wave 3) | ✅ | — | Suy luận (đã build sẵn Wave 3) |
| 69 | Xuất PDF Hợp đồng từ template | `ContractTemplate.render` API | 🟡 | Verify UI export PDF từ ContractsPage | Suy luận (nghiệp vụ HĐ chính thức) |

### 2.5 Tab KHÁCH THUÊ (`/tenants`)

| # | Yêu cầu | Hiện tại | Trạng thái | Đề xuất | Nguồn |
|---|---|---|---|---|---|
| 70 | Thông tin thương hiệu, pháp nhân | `Tenant.brandName`, `companyName`, `taxCode` | ✅ | — | Meeting: *"thông tin khách hàng: thông tin thương hiệu, pháp nhân, người đại diện"* |
| 71 | Người đại diện pháp luật (khác contact) | `Tenant.contactName/Email/Phone` | 🟡 | Thêm `Tenant.legalRepresentative` (họ tên) + `legalRepPosition` | Meeting: *"...người đại diện"* + Tờ Trình XN mục 1 (Tên Pháp nhân) |
| 72 | Ngành hàng khách thuê | `Tenant.categoryId` → `Category` | ✅ | — | Meeting: *"ngành hàng, mô hình kinh doanh"* + Excel BC (cột "NGÀNH HÀNG") |
| 73 | Logo thương hiệu | `Tenant.logo` | ✅ | — | Suy luận (đi kèm brandName) |
| 74 | Danh sách sảnh khách đã/đang thuê | Via `Contract.tenantId` | ✅ | — | Meeting: *"lưu lịch sử khách đã thuê những sảnh nào"* |
| 75 | Tenant portal login | `Tenant.isPortalUser` + `portalUsers` | ✅ | — | Suy luận (đã build sẵn) |
| 76 | Báo cáo đánh giá khách thuê (12 tháng doanh thu, DT/m², %Tiền thuê/DT, Tổng chi phí) — theo mẫu Excel `THISO MALL_MẪU BÁO CÁO ĐÁNH GIÁ` | `SalesTurnover` + `/reports/tenant-sales` có, layout Excel chưa match | 🟡 | Bổ sung Excel export template đúng format `THISO MALL_MẪU BÁO CÁO ĐÁNH GIÁ`: gồm cột Tháng 1–12, DT/m², %Tiền thuê/DT, tổng chi phí per tenant | Excel BC (toàn bộ layout: DOANH THU T1/2026 – T12/2026, DT/m², %Tiền thuê/DT, Tổng chi phí, breakdown ngành hàng × tầng) |
| 77 | Tenant scoring (đánh giá độ tốt của khách) | Chưa có (chỉ có DealScore cho Proposal) | ❌ | Thêm `TenantScore` (payment history + ticket count + sales trend) — tương tự RenewalRiskScore nhưng cho existing tenant | Excel BC (bản chất là "báo cáo đánh giá" theo tên file) + Suy luận (score hóa để so sánh) |
| 78 | Blacklist tenant | `CustomerStatus.BLACKLISTED` cho Customer, chưa có cho Tenant | 🟡 | Thêm `Tenant.status` enum tương tự | Suy luận (đã có cho Customer, chưa parity cho Tenant) |

---

## 3. RBAC theo phạm vi (xuyên suốt các tab)

| # | Yêu cầu | Hiện tại | Trạng thái | Đề xuất | Nguồn |
|---|---|---|---|---|---|
| 79 | Site nào thấy data site đó | `UserMallAccess` (Wave 5) | 🟡 | Enforce filter mặc định ở list endpoint: `bookings`, `proposals`, `contracts`, `tenants`, `invoices`, `tickets` | Meeting: *"site nào thấy data site đó, trên khối thấy all data"* |
| 80 | Cấp khối / CEO / Ms.Oanh thấy all | `Role.CEO` bypass filter | ✅ | Verify code có bypass | Meeting: *"trên khối thấy all data"* + *"ms.Oanh thấy all"* |
| 81 | Sales chỉ thấy data của mình (a.Sơn không thấy của a.Biên) | Chưa filter theo `assignedToId` | ❌ | Add default filter `WHERE assignedToId = user.id OR createdById = user.id` cho role LEASING_EXECUTIVE + short-term equivalent | Meeting: *"a Sơn và Biên k thấy data nhau (chỉ thấy mặt bằng)"* |
| 82 | Sales vẫn thấy all mặt bằng (chỉ ẩn Booking/Proposal của người khác) | Chưa tách | ❌ | RBAC scope riêng: `spaces:read = all`, `bookings:read = own`, `proposals:read = own` | Meeting: *"(chỉ thấy mặt bằng)"* + *"sales có thể thấy all data"* |
| 83 | Audit sửa giá / sửa form | `AuditLog` model có, **middleware chưa auto-log** (Known Limitations) | 🟡 | Viết NestJS interceptor auto ghi AuditLog với diff before/after | Suy luận (best practice + IMPLEMENTATION.md ghi rõ chưa có) |

---

## 4. Tài liệu / Documents (từ Excel `Thông tin Khách thuê`)

Excel tracking cột riêng: **OTL, LA, Cọc đảm bảo, Cọc thi công, Phí thi công, Tờ trình chốt thuê, Hoarding, Ngày nhận MB, Ngày khai trương**.

| # | Yêu cầu | Hiện tại | Trạng thái | Đề xuất | Nguồn |
|---|---|---|---|---|---|
| 84 | OTL (Offer To Lease) — có trạng thái riêng | `Proposal` gộp chung | ❌ | Track `Proposal.documentType = OTL` + `otlNumber`, `otlSentDate`, `otlSignedDate` | Excel KT (cột "OTL" tiêu đề chính) |
| 85 | LA (Lease Agreement) | `Contract` | ✅ | — | Excel KT (cột "LA") |
| 86 | Cọc đảm bảo | Chưa tách khỏi `Contract.deposit` | ❌ | Thêm 3 khoản (xem #41) | Excel KT (cột "CỌC ĐẢM BẢO") + Tờ Trình XN mục 17 |
| 87 | Hoarding fee | Chưa có field | ❌ | Thêm `Contract.hoardingFee` hoặc dùng `ServicePriceCatalog` với code `HOARDING` | Excel KT (cột "HOARDING") |
| 88 | Ngày bàn giao / khai trương / thi công | `Proposal.handoverDate`, `openingDate`, `fitoutDays` | ✅ | Đồng bộ sang `Contract` khi convert | Excel KT (cột "Ngày nhận Mặt bằng", "Ngày Khai trương") + Tờ Trình XN mục 7, 20 + Tờ Trình ĐC (mục 1, 2 điều chỉnh ngày này) + TIF (Handover/Commencement/Opening) |

---

## 5. Ưu tiên (Prioritization)

| Priority | Nhóm | Items |
|---|---|---|
| **P0** — Chặn nghiệp vụ | Approval flow, RBAC, cấu trúc tài chính | #41 (tách 3 khoản deposit), #91–94 (4 field thiếu trong Proposal), #52-53 (2 workflow dài/ngắn), #55 (skip CEO khi trong range), #79-82 (RBAC scope), #95 (post-approval → Contract draft) |
| **P1** — Output nghiệp vụ | PDF, Excel export, template | #39 (documentType + OTL fields), #40 (verify 21 mục + 4 field mới), #43 (layout attach), #44 (PDF 3 template), #51 (ProposalAdjustment pre-sign), #76 (Excel báo cáo đánh giá) |
| **P2** — Cấu trúc mặt bằng | Merge, phân loại, dual pricing | #2 (merge/split), #3-4 (allowLong/Short + spaceType), #5-6 (flexible area + tier), #7 (contracted vs actual area), #13-15 (dual pricing + service catalog) |
| **P3** — Booking & cảnh báo | Line items, cron, UX | #34 (BookingLine[]), #35 (cross-dept handoff + reassign), #38 (cron expire + notify), #89 (tạo UnitBooking từ /bookings), #90 (ConvertDialog mở rộng), #24 (cron HĐ hết hạn), #25 (cron thi công trễ), #14 (existing tenant discount) |
| **P4** — Nâng cấp | Tenant scoring, eSign, blacklist | #46 (seed PRICE_OUT_OF_RANGE rule), #63 (eSign), #66 (auto penalty policy), #77 (TenantScore), #78 (blacklist) |

---

## 6. Ghi chú các item cần **verify inline** trước khi làm

Những item đánh 🟡 cần grep code confirm trước khi đưa vào backlog:

- #13 UnitSlot auto-create cho unit `leaseTermType=SHORT`
- #16 UI formula display asking rent
- #17 Report policy vs actual price có sẵn chưa
- #20 `bookings.service.ts` check unit status VACANT khi create
- #26 `avgRentPerSqm` breakdown trong occupancy analytics
- #28 breakdown floor × category trong `byCategory`
- #33 `bookings.service.ts` transition unit status → BOOKING **và** revert → VACANT khi cancel/expire
- #38 Cron scan booking expired → revert unit status + notify sale
- #40 `Proposal.editorContent` có đủ 21 field (đặc biệt 4 field mới #91–94 sau khi thêm)
- #42 UI ProposalEditor có field nhập `exchangeRate` + `exchangeRateSource` khi USD (**schema đã có, chỉ verify UI**)
- #46 Seed `ApprovalPolicyRule` `PRICE_OUT_OF_RANGE` + service logic check CategoryMallPricing
- #47 UI upload file trong ProposalsPage
- #58 Approval scope theo `UserMallAccess`
- #64 Cron cảnh báo `endDate`
- #67 UnifiedTimeline view
- #69 UI export PDF Contract
- #76 Excel export tenant sales
- #80 CEO bypass filter

---

*Cập nhật sau khi có phản hồi của Trang / Ms.Oanh về mapping user cụ thể vào các step approval.*
