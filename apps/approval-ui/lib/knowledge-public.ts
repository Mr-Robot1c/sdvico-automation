// lib/knowledge-public.ts — NV2 trong ba-spec Kế hoạch AI v2 (AI Data #2 trong flowchart v3).
//
// v1.5 (nhịp user chốt 18/8): AI Data #2 học MỖI NGÀY qua Google News RSS (learnPublicDaily,
// miễn phí không quota) rồi đổ về BOSS. Chủ nhật quét thêm một lượt sâu bằng Gemini
// google_search grounding (learnPublicKnowledge) — lượt này hay dính quota 429, lỗi thì bỏ
// qua vì RSS hằng ngày đã phủ.
//
// Ràng buộc (rule R2 & R3 trong ba-spec):
//   - Mỗi bản ghi PHẢI có URL nguồn thật, không rỗng.
//   - Không tự đăng bài, không tự đẩy hàng chờ duyệt.
//   - Nếu chạm quy định nhà nước/IUU/Cục Thủy sản/Kiểm ngư → gắn needs_gov_review=true.

import type { getServerClient } from './supabase-server';
import { needsGovReview } from './knowledge';
// @ts-ignore — module JS thuần
import { logTokenUsage } from './gen/token-log.mjs';

type Client = ReturnType<typeof getServerClient>;

const MKT_MODEL = process.env.MKT_MODEL || 'gemini-flash-lite-latest';

// Chủ đề tìm kiếm ngành cá/thủy sản Việt Nam. Giữ ngắn gọn để Gemini bám đúng chủ đề.
const SEARCH_TOPICS = [
  'tin tức ngành thủy sản Việt Nam tuần này',
  'quy định mới cho tàu cá và ngư dân Việt Nam',
  'xu hướng đánh bắt cá xa bờ Việt Nam',
  'giá dầu diesel tàu cá Việt Nam gần đây',
  'thiết bị giám sát hành trình tàu cá VMS quy định mới',
  'thẻ vàng IUU EC đối với thủy sản Việt Nam',
  // Playbook 27/8 tầng 1 (user: "1 bài/tuần theo trend, VN vô địch làm video tự hào"):
  // BOSS thấy trend Việt Nam trong tri thức tuần → tự đề xuất 1 hướng bài bám thời sự.
  // Playbook PHẦN 3 pattern 5: "Thời sự nghề là xăng tăng lực viral miễn phí".
  'sự kiện nóng Việt Nam tuần này',
  'bóng đá đội tuyển Việt Nam thắng thua tuần này',
  'thời tiết bão Biển Đông ảnh hưởng đi biển tuần này',
];

type Finding = {
  source_url: string;
  source_title: string;
  summary: string;
};

