// lib/hoi-dap-bot.ts — Bot hỏi đáp nội bộ (lệnh sếp Long 9/9/2026: gom hỏi đáp thành kho kiến thức
// từng sản phẩm, đầu vào cho Bot Live Stream phase 2; Thanh: "nếu tôi quên thì hỏi nó").
//
// 10/9 (Thanh: "t muốn chatbot như 1 con claude vậy, có thể hỏi bên ngoài mà nó vẫn biết"): bot
// trả lời được MỌI câu hỏi như một trợ lý thường (kiến thức chung, kỹ thuật, soạn chữ, dịch, tính
// toán, tin mới qua tìm Google), NHƯNG mọi con số của SDVICO (giá, thông số, bảo hành, khách, link
// sàn, luật đăng bài) CHỈ lấy từ kho: mkt_product_qa + product_facts + FEATURES/PRICE_TEASER/
// SHOPEE_LINK trong products.mjs. Kho không có thì nói thẳng "kho chưa có", không bịa (điều cấm 5).
// Bot chỉ nói với người dùng nội bộ, không nhắn khách (điều cấm 1). Chỉ người đã đăng nhập gọi được.
// Chuỗi thử: Gemini có Google Search trước, lỗi/quota thì rơi về không tìm; tổng thời gian dưới 60s
// (Vercel Hobby), bài học plan-directions.ts 24/8.

// @ts-ignore — module JS thuần
import { logTokenUsage } from './gen/token-log.mjs';
// @ts-ignore — module JS thuần
import { PRODUCTS, getFeatures, PRICE_TEASER, SHOPEE_LINK, PUBLIC_NAME } from './gen/products.mjs';

type AnyClient = { from: (t: string) => any };

export type QaRow = {
  id: string; product_group: string; question: string; answer: string;
  source: string | null; confirmed_by: string | null; verified: boolean; used_count: number; created_at: string;
};
export type BotTurn = { role: 'user' | 'bot'; text: string };
export type BotSource = { id: string; product_group: string; question: string; verified: boolean; source: string | null };
export type WebSource = { url: string; title: string };
// scope: noi_bo = câu hỏi về SDVICO, trả lời từ kho; chung = kiến thức ngoài; hon_hop = cả hai.
export type BotScope = 'noi_bo' | 'chung' | 'hon_hop';
export type BotResult = {
  answer: string; found: boolean; scope: BotScope; used_ids: string[]; model: string;
  sources: BotSource[]; web_sources: WebSource[]; searched: boolean;
};

// Thứ tự thử (kiểm thật 10/9/2026 bằng key hiện tại): gemini-2.5-flash và 2.0-flash đã bị Google gỡ
// (404), gemini-flash-latest (= 3.8) và 3.7 hay 503 quá tải; sống tốt: 3.6-flash (5s), 3.5-flash (3s),
// 3.5-flash-lite (1s), flash-lite-latest. Tìm Google (googleSearch) trên key free hiện 429 ngay
// (hết hạn mức grounding, bài học knowledge-public.ts) nên để 2 lượt có tìm lên đầu (rớt nhanh 0,3s,
// khi Google mở lại hạn mức thì tự dùng), rồi 4 lượt không tìm. Tổng timeout 12+8+12+10+8+8 = 58s < 60s Vercel.
const ATTEMPTS: Array<{ model: string; search: boolean; ms: number }> = [
  { model: 'gemini-3.6-flash', search: true, ms: 12_000 },
  { model: 'gemini-flash-latest', search: true, ms: 8_000 },
  { model: 'gemini-3.6-flash', search: false, ms: 12_000 },
  { model: 'gemini-3.5-flash', search: false, ms: 10_000 },
  { model: 'gemini-3.5-flash-lite', search: false, ms: 8_000 },
  { model: 'gemini-flash-lite-latest', search: false, ms: 8_000 },
];
const MAX_QUESTION = 2000;

