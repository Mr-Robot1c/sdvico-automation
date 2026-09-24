# Plan thi công: PHỄU KHÁCH HỎI ĐẾN CHỐT — phân loại lead, soạn trả lời đầu, follow-up 3 chạm (24/9)

> Plan này tự chứa đủ ngữ cảnh. Người thi công (Sonnet 5) KHÔNG cần đọc lại hội thoại gốc.
> Đọc trước: Root cause, Ràng buộc repo, Bẫy. Làm theo thứ tự Đợt 1, 2, 3 rồi Verify.
> Mọi đường dẫn tính từ gốc repo. Nhánh thi công phải xuất phát từ `origin/main` (6a0b008 trở lên).

## Root cause (chỉ đạo sếp Long 24/9 + khảo sát code 24/9, có bằng chứng)

Sếp Long 24/9 (nhóm Zalo, 13h00 tới 13h13): chưa bán được 10 đơn, tháng này dính KPI. Chỉ đạo:
1. "Trong 1 đống sp của sdvico, ngồi suy tính cái nào DỄ BÁN NHẤT thì focus vào cho ra đơn."
2. Thanh than "toàn khách hỏi xong im re" thì sếp bắt: "tức là CÂU TRẢ LỜI ĐẦU TIÊN của em chưa chuẩn.
   Họ hỏi tức là đã có 10% attention, em trả lời xong nó về 0, thì cần xem cách nào để tăng
   từ 10 lên 20 lên 30." Kèm: "đưa vô cho AI nó dạy về tâm lý khách hàng."
3. Phương pháp vòng lặp: nhận diện vấn đề, DỮ LIỆU HOÁ toàn bộ chuỗi đã làm, rà miss-match
   với flow cơ bản của ngành, điều chỉnh, đo kết quả, lặp vòng mới.

Khảo sát code (24/9, trên `origin/main` 6a0b008) khớp đúng lời sếp — dữ liệu thật: `mkt_leads`
có 22 lead (19 contacted, 1 new, 1 lost, 1 spam), **0 won**. Bốn lỗ hổng:

1. **Không dữ liệu hoá được phễu.** `mkt_leads` không có cột loại câu hỏi; cột `product_guess`
   có trong schema (migration `20260824230000_mkt_leads.sql:21`) nhưng KHÔNG có code nào ghi.
   Không trả lời được "SP nào dễ bán nhất" bằng số.
2. **Không có công cụ soạn câu trả lời đầu.** Không có nút nào trên dòng lead ở `/khach-hang`
   soạn nháp trả lời. Bot `/hoi-dap` chỉ trả lời khi người tự gõ câu hỏi rồi tự chép.
3. **Không có follow-up.** Khách "im re" thì không ai nhắc lại. `packages/marketing/src/outbound.mjs`
   đã có sẵn `queueOutbound` + kind `mkt_send_message` nhưng CHƯA được nối vào luồng nào
   (DB có 0 dòng kind này; chỉ `demo-outbound.mjs` gọi).
4. **Không đo phễu.** `/khach-hang` chỉ đếm theo trạng thái, không có khối phễu tuần
   Hỏi → Đã liên hệ → Đã mua theo SP và theo loại câu hỏi.

Plan này bịt cả 4 lỗ, đúng thứ tự sếp dạy: dữ liệu hoá trước (Đợt 1), rồi sửa câu trả lời đầu
(Đợt 2), rồi follow-up (Đợt 3). Việc CHỌN SP focus là của người (sếp/Thanh) dựa trên khối phễu,
máy chỉ xếp hạng gợi ý (tinh thần Điều cấm 2: máy xếp hạng, người quyết).

## Ràng buộc repo (đọc kỹ, vi phạm là hỏng)

- **Điều cấm 1: MÁY SOẠN, NGƯỜI BẤM GỬI.** Mọi nháp tin nhắn cho khách chỉ được insert vào
  `approval_queue` với `status: 'pending'` NGUYÊN VĂN (script `scripts/check-approval-gate.mjs`
  quét mọi insert, sai là fail). TUYỆT ĐỐI không viết worker gửi tin, không gọi Graph API send,
  không đổi status thành approved bằng máy. Người copy tin, tự gửi trong Messenger, rồi bấm
  "Đã gửi tay" trên UI (chính người bấm đó là hành động approve).
- **Điều cấm 5: không bịa.** Nội dung nháp chỉ dùng số liệu từ kho verified (`mkt_product_qa`,
  `product_facts`, `PRICE_TEASER` trong `apps/approval-ui/lib/gen/products.mjs`). Tin nhắn
  follow-up tất định (Đợt 3) không chứa con số nào ngoài tổng đài 1900 23 23 49 và câu giá
  lấy nguyên văn từ `PRICE_TEASER`.
- **Điều cấm 3:** nháp chạm từ khóa quy định nhà nước (IUU, Kiểm ngư, Cục Thủy sản, quy định)
  phải gắn `needs_manager_approval: true` trong payload và UI hiện cảnh báo đỏ "phải cấp
  quản lý duyệt trước khi gửi". Dùng lại `assessDraft` có sẵn ở `apps/approval-ui/lib/gen/compliance.mjs`
  (cùng chữ ký với bản packages/marketing, xem cách gọi mẫu ở `packages/marketing/src/outbound.mjs:83-97`).
- **Giá trong inbox:** bài công khai chỉ giá úp mở, nhưng INBOX ĐƯỢC nói giá đầy đủ
  (kho mục D trong `lib/hoi-dap-bot.ts:137`: "số đầy đủ chỉ nói trong inbox hoặc trên sàn").
  Nháp trả lời inbox được phép dùng giá chính sách từ kho verified.