// Chuẩn hoá tiêu đề để so trùng: thường hoá, gộp khoảng trắng. Google News RSS đổi URL redirect
// mã hoá MỖI LẦN lấy cho cùng một bài, nên dedup theo URL không bắt được bài trùng (user 20/8:
// "AI Data #2 đọc lại bài cũ"). Tiêu đề mới là khoá ổn định để chặn học lại.
function normTitle(s: string): string {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Lọc bỏ các finding ĐÃ học trong 30 ngày, chặn theo CẢ url lẫn TIÊU ĐỀ, và dedupe trong lô
// theo tiêu đề. Dùng chung cho learnPublicDaily (RSS) và learnPublicKnowledge (Gemini).
async function filterUnseen(client: Client, uniq: Finding[]): Promise<Finding[]> {
  if (!uniq.length) return [];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // URL đã thấy (30 ngày) — vẫn giữ để chặn nhanh khi URL tình cờ ổn định.
  const seenUrls = new Set<string>();
  const urls = uniq.map((f) => f.source_url);
  const CHUNK = 100;
  for (let i = 0; i < urls.length; i += CHUNK) {
    const { data } = await client
      .from('mkt_knowledge_public')
      .select('source_url')
      .in('source_url', urls.slice(i, i + CHUNK))
      .gte('created_at', thirtyDaysAgo);
    for (const r of data || []) seenUrls.add((r as any).source_url as string);
  }

  // Tiêu đề đã thấy (30 ngày) — khoá chính chặn học lại bài cũ.
  const seenTitles = new Set<string>();
  const { data: recent } = await client
    .from('mkt_knowledge_public')
    .select('source_title')
    .gte('created_at', thirtyDaysAgo)
    .limit(3000);
  for (const r of recent || []) seenTitles.add(normTitle((r as any).source_title || ''));

  const outTitles = new Set<string>();
  const out: Finding[] = [];
  for (const f of uniq) {
    if (seenUrls.has(f.source_url)) continue;
    const nt = normTitle(f.source_title);
    if (nt && (seenTitles.has(nt) || outTitles.has(nt))) continue;
    if (nt) outTitles.add(nt);
    out.push(f);
  }
  return out;
}

// Gọi Gemini có bật google_search grounding, trả về danh sách nguồn kèm URL.
async function searchOneTopic(topic: string, client: Client): Promise<Finding[]> {
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const res = await ai.models.generateContent({
      model: MKT_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: [
                `Tìm 2-3 nguồn tin GẦN ĐÂY (trong 7 ngày) về chủ đề: "${topic}".`,
                'Chỉ dùng nguồn tin chính thống Việt Nam (báo lớn, cổng thông tin bộ ngành).',
                'Mỗi nguồn phải có URL đầy đủ.',
                'Trả về JSON đúng dạng, không thêm chữ ngoài JSON:',
                '{"findings":[{"source_url":"https://...","source_title":"...","summary":"2-3 câu tóm tắt tiếng Việt, câu ngắn, gần gũi bà con ngư dân, không gạch dài, không mũi tên"}]}',
                'Nếu không tìm được nguồn nào phù hợp trong 7 ngày qua, trả về {"findings":[]}.',
              ].join('\n'),
            },
          ],
        },
      ],
      config: {
        temperature: 0.3,
        tools: [{ googleSearch: {} }] as any,
      },
    });
    logTokenUsage(client, 'knowledge_public_search', MKT_MODEL, (res as any).usageMetadata);

    const t = (res.text || '').trim();
    const m = t.match(/\{[\s\S]*\}/);
    if (!m) return [];
    const parsed = JSON.parse(m[0]);
    const arr = Array.isArray(parsed.findings) ? parsed.findings : [];
    return arr
      .map((f: any) => ({
        source_url: String(f.source_url || '').trim(),
        source_title: String(f.source_title || '').slice(0, 200).trim(),
        summary: String(f.summary || '').slice(0, 1000).trim(),
      }))
      .filter((f: Finding) => f.source_url && /^https?:\/\//i.test(f.source_url) && f.summary);
  } catch (e: any) {
    console.warn(`[knowledge-public] topic "${topic}" loi:`, e?.message || e);
    return [];
  }
}

// Học tri thức public: chạy tất cả chủ đề, dedupe theo source_url, chèn vào DB.
// Idempotent trong khoảng thời gian gần đây theo source_url (SELECT trước, insert sau).
//
// GUARD 2 NGÀY/LẦN (user 26/8: "điều chỉnh 2 ngày 1 lần quét đi" — cân bằng độ tươi tin
// ngành cá vs chi phí token). Cron mkt-metrics-pull chạy mỗi giờ trong window 7-10h VN →
// mỗi sáng đều gọi hàm này, guard chặn nếu lần cuối < 48h. Ghi log sau khi chạy OK để lần
// sau biết. Kết quả: chạy vào sáng ngày lẻ (VD hôm nay 7h → next chạy sau 48h vào 7h ngày kia).
export async function learnPublicKnowledge(
  client: Client
): Promise<{ topics: number; found: number; inserted: number; errors: string[]; skipped?: boolean }> {
  // Guard: đã chạy trong 48h qua chưa?
  const gate = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const { data: ranRecent } = await client
    .from('run_log')
    .select('id')
    .eq('task', 'mkt.knowledge_public_deep')
    .eq('status', 'ok')
    .gte('created_at', gate)
    .limit(1);
  if (ranRecent && ranRecent.length) {
    return { topics: 0, found: 0, inserted: 0, errors: [], skipped: true };
  }

  const errors: string[] = [];
  const all: Finding[] = [];

  for (const topic of SEARCH_TOPICS) {
    const findings = await searchOneTopic(topic, client);
    for (const f of findings) all.push(f);
  }

  // Dedupe theo URL trong lô tìm được.
  const byUrl = new Map<string, Finding>();
  for (const f of all) if (!byUrl.has(f.source_url)) byUrl.set(f.source_url, f);
  const uniq = [...byUrl.values()];

  // Bỏ bài đã học trong 30 ngày (chặn theo url + tiêu đề).
  const unseen = await filterUnseen(client, uniq);

  let inserted = 0;
  for (const f of unseen) {
    const gov = needsGovReview(f.source_title + ' ' + f.summary);
    const ins = await client.from('mkt_knowledge_public').insert({
      source_url: f.source_url,
      source_title: f.source_title || null,
      summary: f.summary,
      needs_gov_review: gov,
    });
    if (ins.error) {
      errors.push(`${f.source_url}: ${ins.error.message}`);
      continue;
    }
    inserted += 1;
  }

  // Ghi log để lần chạy sau cùng ngày biết đã chạy (guard trên đầu hàm dựa vào log này).
  try {
    await client.from('run_log').insert({
      task: 'mkt.knowledge_public_deep',
      actor: 'cron',
      status: 'ok',
      detail: { topics: SEARCH_TOPICS.length, found: all.length, inserted, errors: errors.length ? errors.slice(0, 5) : undefined },
    });
  } catch { /* bỏ qua lỗi ghi log */ }

  return { topics: SEARCH_TOPICS.length, found: all.length, inserted, errors };
}

