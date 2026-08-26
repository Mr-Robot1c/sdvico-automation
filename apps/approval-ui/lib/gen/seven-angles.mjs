// Playbook SDVICO 26/8 PHẦN 10 — "1 ý tưởng → 7 bài". Nhận 1 chủ đề/sản phẩm, sinh 7 bài
// Facebook hoàn toàn KHÁC nhau về góc tiếp cận: cảnh báo, case study, so sánh, hướng dẫn,
// phản biện, cảm xúc, listicle. Dùng khi ra mắt SP mới hoặc seeding chủ đề nóng.
//
// 1 call Gemini ra cả 7 bài (tiết kiệm token so với 7 call riêng), JSON schema ép cấu trúc.
// Gọi từ server action generateSevenAnglesAction → tạo 7 mkt_content status='review' →
// người dùng vào /noi-dung Bảng bài viết chọn bài duyệt/xóa.

import { PRODUCTS, productHashtags, DEFAULT_HASHTAGS, getFeatures } from './products.mjs';
import { PRODUCT_FACTS } from './product-facts.mjs';
import { guardLines, guardViolations } from './product-guard.mjs';
import { assessDraft } from './compliance.mjs';
import { logTokenUsage } from './token-log.mjs';

const MKT_MODEL = process.env.MKT_MODEL || 'gemini-flash-lite-latest';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function genWithRetry(ai, params, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await ai.models.generateContent(params); }
    catch (e) {
      last = e;
      if (!/503|429|UNAVAILABLE|high demand|overloaded|RESOURCE_EXHAUSTED/i.test(String(e?.message || e)) || i === tries - 1) throw e;
      await sleep(1500 * 2 ** i);
    }
  }
  throw last;
}

// 7 góc theo playbook PHẦN 10 - mỗi góc có tên + mô tả + gợi ý cấu trúc.
export const SEVEN_ANGLES = [
  {
    key: 'canh_bao',
    label: 'Cảnh báo',
    prompt: 'CẢNH BÁO — "Ai đang mắc sai lầm này?" Liệt kê 2 tới 3 sai lầm ba con hay mắc + hậu quả cụ thể. Kích tâm lý sợ mất mát để bà con comment tag bạn thuyền.',
  },
  {
    key: 'case_study',
    label: 'Case study',
    prompt: 'CASE STUDY — Kể chuyện người thật việc thật. Nhân vật cụ thể (bác Ba, chú Bảy), địa phương ven biển (Vũng Tàu, Phước Tỉnh, Long Hải), tình huống + hành động + kết quả cụ thể. KHÔNG bịa số liệu doanh thu/sản lượng cho nhân vật.',
  },
  {
    key: 'so_sanh',
    label: 'So sánh Trước / Sau',
    prompt: 'SO SÁNH — TRƯỚC vs SAU khi biết/dùng điều này. Trình bày rõ 2 cột (đánh dấu ❌ và ✅), mỗi cột 3-4 dòng. Cụ thể, có con số nếu có.',
  },
  {
    key: 'huong_dan',
    label: 'Hướng dẫn 3 bước',
    prompt: 'HƯỚNG DẪN — 3 bước cụ thể áp dụng ngay. Đánh số 1/ 2/ 3/, mỗi bước 1-2 câu ngắn. Chốt bằng 1 câu nhắc lưu bài hoặc share.',
  },
  {
    key: 'phan_bien',
    label: 'Phản biện',
    prompt: 'PHẢN BIỆN — Nêu 1 quan điểm phổ biến ngư dân đang tin ("Nhiều người bảo X..."), rồi lập luận vì sao ngược lại đúng hơn ("...tôi thấy Y mới đúng, vì..."). Gây tranh luận, kéo comment. Không xúc phạm ai.',
  },
  {
    key: 'cam_xuc',
    label: 'Cảm xúc',
    prompt: 'CẢM XÚC — Chạm nỗi sợ hoặc mong muốn sâu nhất của ba con (an toàn về nhà, đủ nước ngọt, cha truyền con nghề, mất chuyến, tình bạn thuyền). KHÔNG bán hàng, KHÔNG nhắc SDVICO. Chỉ kể để bà con cảm thấy "được thấu hiểu".',
  },
  {
    key: 'listicle',
    label: 'Listicle 5 con số',
    prompt: 'LISTICLE — "5 con số mọi chủ tàu nên biết về [chủ đề]". Đánh số 1/ 2/ 3/ 4/ 5/, mỗi số kèm 1 dòng giải thích ngắn. Con số phải có ý nghĩa thực tế, không bịa.',
  },
];