- **Văn phong tin gửi khách:** tiếng Việt tự nhiên, xưng "em"/"SDVICO", gọi "anh chị". Không
  gạch dài, không mũi tên, không dấu chấm tròn giữa câu, không markdown, không emoji trong
  thân tin. Số kiểu Việt Nam (9.900.000 đ). Câu ngắn.
- **Vercel Hobby:** không thêm dependency mới (bundle đang 15,42 MB, trần đã từng vỡ).
  `/api/mkt-metrics-pull` có `maxDuration = 90` giây — mọi bước mới thêm vào route này phải
  là query + insert tất định, KHÔNG gọi LLM.
- **Không thêm cron mới.** Quota GitHub Actions đã cháy tới 1/10; Vercel Hobby chỉ cho 2 cron
  (đã dùng hết cho rotate). Việc lặp lại móc vào `/api/mkt-metrics-pull` (đã chạy 4 lần/ngày
  qua workflow `mkt-metrics-pull.yml`).
- **mkt_leads có RLS** — mọi truy vấn qua `getServerClient()` (service role) như code hiện tại.
- **Migration:** thêm file mới trong `supabase/migrations/`, KHÔNG sửa migration cũ. Sau khi
  merge phải áp vào Supabase thật (project `lluuoygdlaadtjsbnxbk`) — xem mục "Sau khi merge".
- **KHÔNG đụng:** thư mục `Facebook/` (nằm ngoài git, có bản sao fb-inbox-import.mjs chạy local),
  pipeline video, rotate, `packages/marketing/src/fb-inbox-import.mjs` (đường Chrome đang chạy ổn).
  Việc phân loại lead làm Ở MỘT CHỖ trong cron (xem Đợt 1) nên không cần sửa các điểm insert.
- Comment code theo nếp repo: ghi ngày + lý do cụ thể (mẫu: các comment 15/9, 16/9 trong
  `app/khach-hang/page.tsx:13-21`).
- Chuỗi tiếng Việt trong file `.ts/.tsx` viết CÓ DẤU (theo nếp file hiện có); file `.mjs` mới
  trong `lib/gen/` viết comment có dấu được (products.mjs đang có dấu), giữ nhất quán trong file.

## Đợt 1: Dữ liệu hoá — phân loại lead + khối phễu ở /khach-hang

### 1a. Migration cột `intent`

File MỚI `supabase/migrations/20260924180000_mkt_leads_intent.sql`:

```sql
-- 24/9: sếp Long chỉ phễu rớt ở câu trả lời đầu ("họ hỏi là có 10% attention, em trả lời
-- xong nó về 0"). Bước 1 là dữ liệu hoá: phân loại CÂU KHÁCH HỎI để biết khách kẹt ở đâu
-- và SP nào dễ bán nhất. Máy phân loại bằng từ khóa (cron), người không phải làm gì.
alter table mkt_leads
  add column if not exists intent text
  check (intent in ('gia','ky_thuat','lap_dat','bao_hanh','so_sanh','khac'));

comment on column mkt_leads.intent is 'Loại câu hỏi của khách, máy đoán bằng từ khóa (lead-intent.mjs)';
```

Lưu ý: `mkt_keywords` cũng có cột `intent` (init.sql:96) nhưng miền giá trị KHÁC (thong_tin,
thuong_mai...) — đừng lẫn, đừng dùng chung hằng số.

### 1b. Bộ phân loại `guessIntent` (file mới, JS thuần, test được không mạng)

File MỚI `apps/approval-ui/lib/gen/lead-intent.mjs`. Yêu cầu:

- Không import gì ngoài chuẩn Node (không import products.mjs — giữ file độc lập, test nhanh).
- Chuẩn hóa đầu vào: hạ chữ thường, bỏ dấu (`normalize('NFD')` + bỏ `̀-ͯ`, thay
  `đ` bằng `d`) vì khách hay gõ không dấu ("gia bao nhieu v shop").
- Luật khớp theo THỨ TỰ ƯU TIÊN (khớp luật nào trước lấy luật đó):
  1. `gia`: `bao nhieu`, `nhieu tien`, `bn tien`, `bao gia`, `tra gop`, `khuyen mai`,
     `giam gia`, `\bgia\b` (dùng ranh giới từ — "gia dinh" không được khớp).
  2. `lap_dat`: `lap dat`, `lap o`, `ai lap`, `lap tai`, `lap cho`, `thi cong`, `lap duoc khong`.
  3. `bao_hanh`: `bao hanh`, `bao tri`, `sua chua`, `hu thi`, `hong thi`, `doi tra`.
  4. `so_sanh`: `so voi`, `khac gi`, `tot hon`, `loai nao tot`, `nen mua loai nao`, `hon nhau`.
  5. `ky_thuat`: `cong suat`, `thong so`, `chay dau`, `loc duoc`, `may co`, `may dien`,
     `bao nhieu lit`, `\bcv\b`, `dung cho tau`, `tau dai`, `hoat dong`, `xai duoc`.
  6. Không khớp gì, hoặc chuỗi sau chuẩn hóa dưới 3 ký tự: `khac`.
- Export: `INTENTS` (mảng 6 giá trị đúng thứ tự trên), `INTENT_LABEL` (nhãn tiếng Việt có dấu:
  gia = "Hỏi giá", ky_thuat = "Kỹ thuật", lap_dat = "Lắp đặt", bao_hanh = "Bảo hành",
  so_sanh = "So sánh", khac = "Khác"), `guessIntent(text): string`.

