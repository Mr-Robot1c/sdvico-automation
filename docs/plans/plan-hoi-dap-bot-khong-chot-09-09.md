# Plan thi công cho Sonnet 5: Kho hỏi đáp theo sản phẩm + Bot hỏi đáp nội bộ + trạng thái "Không chốt"

> Lập 9/9/2026 15:40 (Fable). Người thi công: Sonnet 5, KHÔNG có transcript, KHÔNG có memory, chỉ có repo và plan này.
> Làm trong worktree `C:\Users\ADMIN\Desktop\SDVICO Marketing\.claude\worktrees\shopee-water-oil-filter-listing-aabf69`
> (nhánh `claude/shopee-water-oil-filter-listing-aabf69`, nhánh này đang ở b341b45 + commit plan, còn origin/main đã tới c61d044 15:19 nên bước 10 chắc chắn phải rebase). Mọi đường dẫn tính từ gốc worktree.
> Checkout chính `C:\Users\ADMIN\Desktop\SDVICO Marketing` (nhánh ngay2-marketing) chỉ dùng ở bước deploy, KHÔNG cd vào đó để sửa code.

---

## 0. ĐỌC TRƯỚC: phần lớn code ĐÃ CÓ SẴN trong worktree, chưa commit

Một phiên Claude khác đã viết gần xong tính năng này lúc 15:29 tới 15:33 ngày 9/9 và để ở trạng thái CHƯA COMMIT. Chạy ngay:

```bash
git status --short
```

Kỳ vọng thấy đúng các dòng sau (ngoài ra có thể có `M docs/app-map/*.md` là rác đổi CRLF, xử lý ở bước 1):

```
 M apps/approval-ui/app/actions.ts                       (thêm 'lost' + lost_reason vào updateLeadStatus; 4 server action addProductQa / updateProductQa / toggleProductQaVerified / deleteProductQa)
 M apps/approval-ui/app/khach-hang/lead-status-select.tsx (option ❌ Không chốt)
 M apps/approval-ui/app/khach-hang/page.tsx               (STATUS_LABEL.lost, cột lost_reason, ô "lý do không chốt", nút SaveQaButton, link /hoi-dap)
 M apps/approval-ui/lib/agent-defs.ts                     (AgentKey thêm 'hoi-dap'; task 'mkt.hoi_dap_bot' vào danh sách đọc run_log) — CHƯA có object def, làm ở bước 3
?? apps/approval-ui/app/api/hoi-dap/route.ts              (POST hỏi bot, GET xuất JSON; khóa bằng isAuthorizedApiRequest)
?? apps/approval-ui/app/hoi-dap/page.tsx                  (trang Kho hỏi đáp và bot)
?? apps/approval-ui/app/hoi-dap/bot-chat.tsx              (khung chat client)
?? apps/approval-ui/app/hoi-dap/qa-row-actions.tsx        (xác nhận / sửa / xoá 1 dòng)
?? apps/approval-ui/app/khach-hang/save-qa-button.tsx     (nút 📚 Lưu hỏi đáp ở từng khách)
?? apps/approval-ui/lib/hoi-dap-bot.ts                    (loadQa, buildKnowledgeText, askBot: Gemini chỉ trả lời từ kho, 4 model fallback, timeout 12s/model, ghi run_log mkt.hoi_dap_bot, cộng used_count)
?? supabase/migrations/20260909170000_mkt_product_qa_lead_lost.sql (CHECK status thêm 'lost', cột lost_reason, bảng mkt_product_qa + RLS + 16 dòng mồi)
```

**KHÔNG viết lại các file trên.** Việc của bạn là: rà (bước 2), bổ sung phần thiếu (bước 3 tới 6), áp migration (bước 7), build (bước 8), commit đúng luật hook (bước 9), deploy (bước 10), verify production (bước 11).

Nếu `git status` KHÔNG thấy các file trên (phiên kia đã commit rồi): chạy `git log --oneline -3`, nếu có commit chứa "hoi-dap" hoặc "mkt_product_qa" thì bỏ qua các bước đã làm, chỉ làm phần còn thiếu theo checklist mục 12. Nếu file vừa không có vừa không có commit: DỪNG, báo lại.

## 1. Bối cảnh (vì sao làm)

