// lib/knowledge.ts — Kho tri thức Kế hoạch AI v2.
//
// Hai nguồn:
//   1. Nội bộ (mkt_knowledge_internal): file người phụ trách thả vào bucket
//      "kho-tri-thuc-noi-bo" (đã trích xuất từ Zalo bằng Cowork hoặc công cụ khác).
//      Hệ thống quét bucket → đọc file → tóm tắt bằng Gemini → lưu bản ghi.
//      Idempotent theo source_path: file đã có bản ghi thì bỏ qua.
//   2. Public (mkt_knowledge_public): bot tự tìm mỗi Chủ nhật (xem lib/knowledge-public.ts).
//
// Đọc để làm nguyên liệu cho Kế hoạch AI (lib/plan.ts). KHÔNG tự tạo bài đăng.
// Chi tiết nghiệp vụ: docs/app-map/ke-hoach-ai-v2-ba-spec.md.
//
// LƯU Ý — kiểm tra IUU/gov/quy định: dùng cùng danh sách từ khóa với packages/marketing
// (compliance.mjs) để đặt cờ needs_gov_review — điều cấm 3.

import type { getServerClient } from './supabase-server';
// @ts-ignore — module JS thuần
import { logTokenUsage } from './gen/token-log.mjs';

type Client = ReturnType<typeof getServerClient>;

const BUCKET = 'kho-tri-thuc-noi-bo';
const MKT_MODEL = process.env.MKT_MODEL || 'gemini-flash-lite-latest';

// Cụm từ chạm quy định nhà nước / IUU / Cục Thủy sản / Kiểm ngư — bám điều cấm 3.
// Đồng bộ với packages/marketing/src/compliance.mjs (nếu cụm mở rộng, phải cập nhật cả hai).
const GOV_KEYWORDS = [
  'iuu', 'thẻ vàng', 'the vang', 'thẻ đỏ', 'the do',
  'cục thủy sản', 'cuc thuy san', 'cục kiểm ngư', 'cuc kiem ngu',
  'nghị định', 'nghi dinh', 'thông tư', 'thong tu',
  'quyết định', 'quyet dinh', 'luật thủy sản', 'luat thuy san',
  'giấy phép', 'giay phep', 'khai thác thủy sản', 'khai thac thuy san',
  'cấm biển', 'cam bien', 'vùng cấm', 'vung cam',
  'bộ nông nghiệp', 'bo nong nghiep', 'chính phủ', 'chinh phu',
];

export function needsGovReview(text: string): boolean {
  const t = String(text || '').toLowerCase();
  return GOV_KEYWORDS.some((k) => t.includes(k));
}

// Định dạng file được hỗ trợ ở bước import.
const TEXT_EXT = ['.txt', '.md', '.markdown', '.html', '.htm', '.json'];
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

function extOf(name: string): string {
  const m = String(name || '').toLowerCase().match(/\.[a-z0-9]+$/);
  return m ? m[0] : '';
}

function isTextFile(name: string): boolean {
  return TEXT_EXT.includes(extOf(name));
}

function isImageFile(name: string): boolean {
  return IMAGE_EXT.includes(extOf(name));
}