### 1c. Bước phân loại trong cron (một chỗ duy nhất, không sửa các điểm insert)

File `apps/approval-ui/app/api/mkt-metrics-pull/route.ts`. NGAY SAU khối inbox
(khối `let inbox = ...` gọi `pullFacebookInbox`, khoảng dòng 84-91), THÊM khối:

```ts
  // 24/9 (sếp Long: dữ liệu hoá chuỗi để biết khách kẹt ở đâu): phân loại lead chưa có intent.
  // Làm ở MỘT CHỖ này thay vì sửa 4 điểm insert (Chrome import chạy local ngoài git, webhook,
  // Graph, nhập tay) — lead mới vào kiểu gì thì lượt cron sau cũng được phân loại. Tất định,
  // không LLM, không đáng kể vào maxDuration 90s.
  let classified = 0;
  try {
    const { data: unclassified } = await client
      .from('mkt_leads').select('id, message, product_guess').is('intent', null).limit(50);
    if (unclassified?.length) {
      const { guessIntent } = await import('../../../lib/gen/lead-intent.mjs');
      const { guessGroup } = await import('../../../lib/gen/products.mjs');
      for (const r of unclassified as any[]) {
        const patch: Record<string, unknown> = { intent: guessIntent(String(r.message || '')) };
        if (!r.product_guess) {
          const g = guessGroup(String(r.message || ''));
          if (g) patch.product_guess = g;
        }
        await client.from('mkt_leads').update(patch).eq('id', r.id);
        classified++;
      }
    }
  } catch { /* phân loại lỗi không làm vỡ cron */ }
```

Trong khối ghi `run_log` task `mkt.metrics_pull` (detail có `inboxPulled...`), thêm
`leadClassified: classified` vào detail.

22 lead cũ sẽ được phân loại tự động ở lượt cron đầu sau deploy — KHÔNG cần script backfill tay.

### 1d. Khối PHỄU ở /khach-hang

File `apps/approval-ui/app/khach-hang/page.tsx`.

- Thêm import `INTENT_LABEL` từ `../../lib/gen/lead-intent.mjs` (theo kiểu `// @ts-ignore` +
  import như dòng 10-11 đang làm với products.mjs).
- Trong `Promise.all` các lượt đếm (dòng 79-86), thêm 1 truy vấn kéo lead 14 ngày
  (cột tối thiểu, giới hạn 1000):

```ts
    client.from('mkt_leads')
      .select('status, product_guess, intent, created_at')
      .neq('status', 'spam')
      .gte('created_at', new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString())
      .limit(1000),
```

- Tổng hợp trong JS (không group by phía DB): đếm phễu `hỏi (tất cả) → contacted+won+lost →
  won | lost`, đếm theo `product_guess` (null gộp thành "Chưa rõ SP") và theo `intent`
  (null gộp "Chưa phân loại"). Xếp hạng SP theo (won desc, tổng hỏi desc) — dòng đầu là
  "gợi ý focus".
- Render NGAY DƯỚI `div.lead-week` hiện có (dòng 136-140) một khối mới, class `lead-week`
  thứ hai (tận dụng style sẵn có, không viết CSS mới):

```
Phễu 14 ngày: Hỏi 22 → Đã liên hệ 20 → 💰 Mua 0 | ❌ Không chốt 1
Theo SP: Lọc dầu 9 (mua 0) · Lọc nước 5 (mua 0) · Chưa rõ SP 8
Câu khách hỏi: Hỏi giá 12 · Kỹ thuật 4 · Khác 6
Gợi ý focus (máy xếp, người quyết): Lọc dầu — nhiều khách hỏi nhất 14 ngày
```

Chỉ hiện dòng "Gợi ý focus" khi có ít nhất 1 SP được đoán. Không thêm trang mới, không đổi
bố cục bảng (bài học memory: "sửa UI của X = sửa riêng X").

## Đợt 2: Nút "Soạn trả lời" — câu trả lời đầu tăng attention 10 lên 20 lên 30

### 2a. Khung trả lời + tâm lý khách (file tri thức mới)

File MỚI `apps/approval-ui/lib/gen/reply-playbook.mjs`. Export 2 hằng chuỗi:

- `REPLY_FRAME`: khung 3 nhịp cho MỌI câu trả lời đầu (đây là thuật lại chỉ đạo sếp Long 24/9,
  ghi rõ trong comment đầu file):
  1. BẮT ĐÚNG Ý: nhắc lại đúng cái khách hỏi bằng 1 câu, trả lời thẳng, không vòng vo.
     Khách hỏi giá thì nói giá (inbox được nói giá đầy đủ từ kho).
  2. NEO LỢI ÍCH + HỎI NGƯỢC: thêm 1 lợi ích sát với câu hỏi (từ kho verified) rồi kết bằng
     MỘT câu hỏi ngược dễ trả lời về tàu/máy của khách (tàu dài bao nhiêu, máy bao nhiêu CV,
     đang chạy vùng nào). Câu hỏi ngược là thứ giữ attention: khách trả lời là cuộc nói chuyện
     còn sống.
  3. MỞ BƯỚC KẾ: hứa một thứ cụ thể ngay sau câu trả lời của khách (gửi clip máy chạy thật,
     gửi bảng giá kèm lắp đặt, báo chi phí đúng cỡ tàu).
  Luật cứng: tối đa 4 câu + 1 câu hỏi ngược; không nói "dạ bên em có nhiều loại lắm";
  không kết bằng "cần gì cứ nhắn em" (câu đóng hội thoại, attention về 0).