- Lệnh sếp Long 9/9/2026 15:12 (nhóm Zalo, anh Hòa xác nhận 15:16): kênh online và chat do Thanh (người dùng hệ thống) trực tiếp trả lời và tự chốt, KHÔNG chuyển, KHÔNG pass lead cho Kinh doanh; không chốt được thì kết quả là "không chốt"; mọi câu khách hỏi và câu trả lời gom thành kho kiến thức từng sản phẩm, là đầu vào cho Bot Live Stream giai đoạn 2. Kinh doanh (Tiến, Hòa, Linh) chỉ cấp thông tin sản phẩm.
- Thanh yêu cầu 15:38: "làm luôn bảng hỏi đáp + trạng thái Không chốt, được thì tạo 1 con bot trên web mkt luôn. nếu tôi quên thì hỏi nó, nó sẽ trả lời tất cả câu hỏi được nạp dữ liệu vào".
- Hiện trạng trước khi làm: `mkt_leads.status` chỉ có new/contacted/won/closed/spam (migration 20260907160000), không có chỗ ghi "không chốt" và lý do. Không có bảng hỏi đáp; thông số nằm rải ở `product_facts` (DB) và `apps/approval-ui/lib/gen/products.mjs` (FEATURES, PRICE_TEASER, SHOPEE_LINK).
- Thiết kế đã chốt (đã viết): bảng `mkt_product_qa`; bot Gemini CHỈ trả lời từ kho (mkt_product_qa + product_facts + products.mjs), không có thì nói "chưa có" (điều cấm 5); trang `/hoi-dap`; nút lưu hỏi đáp ngay tại khách; xuất JSON cho bot live.

## 2. Ràng buộc repo (đọc kỹ, hook sẽ chặn commit nếu sai)

- **Bảy điều cấm** (CLAUDE.md mục 3), 3 điều dính việc này, trích nguyên văn:
  - Điều 1: "Máy soạn, người bấm gửi. Không tự động gửi thư hoặc tin nhắn tới ứng viên và khách hàng." Bot này chỉ trả lời NGƯỜI DÙNG NỘI BỘ trên web, không nhắn khách. Không thêm bất kỳ đường nào gửi tin ra ngoài.
  - Điều 5: "Không bịa số liệu, giải thưởng, khách hàng, đối tác." Prompt bot đã ép "CHỈ trả lời bằng thông tin trong KHO". Không nới luật này.
  - Điều 7: "Không commit khóa và mật khẩu vào Git." Không đụng `.env`.
