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
];

type Finding = {
  source_url: string;
  source_title: string;
  summary: string;
};

// Gọi Gemini có bật google_search grounding, trả về danh sách nguồn kèm URL.
async function searchOneTopic(topic: string): Promise<Finding[]> {
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
export async function learnPublicKnowledge(
  client: Client
): Promise<{ topics: number; found: number; inserted: number; errors: string[] }> {
  const errors: string[] = [];
  const all: Finding[] = [];

  for (const topic of SEARCH_TOPICS) {
    const findings = await searchOneTopic(topic);
    for (const f of findings) all.push(f);
  }

  // Dedupe theo URL trong lô tìm được.
  const byUrl = new Map<string, Finding>();
  for (const f of all) if (!byUrl.has(f.source_url)) byUrl.set(f.source_url, f);
  const uniq = [...byUrl.values()];

  // Bỏ những URL đã tồn tại trong 30 ngày qua (tránh lưu trùng qua các tuần).
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const urls = uniq.map((f) => f.source_url);
  const seenUrls = new Set<string>();
  if (urls.length) {
    const CHUNK = 100;
    for (let i = 0; i < urls.length; i += CHUNK) {
      const chunk = urls.slice(i, i + CHUNK);
      const { data: seen } = await client
        .from('mkt_knowledge_public')
        .select('source_url')
        .in('source_url', chunk)
        .gte('created_at', thirtyDaysAgo);
      for (const r of seen || []) seenUrls.add((r as any).source_url as string);
    }
  }

  let inserted = 0;
  for (const f of uniq) {
    if (seenUrls.has(f.source_url)) continue;
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

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const urls = uniq.map((f) => f.source_url);
  const seenUrls = new Set<string>();
  if (urls.length) {
    const CHUNK = 100;
    for (let i = 0; i < urls.length; i += CHUNK) {
      const chunk = urls.slice(i, i + CHUNK);
      const { data: seen } = await client
        .from('mkt_knowledge_public')
        .select('source_url')
        .in('source_url', chunk)
        .gte('created_at', thirtyDaysAgo);
      for (const r of seen || []) seenUrls.add((r as any).source_url as string);
    }
  }

  let inserted = 0;
  for (const f of uniq) {
    if (seenUrls.has(f.source_url)) continue;
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