function stripHtml(s: string): string {
  return String(s || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Đọc nội dung 1 file trong bucket. Text → utf8. HTML → strip tags. JSON → JSON.stringify.
// Ảnh → dùng Gemini vision để trích chữ (giống ensure-logo.mjs). Trả về excerpt <=15000 ký tự.
async function readFileContent(
  client: Client,
  path: string
): Promise<{ excerpt: string; via: 'text' | 'vision' | 'skip'; reason?: string }> {
  const dl = await client.storage.from(BUCKET).download(path);
  if (dl.error || !dl.data) {
    return { excerpt: '', via: 'skip', reason: 'download-fail: ' + (dl.error?.message || '') };
  }
  const buf = Buffer.from(await dl.data.arrayBuffer());

  if (isTextFile(path)) {
    let raw = buf.toString('utf8');
    const e = extOf(path);
    if (e === '.html' || e === '.htm') raw = stripHtml(raw);
    if (e === '.json') {
      try {
        raw = JSON.stringify(JSON.parse(raw), null, 2);
      } catch {
        // giữ nguyên nếu không parse được, coi như text
      }
    }
    return { excerpt: raw.slice(0, 15000), via: 'text' };
  }

  if (isImageFile(path)) {
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const mimeType =
        extOf(path) === '.png' ? 'image/png' : extOf(path) === '.webp' ? 'image/webp' : 'image/jpeg';
      const res = await ai.models.generateContent({
        model: MKT_MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: [
                  'Đây là ảnh chụp màn hình tin nhắn hoặc nội dung từ nhóm Zalo nội bộ.',
                  'Hãy trích XUẤT NGUYÊN VĂN mọi chữ tiếng Việt bạn thấy trong ảnh, giữ thứ tự.',
                  'Không tóm tắt, không thêm bình luận. Chỉ trích văn bản.',
                ].join(' '),
              },
              { inlineData: { mimeType, data: buf.toString('base64') } },
            ],
          },
        ],
        config: { temperature: 0 }
      });
      logTokenUsage(client, 'knowledge_internal_vision', MKT_MODEL, (res as any).usageMetadata);
      const text = (res.text || '').trim();
      return { excerpt: text.slice(0, 15000), via: 'vision' };
    } catch (e: any) {
      return { excerpt: '', via: 'skip', reason: 'vision-loi: ' + (e?.message || String(e)) };
    }
  }

  return { excerpt: '', via: 'skip', reason: 'khong-ho-tro-dinh-dang: ' + extOf(path) };
}

// Gọi Gemini tóm tắt nội dung nội bộ thành các điểm chính cho Kế hoạch AI dùng.
// Đầu ra bám brand-voice: câu ngắn, không gạch dài, không mũi tên, số chuẩn Việt Nam.
async function summarizeForPlan(text: string, client: Client): Promise<{ title: string; summary: string }> {
  if (!text || text.trim().length < 20) {
    return { title: '(nội dung quá ngắn)', summary: text.trim() };
  }
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
                'Đây là nội dung trích xuất từ nhóm Zalo nội bộ của một công ty phân phối thiết bị cho ngư dân và tàu cá (SDVICO).',
                'Nhiệm vụ: đọc kỹ, tóm tắt thành các điểm chính có ích cho việc lập kế hoạch marketing tuần tới.',
                'Ưu tiên: câu hỏi khách hàng hay gặp, phản hồi Phòng Kinh doanh, sự cố sản phẩm, xu hướng đang nói tới.',
                'BỎ QUA: chuyện tán gẫu, chào hỏi, thông tin cá nhân riêng.',
                'Yêu cầu văn phong: câu ngắn, gần gũi bà con ngư dân, không dùng gạch dài, không dùng mũi tên, số theo chuẩn Việt Nam.',
                'Trả về JSON đúng dạng: {"title": "tiêu đề 5-10 chữ", "summary": "tóm tắt 3-5 câu"}. Không thêm chữ ngoài JSON.',
                '',
                'NỘI DUNG:',
                text.slice(0, 12000),
              ].join('\n'),
            },
          ],
        },
      ],
      config: { responseMimeType: 'application/json', temperature: 0.4 }
    });
    logTokenUsage(client, 'knowledge_internal_summary', MKT_MODEL, (res as any).usageMetadata);
    const t = (res.text || '').trim();
    const m = t.match(/\{[\s\S]*\}/);
    if (!m) return { title: 'Ghi chú nội bộ', summary: text.slice(0, 500) };
    const parsed = JSON.parse(m[0]);
    return {
      title: String(parsed.title || 'Ghi chú nội bộ').slice(0, 200),
      summary: String(parsed.summary || '').slice(0, 2000),
    };
  } catch (e: any) {
    console.warn('summarizeForPlan loi:', e?.message || e);
    return { title: 'Ghi chú nội bộ', summary: text.slice(0, 500) };
  }
}

