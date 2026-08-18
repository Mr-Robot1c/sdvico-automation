# Kênh đăng tuyển đa nền tảng

> Cách hệ thống đăng tin tuyển dụng lên nhiều kênh: Facebook, LinkedIn, và các sàn
> tuyển dụng Việt Nam (TopCV, VietnamWorks, CareerBuilder, ITviec, Vieclam24h).
> Máy soạn, người bấm Duyệt, rồi đăng (điều cấm 1). Không phá bảy điều cấm.

## Hai phương thức đăng

Mỗi kênh khai báo một **phương thức** trong registry `apps/approval-ui/lib/channels.ts`:

- **`api`** — có worker tự đăng sau khi duyệt.
  - Facebook: Graph API (`/api/cron/publish` + nút "Đăng ngay").
  - LinkedIn: LinkedIn API (`/api/cron/linkedin-publish`); khi chưa nối credentials thì đăng tay.
- **`manual`** — không có API đăng. Người vận hành đăng, hệ thống theo dõi. Hai đường:
  - **(a) Đăng có hỗ trợ**: máy soạn nháp → **Duyệt** → mở kênh, dán, đăng → dán link + ảnh
    bằng chứng → bấm **"Đánh dấu đã đăng"**. Dùng khi cần bài chỉn chu, đúng độ dài.
  - **(b) Ghi nhận đã đăng (track-only)**: sàn có form riêng dễ nhập, người **tự đăng thẳng**
    trên nền tảng, hệ thống **không soạn** và **không qua Duyệt** — chỉ dán link + ảnh để theo dõi.
    Vì không có nội dung do máy sinh để gửi nên không cần cổng Duyệt (điều cấm 1 không áp dụng);
    vẫn lưu người ghi nhận (`posted_by`) để truy vết.

## Luồng vận hành

1. **Bật kênh**: trang **Kênh** → mục "Kênh đăng tuyển & cấu hình" → bấm **Bật kênh** cho sàn cần dùng.
2. **Đăng có hỗ trợ**:
   - Trang **Vị trí tuyển dụng** (Tạo JD) → mỗi vị trí có nút **"Soạn [Kênh]"** (TopCV, VietnamWorks…).
   - Bài vào **Duyệt**. Người duyệt bấm Duyệt.
   - Trang **Tin đăng** hiện chip **"Đăng thủ công · N"** + panel: Copy nội dung → mở trang đăng
     của kênh → dán và đăng → dán link bài + ảnh bằng chứng → **Đánh dấu đã đăng**.
3. **Track-only**: trang **Tin đăng** → form **"Ghi nhận đã đăng (đăng thẳng trên nền tảng)"**:
   chọn kênh + (tùy chọn) vị trí + dán link + ảnh → **Ghi nhận đã đăng**.

## Thêm / xóa kênh

### Cách 1 — Tự thêm sàn thủ công ngay trên web (không cần lập trình)

Trang **Kênh** → mục "Kênh đăng tuyển & cấu hình" → form **"Thêm sàn tuyển dụng mới"**:
nhập tên sàn (ví dụ JobsGO) + link trang đăng (tùy chọn) → **Thêm kênh**. Hệ thống tự sinh
khóa `kenh` từ tên (bỏ dấu). Kênh tự thêm **luôn là đăng thủ công** (soạn có hỗ trợ + track-only)
và bật sẵn. Muốn bỏ thì bấm **Xóa** ngay trên thẻ kênh đó (chỉ kênh tự thêm mới xóa được;
kênh built-in như Facebook/LinkedIn chỉ **tắt**, không xóa, để giữ adapter và nhãn).

### Cách 2 — Kênh có API (cần lập trình)

1. Thêm một dòng vào `CHANNELS` trong `apps/approval-ui/lib/channels.ts`
   (`kenh`, `ten`, `loai`, `method: 'api'`, `jd_variant`, `post_url`, `field_hints`) + viết adapter đăng.
2. Seed một dòng `hr_platforms` trong migration; đặt credentials ở env (adapter ngủ khi thiếu).
3. Bật kênh ở trang **Kênh**.

> Kỹ thuật: kênh tự thêm lưu trong `hr_platforms` (khóa `kenh` + `post_url`); registry code
> (`lib/channels.ts`) và bảng DB được **gộp** khi hiển thị. `hr_job_posts.kenh` đã bỏ CHECK cứng
> để nhận khóa kênh tùy ý (hợp lệ hóa ở tầng ứng dụng). Xem migration
> `20260819010000_hr_channels_userdefined.sql`.

## Nối API thật (khi kênh có API)

- Credentials chỉ đặt ở **biến môi trường** trên Vercel/GitHub, KHÔNG commit (điều cấm 7).
  Ví dụ LinkedIn: `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_ORG_URN` (xem `apps/approval-ui/lib/linkedin.ts`).
- Adapter **tự "ngủ"** khi thiếu credentials (không đăng, không lỗi) — an toàn cho tới khi cấu hình xong.
- Việc lấy token/OAuth do người vận hành làm trực tiếp trên nền tảng; hệ thống không tự nhập
  credentials hay bấm đồng ý OAuth thay người.

## Chính sách rào chắn (điều cấm 1, Phần 6 kế hoạch)

- Gặp captcha, xác thực hai bước, cảnh báo bất thường, hoặc điều khoản của sàn → **dừng**,
  để người xử lý. KHÔNG phá rào, KHÔNG bán tự động điền form bằng trình duyệt cho các sàn ngoài.
- Đăng thủ công là người thật thao tác trên nền tảng; hệ thống chỉ soạn sẵn và ghi nhận kết quả.

## Bảng và cột liên quan

- `hr_platforms(kenh, ten, loai, bat)` — danh bạ kênh + trạng thái bật/tắt.
- `hr_job_posts(kenh, noi_dung, trang_thai, url, image_url, posted_by, proof_path, ...)` —
  tin đăng theo kênh. `posted_by` = email người ghi nhận; `proof_path` = ảnh bằng chứng
  (bucket `post-images`, prefix `proof/`).
- `approval_queue(kind='hr_job_post')` — cổng duyệt cho nội dung máy soạn.

Migration: `supabase/migrations/20260819000000_hr_channels.sql` (chạy trong Supabase SQL editor).