// Chủ nhật theo giờ VN? Dùng để cron biết hôm nay có học public không (Vercel Hobby 2 cron
// cứng, học public gộp vào cron mkt-metrics-pull).
export function isSundayVN(now: Date): boolean {
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return vn.getUTCDay() === 0;
}

// ===== HỌC HẰNG NGÀY QUA GOOGLE NEWS RSS (không quota, đã chạy ổn 18/8) =====
// Đồng bộ logic với scripts/learn-public-rss.mjs. Google News RSS trả description có HTML
// entities lồng 2 lớp — phải decode LẶP trước và sau khi bỏ tag, không thì chuỗi href=...
// lọt vào summary (bug UI 18/8).

function decodeEntities(s: string): string {
  let prev: string | null = null;
  let cur = String(s || '');
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  while (prev !== cur) {
    prev = cur;
    cur = cur
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
      .replace(/&([a-zA-Z]+);/g, (_, name) => named[name.toLowerCase()] ?? `&${name};`);
  }
  return cur;
}

function stripHtml(s: string): string {
  let out = decodeEntities(String(s || ''));
  out = out.replace(/<[^>]+>/g, ' ');
  out = decodeEntities(out);
  return out.replace(/\s+/g, ' ').trim();
}

type RssItem = { title: string; link: string; description: string };

