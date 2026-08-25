// lib/plan-directions.ts — BOSS sinh "Hướng đi tuần tới" (chỉ đạo cho AI Creator).
//
// Bản TS của scripts/generate-plan-directions.mjs để CRON tự chạy: mỗi bản kế hoạch
// (Thứ 2 kế hoạch tuần, Thứ 4 cập nhật lần 1, hoặc bấm tay) tự kèm 5-7 hướng đi bám
// nguồn tri thức thật. Script mjs vẫn giữ cho chạy tay ngoài giờ.
//
// Fallback 4 model Gemini vì model đầu hay dính 429; KHÔNG dùng google_search grounding
// (quota nhỏ) — tri thức đã nằm sẵn trong DB do 2 AI Data học hằng ngày.

import type { ContentDirection } from './plan';
// @ts-ignore — module JS thuần
import { logTokenUsage } from './gen/token-log.mjs';

type AnyClient = { from: (t: string) => any };

const MKT_MODEL_CHAIN = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest'];

// Danh mục sản phẩm SDVICO — đồng bộ scripts/generate-plan-directions.mjs.
// CÓ DẤU đầy đủ (user 21/8: hướng đi hiện không dấu khó đọc — prompt không dấu thì
// Gemini bắt chước trả không dấu theo).
const PRODUCTS = [
  '1. Thiết bị giám sát hành trình S-Tracking (Viettel VMS)',
  '2. Thiết bị liên lạc vệ tinh Thuraya MarineStar MNB-01 (nghe gọi)',
  '3. Điện thoại vệ tinh XT-Pro',
  '4. Máy lọc nước biển thành nước ngọt',
  '5. Thiết bị lọc dầu SF-50 (tiết kiệm dầu diesel)',
  '6. Dầu nhớt PVOIL Nano Graphene',
];

type KnowledgeInput = {
  internal: Array<{ title: string | null; summary: string | null; needs_gov_review: boolean }>;
  publicSrc: Array<{ source_title: string | null; summary: string; source_url: string; needs_gov_review: boolean }>;
};

