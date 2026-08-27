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
  '7. Ắc quy Accu Nano SDViCo',
  '8. Sơn RARE (sơn chống nóng tàu)',
  // 26/8: SP moi user cung cap (folder "9. May Loc Dau Diesel SD12-300").
  '9. Máy Lọc Dầu Diesel SD12-300 (lọc nước và cặn bẩn trong dầu, bảo vệ kim phun/bơm cao áp)',
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

=== PLAYBOOK MARKETING SDVICO (BẮT BUỘC BÁM) ===

Khách của SDVICO là NGƯỜI ĐI BIỂN (ngư dân, chủ tàu, thợ máy), KHÔNG phải người ăn hải sản.
Ngư dân chỉ tin "người trong nghề thật" (boong tàu, tiếng máy, giọng địa phương). Càng bóng bẩy càng bị lướt.

BỘ LỌC VÀNG — MỖI BÀI PHẢI CHẠM 1 TRONG 4 CHỮ CẢM XÚC (không chạm chữ nào chắc chắn chìm):
- NGHỀ: bà con tự nhận ra mình, muốn khoe kinh nghiệm -> kể chuyện của họ (comment)
- TIỀN: ảnh hưởng túi tiền mỗi chuyến -> hỏi giá (inbox)
- RỦI RO: sợ mất chuyến/mất tiền/mất an toàn -> cảnh báo bạn thuyền (comment/share)
- TỰ HÀO: danh dự nghề, tình anh em bạn thuyền -> khoe (share)

7 HƯỚNG PHẢI CHIA ĐÚNG CẤU TRÚC TUẦN (2 giáo dục · 2 viral · 1 cá nhân · 1 seeding · 1 tương tác):
- Hướng #1 (Thứ 2)  = GIÁO DỤC · chữ RỦI RO · role="giao_duc" · kind="checklist" — mẹo kỹ thuật áp dụng ngay
- Hướng #2 (Thứ 3)  = VIRAL    · chữ RỦI RO · role="viral"    · kind="tip"       — cảnh báo hậu quả thật, kích tranh luận
- Hướng #3 (Thứ 4)  = GIÁO DỤC · chữ TIỀN   · role="giao_duc" · kind="tip"       — mẹo tiết kiệm/tránh mua hớ, CÓ CON SỐ
- Hướng #4 (Thứ 5)  = TƯƠNG TÁC · chữ NGHỀ  · role="tuong_tac" · kind="engage"   — poll/câu hỏi chia phe (A hay B)
- Hướng #5 (Thứ 6)  = VIRAL    · chữ TỰ HÀO · role="viral"    · kind="tip"       — ƯU TIÊN BÁM TREND VIỆT NAM tuần này (bóng đá đội tuyển thắng lớn, sự kiện lớn xã hội, giải quốc gia). Móc sang góc ngư dân (VD "VN vô địch → ngư dân Vũng Tàu treo cờ đỏ ra khơi"). Nếu không có trend hot → khoảnh khắc "lộc biển" bình thường payoff giây đầu.
- Hướng #6 (Thứ 7)  = CÁ NHÂN  · chữ TỰ HÀO · role="ca_nhan"  · kind="qa"        — câu chuyện thật, người thật việc thật
- Hướng #7 (CN)     = SEEDING  · chữ TIỀN   · role="seeding"  · kind="checklist" — checklist tuần dẫn tự nhiên về sản phẩm