function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const blocks = xml.split(/<item>/i).slice(1);
  for (const block of blocks) {
    const end = block.indexOf('</item>');
    const body = end > 0 ? block.slice(0, end) : block;
    const clean = (s: string) => s.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
    const t = (body.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
    const l = (body.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || '';
    const d = (body.match(/<description>([\s\S]*?)<\/description>/i) || [])[1] || '';
    items.push({ title: stripHtml(clean(t)), link: clean(l).trim(), description: stripHtml(clean(d)) });
  }
  return items;
}

async function fetchGoogleNewsRss(query: string): Promise<RssItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=vi&gl=VN&ceid=VN:vi`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (SDVICO knowledge bot)' } });
  if (!res.ok) throw new Error(`RSS ${res.status}`);
  return parseRss(await res.text());
}

// AI Data #2 học HẰNG NGÀY: quét Google News RSS 6 chủ đề ngành cá, lấy 2 bài mới nhất mỗi
// chủ đề, dedupe theo URL trong 30 ngày. Chạy trong cron mkt-metrics-pull mỗi ngày.
export async function learnPublicDaily(
  client: Client
): Promise<{ topics: number; found: number; inserted: number; errors: string[] }> {
  const errors: string[] = [];
  const all: Finding[] = [];

  for (const topic of SEARCH_TOPICS) {
    try {
      const items = await fetchGoogleNewsRss(topic);
      const picked = items.filter((it) => it.title && it.link && it.description).slice(0, 2);
      for (const it of picked) {
        all.push({
          source_url: it.link,
          source_title: it.title.slice(0, 200),
          summary: it.description.slice(0, 800),
        });
      }
    } catch (e: any) {
      errors.push(`${topic}: ${e?.message || String(e)}`);
    }
  }

  const byUrl = new Map<string, Finding>();
  for (const f of all) if (!byUrl.has(f.source_url)) byUrl.set(f.source_url, f);
  const uniq = [...byUrl.values()];

  const unseen = await filterUnseen(client, uniq);

  let inserted = 0;
  for (const f of unseen) {
    const gov = needsGovReview(f.source_title + ' ' + f.summary);
    const ins = await client.from('mkt_knowledge_public').insert({
      source_url: f.source_url,
      source_title: f.source_title || null,
      summary: f.summary,
      needs_gov_review: gov,
    });
    if (ins.error) { errors.push(`${f.source_url}: ${ins.error.message}`); continue; }
    inserted += 1;
  }

  return { topics: SEARCH_TOPICS.length, found: all.length, inserted, errors };
}

// Boc JSON object DAU TIEN hop le tu text model tra ve. Chiu duoc: text truoc/sau JSON,
// ```json fence, nhieu object noi nhau ("{...}\n{...}" — loi thuc te 28/8 lam scoring vo).
// Dem depth { } nhung bo qua ngoac nam trong string literal (va escape \").
function parseFirstJsonObject(raw: string): any | null {
  let t = String(raw || '').trim();
  // 1. Parse thang (responseMimeType json thuong tra sach).
  try { return JSON.parse(t); } catch { /* thu cach sau */ }
  // 2. Strip markdown fence neu co.
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try { return JSON.parse(fence[1].trim()); } catch { t = fence[1].trim(); }
  }
  // 3. Scan lay object dau tien theo depth.
  const start = t.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { if (inStr) esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(t.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

// ===== 27/8 dot 2 redesign: CHAM DIEM TIER S/A/B/C (Trending Digest kieu ForLife) =====
// Cham cac dong tier IS NULL (moi hoc, chua danh gia): score 0-100 theo do dung duoc cho
// content marketing ngu dan + tier + angle + key_message + keywords + plan goi y gio dang.
// Chay trong cron sau learnPublicDaily; 1 call Gemini cham ca batch de tiet kiem token.
// Yeu cau migration 20260827233000_knowledge_tier.sql da ap — chua ap thi select loi,
// tra skipped de cron khong vo.
export async function scoreUnscoredKnowledge(
  client: Client,
  opts: { limit?: number } = {}
): Promise<{ scored: number; errors: string[]; skipped?: boolean; rawSample?: string }> {
  const limit = opts.limit ?? 20;
  const errors: string[] = [];

  const sel = await client
    .from('mkt_knowledge_public')
    .select('id, source_title, summary')
    .is('tier', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (sel.error) {
    // Thuong la migration chua ap (cot tier chua co). Bao ro, khong pha cron.
    return { scored: 0, errors: ['select: ' + sel.error.message + ' (da ap migration knowledge_tier chua?)'], skipped: true };
  }
  const rows = (sel.data || []) as Array<{ id: string; source_title: string | null; summary: string }>;
  if (!rows.length) return { scored: 0, errors: [] };

  let parsed: any;
  let rawText = '';
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    // 28/8 fix scored:0 im lang: model KHONG chep lai noi UUID dai -> vong update validIds
    // skip het. Doi sang danh so thu tu (idx 1..N), map idx -> rows[idx-1].id khi update.
    const itemsBlock = rows
      .map((r, i) => `${i + 1}. ${r.source_title || '(khong tieu de)'}\n   ${String(r.summary || '').slice(0, 400)}`)
      .join('\n');
    const res = await ai.models.generateContent({
      model: MKT_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: [
                'Bạn là AI DATA 2 của SDVICO — công ty phân phối thiết bị tàu cá (máy lọc nước biển, thiết bị giám sát hành trình, lọc dầu, dầu nhớt) cho ngư dân Việt Nam.',
                'Chấm điểm từng mẩu tin dưới đây theo ĐỘ DÙNG ĐƯỢC cho content marketing hướng tới ngư dân/chủ tàu:',
                '- Liên quan trực tiếp nghề biển, tàu cá, quy định IUU/VMS: điểm cao.',
                '- Thời sự nóng cả nước có thể móc sang góc ngư dân (bóng đá VN thắng, bão Biển Đông): điểm cao.',
                '- Tin chung chung khó móc sang nghề biển: điểm thấp.',
                'Thang: score 0-100. tier: "S" nếu >= 80, "A" nếu >= 60, "B" nếu >= 40, "C" nếu < 40.',
                'angle: góc tiếp cận gợi ý + tự chấm /10, ví dụ "cau_chuyen_cu_the (9/10)", "cam_xuc_tu_hao (8/10)", "canh_bao_rui_ro (7/10)".',
                'key_message: 1 câu thông điệp chính nếu viết bài từ tin này (tiếng Việt, câu ngắn, không gạch dài, không mũi tên).',
                'keywords: 3-5 từ khóa tiếng Việt của tin.',
                'plan: 1-3 gợi ý lịch dùng tin (chỉ với tier S/A; tier B/C trả mảng rỗng), mỗi gợi ý {"time":"HH:MM","kind":"article|seed|video_short|blog","title":"tiêu đề gợi ý"}.',
                '',
                'DANH SÁCH TIN:',
                itemsBlock,
                '',
                'Trả JSON đúng dạng, không thêm chữ ngoài JSON. idx là SỐ THỨ TỰ của tin trong danh sách (1, 2, 3...):',
                '{"items":[{"idx":1,"score":75,"tier":"A","angle":"cam_xuc_tu_hao (8/10)","key_message":"...","keywords":["..."],"plan":[{"time":"19:30","kind":"video_short","title":"..."}]}]}',
              ].join('\n'),
            },
          ],
        },
      ],
      config: { temperature: 0.3, responseMimeType: 'application/json' },
    });
    logTokenUsage(client, 'knowledge_score', MKT_MODEL, (res as any).usageMetadata);
    const t = (res.text || '').trim();
    rawText = t;
    // Parse ben bi (fix 28/8: model tra "{...}\n{...}" hoac text thua sau JSON -> regex greedy
    // \{[\s\S]*\} nuot 2 object lien nhau, JSON.parse vo "Unexpected non-whitespace character
    // after JSON"). Thu tu: parse thang -> strip ```json fence -> boc object DAU TIEN theo
    // dem depth ngoac (bo qua ngoac trong string literal).
    parsed = parseFirstJsonObject(t);
  } catch (e: any) {
    return { scored: 0, errors: ['gemini: ' + String(e?.message || e).slice(0, 200)] };
  }
  if (!parsed) return { scored: 0, errors: ['gemini: khong parse duoc JSON tu response'] };

  const items: any[] = Array.isArray(parsed?.items) ? parsed.items : [];
  if (!items.length) return { scored: 0, errors: ['model tra 0 items (parse ok nhung mang rong)'], rawSample: rawText.slice(0, 500) };
  let scored = 0;
  for (const it of items) {
    // Map idx (1-based) -> row; fallback id UUID neu model van tra id.
    const idx = Number(it?.idx);
    const row = Number.isInteger(idx) && idx >= 1 && idx <= rows.length
      ? rows[idx - 1]
      : rows.find((r) => r.id === String(it?.id || '')) || null;
    if (!row) { errors.push(`item khong map duoc (idx=${String(it?.idx)}, id=${String(it?.id || '').slice(0, 12)})`); continue; }
    const id = row.id;
    const score = Math.max(0, Math.min(100, Number(it.score) || 0));
    const tier = ['S', 'A', 'B', 'C'].includes(String(it.tier)) ? String(it.tier) : score >= 80 ? 'S' : score >= 60 ? 'A' : score >= 40 ? 'B' : 'C';
    const up = await client
      .from('mkt_knowledge_public')
      .update({
        score,
        tier,
        angle: String(it.angle || '').slice(0, 120) || null,
        key_message: String(it.key_message || '').slice(0, 300) || null,
        keywords: Array.isArray(it.keywords) ? it.keywords.slice(0, 6).map((k: any) => String(k).slice(0, 60)) : [],
        plan_suggestions: Array.isArray(it.plan) ? it.plan.slice(0, 4) : [],
      })
      .eq('id', id);
    if (up.error) { errors.push(`${id}: ${up.error.message}`); continue; }
    scored += 1;
  }

  try {
    await client.from('run_log').insert({
      task: 'mkt.knowledge_score', actor: 'cron', status: errors.length && !scored ? 'error' : 'ok',
      detail: { candidates: rows.length, scored, errors: errors.length ? errors.slice(0, 3) : undefined },
    });
  } catch { /* bo qua */ }
  return { scored, errors };
}