// Sinh 7 bài từ 1 chủ đề. topic = câu chủ đề, productGroup = 1 folder SP trong PRODUCTS (hoặc null).
// Trả về array 7 objects { angle_key, angle_label, headline, body, text, hashtags, assessment }.
export async function generateSevenAngles({ topic, productGroup = null, client = null }) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const productName = productGroup ? String(productGroup).replace(/^\d+\.\s*/, '').trim() : '';
  const features = productGroup ? getFeatures(productGroup) : [];
  const facts = PRODUCT_FACTS.filter((f) => f.value).map((f) => `${f.brand || ''} ${f.model || ''} ${f.attribute}: ${f.value}${f.verified ? '' : ' (CHƯA XÁC NHẬN)'}`.trim());

  const system = [
    'Bạn viết bài Facebook cho Công ty SDVICO, nhà phân phối thiết bị hàng hải và giám sát tàu cá.',
    'BỐI CẢNH: khách của SDVICO là NGƯỜI ĐI BIỂN (ngư dân, chủ tàu, thợ máy), KHÔNG phải người ăn hải sản.',
    'Ngư dân chỉ tin "người trong nghề thật" — càng bóng bẩy càng bị lướt. Giọng bạn thuyền, câu ngắn, đọc trên điện thoại.',
    '',
    'Nhiệm vụ: từ 1 CHỦ ĐỀ, sinh ĐÚNG 7 BÀI FACEBOOK khác hoàn toàn nhau về GÓC TIẾP CẬN. Mỗi bài đủ hoàn chỉnh, 150-220 chữ, có thể đăng ngay.',
    '',
    'KHUNG CHUNG cho mọi bài (playbook 6 nhịp):',
    '1) HOOK câu đầu body ≤15 chữ (dòng riêng)',
    '2) Đồng cảm giọng bạn thuyền',
    '3) Nội dung chính theo GÓC tiếp cận (mỗi bài 1 góc khác nhau, xem list dưới)',
    '4) Lợi ích cụ thể (nếu bài có sản phẩm)',
    '5) 1 câu tin cậy (nếu hợp)',
    '6) CTA kết bằng câu hỏi mở (dấu ?) mời bà con comment. KHÔNG đòi gọi tổng đài',
    '',
    'BỘ LỌC VÀNG: mỗi bài phải chạm 1 trong 4 chữ NGHỀ/TIỀN/RỦI RO/TỰ HÀO (playbook PHẦN 4).',
    '',
    'Tuổi/số năm/số lượng viết bằng CHỮ SỐ (55 tuổi, 30 năm), số lớn dùng dấu chấm (3.000.000đ).',
    'KHÔNG dùng gạch dài, mũi tên, dấu chấm tròn giữa câu. KHÔNG tự thêm hashtag.',
    'KHÔNG bịa model, thông số. Chỉ nêu thông số có trong danh sách được phép.',
    'KHÔNG mô tả phần mềm đối tác (Viettel/VNPT/Thuraya/Vishipel) như của SDVICO.',
    '',
    ...guardLines(productName + ' ' + (productGroup || '')),
    '',
    facts.length ? 'Thông số được phép nêu:\n' + facts.join('\n') : 'Chưa có thông số được duyệt: nói chung chung, không nêu số cụ thể.',
  ].join('\n');

  const anglesBlock = SEVEN_ANGLES.map((a, i) => `${i + 1}. [${a.key}] ${a.label}: ${a.prompt}`).join('\n');

  const user = [
    `CHỦ ĐỀ CHÍNH: ${topic}`,
    productName ? `Sản phẩm liên quan: "${productName}"` : 'Bài chung, không tập trung 1 sản phẩm cụ thể.',
    features.length ? 'Đặc điểm sản phẩm (nêu đúng, chọn vài ý nổi bật):\n- ' + features.join('\n- ') : '',
    '',
    '7 GÓC TIẾP CẬN (BẮT BUỘC làm đủ 7, mỗi góc 1 bài khác biệt hoàn toàn):',
    anglesBlock,
    '',
    'Trả về JSON đúng dạng, không thêm chữ ngoài JSON, mảng "posts" có ĐÚNG 7 phần tử theo đúng thứ tự 7 góc trên:',
    '{"posts": [{"angle_key": "canh_bao|case_study|so_sanh|huong_dan|phan_bien|cam_xuc|listicle", "headline": "tiêu đề 6-12 từ, kèm 1 emoji", "body": "thân bài 150-220 chữ theo đúng khung 6 nhịp và góc tiếp cận đã yêu cầu", "emotion": "NGHỀ|TIỀN|RỦI RO|TỰ HÀO"}]}',
  ].filter(Boolean).join('\n');

  const res = await genWithRetry(ai, {
    model: MKT_MODEL,
    contents: user,
    config: { systemInstruction: system, responseMimeType: 'application/json', temperature: 1.0 },
  });
  logTokenUsage(client, 'creator_seven_angles', MKT_MODEL, res?.usageMetadata);
  const parsed = JSON.parse(res.text || '{}');
  const posts = Array.isArray(parsed.posts) ? parsed.posts : [];
  if (posts.length < 3) throw new Error(`Gemini trả ${posts.length} bài, cần 7.`);

  const tagsBase = productGroup ? [...DEFAULT_HASHTAGS, ...productHashtags(productGroup)] : DEFAULT_HASHTAGS;
  const tags = [...new Set(tagsBase)].join(' ');

  const results = [];
  for (const p of posts.slice(0, 7)) {
    const body = String(p.body || '').trim();
    const headline = String(p.headline || '').replace(/#[^\s#]+/g, '').trim();
    if (!body) continue;
    const angle = SEVEN_ANGLES.find((a) => a.key === p.angle_key) || SEVEN_ANGLES[results.length];
    const text = `${body}\n\n${tags}`;
    const domain = guardViolations(`${headline}\n${body}`, productName + ' ' + (productGroup || ''));
    const assessment = assessDraft(text, { kind: 'sales' });
    if (domain.length) {
      assessment.flags = { ...(assessment.flags || {}), domain: domain.map((v) => `${v.phrase} (${v.product})`) };
      if (assessment.risk === 'none') assessment.risk = 'amber';
    }
    results.push({
      angle_key: angle.key,
      angle_label: angle.label,
      headline,
      body,
      text,
      hashtags: tags,
      emotion: String(p.emotion || '').toUpperCase(),
      assessment,
    });
  }
  return results;
}
