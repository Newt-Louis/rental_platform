# Báo cáo QC vận hành / SRE — THISO Leasing UAT

**Thời điểm kiểm tra:** 19/07/2026 (Asia/Ho_Chi_Minh)  
**Phạm vi:** Docker Compose UAT cục bộ, health/readiness, tài nguyên, log, migration, khả năng tự phục hồi, backup và observability.  
**Nguyên tắc:** Chỉ kiểm tra đọc; không restart, stop, seed, restore hoặc thay đổi dữ liệu.

## Kết luận điều hành

UAT hiện phục vụ được: frontend, backend, PostgreSQL và Redis đều `healthy`; API liveness/readiness và frontend trả HTTP 200; schema có 18 migration và đang đồng bộ. Tuy nhiên môi trường **chưa đủ an toàn để vận hành như production** vì có một đường chạy setup có thể xóa toàn bộ dữ liệu, không dịch vụ nào có restart policy, database/Redis công khai cổng trên mọi interface, không có giới hạn tài nguyên/log rotation và chưa có bằng chứng restore thực tế hiện hành.

**Khuyến nghị phát hành:** `CONDITIONAL / HOLD` cho đến khi xử lý OPS-001. Không chạy `migrate-uat` profile `setup` trên dữ liệu cần giữ.

## Bảng phát hiện

| ID | Severity | Phát hiện | Bằng chứng | Ảnh hưởng / đề xuất |
|---|---|---|---|---|
| OPS-001 | **Critical** | Job migration UAT luôn seed phá huỷ dữ liệu | `docker-compose.uat.yml`: `SEED_DATABASE: "true"`, command chạy migrate rồi `seed.ts`; `seed.ts:11-81` có hàng chục `deleteMany()` cho invoice, payment, ticket, contract, proposal, lead, unit, user, tenant, mall... | Chạy profile `setup` sẽ xóa dữ liệu nghiệm thu. Tách migrate và demo seed; mặc định `SEED_DATABASE=false`; seed phải có xác nhận rõ ràng và chỉ cho DB tên demo/disposable. Trước mọi migrate phải backup và kiểm chứng manifest. |
| OPS-002 | **High** | Không container nào tự khởi động lại sau crash/reboot | `docker inspect`: cả 4 dịch vụ `restart=no`, `maxRetry=0` | Thêm `restart: unless-stopped` (hoặc policy do nền tảng quản lý), kiểm tra boot persistence và alert restart loop. Chạy chaos/restart drill ở cửa sổ được duyệt. |
| OPS-003 | **High** | PostgreSQL và Redis được publish ra mọi interface host | `0.0.0.0:55432->5432`, `0.0.0.0:56379->6379`; Redis không thấy auth/TLS | Không publish DB/cache nếu chỉ dùng nội bộ; nếu cần quản trị, bind `127.0.0.1`, firewall/VPN. Thiết lập Redis ACL/password, PostgreSQL network allowlist và TLS theo môi trường. |
| OPS-004 | **High** | Chưa có bằng chứng restore drill hiện hành | Runbook yêu cầu restore hàng tháng; artifact release chỉ xác nhận manifest và guard fixture, `migrations.checkedLive=false`; không có kết quả restore thực tế trong báo cáo hiện hành | Tổ chức restore vào DB cô lập `restore_verify_*`, đo RTO, kiểm tra số bảng/dòng và mẫu upload. Lưu biên bản cùng checksum, người thực hiện và thời điểm. |
| OPS-005 | **Medium** | Không giới hạn CPU/RAM/PID và không log rotation | `docker inspect`: memory=0, cpu=0; log driver `json-file` với `Config={}` | Một leak/log storm có thể chiếm toàn host. Đặt memory/CPU/PID phù hợp; `json-file` với `max-size`/`max-file`, hoặc chuyển log tập trung. |
| OPS-006 | **Medium** | Chưa có monitoring/alerting UAT gắn với stack leasing | Compose chỉ có 4 dịch vụ, không có exporter/collector; health chỉ được polling bởi Docker | Thu thập request latency/error rate, DB connections, Redis health, disk/volume, scheduler lag, backup age; cảnh báo 5xx, readiness fail, restart, disk >80%, backup quá RPO. Gắn owner/escalation. |
| OPS-007 | **Medium** | Release report có thể tạo cảm giác sẵn sàng quá mức | `artifacts/release-readiness-uat.json` ghi `verdict: READY` dù live performance `SKIP` và migration `checkedLive:false` | Verdict UAT cuối phải fail/conditional khi thiếu migration evidence, performance window hoặc restore evidence bắt buộc. Tách rõ “functional ready” và “operational ready”. |
| OPS-008 | **Medium** | Lệnh Compose phụ thuộc biến bí mật kể cả khi chỉ xem trạng thái/log | Không nạp `UAT_POSTGRES_PASSWORD` và `UAT_JWT_SECRET` thì `docker compose ps/logs` lỗi interpolation | Cung cấp wrapper/runbook nạp secret từ secret store; tránh ghi secret vào shell history. Với quan sát khẩn cấp có thể dùng `docker ps/logs` trực tiếp. |
| OPS-009 | **Low** | Frontend liên tục yêu cầu asset không tồn tại | Nginx log: `open() /usr/share/nginx/html/vite.svg failed`, referrer `/admin` và `/login` | Sửa favicon/manifest sang asset thực; thêm smoke check static asset để tránh noise và trải nghiệm icon lỗi. |
| OPS-010 | **Low** | Image UAT được build cục bộ, không có digest/tag bất biến thể hiện trong compose | `backend-uat`/`frontend-uat` dùng `build:`; tên image theo project | Với UAT dùng image registry có tag commit SHA và lưu digest trong release evidence để rollback có thể tái lập. |