- `CUSTOMER_PSYCHOLOGY`: 8 tới 10 gạch ý về tâm lý khách ngư dân/chủ tàu (kinh nghiệm chung
  của nghề bán hàng, KHÔNG phải số liệu SDVICO, ghi rõ điều đó trong chuỗi): sợ mua nhầm đồ
  không xài được trên tàu mình; tin người đã lắp thật hơn lời quảng cáo; hỏi giá trước không có
  nghĩa chỉ quan tâm giá, mà là cách mở chuyện quen thuộc; ngại chữ nghĩa dài, thích nói chuyện
  như ngoài bến; quyết định theo chuyến biển và theo mùa, chậm trả lời không phải hết quan tâm;
  hay mua vì người quen giới thiệu; muốn biết ai lắp cho, hư ai sửa; con số cụ thể (lít dầu,
  ngày công) thuyết phục hơn tính từ.

Hai chuỗi này dùng ở 2 nơi: prompt soạn nháp (2b) và kho bot `/hoi-dap` (2d).

### 2b. Hàm soạn nháp trong `lib/hoi-dap-bot.ts`

File `apps/approval-ui/lib/hoi-dap-bot.ts`. Thêm CUỐI FILE (dùng lại `buildKnowledgeText`,
`callModel`, `parseJson`, `todayVN` sẵn có — không sửa các hàm cũ):

```ts
// 24/9 (sếp Long: "câu trả lời đầu tiên của em chưa chuẩn... tăng attention từ 10 lên 20 lên 30",
// "đưa vô cho AI nó dạy về tâm lý khách hàng"): soạn NHÁP trả lời inbox cho 1 lead. Máy chỉ soạn,
// người đọc, sửa, TỰ GỬI trong Messenger rồi bấm Đã gửi tay (điều cấm 1). Số liệu SDVICO chỉ từ kho.
export type ReplyDraftInput = {
  id: string; fb_user_name: string | null; message: string;
  intent: string | null; product_guess: string | null;
  history: string[]; // raw_payload.all_customer_texts nếu có
};
export type ReplyDraftResult = { body: string; note: string; model: string };

export async function draftLeadReply(client: AnyClient, lead: ReplyDraftInput): Promise<ReplyDraftResult> {
  const { text } = await buildKnowledgeText(client);
  const { REPLY_FRAME, CUSTOMER_PSYCHOLOGY } = await import('./gen/reply-playbook.mjs');
  const prompt = [
    'Bạn soạn NHÁP tin nhắn trả lời khách qua inbox Facebook cho nhân viên SDVICO. Nhân viên sẽ đọc, sửa và tự gửi.',
    `Hôm nay: ${todayVN()}.`,
    '',
    'KHUNG BẮT BUỘC:', REPLY_FRAME, '',
    'TÂM LÝ KHÁCH (kinh nghiệm chung, không phải số liệu SDVICO):', CUSTOMER_PSYCHOLOGY, '',
    'LUẬT CỨNG:',
    '- Giá và thông số SDVICO CHỈ lấy từ kho bên dưới. Kho không có thì hỏi ngược nhu cầu khách, TUYỆT ĐỐI không bịa số.',
    '- Đây là inbox riêng nên ĐƯỢC nói giá đầy đủ nếu kho có giá đó.',
    '- Xưng "em", gọi "anh chị". Câu ngắn. Không gạch dài, không mũi tên, không emoji, không markdown. Số kiểu Việt Nam (9.900.000 đ).',
    '- Không mô tả phần mềm đối tác (Viettel S-Tracking, VNPT VSS, Vishipel, Thuraya) như của SDVICO.',
    '- Nội dung chạm quy định nhà nước, IUU, Kiểm ngư thì chỉ hẹn "em kiểm tra lại và trả lời anh chị sau", không tự trả lời.',
    '',
    'ĐẦU RA: DUY NHẤT một JSON {"body": string, "note": string}.',
    '- body: tin nhắn hoàn chỉnh gửi khách (tối đa 4 câu + 1 câu hỏi ngược ở cuối).',
    '- note: 1 câu cho NHÂN VIÊN, nói rõ mục tiêu của tin này (ví dụ: kéo khách nói cỡ tàu để báo đúng giá).',
    '',
    '===== KHO KIẾN THỨC SDVICO =====', text, '===== HẾT KHO =====', '',
    `Khách: ${lead.fb_user_name || '(chưa rõ tên)'}`,
    `Loại câu hỏi máy đoán: ${lead.intent || 'chưa rõ'}. Sản phẩm máy đoán: ${lead.product_guess || 'chưa rõ'}.`,
    lead.history.length ? `Các tin khách đã nhắn (cũ tới mới):\n${lead.history.map((t) => `- ${t}`).join('\n')}` : '',
    `Tin mới nhất của khách: ${lead.message}`,
  ].join('\n');
  const res = await callModel(() => prompt, client, false);
  const parsed = parseJson(res.text) as any;
  const body = String(parsed.body || parsed.answer || '').trim();
  if (!body) throw new Error('Bot không soạn được nháp.');
  return { body: body.slice(0, 1500), note: String(parsed.note || '').trim().slice(0, 300), model: res.model };
}
```

Lưu ý chữ ký `callModel(mkPrompt, client, hasWebHits)` — truyền `() => prompt` (bỏ qua tham số
canSearch vì nháp trả lời không cần tìm web) và `hasWebHits = false`.

### 2c. Server action + hàng đợi duyệt

File `apps/approval-ui/app/actions.ts`. Thêm 2 action, đặt ngay sau `updateLeadStatus`:

**`draftReplyAction(formData)`** — nhận `lead_id`:
1. Đọc lead: `select id, fb_user_name, message, intent, product_guess, raw_payload` từ `mkt_leads`.
2. Lấy `history = raw_payload?.all_customer_texts` (mảng, đường Chrome có; đường khác không có
   thì mảng rỗng).
3. Nếu đã có nháp pending cho lead này thì trả lại nháp đó luôn, không soạn mới (chống bấm đúp
   tốn quota): `select id, payload` từ `approval_queue` where `kind = 'mkt_send_message'`,
   `status = 'pending'`, `payload->>lead_id = <id>`, limit 1.
4. Gọi `draftLeadReply`. Quét tuân thủ bằng `assessDraft` từ `lib/gen/compliance.mjs` theo đúng
   mẫu `packages/marketing/src/outbound.mjs:83-97` (import PRODUCT_FACTS, knownFactValues,
   testFactValues từ `lib/gen/product-facts.mjs`).
5. Insert `approval_queue`:
   `{ kind: 'mkt_send_message', title: 'Trả lời ' + (tên khách || 'khách') + ' — ' + nhãn intent,
   payload: { channel: 'facebook_inbox', lead_id, body, note, intent, product_guess, touch: 0,
   needs_manager_approval: assessment.needsManagerApproval, risk: assessment.risk,
   compliance: assessment.flags }, status: 'pending' }` — status pending NGUYÊN VĂN.
6. Ghi `run_log`: task `mkt.reply_draft`, actor `gemini`, status `ok`, detail
   `{ lead_id, intent, model, risk }`. Lỗi ghi log không được chặn kết quả.
7. `revalidatePath('/khach-hang')`. Trả về `{ ok: true, queueId, body, note, risk }`; lỗi trả
   `{ ok: false, error: <thông báo tiếng Việt ngắn> }` — KHÔNG throw để client hiện lỗi mềm.

**`markReplySentAction(formData)`** — nhận `queue_id`, `lead_id`:
1. `update approval_queue set status = 'approved', decided_at = now(), note = 'Người gửi tay trong Messenger'`
   where `id = queue_id` AND `.eq('status','pending')` (theo mẫu `decideForm` actions.ts:517-546).
   Đây là ghi lại việc NGƯỜI đã tự gửi — không phải máy gửi.
2. Lead đang `new` thì update `status = 'contacted', updated_at = now()`; đang trạng thái khác
   thì chỉ chạm `updated_at` (mốc tính follow-up Đợt 3).
3. `revalidatePath('/khach-hang')`.

### 2d. Nạp khung + tâm lý vào bot /hoi-dap

File `apps/approval-ui/lib/hoi-dap-bot.ts`, hàm `buildKnowledgeText` (dòng 99-139): sau mục D,
thêm mục E:

```ts
  lines.push('');
  lines.push('=== E. KHUNG TRẢ LỜI KHÁCH + TÂM LÝ KHÁCH (chỉ đạo sếp Long 24/9; kinh nghiệm chung, không phải số liệu SDVICO) ===');
  lines.push(REPLY_FRAME);
  lines.push(CUSTOMER_PSYCHOLOGY);
```

Import tĩnh đầu file theo kiểu `// @ts-ignore` + `import { REPLY_FRAME, CUSTOMER_PSYCHOLOGY }
from './gen/reply-playbook.mjs';` (giống dòng 14-17). Nhờ vậy khi Thanh hỏi bot "soạn giúp tin
trả lời khách..." bằng tay, bot cũng dùng đúng khung. Giữ mục E GỌN (2 chuỗi cộng lại dưới
2.500 từ) — cả kho đang được nhét nguyên vào prompt mỗi lượt.

### 2e. UI nút Soạn trả lời trên dòng lead

File MỚI `apps/approval-ui/app/khach-hang/draft-reply-button.tsx` (client component, theo mẫu
`lead-stepper.tsx`):

- Props: `leadId`, `fbUrl` (fb_profile_url, có thể null), `pending` (nháp pending có sẵn:
  `{ queueId, body, note, risk } | null` — server truyền xuống).
- Chưa có nháp: nút `🤖 Soạn trả lời` → `useTransition` gọi `draftReplyAction`. Đang soạn hiện ⏳.
  Lỗi hiện chữ đỏ nhỏ, không alert.
- Có nháp (mới soạn hoặc pending sẵn): hiện `<textarea>` giá trị body (người sửa được trước khi
  chép), dòng `note` màu xám dưới, và nếu `risk === 'red'` hoặc `needs_manager_approval` thì dòng
  đỏ "Nội dung chạm quy định, phải cấp quản lý duyệt trước khi gửi (Điều cấm 3)".
  3 nút: `📋 Chép` (`navigator.clipboard.writeText` giá trị textarea hiện tại),
  `↗ Mở hộp thư` (link `fbUrl`, ẩn nếu null), `✅ Đã gửi tay` (gọi `markReplySentAction`,
  xong ẩn khối nháp, hiện "Đã ghi nhận").
- KHÔNG có nút nào gửi tự động. Ghi 1 dòng comment đầu file nhắc điều cấm 1.

File `apps/approval-ui/app/khach-hang/page.tsx`:
- Query thêm (song song trong `Promise.all` sẵn có): nháp pending
  `client.from('approval_queue').select('id, payload').eq('kind', 'mkt_send_message').eq('status', 'pending').limit(100)`
  rồi map `payload.lead_id → { queueId, body, note, risk, needs_manager_approval }`.