// 24/8 (user "bam sinh ke hoach qua lau dan den crash web"): 1 lan do that mat 133 GIAY.
// Goc: khong co timeout cho tung model — model treo (khong loi ngay ma cho mang lau) thi
// callGemini cho VO THOI HAN truoc khi thu model ke. Vercel Hobby gioi han CUNG 60s cho
// serverless function (du code set maxDuration=300 trong page.tsx cung khong vuot duoc
// tren Hobby) -> qua 60s la browser nhan 504, thay nhu "crash".
// FIX: moi model toi da 12s (Promise.race voi timeout) — 4 model fallback toi da 48s,
// duoi nguong 60s Hobby. Model treo bi bo qua ngay, khong cho vo han.
const MODEL_TIMEOUT_MS = 12_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label}: timeout ${ms}ms`)), ms)),
  ]);
}

async function callGemini(prompt: string, temperature = 0.5, client?: AnyClient | null): Promise<string> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let lastErr = '';
  for (const model of MKT_MODEL_CHAIN) {
    try {
      const res = await withTimeout(
        ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: { responseMimeType: 'application/json', temperature },
        }),
        MODEL_TIMEOUT_MS,
        model
      );
      // 24/8 (user "quan tri token cac agent"): ghi lai token da dung, khong doi flow.
      if (client) logTokenUsage(client, 'plan_directions', model, (res as any).usageMetadata);
      return res.text || '';
    } catch (e: any) {
      lastErr = `${model}: ${String(e?.message || e).slice(0, 150)}`;
    }
  }
  throw new Error('Moi model Gemini deu loi/timeout. Cuoi: ' + lastErr);
}

// Sinh hướng đi từ tri thức đã nạp (không tự query DB — nhận nguyên liệu từ generateAndStorePlan
// để không đọc lặp). goal rỗng = BOSS tự định hướng. Lỗi LLM -> ném, chỗ gọi tự quyết ([]).
export async function generateContentDirections(
  knowledge: KnowledgeInput,
  goal: string,
  // Tieu de huong DA DUNG gan day — cam Gemini sinh huong trung/na na (user 21/8: BOSS regen
  // ra huong "Lap dat may loc dau kip chuyen bien" gan giong huong vua chay hom truoc).
  avoidTitles: string[] = [],
  // 24/8: client Supabase de ghi log token (optional — thieu thi bo qua log, khong loi).
  client: AnyClient | null = null
): Promise<ContentDirection[]> {
  if (!knowledge.internal.length && !knowledge.publicSrc.length) return [];

  const knowledgeBlock = [
    '## Nguon noi bo (Zalo Phong Kinh doanh + danh gia A/B vong truoc):',
    ...knowledge.internal.map((k, i) => `${i + 1}. ${k.title || ''}${k.needs_gov_review ? ' [can duyet QL]' : ''}\n   ${k.summary || ''}`),
    '',
    '## Nguon public (tin nganh 7 ngay qua):',
    ...knowledge.publicSrc.map((k, i) => `${i + 1}. ${k.source_title || ''}${k.needs_gov_review ? ' [can duyet QL]' : ''}\n   ${k.summary}\n   Nguon: ${k.source_url}`),
  ].join('\n');

  // CẤM TRÙNG (user 24/8 gắt: "TAO BAO MAY LA KHONG DUOC TRUNG LAI"): liệt kê các hướng
  // đã có (bài đã đăng + hướng trong plan đang áp) để Gemini tránh sinh na ná. avoidTitles
  // trước đây KHAI BÁO nhưng KHÔNG chèn vào prompt (bug) -> Gemini sinh lại y hệt mỗi lần.
  const avoidBlock = avoidTitles.length
    ? `\nCÁC HƯỚNG ĐÃ CÓ (TUYỆT ĐỐI KHÔNG lặp lại, không viết na ná, không đổi vài chữ):\n${avoidTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n`
    : '';

  const prompt = `Bạn là chuyên gia marketing cho SDVICO, công ty phân phối thiết bị cho ngư dân và tàu cá Việt Nam.

${goal
  ? `MỤC TIÊU TUẦN TỪ NGƯỜI QUẢN LÝ (bám sát khi chọn hướng): ${goal}\n`
  : 'Tuần này KHÔNG có mục tiêu cụ thể từ quản lý. Hãy TỰ đề xuất hướng đi tốt nhất dựa trên tri thức và số liệu bên dưới (ưu tiên chủ đề đang nóng và sản phẩm có phản hồi khách thật).\n'}
Danh mục sản phẩm của công ty:
${PRODUCTS.map((p) => '- ' + p).join('\n')}

Nguyên liệu tri thức tuần này:
${knowledgeBlock}
${avoidBlock}
Nhiệm vụ: dựa vào NHỮNG GÌ ĐANG XẢY RA (tri thức trên), đề xuất 7 hướng bài đăng cụ thể cho tuần tới trên Facebook/TikTok của SDVICO. Mỗi hướng phải:
- Bám vào một nguồn tri thức thật (nói rõ dựa vào mục nội bộ số N hay public số N)
- Gọi tên một sản phẩm cụ thể trong danh mục, không nói chung chung
- Cho biết loại bài (checklist / hỏi đáp / mẹo / chia sẻ / tin ngành)
- Nêu rõ TẠI SAO tuần này đang là thời điểm tốt cho chủ đề này
- Nếu tri thức gốc có cờ "cần duyệt QL" thì bài theo hướng này cũng có "needs_gov_review: true"
- Nếu có kết luận đánh giá A/B vòng trước, ưu tiên cách viết của bản thắng

QUY TẮC CHỐNG TRÙNG (BẮT BUỘC):
- Mỗi hướng phải xoáy vào MỘT nỗi lo / góc nhìn KHÁC NHAU của bà con. Ví dụ với cùng máy lọc dầu: một hướng về tiết kiệm tiền dầu, một hướng về máy bền đỡ hỏng giữa biển, một hướng về lắp đặt tận nơi — KHÔNG được 3 hướng đều nói "lắp đặt lọc dầu".
- KHÔNG được có 2 hướng cùng sản phẩm mà thông điệp na ná nhau. Nếu 2 sản phẩm tập trung, chia đều mỗi sản phẩm vài góc khác biệt.
- Tránh mọi tiêu đề trùng hoặc gần giống "CÁC HƯỚNG ĐÃ CÓ" ở trên.

Văn phong: câu ngắn, gần gũi bà con ngư dân, KHÔNG dùng gạch dài, KHÔNG dùng mũi tên, số theo chuẩn Việt Nam. BẮT BUỘC viết tiếng Việt CÓ DẤU đầy đủ trong mọi trường (title, why, product), tuyệt đối không viết không dấu.

Trả JSON đúng dạng, không thêm chữ ngoài JSON:
{
  "directions": [
    {
      "title": "Tiêu đề gợi ý (5-10 chữ, tiếng Việt có dấu, mỗi hướng một góc khác biệt)",
      "why": "1-2 câu giải thích tại sao tuần này nên đăng chủ đề này, dựa vào tri thức nào (có dấu)",
      "product": "Tên sản phẩm chính xác trong danh mục",
      "kind": "checklist|qa|tip|engage|glossary|news",
      "sources": ["nội bộ #N", "public #N"],
      "needs_gov_review": false
    }
  ]
}`;

  // temperature cao hơn (0.85) cho hướng đi ĐA DẠNG hơn giữa các lần sinh (user: "sinh lại
  // mà y hệt"). 0.5 quá thấp -> Gemini hội tụ về cùng output với input giống nhau.
  const text = await callGemini(prompt, 0.85, client);
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Khong parse duoc JSON directions.');
  const parsed = JSON.parse(m[0]);
  const arr = Array.isArray(parsed.directions) ? parsed.directions : [];
  return arr
    .map((d: any): ContentDirection => ({
      title: String(d.title || '').slice(0, 200),
      why: String(d.why || '').slice(0, 1000),
      product: String(d.product || '').slice(0, 200),
      kind: String(d.kind || 'tip').slice(0, 30),
      sources: Array.isArray(d.sources) ? d.sources.map((s: any) => String(s)) : [],
      needs_gov_review: d.needs_gov_review === true,
    }))
    .filter((d: ContentDirection) => d.title && d.product);
}