## Bằng chứng kiểm tra trực tiếp

### Trạng thái và tài nguyên

```text
backend-uat   Up 2 hours (healthy)   0.0.0.0:53000->3000
frontend-uat  Up 2 hours (healthy)   0.0.0.0:58080->80
postgres-uat  Up 25 hours (healthy)  0.0.0.0:55432->5432
redis-uat     Up 24 hours (healthy)  0.0.0.0:56379->6379

frontend  12.3 MiB
backend   73.11 MiB
postgres  75.84 MiB
redis      4.13 MiB
```

Mẫu `docker stats --no-stream` cho thấy tài nguyên hiện tại thấp, nhưng đây chỉ là snapshot khi gần như không tải và không thay thế capacity test.

### Health/readiness

```text
GET http://localhost:53000/api/health       -> 200
database=up, redis=up, ai/email/sap=disabled
GET http://localhost:53000/api/health/ready -> 200
database=up, redis=up
GET http://localhost:58080/                 -> 200
```

Healthcheck backend có `start_period: 30s`, interval 10s, timeout 5s, 12 retries. Frontend phụ thuộc backend healthy. Đây là nền tảng tốt, nhưng readiness hiện chưa kiểm tra dung lượng disk, migration version hoặc phụ thuộc nghiệp vụ bên ngoài.

### Migration và database

```text
18 migrations found
Database schema is up to date!
Database size: 14 MB
Applied/finished migrations: 18
```

### Log

Trong 2 giờ log được kiểm tra không thấy exception/fatal/backend error. Có hai lỗi asset Nginx:

```text
open() "/usr/share/nginx/html/vite.svg" failed (2: No such file or directory)
```

## Runbook đề xuất

### 1. Kiểm tra đầu ca

1. Nạp secret từ secret manager vào session được bảo vệ; không commit `.env` và không dán secret vào ticket/log.
2. Chạy `docker compose -p leasing-uat -f docker-compose.uat.yml ps`.
3. Gọi `/api/health`, `/api/health/ready`, frontend `/` và frontend proxy `/api/health`.
4. Kiểm tra restart count, OOM, disk/volume, log 15–60 phút gần nhất.
5. Nếu readiness lỗi, dừng phát hành; giữ log/request ID và xác định DB hay Redis trước.

### 2. Triển khai an toàn

1. Ghi image digest/commit, migration cuối và thời điểm deploy.
2. Tạo backup DB + uploads cùng cửa sổ; xác minh checksum và bản sao off-site.
3. Chạy **chỉ** `prisma migrate deploy`; tuyệt đối không chạy destructive seed trên DB cần giữ.
4. Deploy image bất biến, chờ DB/Redis healthy rồi backend ready, sau đó frontend.
5. Chạy smoke theo vai trò và so sánh error rate/p95 với baseline.
6. Rollback application bằng digest trước; migration phải forward-compatible. Không tự rollback DB khi chưa có kế hoạch dữ liệu được duyệt.

### 3. Sự cố dịch vụ

1. Xác định blast radius qua health, container state, restart/OOM và log theo request ID.
2. Nếu nghi ngờ toàn vẹn dữ liệu, chặn traffic ghi trước khi thao tác.
3. Không restart mù; lưu log và trạng thái trước. Restart chỉ khi đã xác định dịch vụ và có người phê duyệt.
4. Sau phục hồi: smoke login/dashboard/list nghiệp vụ, kiểm tra scheduler lock, audit và queue/outbox.
5. Ghi incident timeline, tác động tenant, root cause, hành động phòng ngừa.

### 4. Backup/restore

1. Backup DB hằng ngày, uploads đồng thời; giữ tối thiểu 14 bản ngày và 3 bản tháng đã kiểm chứng.
2. Mã hoá khi truyền/lưu và đưa ra kho off-site versioned/immutable.
3. Hàng tháng restore vào DB cô lập có prefix `restore_verify_*`.
4. Xác minh checksum, schema, số bảng/dòng quan trọng, đăng nhập/read smoke và file upload mẫu.
5. Lưu RPO/RTO đạt được; cảnh báo nếu backup age vượt 24 giờ.

## Tiêu chí đóng báo cáo

- OPS-001 được sửa và có test guard chứng minh seed không thể chạy nhầm.
- Restart drill sau host/container restart đạt, không mất dữ liệu và không chạy scheduler trùng.
- DB/Redis không còn public ngoài phạm vi quản trị được phép.
- Có resource limit, log rotation và dashboard/alert owner.
- Có restore drill thực tế đạt RPO 24 giờ / RTO 4 giờ.
- Release verdict phản ánh đúng migration, performance và backup evidence.