- Trong mỗi `<tr>`, dưới `SaveQaButton` (dòng 203-211), thêm `<DraftReplyButton leadId={l.id}
  fbUrl={l.fb_profile_url} pending={pendingByLead.get(l.id) || null} />`.
- Nháp follow-up (Đợt 3, `touch >= 1`) cũng hiện qua đúng component này (cùng map), thêm chữ
  "Chạm N" ở note.

## Đợt 3: Follow-up 3 chạm — máy soạn tất định, người bấm gửi

### 3a. Luật + nội dung (file mới, thuần, test được)

File MỚI `apps/approval-ui/lib/gen/followup-rules.mjs`:

```js
// 24/9: khách "im re" một phần vì không ai nhắc lại. Máy soạn nháp nhắc theo 3 mốc, người
// đọc, tự gửi, bấm Đã gửi tay (điều cấm 1). Tin TẤT ĐỊNH, không LLM (chạy trong cron 90s),
// không con số nào ngoài tổng đài và câu giá PRICE_TEASER lấy nguyên văn (điều cấm 5).
import { PRICE_TEASER } from './products.mjs';

export const TOUCHES = [
  { touch: 1, afterHours: 24 },
  { touch: 2, afterHours: 72 },
  { touch: 3, afterHours: 168 },
];

// Lead đủ điều kiện chạm nào? Trả về số chạm kế tiếp hoặc null.
// - Chỉ lead status 'contacted'. Mốc tính giờ: updated_at (lần người chạm khách gần nhất).
// - doneTouches: các touch đã có trong approval_queue cho lead này (pending lẫn approved).
// - Còn nháp pending bất kỳ cho lead -> null (đừng chồng tin).
// - Đã đủ 3 chạm -> null.
export function nextTouch({ status, updatedAt, doneTouches, hasPending, now }) { ... }

// Nội dung theo chạm. group = product_guess (có thể null).
export function buildFollowupBody({ touch, customerName, group }) { ... }
```

`nextTouch`: `hasPending → null`; `status !== 'contacted' → null`; tính `hours = (now - updatedAt)/3600000`;
duyệt TOUCHES theo thứ tự, lấy touch đầu tiên CHƯA có trong `doneTouches` và `hours >= afterHours`;
nhưng nếu touch nhỏ hơn chưa làm mà đã quá mốc touch lớn thì vẫn chỉ trả touch nhỏ nhất chưa làm
(mỗi lần 1 tin, đừng dồn); `doneTouches` đủ 3 → null.

`buildFollowupBody` — 3 mẫu, chèn `sp = tên nhóm SP` (group hoặc "thiết bị"), `chao =
customerName ? 'Chào ' + customerName + ',' : 'Chào anh chị,'`; câu giá `teaser =
PRICE_TEASER[group]?.text` (chỉ chèn khi có, nguyên văn):

- Chạm 1: `chao` + `Hôm trước anh chị có hỏi em về ${sp} bên SDVICO. Anh chị còn điều gì băn
  khoăn không, em giải đáp luôn ạ? Anh chị cho em biết tàu mình cỡ nào, em tư vấn đúng loại cho
  đỡ mất thời gian của anh chị.`
- Chạm 2: `chao` + `Em gửi anh chị thêm thông tin ${sp} nhé. ${teaser có thì chèn}` +
  `Nếu anh chị muốn xem máy chạy thật, em gửi clip khách đã lắp cho anh chị coi trước rồi mình
  tính tiếp ạ.` (payload.note nhắc người gửi: "đính kèm clip hoặc ảnh SP khi gửi").
- Chạm 3: `chao` + `Em phiền anh chị lần này nữa thôi ạ. Nếu anh chị vẫn quan tâm ${sp}, em hỗ
  trợ báo chi phí trọn gói theo cỡ tàu của mình. Còn nếu chưa tiện, anh chị cứ giữ số tổng đài
  1900 23 23 49, khi nào cần SDVICO có mặt ạ.`

Cấm trong body: gạch dài, mũi tên, emoji, markdown. Câu ngắn, mỗi tin dưới 500 ký tự.

### 3b. Bước sinh nháp trong cron

File MỚI `apps/approval-ui/lib/followup.ts`, export `draftFollowups(client, now = new Date())`:

1. Kéo lead ứng viên: `select id, fb_user_name, product_guess, status, updated_at` từ `mkt_leads`
   where `status = 'contacted'` và `updated_at <= now - 24h`, limit 100.
2. Kéo MỌI dòng `approval_queue` kind `mkt_send_message` (mọi status) có `payload->>lead_id`
   thuộc danh sách trên: `select status, payload`. Gom theo lead: `doneTouches` = các
   `payload.touch >= 1` (mọi status), `hasPending` = có dòng `status = 'pending'` bất kỳ
   (kể cả touch 0 của Đợt 2).
3. Với từng lead, gọi `nextTouch`; có chạm thì `buildFollowupBody` rồi insert
   `approval_queue { kind: 'mkt_send_message', title: 'Chạm ' + touch + ' — ' + (tên khách || 'khách'),
   payload: { channel: 'facebook_inbox', lead_id, touch, body, note: <ghi chú cho người gửi>,
   product_guess }, status: 'pending' }`. Tối đa 10 nháp mỗi lượt chạy.
4. KHÔNG đổi `mkt_leads.status`, KHÔNG đổi `updated_at` của lead (máy không quyết gì về khách).
5. Chỉ khi `drafted > 0` hoặc có lỗi mới ghi `run_log` task `mkt.followup_draft`, actor `cron`,
   detail `{ drafted, candidates, errors }` (cron chạy 4 lần/ngày, đừng xả log rỗng).