// Quét toàn bộ file trong bucket (đệ quy nhiều tầng thư mục), import file mới vào
// mkt_knowledge_internal. Idempotent theo source_path (UNIQUE trong DB).
export async function importInternalFromBucket(
  client: Client,
  opts: { limit?: number } = {}
): Promise<{ scanned: number; imported: number; skipped: number; errors: string[] }> {
  const limit = opts.limit ?? 50;
  const errors: string[] = [];
  let scanned = 0;
  let imported = 0;
  let skipped = 0;

  // Đệ quy list file (Supabase list mỗi cấp thư mục — không có list -R sẵn).
  const stack: string[] = [''];
  const files: { path: string; name: string }[] = [];
  while (stack.length && files.length < 500) {
    const prefix = stack.pop() as string;
    const { data, error } = await client.storage.from(BUCKET).list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
    if (error) { errors.push(`list ${prefix}: ${error.message}`); continue; }
    for (const entry of data || []) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      // Thư mục con: (id === null trong list Supabase Storage).
      if (!(entry as any).id) { stack.push(full); continue; }
      files.push({ path: full, name: entry.name });
    }
  }

  // Lấy danh sách source_path đã tồn tại để bỏ qua nhanh.
  const paths = files.map((f) => f.path);
  const existing = new Set<string>();
  if (paths.length) {
    // Chia lô để tránh IN quá dài
    const CHUNK = 100;
    for (let i = 0; i < paths.length; i += CHUNK) {
      const chunk = paths.slice(i, i + CHUNK);
      const { data: existRows } = await client
        .from('mkt_knowledge_internal')
        .select('source_path')
        .in('source_path', chunk);
      for (const r of existRows || []) existing.add((r as any).source_path as string);
    }
  }

  for (const f of files) {
    if (imported >= limit) break;
    scanned += 1;
    if (existing.has(f.path)) { skipped += 1; continue; }

    // Chỉ import file được hỗ trợ, các định dạng khác bỏ qua nhưng KHÔNG báo lỗi.
    if (!isTextFile(f.path) && !isImageFile(f.path)) { skipped += 1; continue; }
    // Tài liệu hướng dẫn / bí kíp của phiên đọc Zalo không phải tri thức nội bộ -> bỏ qua
    // (18/8: prompt-doc-zalo-hang-ngay.md bị học nhầm thành "Quy trình trích xuất...").
    if (/(^|\/)(prompt-|readme|huong-dan|bi-kip|upload-log)/i.test(f.path) || /\.log$/i.test(f.path)) { skipped += 1; continue; }

    try {
      const { excerpt, via, reason } = await readFileContent(client, f.path);
      if (!excerpt || excerpt.trim().length < 20) {
        skipped += 1;
        if (reason) errors.push(`${f.path}: ${reason}`);
        continue;
      }
      const { title, summary } = await summarizeForPlan(excerpt, client);
      const gov = needsGovReview(excerpt + ' ' + summary);
      const ins = await client.from('mkt_knowledge_internal').insert({
        source_path: f.path,
        title,
        summary,
        raw_excerpt: excerpt.slice(0, 5000),
        needs_gov_review: gov,
      });
      if (ins.error) { errors.push(`${f.path}: insert ${ins.error.message}`); continue; }
      imported += 1;
      // Note: dùng via/reason chỉ trong log console nếu cần chẩn đoán, không lưu vào DB.
      if (via === 'skip' && reason) console.warn(`[knowledge] ${f.path} skip: ${reason}`);
    } catch (e: any) {
      errors.push(`${f.path}: ${e?.message || String(e)}`);
    }
  }

  return { scanned, imported, skipped, errors };
}

// Đọc N bản ghi tri thức trong 7 ngày qua để làm nguyên liệu cho Kế hoạch AI.
export async function loadRecentKnowledge(
  client: Client,
  daysBack = 7,
  limit = 30
): Promise<{
  internal: Array<{ id: string; title: string | null; summary: string | null; needs_gov_review: boolean; created_at: string }>;
  publicSrc: Array<{ id: string; source_url: string; source_title: string | null; summary: string; needs_gov_review: boolean; created_at: string }>;
}> {
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: iRows }, { data: pRows }] = await Promise.all([
    client
      .from('mkt_knowledge_internal')
      .select('id, title, summary, needs_gov_review, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(limit),
    client
      .from('mkt_knowledge_public')
      .select('id, source_url, source_title, summary, needs_gov_review, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);
  return { internal: (iRows as any[]) || [], publicSrc: (pRows as any[]) || [] };
}
