// lib/plan-directions.ts — BOSS sinh "Hướng đi tuần tới" (chỉ đạo cho AI Creator).
//
// Bản TS của scripts/generate-plan-directions.mjs để CRON tự chạy: mỗi bản kế hoạch
// (Thứ 2 kế hoạch tuần, Thứ 4 cập nhật lần 1, hoặc bấm tay) tự kèm 5-7 hướng đi bám
// nguồn tri thức thật. Script mjs vẫn giữ cho chạy tay ngoài giờ.
//
// Fallback 4 model Gemini vì model đầu hay dính 429; KHÔNG dùng google_search grounding
// (quota nhỏ) — tri thức đã nằm sẵn trong DB do 2 AI Data học hằng ngày.

import type { ContentDirection } from './plan';

const MKT_MODEL_CHAIN = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest'];

// Danh mục sản phẩm SDVICO — đồng bộ scripts/generate-plan-directions.mjs.
const PRODUCTS = [
  '1. Thiet bi giam sat hanh trinh S-Tracking (Viettel VMS)',
  '2. Thiet bi lien lac ve tinh Thuraya MarineStar MNB-01 (nghe goi)',
  '3. Dien thoai ve tinh XT-Pro',
  '4. May loc nuoc bien thanh nuoc ngot',
  '5. Thiet bi loc dau SF-50 (tiet kiem dau diesel)',
  '6. Dau nhot PVOIL Nano Graphene',
];

type KnowledgeInput = {
  internal: Array<{ title: string | null; summary: string | null; needs_gov_review: boolean }>;
  publicSrc: Array<{ source_title: string | null; summary: string; source_url: string; needs_gov_review: boolean }>;
};

async function callGemini(prompt: string): Promise<string> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let lastErr = '';
  for (const model of MKT_MODEL_CHAIN) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { responseMimeType: 'application/json', temperature: 0.5 },
      });
      return res.text || '';
    } catch (e: any) {
      lastErr = `${model}: ${String(e?.message || e).slice(0, 150)}`;
    }
  }
  throw new Error('Moi model Gemini deu loi. Cuoi: ' + lastErr);
}

// Sinh hướng đi từ tri thức đã nạp (không tự query DB — nhận nguyên liệu từ generateAndStorePlan
// để không đọc lặp). goal rỗng = BOSS tự định hướng. Lỗi LLM -> ném, chỗ gọi tự quyết ([]).
export async function generateContentDirections(
  knowledge: KnowledgeInput,
  goal: string,
  // Tieu de huong DA DUNG gan day — cam Gemini sinh huong trung/na na (user 21/8: BOSS regen
  // ra huong "Lap dat may loc dau kip chuyen bien" gan giong huong vua chay hom truoc).
  avoidTitles: string[] = []
): Promise<ContentDirection[]> {
  if (!knowledge.internal.length && !knowledge.publicSrc.length) return [];

  const knowledgeBlock = [
    '## Nguon noi bo (Zalo Phong Kinh doanh + danh gia A/B vong truoc):',
    ...knowledge.internal.map((k, i) => `${i + 1}. ${k.title || ''}${k.needs_gov_review ? ' [can duyet QL]' : ''}\n   ${k.summary || ''}`),
    '',
    '## Nguon public (tin nganh 7 ngay qua):',
    ...knowledge.publicSrc.map((k, i) => `${i + 1}. ${k.source_title || ''}${k.needs_gov_review ? ' [can duyet QL]' : ''}\n   ${k.summary}\n   Nguon: ${k.source_url}`),
  ].join('\n');

  const prompt = `Ban la chuyen gia marketing cho SDVICO, cong ty phan phoi thiet bi cho ngu dan va tau ca Viet Nam.

${goal
  ? `MUC TIEU TUAN TU NGUOI QUAN LY (bam sat khi chon huong): ${goal}\n`
  : 'Tuan nay KHONG co muc tieu cu the tu quan ly. Hay TU de xuat huong di tot nhat dua tren tri thuc va so lieu ben duoi (uu tien chu de dang nong va san pham co phan hoi khach that).\n'}
Danh muc san pham cua cong ty:
${PRODUCTS.map((p) => '- ' + p).join('\n')}

Nguyen lieu tri thuc tuan nay:
${knowledgeBlock}

Nhiem vu: dua vao NHUNG GI DANG XAY RA (tri thuc tren), de xuat 5-7 huong bai dang cu the cho tuan toi tren Facebook/TikTok cua SDVICO. Moi huong phai:
- Bam vao mot nguon tri thuc that (noi ro dua vao muc noi bo so N hay public so N)
- Goi ten mot san pham cu the trong danh muc, khong noi chung chung
- Cho biet loai bai (checklist / hoi-dap / meo / chia se / tin nganh)
- Neu ro TAI SAO tuan nay dang la thoi diem tot cho chu de nay
- Neu tri thuc goc co co "can duyet QL" thi bai theo huong nay cung co "needs_gov_review: true"
- Neu co ket luan danh gia A/B vong truoc, uu tien cach viet cua ban thang

Van phong: cau ngan, gan gui ba con ngu dan, KHONG dung gach dai, KHONG dung mui ten, so theo chuan Viet Nam.

Tra JSON dung dang, khong them chu ngoai JSON:
{
  "directions": [
    {
      "title": "Tieu de goi y (5-10 chu)",
      "why": "1-2 cau giai thich tai sao tuan nay nen dang chu de nay, dua vao tri thuc nao",
      "product": "Ten san pham chinh xac trong danh muc",
      "kind": "checklist|qa|tip|engage|glossary|news",
      "sources": ["noi bo #N", "public #N"],
      "needs_gov_review": false
    }
  ]
}`;

  const text = await callGemini(prompt);
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
