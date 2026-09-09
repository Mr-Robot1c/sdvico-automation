// lib/hoi-dap-bot.ts — Bot hỏi đáp nội bộ (lệnh sếp Long 9/9/2026: gom hỏi đáp thành kho kiến thức
// từng sản phẩm, đầu vào cho Bot Live Stream phase 2; Thanh: "nếu tôi quên thì hỏi nó").
//
// Bot CHỈ trả lời từ kho: bảng mkt_product_qa (hỏi đáp đã nạp) + product_facts (thông số đã xác
// nhận) + FEATURES/PRICE_TEASER/SHOPEE_LINK trong products.mjs. Không có trong kho thì nói thẳng
// "chưa có", không bịa (điều cấm 5). Chỉ người đã đăng nhập gọi được (API route tự khóa).
// Fallback 4 model Gemini + timeout 12s mỗi model (bài học plan-directions.ts 24/8: Vercel Hobby 60s).

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
export type BotResult = { answer: string; found: boolean; used_ids: string[]; model: string; sources: BotSource[] };

const MODEL_CHAIN = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest'];
const MODEL_TIMEOUT_MS = 12_000;

// Nhóm sản phẩm cho ô chọn (10 nhóm products.mjs + 2 nhóm ngoài danh mục).
export const QA_GROUPS: string[] = ['Chung', ...(PRODUCTS as Array<{ group: string }>).map((p) => p.group), 'Wifi vệ tinh'];

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label}: timeout ${ms}ms`)), ms)),
  ]);
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
  return { qa, text: lines.join('\n') };
}

function buildPrompt(knowledge: string, history: BotTurn[], question: string): string {
  const hist = history
    .slice(-6)
    .map((t) => `${t.role === 'user' ? 'Người hỏi' : 'Bot'}: ${String(t.text || '').slice(0, 600)}`)
    .join('\n');
  return [
    'Bạn là trợ lý nội bộ của SDVICO (Công ty TNHH Hiệp Lực Phát Triển Việt), trả lời cho nhân viên phụ trách kênh online.',
    'LUẬT BẮT BUỘC:',
    '1. CHỈ trả lời bằng thông tin có trong KHO KIẾN THỨC bên dưới. Không suy đoán, không thêm số liệu, giá, thông số ngoài kho.',
    '2. Không tìm thấy thì found=false và answer ghi: "Chưa có trong kho kiến thức. Hỏi Kinh doanh (Tiến, Hòa, Linh) rồi lưu câu trả lời vào kho." Có thể gợi ý dòng gần nhất nếu có.',
    '3. Dòng nào CHƯA XÁC NHẬN thì phải ghi rõ "(chưa xác nhận)" ngay sau ý đó.',
    '4. Nếu câu hỏi liên quan tới đăng bài công khai, nhắc luật giá úp mở và luật gửi nhóm duyệt nếu kho có.',
    '5. Viết tiếng Việt tự nhiên, ngắn gọn, đủ ý. Không dùng gạch dài, mũi tên, dấu chấm tròn giữa câu. Số theo kiểu Việt Nam (9.900.000 đ).',
    '6. used_ids = danh sách id trong ngoặc vuông của các dòng HỎI ĐÁP đã dùng để trả lời (chỉ mục A). Không có thì [].',
    '',
    'Trả về DUY NHẤT một JSON: {"answer": string, "found": boolean, "used_ids": string[]}',
    '',
    '===== KHO KIẾN THỨC =====',
    knowledge,
    '===== HẾT KHO =====',
    '',
    hist ? `Hội thoại trước:\n${hist}\n` : '',
    `Câu hỏi mới: ${question}`,
  ].join('\n');
}

async function callGemini(prompt: string, client: AnyClient | null): Promise<{ text: string; model: string }> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let lastErr = '';
  for (const model of MODEL_CHAIN) {
    try {
      const res = await withTimeout(
        ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: { responseMimeType: 'application/json', temperature: 0.2 },
        }),
        MODEL_TIMEOUT_MS,
        model
      );
      if (client) logTokenUsage(client, 'hoi_dap_bot', model, (res as any).usageMetadata);
      return { text: res.text || '', model };
    } catch (e: any) {
      lastErr = `${model}: ${String(e?.message || e).slice(0, 150)}`;
    }
  }
  throw new Error('Mọi model Gemini đều lỗi hoặc quá giờ. Lỗi cuối: ' + lastErr);
}

function parseJson(text: string): { answer?: string; found?: boolean; used_ids?: unknown } {
  try { return JSON.parse(text); } catch { /* rơi xuống */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* bỏ */ } }
  return {};
}

export async function askBot(client: AnyClient, question: string, history: BotTurn[] = []): Promise<BotResult> {
  const q = String(question || '').trim().slice(0, 600);
  if (!q) throw new Error('Câu hỏi trống.');
  const { qa, text } = await buildKnowledgeText(client);
  const { text: raw, model } = await callGemini(buildPrompt(text, history, q), client);
  const parsed = parseJson(raw);
  const byId = new Map(qa.map((r) => [r.id, r]));
  const usedIds = (Array.isArray(parsed.used_ids) ? parsed.used_ids : [])
    .map((x) => String(x))
    .filter((id) => byId.has(id))
    .slice(0, 8);
  const found = parsed.found !== false && !!String(parsed.answer || '').trim();
  const answer = String(parsed.answer || '').trim()
    || 'Chưa có trong kho kiến thức. Hỏi Kinh doanh (Tiến, Hòa, Linh) rồi lưu câu trả lời vào kho.';

  // Đếm số lần dùng để biết dòng nào hay được hỏi (đầu vào chọn lọc cho bot live).
  await Promise.all(usedIds.map((id) => {
    const r = byId.get(id)!;
    return client.from('mkt_product_qa').update({ used_count: (r.used_count || 0) + 1 }).eq('id', id);
  }));
  // Ghi vết để Agent thấy bot hoạt động và để biết câu nào bot chưa trả lời được (kho còn thiếu gì).
  try {
    await client.from('run_log').insert({
      task: 'mkt.hoi_dap_bot', actor: 'gemini', status: found ? 'ok' : 'warn',
      detail: { question: q, found, used_ids: usedIds, model, msg: found ? 'trả lời từ kho' : 'kho chưa có câu này' },
    });
  } catch { /* log lỗi không chặn trả lời */ }

  const sources: BotSource[] = usedIds.map((id) => {
    const r = byId.get(id)!;
    return { id, product_group: r.product_group, question: r.question, verified: r.verified, source: r.source };
  });
  return { answer, found, used_ids: usedIds, model, sources };
}