6. Trả `{ drafted, candidates, errors }`.

Móc vào `apps/approval-ui/app/api/mkt-metrics-pull/route.ts`, NGAY SAU khối phân loại 1c:

```ts
  // 24/9: nhắc lại khách đã liên hệ mà im re — máy chỉ SOẠN NHÁP vào hàng đợi (điều cấm 1).
  let fu: { drafted: number; candidates: number; errors: string[] } = { drafted: 0, candidates: 0, errors: [] };
  try {
    const { draftFollowups } = await import('../../../lib/followup');
    fu = await draftFollowups(client);
  } catch (e: any) { fu.errors = [String(e?.message || e).slice(0, 160)]; }
```

và thêm `followupDrafted: fu.drafted` vào detail của `mkt.metrics_pull`.

### 3c. Nháp follow-up hiện ở /khach-hang

Đã phủ ở 2e (cùng map pending theo lead_id). Kiểm rằng dòng lead có nháp chạm N hiện đúng chữ
"Chạm N" và nút Đã gửi tay hoạt động (approve + chạm `updated_at` lead — riêng follow-up thì
`markReplySentAction` giữ nguyên logic: lead contacted rồi thì chỉ chạm `updated_at`, nghĩa là
đồng hồ 3 chạm tự dời theo lần gửi mới nhất, đúng ý "3 chạm cách nhau").

## Test (mới) + Verify

### Test không mạng

File MỚI `apps/approval-ui/lib/gen/test-pheu.mjs`, chạy thuần Node, theo kiểu `eq(...)` của
`packages/marketing/src/test-video-rules.mjs`. Case tối thiểu:

1. `guessIntent`: "máy này giá bao nhiêu vậy" → gia; "gia bao nhieu v shop" (không dấu) → gia;
   "lắp ở Vũng Tàu được không" → lap_dat; "bảo hành mấy năm" → bao_hanh; "so với hàng Nhật thì
   sao" → so_sanh; "tàu 15m máy 400cv xài được không" → ky_thuat; "gia đình tôi làm nghề biển" →
   KHÔNG được ra gia (ranh giới từ) → khac; "." → khac; "giá bao nhiêu, chạy dầu gì" → gia
   (ưu tiên); chuỗi rỗng → khac.
2. `nextTouch`: contacted 25h không nháp → 1; contacted 25h có pending → null; contacted 80h
   đã touch 1 → 2; contacted 200h đã touch 1+2 → 3; đã đủ 3 → null; contacted 200h CHƯA touch
   nào → 1 (không dồn); status won/lost/new → null; 10h → null.
3. `buildFollowupBody`: cả 3 chạm không chứa ký tự cấm (regex `[—→•*#>]` và emoji), dưới 500 ký
   tự, chạm 3 chứa "1900 23 23 49", có group có teaser thì chạm 2 chứa nguyên văn teaser, không
   group thì không chứa chữ "undefined"/"null".
4. `REPLY_FRAME` + `CUSTOMER_PSYCHOLOGY`: tổng độ dài 2 chuỗi dưới 6.000 ký tự; không chứa
   ký tự cấm; `CUSTOMER_PSYCHOLOGY` chứa chữ "không phải số liệu SDVICO".

`package.json` gốc thêm script: `"test:pheu": "node apps/approval-ui/lib/gen/test-pheu.mjs"`.

### Verify bắt buộc trước khi báo xong

1. `npm run test:pheu` xanh. `npm run test:compliance` và `npm run test:inbox` vẫn xanh
   (không được vỡ cái cũ).
2. `node scripts/check-approval-gate.mjs` pass (mọi insert approval_queue mới đều
   `status: 'pending'` nguyên văn).
3. `cd apps/approval-ui && npx next build` không lỗi type.
4. Chạy dev (`npm run dev` trong apps/approval-ui, cần `.env.local` — ĐÃ có sẵn trên máy, bẫy:
   phải trỏ Supabase MỚI lluuoygdlaadtjsbnxbk, xem memory refill) và kiểm bằng browser preview:
   - `/khach-hang` hiện khối phễu, số khớp dữ liệu thật (22 lead).
   - Bấm 🤖 Soạn trả lời trên 1 lead thật → nháp hiện, sửa được, Chép được; kiểm tra trong DB
     có dòng `approval_queue` kind `mkt_send_message` status pending, payload đủ trường.
   - Bấm ✅ Đã gửi tay → dòng đổi approved, lead new thành contacted.
   - Gọi `GET /api/mkt-metrics-pull?secret=...` local 1 lần → lead cũ được điền intent
     (`leadClassified > 0` trong run_log), và với lead contacted quá 24h thì sinh nháp Chạm 1
     (kiểm approval_queue). KHÔNG bấm duyệt các nháp test này — xóa dòng test tự tạo sau khi kiểm.
5. Soi lại chính tả + văn phong 3 mẫu follow-up và 1 nháp bot sinh ra bằng mắt: đọc như người
   Việt viết, không lộ giọng máy.

## Bẫy đã biết (đọc trước khi code)

1. **Worktree cũ:** worktree phiên này từng ở commit 11/8 lịch sử KHÁC GỐC. Nhánh đã được reset
   về `origin/main` 6a0b008 ngày 24/9. Trước khi bắt đầu, chạy `git log --oneline -1` phải thấy
   6a0b008 trở lên; nếu không, `git fetch origin && git reset --hard origin/main` (worktree sạch).
2. **check-approval-gate** bắt CHUỖI `status: 'pending'` đúng nguyên văn trong code insert —
   đừng đưa status vào biến hay spread.
