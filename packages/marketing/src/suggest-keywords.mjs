// suggest-keywords.mjs — AI quản lý SEO: Gemini đề xuất từ khóa đuôi dài mới cho kho mkt_keywords.
// Chạy: npm run seo:suggest                                  (chèn tối đa 10 từ mới, khử trùng)
//       node packages/marketing/src/suggest-keywords.mjs --dry   (chỉ in ra, không ghi DB)
//
// Model chỉ GỢI Ý CỤM TÌM KIẾM người dùng hay gõ — không sinh dữ kiện sản phẩm, không viết
// nội dung (không đụng điều cấm 5). Từ mới vào kho với priority 0 (thấp nhất — từ khóa
// chiến lược nạp tay vẫn được ưu tiên trước) và source 'gemini đề xuất'. Nội dung viết từ
// các từ khóa này vẫn qua hàng đợi duyệt như mọi bài (điều cấm 1 giữ ở tầng nội dung).

import { getServiceClient, logRun } from '@sdvico/core';
import { logTokenUsage } from './token-log.mjs';

const DRY = process.argv.includes('--dry');
const CAP = 10;
const MODEL = process.env.MKT_KEYWORD_MODEL || 'gemini-flash-lite-latest';
const FALLBACK_MODEL = process.env.MKT_MODEL || 'gemini-flash-latest';
const TIMEOUT_MS = Number(process.env.MKT_GEN_TIMEOUT_MS) || 30000;
// Bốn mã intent hợp lệ theo ràng buộc bảng mkt_keywords (xem ghi chú schema ở seed-keywords.mjs).
const VALID_INTENT = new Set(['thong_tin', 'thuong_mai', 'giao_dich', 'dieu_huong']);

const client = getServiceClient();
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// Toàn bộ keyword hiện có (phân trang như seed-keywords.mjs) để khử trùng lặp.
const existing = new Set();
{
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from('mkt_keywords')
      .select('keyword')
      .range(from, from + pageSize - 1);
    if (error) throw new Error('Không đọc được mkt_keywords: ' + error.message);
    for (const r of data) existing.add(norm(r.keyword));
    if (!data || data.length < pageSize) break;
  }
}
const sample = [...existing].slice(-60);

const system = [
  'Bạn là chuyên viên SEO cho SDVICO, công ty phân phối và lắp đặt thiết bị cho tàu cá:',
  'thiết bị giám sát hành trình tàu cá, điện thoại vệ tinh, máy lọc nước biển thành nước ngọt,',
  'thiết bị xử lý dầu tiết kiệm diesel, dầu nhớt cho máy tàu.',
  'Khách hàng: ngư dân, chủ tàu cá, doanh nghiệp thủy sản Việt Nam.',
  `Nhiệm vụ: đề xuất ĐÚNG ${CAP} cụm từ khóa tìm kiếm ĐUÔI DÀI tiếng Việt mà ngư dân, chủ tàu`,
  'thật sự gõ vào Google (câu hỏi đời thường, sự cố, thủ tục, chi phí). KHÔNG trùng và không',
  'chỉ đảo chữ các từ khóa đã có. KHÔNG bịa tên model, thông số kỹ thuật, giá tiền.',
  'Trả về DUY NHẤT một mảng JSON, mỗi phần tử: {"keyword": "...", "intent": "..."}.',
  'intent chọn một trong: thong_tin (tìm hiểu), thuong_mai (so sánh), giao_dich (mua/lắp/sửa), dieu_huong (tìm SDVICO).',
].join('\n');
const user = 'Từ khóa đã có trong kho (tránh trùng):\n' + sample.join('\n');

let res;
let usedModel = MODEL;
try {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  // Timeout cứng kiểu genOnce của content.mjs — SDK tự retry làm lần gọi chậm treo rất lâu.
  const call = async (model) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      return await ai.models.generateContent({
        model,
        contents: user,
        config: { systemInstruction: system, responseMimeType: 'application/json', abortSignal: ac.signal },
      });
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    res = await call(MODEL);
  } catch {
    usedModel = FALLBACK_MODEL;
    res = await call(FALLBACK_MODEL);
  }
} catch (e) {
  const msg = String(e?.message || e);
  console.error('Gemini lỗi, không đề xuất được từ khóa:', msg);
  // Fail mềm: trạng thái nằm ở run_log (tab AI SEO đọc), không làm đỏ cả workflow tuần.
  if (!DRY) await logRun(client, { task: 'mkt.keyword_suggest', status: 'error', detail: { model: usedModel, msg } });
  process.exit(0);
}
logTokenUsage(client, 'keyword_suggest', usedModel, res.usageMetadata);

let rows = [];
try {
  const text = String(res.text || '').replace(/^```(json)?/m, '').replace(/```\s*$/m, '').trim();
  rows = JSON.parse(text);
  if (!Array.isArray(rows)) throw new Error('không phải mảng');
} catch (e) {
  const msg = 'Gemini trả JSON hỏng: ' + String(e?.message || e);
  console.error(msg);
  if (!DRY) await logRun(client, { task: 'mkt.keyword_suggest', status: 'error', detail: { model: usedModel, msg } });
  process.exit(0);
}

const fresh = [];
const seenNow = new Set();
for (const r of rows) {
  const kw = norm(r?.keyword);
  if (!kw || kw.length < 8 || kw.length > 90) continue;
  if (existing.has(kw) || seenNow.has(kw)) continue;
  seenNow.add(kw);
  fresh.push({
    keyword: kw,
    intent: VALID_INTENT.has(r?.intent) ? r.intent : 'thong_tin',
    landing_url: null,
    source: 'gemini đề xuất',
    priority: 0,
  });
  if (fresh.length >= CAP) break;
}

console.log(`Gemini (${usedModel}) đề xuất ${rows.length} cụm, sau khử trùng còn ${fresh.length}:`);
for (const f of fresh) console.log(`- [${f.intent}] ${f.keyword}`);

if (DRY) {
  console.log('\nChế độ --dry: không ghi gì vào DB.');
  process.exit(0);
}

if (fresh.length) {
  const { error } = await client.from('mkt_keywords').insert(fresh);
  if (error) throw new Error('Chèn mkt_keywords lỗi: ' + error.message);
}
await logRun(client, {
  task: 'mkt.keyword_suggest',
  status: 'ok',
  detail: {
    model: usedModel,
    suggested: rows.length,
    inserted: fresh.length,
    msg: `chèn ${fresh.length} từ khóa mới (Gemini đề xuất ${rows.length}, kho có sẵn ${existing.size})`,
  },
});
console.log(`\nXong. Chèn ${fresh.length} từ khóa mới vào kho.`);