Quy tắc phân phối: chỉ 2/7 bài trực tiếp bán (Hướng #3 nhắc nhẹ + Hướng #7 seeding). 5 hướng còn lại XÂY NIỀM TIN — nhắc sản phẩm nhẹ hoặc không nhắc, ưu tiên cảnh nghề thật + con số + câu chuyện.

HOOK NGHỊCH LÝ MẤT MÁT (bắt buộc cho hướng viral #2, #5, #7):
- Cấu trúc: "Thành quả lớn bị phá bởi 1 nguyên nhân nhỏ" — ≤15 chữ
- Ví dụ mẫu: "Trúng luồng cá mà phải quay vào bờ - chỉ vì hết nước ngọt."
- 5 yếu tố: nghịch lý, nỗi sợ mất mát cụ thể, tự soi mình, ngắn dồn, có hình ảnh cụ thể

Với các hướng còn lại (giáo dục, tương tác, cá nhân), hook có thể theo cơ chế khác nhưng vẫn ≤15 chữ:
- Gây shock bằng con số cụ thể (dầu 38.000đ/lít)
- Phá vỡ niềm tin sai ("điều anh đang tin là sai")
- Kể tình huống cụ thể (thời gian + địa điểm + nhân vật)
- Câu hỏi tự soi ("Anh còn nhớ lần cuối...")
- Cảnh báo sai lầm đang mắc

Ví dụ hook mẫu (không copy nguyên, chỉ tham khảo cấu trúc):
- "Dầu 38.000đ/lít - mỗi chuyến anh đang đốt trôi bao nhiêu tiền?"
- "Máy 300 triệu, nhưng chưa bỏ 1 đồng lọc sạch dầu cho nó."
- "3 giờ sáng, cách bờ 80 hải lý, máy khục một tiếng rồi tắt."
- "Anh còn nhớ lần cuối súc rửa két nước ngọt là khi nào không?"
- "Trúng luồng cá mà phải quay vào bờ - chỉ vì hết nước ngọt."

CTA MỞ CHUYỆN (không phải "gọi tổng đài báo giá" - page mới, tệp lạ, xin gọi tổng đài là quá sức):
- Một câu hỏi kéo comment (để bà con tự trả lời trong đầu, dừng lại, comment)
- Một từ khóa nhắn Page nhẹ nhàng ("nhắn KEYWORD cho page, mình gửi thông tin - không gọi làm phiền")

Nhiệm vụ chi tiết: dựa vào NHỮNG GÌ ĐANG XẢY RA (tri thức trên), đề xuất ĐÚNG 7 hướng bài đăng cho tuần tới trên Facebook/TikTok của SDVICO, THEO ĐÚNG THỨ TỰ 7 nhịp bên trên. Mỗi hướng phải:
- Bám vào một nguồn tri thức thật (nói rõ dựa vào mục nội bộ số N hay public số N)
- Gọi tên một sản phẩm cụ thể trong danh mục, không nói chung chung
- Gán ĐÚNG "role" + "emotion" + "kind" theo bảng 7 nhịp trên (KHÔNG được đổi)
- Viết "hook" ≤15 chữ theo mô tả từng loại
- Nêu rõ TẠI SAO tuần này đang là thời điểm tốt cho chủ đề này ở trường "why"
- Nếu tri thức gốc có cờ "cần duyệt QL" thì bài theo hướng này cũng có "needs_gov_review: true"
- Nếu có kết luận đánh giá A/B vòng trước, ưu tiên cách viết của bản thắng

QUY TẮC CHỐNG TRÙNG (BẮT BUỘC):
- Mỗi hướng phải xoáy vào MỘT nỗi lo / góc nhìn KHÁC NHAU của bà con. Ví dụ với cùng máy lọc dầu: một hướng về tiết kiệm tiền dầu, một hướng về máy bền đỡ hỏng giữa biển, một hướng về lắp đặt tận nơi — KHÔNG được 3 hướng đều nói "lắp đặt lọc dầu".
- KHÔNG được có 2 hướng cùng sản phẩm mà thông điệp na ná nhau. Nếu 2 sản phẩm tập trung, chia đều mỗi sản phẩm vài góc khác biệt.
- Tránh mọi tiêu đề trùng hoặc gần giống "CÁC HƯỚNG ĐÃ CÓ" ở trên.

3 LỖI CHẾT NGƯỜI TUYỆT ĐỐI TRÁNH:
1. Bán hàng quá sớm (chèn "sắm ngay X" ở câu mở) - não gắn nhãn quảng cáo, bà con lướt
2. Liệt kê thông số kỹ thuật thay vì lợi ích (VAC, RO, lít/giờ...) - phải "dịch" ra: đỡ tốn, đi xa hơn, an tâm hơn
3. CTA đòi hành động lớn với tệp lạ - "gọi tổng đài lấy báo giá" là quá sức

Văn phong: câu ngắn, giọng bạn thuyền, KHÔNG dùng gạch dài, KHÔNG dùng mũi tên, KHÔNG dùng ký hiệu thay chữ "và", số theo chuẩn Việt Nam (3.000.000đ). BẮT BUỘC viết tiếng Việt CÓ DẤU đầy đủ trong mọi trường (title, why, product, hook, emotion, role), tuyệt đối không viết không dấu.

Trả JSON đúng dạng, KHÔNG thêm chữ ngoài JSON, đúng 7 phần tử theo đúng thứ tự 7 nhịp:
{
  "directions": [
    {
      "title": "Tiêu đề gợi ý (5-10 chữ, tiếng Việt có dấu, mỗi hướng một góc khác biệt)",
      "why": "1-2 câu giải thích tại sao tuần này nên đăng chủ đề này, dựa vào tri thức nào (có dấu)",
      "product": "Tên sản phẩm chính xác trong danh mục",
      "kind": "checklist|qa|tip|engage|glossary|news",
      "role": "giao_duc|viral|ca_nhan|seeding|tuong_tac",
      "emotion": "NGHỀ|TIỀN|RỦI RO|TỰ HÀO",
      "hook": "Câu mở đầu ≤15 chữ, tiếng Việt có dấu",
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
      // Playbook 26/8: 3 field mới BOSS ép Creator bám khung viral SDVICO. Bản cũ không có
      // các field này -> undefined; Creator có fallback riêng nên không vỡ.
      emotion: d.emotion ? String(d.emotion).slice(0, 20) : undefined,
      role: d.role ? String(d.role).slice(0, 20) : undefined,
      hook: d.hook ? String(d.hook).slice(0, 150) : undefined,
      sources: Array.isArray(d.sources) ? d.sources.map((s: any) => String(s)) : [],
      needs_gov_review: d.needs_gov_review === true,
    }))
    .filter((d: ContentDirection) => d.title && d.product);
}