- **Commit**: author và committer phải là `Mr-Robot1c <178200163+Mr-Robot1c@users.noreply.github.com>` (git user của worktree đã đúng, kiểm bằng `git config user.name`). Message dạng `<loại>(<phạm vi>): <mô tả không dấu>`, kết bằng dòng `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- **Hook pre-commit** (`.githooks/pre-commit`, đã trỏ core.hooksPath):
  - Migration mới trong `supabase/migrations/` thì `docs/app-map/database.md` PHẢI đổi cùng commit (thêm dòng re-verified + cập nhật bảng).
  - Code trong `apps/approval-ui` và `supabase/migrations` nằm trong `covers:` của `docs/app-map/README.md` → README.md phải có dòng `<!-- re-verified: ... -->` mới cùng commit. `marketing.md` (covers packages/marketing) KHÔNG cần vì không đụng packages/marketing. `ke-hoach-ai-v2-ba-spec.md` chỉ covers `apps/approval-ui/app/ke-hoach`, không đụng.
  - Hook chạy `scripts/check-approval-gate.mjs`: việc này không insert approval_queue, sẽ qua.
  - Hook chặn màu hard-code kiểu `text-[#ff0000]` trong tsx: code sẵn dùng `var(--tone-no, #dc2626)` inline style, đã từng qua hook ở file khác, giữ nguyên.
- **Deploy** = push nhánh lên `origin main` (Vercel tự build), rồi ff nhánh `ngay2-marketing` ở checkout chính và push. KHÔNG bao giờ dùng `git stash` trần.
- **Bash tool trên máy này KHÔNG chạy được heredoc nhiều dòng có dấu nháy** (báo `unexpected EOF`). Muốn sửa file nhiều dòng thì dùng tool Edit/Write, hoặc viết script .mjs ra scratchpad bằng Write rồi `node` chạy.
- **CRLF**: nhiều file trong repo là CRLF, git autocrlf bật. Sau `git commit`, hook hay làm `docs/app-map/*.md` hiện `M` chỉ vì đổi EOL; trước khi bắt đầu và sau mỗi commit chạy `git checkout -- docs/app-map` rồi mới sửa doc thật (bước 6). Tool Edit khớp chuỗi có \r ổn; script node thì `.replace(/\r\n/g,'\n')` khi đọc.
- **supabase-js**: `insert/update` lỗi KHÔNG throw, phải đọc `{ error }`. Code sẵn bỏ qua error ở vài chỗ, chấp nhận (không phải phạm vi sửa).
- **Vercel Hobby**: API tối đa 60 giây; route đã đặt `maxDuration = 60`, bot timeout 12 giây mỗi model. Không nâng.
- **Vercel dung lượng**: KHÔNG thêm dependency mới (đã có sự cố 8/9). `@google/genai` đã có trong `apps/approval-ui/package.json`.

## 3. Việc còn thiếu, từng file

### 3.1 `apps/approval-ui/lib/agent-defs.ts`: thêm object def cho AI thứ 11 "hoi-dap"

Đã có `AgentKey` thêm `'hoi-dap'` (dòng 12) và `'mkt.hoi_dap_bot'` trong danh sách task (dòng 61) nhưng mảng `agents` (từ dòng ~95) CHƯA có phần tử `key: 'hoi-dap'`. Trang `/hoi-dap` gọi `defs.find(a => a.key === 'hoi-dap')` và chỉ hiện AgentHeadCard khi tìm thấy; trang `/agent` (agent-roster.tsx) cũng liệt kê mọi def.

Tìm phần tử cuối cùng của mảng (key `'danh-gia'`), nó kết thúc bằng:

```ts
      href: '/kho-tri-thuc?ai=danh-gia',
    },
  ];

  return agents;
```

Thêm 1 phần tử NGAY SAU phần tử `'danh-gia'` (trước `];`):

```ts
    {
      // 9/9: AI thứ 11 — bot hỏi đáp nội bộ (lệnh sếp Long 9/9 15:12: gom hỏi đáp thành kho kiến thức
      // từng sản phẩm, đầu vào Bot Live Stream phase 2; Thanh: "nếu tôi quên thì hỏi nó").
      key: 'hoi-dap', icon: '📚', name: 'AI hỏi đáp nội bộ',
      model: 'Gemini 2.5 Flash (dự phòng 2.0 Flash, flash-latest, flash-lite), chỉ trả lời từ kho mkt_product_qa + product_facts',
      runsAt: 'Chạy trên cloud khi có người hỏi ở trang /hoi-dap — không tự chạy theo lịch, không nhắn khách',
      role: 'Trả lời nhân viên kênh online về giá, thông số, bảo hành, luật đăng bài, link sàn từ kho hỏi đáp đã nạp. Không có trong kho thì nói chưa có và gợi ý nạp. Kho này là đầu vào cho Bot Live Stream giai đoạn 2.',
      last: mkLast(lastOf(['mkt.hoi_dap_bot']), 'trả lời câu hỏi nội bộ'),
      href: '/hoi-dap',
    },
```

`mkLast` và `lastOf` là 2 hàm sẵn có trong file (các def khác đang dùng y hệt). Kiểm: `grep -n "mkLast\|lastOf" apps/approval-ui/lib/agent-defs.ts` phải thấy định nghĩa phía trên mảng.

### 3.2 `apps/approval-ui/app/nav.tsx`: cho mục "Tổng quan" sáng khi đang ở /hoi-dap

Dòng 20 hiện tại:

```ts
      { href: '/tong-quan', label: 'Tổng quan', icon: '📊', also: ['/noi-dung', '/ke-hoach', '/khach-hang', '/hang-doi'] },
```

Sửa thành:

```ts
      { href: '/tong-quan', label: 'Tổng quan', icon: '📊', also: ['/noi-dung', '/ke-hoach', '/khach-hang', '/hang-doi', '/hoi-dap'] },
```

Không thêm mục menu mới (sidebar đã chốt 5 mục ngày 27/8, không bàn lại). Đường vào /hoi-dap là nút "📚 Kho hỏi đáp và bot" ở đầu trang /khach-hang (đã có) và thẻ AI ở /agent (href ở 3.1).

### 3.3 `apps/approval-ui/app/noi-dung/lead-quick-view.tsx`: nhận trạng thái 'lost'

File này là bảng khách rút gọn ở trang /noi-dung. Hiện KHÔNG biết 'lost' nên khách "Không chốt" sẽ rơi khỏi mọi tab đếm. Sửa 4 chỗ:

(a) Dòng ~33 tới 38, `STATUS_LABEL`:

```ts
const STATUS_LABEL: Record<string, string> = {
  new: '🆕 Mới',
  contacted: '📞 Đã liên hệ',
  won: '💰 Đã mua',
```

thêm ngay sau dòng `won`:

```ts
  lost: '❌ Không chốt',
```

(b) Dòng ~47:

```ts
type FilterKey = 'all' | 'new' | 'contacted' | 'won' | 'closed';
```
thành
```ts
type FilterKey = 'all' | 'new' | 'contacted' | 'won' | 'lost' | 'closed';
```

(c) Dòng ~68:

```ts
    const c = { all: 0, new: 0, contacted: 0, won: 0, closed: 0 };
```
thành
```ts
    const c = { all: 0, new: 0, contacted: 0, won: 0, lost: 0, closed: 0 };
```
Ngay dưới dòng này là vòng đếm; nếu nó viết kiểu `if (s in c) c[s]++` thì không cần sửa gì thêm; nếu nó liệt kê từng key thì thêm `lost` cùng kiểu. Đọc 10 dòng sau để chắc.

(d) Dòng ~179:

```ts
          {(['all', 'new', 'contacted', 'won', 'closed'] as FilterKey[]).map((k) => (
```
thành
```ts
          {(['all', 'new', 'contacted', 'won', 'lost', 'closed'] as FilterKey[]).map((k) => (
```

Số dòng có thể lệch vài dòng, tìm theo nội dung.

### 3.4 `apps/approval-ui/app/tong-quan/page.tsx`: nhãn khách ở Tổng quan

Dòng ~436 tới 437:

```tsx
                  <span className={`badge ${String(l.status || 'new') === 'new' ? 'tone-no' : 'tone-ok'}`} style={{ flexShrink: 0 }}>
                    {String(l.status || 'new') === 'new' ? 'Mới' : String(l.status) === 'won' ? 'Đã mua' : String(l.status) === 'closed' ? 'Xong' : 'Đã liên hệ'}
```

Sửa thành (thêm nhánh lost, tone đỏ):

```tsx
                  <span className={`badge ${['new', 'lost'].includes(String(l.status || 'new')) ? 'tone-no' : 'tone-ok'}`} style={{ flexShrink: 0 }}>
                    {String(l.status || 'new') === 'new' ? 'Mới' : String(l.status) === 'won' ? 'Đã mua' : String(l.status) === 'lost' ? 'Không chốt' : String(l.status) === 'closed' ? 'Xong' : 'Đã liên hệ'}
```

Không đụng phần đếm "Đã mua tuần này" (dòng ~116, ~425).

### 3.5 Rà nhanh code sẵn có (không sửa trừ khi build báo lỗi)

Chạy các lệnh sau, mỗi lệnh phải ra kết quả như ghi:

```bash
grep -n "export async function isAuthorizedApiRequest" apps/approval-ui/lib/session-auth.ts
```
Kỳ vọng 1 dòng (hàm có sẵn, dev thì luôn true, production cần cookie sdvico_auth hoặc Bearer CRON_SECRET).

```bash
grep -n "^export const PRODUCTS\|^export function getFeatures\|^export const PRICE_TEASER\|^export const SHOPEE_LINK\|^export const PUBLIC_NAME\|^export function guessGroup" apps/approval-ui/lib/gen/products.mjs
```
Kỳ vọng 6 dòng (hoi-dap-bot.ts và khach-hang/page.tsx import đúng 6 tên này).

```bash
grep -n "export function logTokenUsage" apps/approval-ui/lib/gen/token-log.mjs
```
Kỳ vọng 1 dòng, chữ ký `(client, task, model, usageMetadata)`.

```bash
grep -n "lost" apps/approval-ui/app/actions.ts | head
```
Kỳ vọng thấy mảng `['new', 'contacted', 'won', 'lost', 'closed', 'spam']` và `patch.lost_reason`.

## 4. Migration: nội dung đã có, chỉ cần hiểu để viết doc

File `supabase/migrations/20260909170000_mkt_product_qa_lead_lost.sql` làm 3 việc, idempotent:
1. `mkt_leads_status_check` đổi thành `('new','contacted','won','lost','closed','spam')`; thêm cột `lost_reason text`.
2. Tạo bảng `public.mkt_product_qa` (id uuid, product_group text default 'Chung', question, answer, source, confirmed_by, verified bool default false, used_count int default 0, lead_id uuid → mkt_leads on delete set null, created_by, created_at, updated_at) + index `(product_group, verified, created_at desc)` + RLS bật, policy `mkt_product_qa_staff_all` cho `authenticated`.
3. Chèn 16 dòng mồi (chỉ khi bảng trống): hotline, luật giá công khai, luật gửi nhóm duyệt, lệnh kênh online tự chốt, link Shopee, giá và thông số máy lọc nước, bảo hành, nước uống được, tên SEA-40/SEA250 (chưa xác nhận), giá và thông số lọc dầu, lọc cơ (chưa xác nhận), S-Tracking giá + chức năng, Starlink.

Server dùng service role nên RLS không cản. Bảng KHÔNG chứa dữ liệu cá nhân (chỉ lead_id tham chiếu), không cần siết thêm.

## 5. Không cần làm (đừng tự thêm)

- Không thêm tab ở `/kho-tri-thuc` (trang /hoi-dap đã có AgentHeadCard riêng).
- Không viết test tự động mới cho bot (cần GEMINI_API_KEY và mạng); verify tay ở bước 11.
- Không đổi prompt bot, không đổi MODEL_CHAIN, không đổi số dòng mồi.
- Không sửa `apps/approval-ui/app/noi-dung/page.tsx` (STATUS ở đó là trạng thái BÀI, không phải khách).

## 6. Doc app-map (bắt buộc cùng commit, hook chặn nếu thiếu)

Trước tiên:
```bash
git checkout -- docs/app-map
git status --short docs/app-map
```
Kỳ vọng trống. Rồi sửa 2 file bằng tool Edit:

### 6.1 `docs/app-map/database.md`

(a) Ngay SAU dòng `ttl_days: 180` (dòng 6) và TRƯỚC dòng re-verified 2026-09-07 hiện có, chèn 1 dòng:

```
<!-- re-verified: 2026-09-09 chieu - Migration 20260909170000_mkt_product_qa_lead_lost (lenh sep Long 9/9 15:12: kenh online tu chot, khong pass lead; gom hoi dap thanh kho kien thuc): (1) CHECK mkt_leads.status them 'lost' (Khong chot) -> new/contacted/won/lost/closed/spam + cot mkt_leads.lost_reason text; (2) bang moi mkt_product_qa (product_group, question, answer, source, confirmed_by, verified, used_count, lead_id FK mkt_leads set null, created_by, created_at, updated_at) + index (product_group, verified, created_at desc) + RLS policy staff_all authenticated; (3) 16 dong moi (chi chen khi bang trong) tu van ban chinh sach gia GD TTKD 9/9 + bang quy cach + bao gia S-Tracking. Doc boi apps/approval-ui/lib/hoi-dap-bot.ts (bot chi tra loi tu kho), trang /hoi-dap, API /api/hoi-dap, nut Luu hoi dap o /khach-hang. DA AP len project lluuoygdlaadtjsbnxbk qua db-apply.mjs 9/9. -->
```

(b) Đổi `last_verified: 2026-09-07` thành `last_verified: 2026-09-09`.

(c) Trong bảng liệt kê bảng (dòng ~44, hàng `| mkt_leads |`): sửa đoạn `` `status` new/contacted/won/closed/spam (won = đã mua, 7/9) `` thành `` `status` new/contacted/won/lost/closed/spam (won = đã mua 7/9, lost = không chốt 9/9 kèm `lost_reason`) ``.

(d) Thêm 1 hàng mới ngay dưới hàng `mkt_leads` (giữ đúng số cột của bảng; xem hàng mkt_leads để khớp cột):

```
| mkt_product_qa | Marketing | Kho hỏi đáp theo sản phẩm (9/9, lệnh sếp Long): `product_group` = tên nhóm trong products.mjs hoặc 'Chung', `question`, `answer`, `source`, `confirmed_by`, `verified` (bot ưu tiên), `used_count` (bot cộng mỗi lần dùng), `lead_id` khách nào hỏi. Bot /hoi-dap chỉ trả lời từ đây + product_facts. Xuất JSON `/api/hoi-dap?export=1` cho Bot Live Stream giai đoạn 2 | Bật, staff |
```

### 6.2 `docs/app-map/README.md`

Chèn 1 dòng TRƯỚC dòng `<!-- re-verified:` đầu tiên (dòng 6):

```
<!-- re-verified: 2026-09-09 chieu - KHO HOI DAP + BOT NOI BO + TRANG THAI KHONG CHOT (lenh sep Long 9/9 15:12; Thanh: "neu toi quen thi hoi no"): lib/hoi-dap-bot.ts (loadQa, buildKnowledgeText gom mkt_product_qa + product_facts + FEATURES/PRICE_TEASER/SHOPEE_LINK, askBot: Gemini chain 2.5-flash/2.0-flash/flash-latest/flash-lite timeout 12s moi model, tra JSON {answer,found,used_ids}, cong used_count, ghi run_log mkt.hoi_dap_bot ok/warn, logTokenUsage hoi_dap_bot); app/api/hoi-dap/route.ts POST hoi + GET xuat JSON, khoa isAuthorizedApiRequest, maxDuration 60; app/hoi-dap (page + bot-chat + qa-row-actions): chat, danh sach cau bot chua tra loi duoc (run_log warn), form them, loc theo nhom, xac nhan/sua/xoa; actions.ts addProductQa/updateProductQa/toggleProductQaVerified/deleteProductQa + updateLeadStatus nhan 'lost' + lost_reason; khach-hang: option Khong chot, o ly do, nut SaveQaButton (guessGroup goi y nhom); lead-quick-view + tong-quan nhan lost; agent-defs AI thu 11 'hoi-dap' href /hoi-dap; nav 'Tong quan' sang khi o /hoi-dap. Bot KHONG nhan khach (dieu cam 1), KHONG bia (dieu cam 5). Migration 20260909170000 xem database.md. -->
```

## 7. Áp migration lên DB thật (bắt buộc TRƯỚC deploy, nếu không trang /hoi-dap sập vì thiếu bảng)

Kiểm trước (đang thiếu):
```bash
node -e "const fs=require('fs');const env=fs.readFileSync('C:/Users/ADMIN/Desktop/SDVICO Marketing/.env','utf8');const g=k=>(env.match(new RegExp('^'+k+'=(.*)$','m'))||[])[1];const url=g('SUPABASE_URL'),key=g('SUPABASE_SERVICE_ROLE_KEY');fetch(url+'/rest/v1/mkt_product_qa?select=id&limit=1',{headers:{apikey:key,Authorization:'Bearer '+key}}).then(async r=>console.log(r.status,(await r.text()).slice(0,80)))"
```
Kỳ vọng lúc này: `404 {"code":"PGRST205"...` (chưa có bảng). URL phải là `https://lluuoygdlaadtjsbnxbk.supabase.co` (project MỚI; project cũ jwisiccphcepgpabyyco đã khóa, không áp vào đó).

Áp:
```bash
node packages/marketing/src/db-apply.mjs supabase/migrations/20260909170000_mkt_product_qa_lead_lost.sql
```
Script tự đọc `.env` thật ở checkout chính (`DATABASE_URL`), tự từ chối nếu DATABASE_URL không cùng project với SUPABASE_URL. Kỳ vọng in "OK" hoặc "applied" cho file, không có "ERROR". Nếu báo "TỪ CHỐI: DATABASE_URL không chứa project ref": DỪNG, báo lại, KHÔNG dùng --force.

Kiểm sau:
```bash
node -e "const fs=require('fs');const env=fs.readFileSync('C:/Users/ADMIN/Desktop/SDVICO Marketing/.env','utf8');const g=k=>(env.match(new RegExp('^'+k+'=(.*)$','m'))||[])[1];const url=g('SUPABASE_URL'),key=g('SUPABASE_SERVICE_ROLE_KEY');const h={apikey:key,Authorization:'Bearer '+key,Prefer:'count=exact'};(async()=>{let r=await fetch(url+'/rest/v1/mkt_product_qa?select=id',{headers:h});console.log('qa',r.status,r.headers.get('content-range'));r=await fetch(url+'/rest/v1/mkt_leads?select=lost_reason&limit=1',{headers:h});console.log('lost_reason',r.status);})()"
```
Kỳ vọng: `qa 200 0-15/16` (16 dòng mồi) và `lost_reason 200`.

## 8. Build

```bash
cd apps/approval-ui && npm run build
```
Kỳ vọng có dòng `✓ Compiled successfully` và trong danh sách route thấy `/hoi-dap` và `/api/hoi-dap`. Nếu lỗi type ở file KHÔNG nằm trong plan: DỪNG, báo lại kèm 20 dòng lỗi. Nếu lỗi ở file trong plan: sửa đúng chỗ lỗi, không sửa lan.

Lỗi hay gặp và cách xử:
- `Cannot find module './gen/products.mjs'` kiểu type: file .mjs được import với `// @ts-ignore` ở dòng trên, giữ nguyên comment đó.
- `Property 'lost' does not exist on type ...` ở lead-quick-view: chưa làm đủ 4 chỗ mục 3.3.
- Lỗi JSX "Unexpected token" gần `{/* */}`: không đặt comment trong ngoặc ternary.

Sau build:
```bash
cd ../.. && node scripts/check-approval-gate.mjs
```
Kỳ vọng `check-approval-gate: OK`.

## 9. Commit (1 commit, đủ cả code + migration + 2 doc)

```bash
git checkout -- docs/app-map   # chỉ nếu vẫn còn file M rác EOL NGOÀI database.md và README.md; xem git diff --stat trước
git add apps/approval-ui/app/actions.ts apps/approval-ui/app/khach-hang apps/approval-ui/app/hoi-dap apps/approval-ui/app/api/hoi-dap apps/approval-ui/lib/hoi-dap-bot.ts apps/approval-ui/lib/agent-defs.ts apps/approval-ui/app/nav.tsx apps/approval-ui/app/noi-dung/lead-quick-view.tsx apps/approval-ui/app/tong-quan/page.tsx supabase/migrations/20260909170000_mkt_product_qa_lead_lost.sql docs/app-map/database.md docs/app-map/README.md
git status --short   # kiểm: không còn file code nào của tính năng này chưa add
```

Commit message (viết vào file scratchpad rồi `git commit -F <file>` để né lỗi heredoc):

```
feat(hoi-dap): kho hoi dap theo san pham + bot noi bo /hoi-dap + trang thai Khong chot (lenh sep Long 9/9); re-verify(docs/app-map/database.md, README.md)

- Migration 20260909170000: mkt_leads.status them 'lost' + lost_reason; bang mkt_product_qa + RLS + 16 dong moi.
- lib/hoi-dap-bot.ts: bot Gemini chi tra loi tu kho (mkt_product_qa + product_facts + products.mjs), 4 model fallback, run_log mkt.hoi_dap_bot.
- /hoi-dap: chat bot, them/sua/xac nhan/xoa hoi dap, cau bot chua tra loi duoc, xuat JSON /api/hoi-dap?export=1.
- /khach-hang: trang thai Khong chot + ly do, nut Luu hoi dap; lead-quick-view + tong-quan nhan 'lost'.
- agent-defs: AI thu 11 'hoi-dap'; nav sang muc Tong quan khi o /hoi-dap.
- DB da ap len lluuoygdlaadtjsbnxbk qua db-apply.mjs; build xanh; gate OK.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

Nếu hook BLOCK với thông báo "code trong vung covers cua 'docs/app-map/X.md' thay doi nhung doc khong duoc sua": thêm dòng re-verified vào đúng file X đó (cùng mẫu mục 6.2) và commit lại. Nếu X là file KHÔNG kể trong plan này: DỪNG, báo lại.

## 10. Deploy

```bash
git fetch origin
git log --oneline HEAD..origin/main
```
Nếu có commit mới trên origin/main: `git rebase origin/main`; xung đột chỉ được phép ở 2 dòng re-verified trong docs/app-map (giữ CẢ HAI dòng, dòng của bạn đặt trên), xung đột ở file code thì DỪNG báo lại. Sau rebase chạy lại `cd apps/approval-ui && npm run build` (nhanh hơn lần đầu nhờ cache).

```bash
git push origin HEAD:main
M="C:/Users/ADMIN/Desktop/SDVICO Marketing"
git -C "$M" merge --ff-only "$(git rev-parse HEAD)"
git -C "$M" push origin ngay2-marketing
```
Kỳ vọng: push main ra dòng `<sha cũ>..<sha mới>  HEAD -> main`; ff ở checkout chính ra "Fast-forward" (checkout chính có file M ngoài git như CLAUDE.md, không đụng vào, ff vẫn được vì commit không sửa CLAUDE.md); push ngay2-marketing thành công.

Chờ Vercel (chỉ chạy được trong Git Bash, không chạy trong PowerShell):
```bash
for i in $(seq 1 16); do row=$(timeout 60 vercel ls 2>&1 | grep -m1 Production); echo "$row" | grep -qE "Ready|Error" && { echo "$row"; break; }; sleep 15; done
```
Kỳ vọng dòng có `Ready`. Nếu `Error`: `vercel inspect <url> --logs` xem lỗi, thường là lỗi build không tái hiện local vì env; báo lại kèm 30 dòng log.

## 11. Verify trên production (sdvico-mktit.vercel.app)

Có thể verify bằng Browser pane (mở URL, đăng nhập bằng tài khoản nội bộ đã lưu trong trình duyệt; nếu không có mật khẩu thì DỪNG ở bước này và giao người dùng tự kiểm, ghi rõ 5 mục dưới):

1. Mở `https://sdvico-mktit.vercel.app/hoi-dap`: thấy tiêu đề "Kho hỏi đáp và bot", thẻ AI "AI hỏi đáp nội bộ", dòng "Kho: 16 hỏi đáp, 14 đã xác nhận, 2 chờ xác nhận", bảng 16 dòng, nút "⬇ Xuất JSON cho bot live".
2. Gõ vào khung chat `giá máy lọc dầu bao nhiêu`, bấm Hỏi. Kỳ vọng câu trả lời có `9.900.000` và `7.900.000`, kèm 1 badge nguồn "✔ Máy Lọc Dầu Diesel SD12-300". Gõ `máy lọc nước bảo hành bao lâu`: kỳ vọng có "12 tháng", "18 tháng", "2 năm".
3. Gõ `giá bình ắc quy bao nhiêu`: kỳ vọng bot nói "Chưa có trong kho kiến thức" và hiện dòng gợi ý nạp; sau đó tải lại trang, mục "❓ Câu bot chưa trả lời được gần đây" có câu này.
4. Mở `/khach-hang`, ở 1 khách bất kỳ đổi trạng thái sang "❌ Không chốt": trang tải lại, khách hiện badge đỏ "Không chốt", xuất hiện ô "lý do không chốt...", gõ lý do, bấm Lưu, thấy dòng "❌ <lý do>". Tab lọc "❌ Không chốt (1)". Đổi lại trạng thái cũ sau khi kiểm nếu đó là khách thật.
5. Ở cùng khách bấm "📚 Lưu hỏi đáp": form hiện câu hỏi lấy từ tin nhắn khách, nhóm sản phẩm gợi ý sẵn; nhập câu trả lời, Lưu, thấy "✓ Đã vào kho"; sang /hoi-dap thấy dòng mới ở trạng thái "? Chờ". Xoá dòng thử này bằng nút 🗑 sau khi kiểm.
6. Mở `https://sdvico-mktit.vercel.app/api/hoi-dap?export=1` (đã đăng nhập): tải file `sdvico-hoi-dap.json`, có `"count": 16`.
7. Mở `/agent`: có thẻ "AI hỏi đáp nội bộ" với dòng hoạt động "chạy lần cuối ... trả lời câu hỏi nội bộ" (sau khi đã hỏi ở mục 2).

Không có trình duyệt đăng nhập được thì tối thiểu kiểm bằng curl (production sẽ trả 401 khi chưa đăng nhập, đó là ĐÚNG):
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://sdvico-mktit.vercel.app/api/hoi-dap
```
Kỳ vọng `401`.

## 12. Checklist Definition of Done

- [ ] `git status` sạch (không còn file code tính năng này chưa commit), commit có author Mr-Robot1c.
- [ ] Migration đã áp: REST `mkt_product_qa` trả 200 với 16 dòng; `mkt_leads.lost_reason` tồn tại.
- [ ] `npm run build` trong apps/approval-ui: `✓ Compiled successfully`, có route `/hoi-dap` và `/api/hoi-dap`.
- [ ] `node scripts/check-approval-gate.mjs`: OK.
- [ ] Commit chứa cả 2 doc: database.md (re-verified + bảng mới + status lost) và README.md (re-verified).
- [ ] Đã push origin main, ff + push ngay2-marketing, Vercel Production Ready.
- [ ] Production: /hoi-dap hiện 16 dòng, bot trả lời đúng câu giá lọc dầu, câu ngoài kho trả "Chưa có trong kho kiến thức", /khach-hang đổi được trạng thái Không chốt kèm lý do, nút Lưu hỏi đáp chạy, export JSON count 16, /agent có thẻ AI hỏi đáp.
- [ ] Ghi 1 dòng re-verified vào `docs/app-map/reverify-log.md` nếu repo đang dùng file đó cho nhật ký (mở file xem mẫu 3 dòng gần nhất; nếu file chỉ do hook sinh thì bỏ qua).
- [ ] Báo lại cho người dùng: URL /hoi-dap, cách nạp hỏi đáp (form hoặc nút ở khách), cách xuất JSON, và 2 dòng CHƯA XÁC NHẬN trong kho (tên SEA-40/SEA250, thông số bộ lọc cơ) cần Kinh doanh chốt.

## 13. Điều kiện dừng (DỪNG và hỏi lại, không tự chế)

- Build lỗi ở file không nằm trong plan.
- db-apply từ chối vì DATABASE_URL lệch project, hoặc áp lỗi giữa chừng.
- Hook chặn vì doc không kể trong plan.
- Rebase xung đột ở file code.
- Vercel build Error mà log không chỉ rõ file trong plan.
- Phát hiện file trong mục 0 đã bị phiên khác sửa khác với mô tả (ví dụ route.ts không còn `isAuthorizedApiRequest`): báo lại thay vì "sửa cho khớp plan".

## 14. Bẫy đã biết dính tới việc này

- Bash tool: heredoc nhiều dòng có dấu nháy báo `unexpected EOF`. Dùng Write/Edit hoặc script .mjs.
- Sau mỗi commit, `docs/app-map/*.md` có thể hiện M do EOL. `git diff --ignore-space-at-eol --stat` để phân biệt; rác thì `git checkout -- docs/app-map`.
- `git show` / `git diff` trên Windows in `warning: LF will be replaced by CRLF`, vô hại.
- `vercel` chỉ có trong Git Bash (PowerShell không thấy).
- Gemini free tier hay 429 với `gemini-2.5-flash`; bot tự rơi xuống model sau, câu trả lời vẫn ra nhưng chậm hơn (tối đa 4 × 12 giây = 48 giây, dưới trần 60 giây). Không "sửa" bằng cách tăng timeout.
- `product_facts` là bảng có sẵn (nạp 3/9); nếu REST trả 404 cho bảng này thì đang trỏ sai project.
- Trang /khach-hang truyền server action `addProductQa` vào client component qua prop `action`: mẫu này đã dùng ở LeadStatusSelect, Next 14 cho phép, đừng đổi sang import trực tiếp trong client.