// Nhóm sản phẩm cho ô chọn (10 nhóm products.mjs + 2 nhóm ngoài danh mục).
export const QA_GROUPS: string[] = ['Chung', ...(PRODUCTS as Array<{ group: string }>).map((p) => p.group), 'Wifi vệ tinh'];

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label}: timeout ${ms}ms`)), ms)),
  ]);
}

function todayVN(): string {
  const p = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
  return p;
}

export async function loadQa(client: AnyClient, group?: string): Promise<QaRow[]> {
  let q = client
    .from('mkt_product_qa')
    .select('id, product_group, question, answer, source, confirmed_by, verified, used_count, created_at')
    .order('verified', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500);
  if (group) q = q.eq('product_group', group);
  const { data } = await q;
  return (data || []) as QaRow[];
}

// Ghép toàn bộ kho thành văn bản cho prompt. Mỗi dòng hỏi đáp có [id] để bot trích lại.
export async function buildKnowledgeText(client: AnyClient): Promise<{ qa: QaRow[]; text: string }> {
  const [qa, factsRes] = await Promise.all([
    loadQa(client),
    client.from('product_facts').select('category, brand, model, attribute, value, verified, source').limit(500),
  ]);
  const facts = ((factsRes?.data || []) as any[]).filter((f) => f.value);

  const lines: string[] = [];
  lines.push('=== A. HỎI ĐÁP ĐÃ NẠP (ưu tiên cao nhất; dòng ghi CHƯA XÁC NHẬN thì phải nói rõ khi trả lời) ===');
  for (const r of qa) {
    lines.push(`[${r.id}] (${r.product_group}) ${r.verified ? 'ĐÃ XÁC NHẬN' : 'CHƯA XÁC NHẬN'}${r.confirmed_by ? ' bởi ' + r.confirmed_by : ''}${r.source ? '; nguồn: ' + r.source : ''}`);
    lines.push(`Hỏi: ${r.question}`);
    lines.push(`Đáp: ${r.answer}`);
    lines.push('');
  }
  lines.push('=== B. THÔNG SỐ SẢN PHẨM (product_facts) ===');
  for (const f of facts) {
    lines.push(`- (${f.category}) ${[f.brand, f.model].filter(Boolean).join(' ')} ${f.attribute}: ${f.value}${f.verified ? '' : ' (CHƯA XÁC NHẬN)'}${f.source ? ' [nguồn: ' + f.source + ']' : ''}`);
  }
  lines.push('');
  lines.push('=== C. TÍNH NĂNG, CÂU GIÁ CÔNG KHAI, LINK SÀN (products.mjs) ===');
  for (const p of PRODUCTS as Array<{ group: string }>) {
    const feats: string[] = getFeatures(p.group) || [];
    const teaser = (PRICE_TEASER as any)[p.group];
    const link = (SHOPEE_LINK as any)[p.group];
    const pub = (PUBLIC_NAME as any)[p.group];
    if (!feats.length && !teaser && !link) continue;
    lines.push(`- ${p.group}${pub ? ' (tên công khai: ' + pub + ')' : ''}`);
    if (feats.length) lines.push(`  Tính năng: ${feats.join('; ')}`);
    if (teaser) lines.push(`  Câu giá trên bài công khai: "${teaser.text}"`);
    if (link) lines.push(`  Link Shopee: ${link}`);
  }
  lines.push('');
  // 10/9: bối cảnh công ty cố định (từ CLAUDE.md) để bot trả lời câu chung về SDVICO không cần nạp lại.
  lines.push('=== D. BỐI CẢNH CÔNG TY (cố định) ===');
  lines.push('- SDVICO = Công ty TNHH Hiệp Lực Phát Triển Việt. Nhà PHÂN PHỐI thiết bị hàng hải, giám sát hành trình tàu cá, thiết bị liên lạc. Web sdvico.vn, blog sdvico.vn/blog. Tổng đài 1900 23 23 49.');
  lines.push('- Viettel S-Tracking, VNPT VSS, Vishipel, Thuraya là phần mềm/dịch vụ của ĐỐI TÁC. SDVICO chỉ phân phối thiết bị tương thích, không sở hữu phần mềm của họ.');
  lines.push('- Kênh online (Page Facebook, TikTok, Zalo, Shopee) do nhân viên kênh online tự trả lời và tự chốt, không chuyển Kinh doanh (lệnh sếp Long 9/9/2026). Kinh doanh (Tiến, Hòa, Linh) chỉ cấp thông tin sản phẩm.');
  lines.push('- Bài công khai chỉ ghi giá úp mở theo câu giá ở mục C; số đầy đủ chỉ nói trong inbox hoặc trên sàn. Nội dung về quy định nhà nước, IUU, Cục Thủy sản, Kiểm ngư phải qua duyệt cấp quản lý trước khi đăng.');
  return { qa, text: lines.join('\n') };
}

function buildPrompt(knowledge: string, history: BotTurn[], question: string, canSearch: boolean): string {
  const hist = history
    .slice(-8)
    .map((t) => `${t.role === 'user' ? 'Người hỏi' : 'Bot'}: ${String(t.text || '').slice(0, 1200)}`)
    .join('\n');
  return [
    'Bạn là trợ lý AI nội bộ của SDVICO (Công ty TNHH Hiệp Lực Phát Triển Việt), giống một trợ lý đa năng như Claude hay ChatGPT, dùng cho nhân viên phụ trách kênh online và marketing.',
    `Hôm nay: ${todayVN()} (giờ Việt Nam).`,
    '',
    'CÁCH LÀM VIỆC:',
    '1. Trả lời được MỌI câu hỏi: kiến thức chung, kỹ thuật tàu cá và máy lọc, luật biển và IUU nói chung, soạn chữ, dịch, tính toán, tóm tắt, gợi ý cách bán hàng, tin tức mới. Với các câu này bạn dùng hiểu biết của mình' + (canSearch ? ' và công cụ tìm Google (nhất là khi cần thông tin mới hoặc số liệu bên ngoài).' : '.'),
    '2. RIÊNG mọi thứ THUỘC VỀ SDVICO (giá bán, khuyến mãi, thông số máy SDVICO đang bán, bảo hành, khách hàng, đối tác, link sàn, luật đăng bài nội bộ) thì CHỈ được lấy từ KHO KIẾN THỨC bên dưới. Tuyệt đối không suy đoán, không lấy giá hay thông số từ internet gán cho SDVICO. Kho không có thì nói rõ "kho SDVICO chưa có thông tin này, hỏi Kinh doanh (Tiến, Hòa, Linh) rồi lưu vào kho", nhưng vẫn có thể trả lời phần kiến thức chung của câu hỏi và nói rõ đó là kiến thức chung.',
    '3. Dòng kho ghi CHƯA XÁC NHẬN thì ghi "(chưa xác nhận)" ngay sau ý đó.',
    '4. Thông tin lấy từ internet thì ghi rõ là "theo nguồn ngoài" và không được trộn lẫn với số liệu SDVICO.',
    '5. Không bịa số liệu, giải thưởng, khách hàng, đối tác. Không mô tả phần mềm đối tác (Viettel S-Tracking, VNPT VSS, Vishipel, Thuraya) như của SDVICO.',
    '6. Nếu câu hỏi liên quan tới đăng bài công khai, nhắc luật giá úp mở và luật nội dung IUU phải qua duyệt (mục D).',
    '7. Viết tiếng Việt tự nhiên, thân thiện, đủ ý; câu hỏi khó thì giải thích từng bước. Không dùng gạch dài, mũi tên, dấu chấm tròn giữa câu, không markdown đậm nghiêng. Số theo kiểu Việt Nam (9.900.000 đ).',
    '',
    'ĐẦU RA: trả về DUY NHẤT một JSON, không có chữ nào ngoài JSON:',
    '{"answer": string, "scope": "noi_bo" | "chung" | "hon_hop", "found": boolean, "used_ids": string[]}',
    '- scope: noi_bo nếu câu hỏi hoàn toàn về SDVICO; chung nếu hoàn toàn là kiến thức ngoài; hon_hop nếu cả hai.',
    '- found: false CHỈ KHI câu hỏi có phần về SDVICO mà kho không có; câu hỏi chung trả lời được thì found = true.',
    '- used_ids: id trong ngoặc vuông của các dòng HỎI ĐÁP (mục A) đã dùng. Không có thì [].',
    '',
    '===== KHO KIẾN THỨC SDVICO =====',
    knowledge,
    '===== HẾT KHO =====',
    '',
    hist ? `Hội thoại trước:\n${hist}\n` : '',
    `Câu hỏi mới: ${question}`,
  ].join('\n');
}

type GeminiOut = { text: string; model: string; searched: boolean; web: WebSource[] };

function extractWebSources(res: any): WebSource[] {
  const chunks = res?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];
  const seen = new Set<string>();
  const out: WebSource[] = [];
  for (const c of chunks) {
    const url = String(c?.web?.uri || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, title: String(c?.web?.title || url).slice(0, 120) });
    if (out.length >= 5) break;
  }
  return out;
}

async function callGemini(mkPrompt: (canSearch: boolean) => string, client: AnyClient | null): Promise<GeminiOut> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let lastErr = '';
  for (const a of ATTEMPTS) {
    try {
      // Grounding (googleSearch) không đi cùng responseMimeType JSON, nên lượt có tìm thì tự bóc JSON từ chữ.
      const config: any = { temperature: 0.3 };
      if (a.search) config.tools = [{ googleSearch: {} }];
      else config.responseMimeType = 'application/json';
      const res = await withTimeout(
        ai.models.generateContent({
          model: a.model,
          contents: [{ role: 'user', parts: [{ text: mkPrompt(a.search) }] }],
          config,
        }),
        a.ms,
        `${a.model}${a.search ? '+search' : ''}`
      );
      const text = (res as any).text || '';
      if (!text.trim()) throw new Error('trả lời rỗng');
      if (client) logTokenUsage(client, 'hoi_dap_bot', a.model, (res as any).usageMetadata);
      return { text, model: a.model + (a.search ? ' + Google Search' : ''), searched: a.search, web: a.search ? extractWebSources(res) : [] };
    } catch (e: any) {
      lastErr = `${a.model}${a.search ? '+search' : ''}: ${String(e?.message || e).slice(0, 150)}`;
    }
  }
  throw new Error('Mọi model Gemini đều lỗi hoặc quá giờ. Lỗi cuối: ' + lastErr);
}

function parseJson(text: string): { answer?: string; found?: boolean; scope?: string; used_ids?: unknown } {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch { /* rơi xuống */ }
  const m = t.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* bỏ */ } }
  // Model có tìm Google đôi khi trả chữ thường thay vì JSON: lấy nguyên chữ làm câu trả lời.
  return { answer: t, found: true, scope: 'chung', used_ids: [] };
}

export async function askBot(client: AnyClient, question: string, history: BotTurn[] = []): Promise<BotResult> {
  const q = String(question || '').trim().slice(0, MAX_QUESTION);
  if (!q) throw new Error('Câu hỏi trống.');
  const { qa, text } = await buildKnowledgeText(client);
  const { text: raw, model, searched, web } = await callGemini((canSearch) => buildPrompt(text, history, q, canSearch), client);
  const parsed = parseJson(raw);
  const byId = new Map(qa.map((r) => [r.id, r]));
  const usedIds = (Array.isArray(parsed.used_ids) ? parsed.used_ids : [])
    .map((x) => String(x))
    .filter((id) => byId.has(id))
    .slice(0, 8);
  const scope: BotScope = parsed.scope === 'chung' || parsed.scope === 'hon_hop' ? parsed.scope : 'noi_bo';
  const found = parsed.found !== false && !!String(parsed.answer || '').trim();
  const answer = String(parsed.answer || '').trim()
    || 'Kho SDVICO chưa có thông tin này. Hỏi Kinh doanh (Tiến, Hòa, Linh) rồi lưu câu trả lời vào kho.';

  // Đếm số lần dùng để biết dòng nào hay được hỏi (đầu vào chọn lọc cho bot live).
  await Promise.all(usedIds.map((id) => {
    const r = byId.get(id)!;
    return client.from('mkt_product_qa').update({ used_count: (r.used_count || 0) + 1 }).eq('id', id);
  }));
  // Ghi vết để Agent thấy bot hoạt động và để biết câu nào kho còn thiếu (warn = câu về SDVICO kho chưa có).
  try {
    await client.from('run_log').insert({
      task: 'mkt.hoi_dap_bot', actor: 'gemini', status: found ? 'ok' : 'warn',
      detail: { question: q.slice(0, 600), found, scope, searched, used_ids: usedIds, model, web: web.length, msg: found ? (scope === 'chung' ? 'trả lời kiến thức chung' : 'trả lời từ kho') : 'kho chưa có câu này' },
    });
  } catch { /* log lỗi không chặn trả lời */ }

  const sources: BotSource[] = usedIds.map((id) => {
    const r = byId.get(id)!;
    return { id, product_group: r.product_group, question: r.question, verified: r.verified, source: r.source };
  });
  return { answer, found, scope, used_ids: usedIds, model, sources, web_sources: web, searched };
}