3. **`decided_by` không được ghi** ở luồng duyệt hiện tại (đăng nhập tài khoản chung) — đừng
   thêm logic dựa vào nó.
4. **Lead đường Chrome** có `fb_user_id: null` và `fb_profile_url` là link hộp thư CHUNG của
   Page (không phải hội thoại riêng) — nút "Mở hộp thư" vẫn dùng nó, người tự tìm đúng khách.
5. **`raw_payload` không đồng nhất:** đường Chrome có `all_customer_texts` (mảng 5 tin cuối),
   đường Graph là từng tin lẻ có `conversation_id`, webhook khác nữa. Code đọc phải
   `Array.isArray(...) ? ... : []`.
6. **`callModel` chuỗi Gemini hay 503/429** — `draftLeadReply` đã có fallback nhiều model sẵn;
   phía action bắt lỗi trả `{ ok: false, error }`, UI hiện chữ đỏ, KHÔNG retry vòng lặp.
7. **Đừng nhét kho 2 lần vào prompt nháp** — `buildKnowledgeText` đã gồm mục E mới; prompt
   `draftLeadReply` đưa REPLY_FRAME + CUSTOMER_PSYCHOLOGY riêng cho đậm, chấp nhận trùng mục E
   trong phần kho (vô hại), nhưng KHÔNG lặp lại product_facts hay QA thủ công lần nữa.
8. **`updated_at` của lead** bị `updateLeadStatus` chạm mỗi lần người lưu ghi chú — nghĩa là
   đồng hồ follow-up bị reset khi người sửa note. Chấp nhận trong bản này (người vừa chạm lead
   nghĩa là khách đang được quan tâm); ghi 1 dòng comment trong followup.ts để đời sau biết.
9. **Import `.mjs` từ `.ts`:** theo mẫu sẵn có (`// @ts-ignore` + import thẳng, xem
   hoi-dap-bot.ts:14-17). `import()` động trong route.ts theo mẫu youtube-metrics (dòng 67).
10. **Không đụng `Facebook/fb-inbox-import.mjs`** (bản sao local ngoài git) — mọi phân loại nằm
    ở cron, lead do bản sao đó tạo sẽ được phân loại ở lượt cron kế.
11. **Tiêu đề hàng đợi ở /hang-doi:** kind `mkt_send_message` đã có nhãn "Tin nhắn chăm sóc"
    trong `app/labels.ts:19-20` — kiểm tra trang `/hang-doi` hiện các nháp mới không vỡ layout
    (payload thiếu content_id là bình thường với kind này).

## Điều kiện dừng (gặp là DỪNG, hỏi người, không tự lách)

- Bất kỳ giải pháp nào đòi máy TỰ GỬI tin cho khách (Graph send, Playwright điền Messenger...).
- Cột `intent` đã tồn tại trên DB thật với miền giá trị khác plan.
- `check-approval-gate.mjs` fail mà không rõ vì sao.
- Phải thêm dependency mới vào apps/approval-ui mới làm được.
- Nháp bot sinh ra chứa giá/thông số KHÔNG có trong kho (điều cấm 5) — dừng, siết prompt, báo lại.

## Definition of Done

- [ ] Migration `20260924180000_mkt_leads_intent.sql` có trong repo (chưa cần áp DB — xem dưới).
- [ ] `npm run test:pheu` xanh; `test:compliance`, `test:inbox` không vỡ; `next build` sạch.
- [ ] `node scripts/check-approval-gate.mjs` pass.
- [ ] `/khach-hang`: khối phễu 14 ngày + theo SP + theo câu hỏi + gợi ý focus.
- [ ] Nút 🤖 Soạn trả lời chạy thật trên dev với 1 lead thật; nháp vào approval_queue pending;
      Đã gửi tay đổi approved + lead sang contacted.
- [ ] Cron local sinh nháp Chạm 1 cho lead contacted quá 24h; không sinh trùng, không quá 10/lượt.
- [ ] Không một dòng code nào gửi tin ra ngoài tự động.
- [ ] Commit message tiếng Việt theo nếp repo, kể đúng việc.

## Sau khi merge (việc chạy tay, ghi vào báo cáo cuối của người thi công)

1. Áp migration vào Supabase thật (project lluuoygdlaadtjsbnxbk): dán SQL của
   `20260924180000_mkt_leads_intent.sql` vào SQL Editor và chạy. Chưa áp thì bước phân loại
   trong cron lỗi im lặng (đã bọc try/catch, không vỡ cron) và khối phễu hiện "Chưa phân loại".
2. Deploy theo nếp repo: từ checkout chính, đồng bộ nhánh `ngay2-marketing` rồi
   `git push origin ngay2-marketing:main` (author phải Mr-Robot1c). Từ worktree thì fetch,
   rà lệch, rebase rồi push `HEAD:main` (cách đã dùng 11/9, xem memory bài bán theo tệp).
3. Sau lượt cron `/api/mkt-metrics-pull` đầu tiên: vào `/khach-hang` xác nhận 22 lead cũ đã có
   intent, khối phễu có số. Chụp màn hình gửi Thanh.
4. Nhắc Thanh: quy trình mới là mỗi sáng vào `/khach-hang`, xem nháp chờ (trả lời đầu + chạm),
   sửa theo ý mình, tự gửi trong Messenger, bấm Đã gửi tay. Tuần sau đọc lại khối phễu để
   chọn SP focus báo sếp Long (bước 5 "đo kết quả" trong vòng lặp sếp dạy).
