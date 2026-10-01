// Sinh kịch bản video nhiều cảnh từ nội dung đã đăng, chọn tư liệu cho từng cảnh.
// Giọng brand-voice + hàng rào product-boundary trong system prompt; quét compliance sau khi sinh.
import { assessDraft } from '../compliance.mjs';
import { knownFactValues, testFactValues } from '../product-facts.mjs';
import { guardLines, guardViolations, stripViolatingSentences } from '../product-guard.mjs';
import { logTokenUsage } from '../token-log.mjs';
import { getPriceTeaser, publicName, redactExactPrices, ensureSpokenTeaser, outroKeyword as outroKeywordOf } from '../products.mjs';
import { matchScenesToAssets, assetListForPrompt, visualOverlap, pickByRole, problemPool, refinePicksByImagery, extractFirstJson, pickStoryboard, storyboardDrift } from './scene-match.mjs';
import { EXTRA_WORN, crossProductTerms, crossProductViolations, unsourcedPercents, stripSentencesWith, splitPriceScene, splitLongImageScenes, outroText, hookProductTerm, wordsBeforeSolution, trimEarlyScenes, breakLongSentences, imageryDriftSentences, cutImageryDrift, selfProductFaultPhrases, inventedDetailSentences } from './rules.mjs';

const MKT_MODEL = process.env.MKT_MODEL || 'gemini-flash-lite-latest';
// 10/9 tối (2 lượt CI liên tiếp sinh kịch bản bài 3826e7f9 dính 500 INTERNAL từ flash-lite, cùng lúc
// gọi thử 1 câu ngắn vẫn 200): 500 không nằm trong danh sách thử lại và không có model dự phòng nên
// cả bài rớt, giữ chỗ 30 phút. Nay: 500/INTERNAL cũng thử lại, hết lượt thì đổi model kế trong chuỗi
// (cùng thứ tự với lib/plan-directions.ts). MKT_MODEL_CHAIN (env, phẩy) ghi đè.
const MODEL_CHAIN = (process.env.MKT_MODEL_CHAIN || '').split(',').map((s) => s.trim()).filter(Boolean);
const SCRIPT_MODELS = [...new Set([MKT_MODEL, ...(MODEL_CHAIN.length ? MODEL_CHAIN : ['gemini-3.6-flash', 'gemini-3.5-flash'])])];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Gọi Gemini có thử lại khi quá tải hoặc lỗi nội bộ (503/429/500) với giãn cách tăng dần; hết lượt
// thì đổi sang model kế trong SCRIPT_MODELS (params.model là model đầu). Trả res, kèm res.modelUsed.
async function generateWithRetry(ai, params, tries = 3) {
  let lastErr;
  const models = [...new Set([params.model, ...SCRIPT_MODELS].filter(Boolean))];
  for (const model of models) {
    for (let i = 0; i < tries; i++) {
      try {
        const res = await ai.models.generateContent({ ...params, model });
        if (res && typeof res === 'object') res.modelUsed = model;
        return res;
      } catch (e) {
        lastErr = e;
        const msg = String(e?.message || e);
        const transient = /503|429|500|UNAVAILABLE|INTERNAL|high demand|overloaded|RESOURCE_EXHAUSTED/i.test(msg);
        if (!transient) throw e;
        if (i < tries - 1) {
          const wait = 1500 * 2 ** i;
          console.warn(`Gemini ${model} lỗi tạm (${msg.slice(0, 60)}), thử lại sau ${wait}ms...`);
          await sleep(wait);
        }
      }
    }
    const next = models[models.indexOf(model) + 1];
    if (next) console.warn(`Gemini ${model} hỏng ${tries} lần, đổi sang ${next}`);
  }
  throw lastErr;
}

// 4/9 (sếp): bỏ hẳn lời chào đầu video ("Alo alo bà con ơi!", "Hello các thuyền trưởng!"...).
// Prompt đã cấm, nhưng model quen mẫu cũ (21/8 tới 3/9) vẫn có thể chào -> cắt câu chào ở đầu
// cảnh 1 cho chắc. Chỉ cắt khi câu mở đầu là chào rõ ràng (alo/hello/xin chào/chào...) hoặc
// câu gọi ngắn kết bằng "ơi!" / "ơi," ("Bà con ơi!", "Anh em đi biển ơi,"). Không đụng câu hook.
// (Không dùng \b vì \b trong JS chỉ hiểu chữ ASCII, đứng cạnh "ô", "ơ" là hỏng.)
const GREETING_RE = /^(?:(?:(?:a\s?l[oô]\s*)+|hell?o|hê\s?lô|xin chào|chào)(?=[\s,!.?]|$)[^.!?,]{0,40}[.!?,]\s*|[^.!?,]{0,20}(?:^|\s)ơi\s*[!,.]\s*)+/iu;
export function stripGreeting(text) {
  const t = String(text || '').trim();
  const out = t.replace(GREETING_RE, '').trim();
  if (!out || out === t) return t;
  return out.charAt(0).toUpperCase() + out.slice(1);
}

function parseJson(text) {
  let t = (text || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  return JSON.parse(t);
}

// 1/10 vòng 2 (Thanh, bài 22452d7f dựng 4 lần vẫn lệch): so CHỮ (từ khóa trong title/description) không
// đo được NGHĨA — model viết kiểu lệch mới mỗi vòng ("đứng dưới hầm máy siết vòng gen" trên hình máy bơm
// ngoài trời, "ngồi giữa chòng chành sóng nước" trên hình cảng) mà danh sách từ khóa không phủ nổi, còn kho
// Content tuần này toàn cảnh cảng/bờ nên đổi hình kiểu gì cũng lệch. Đường đúng: nhờ model CHẤM nghĩa lời với
// hình đã chọn, cảnh lệch thì VIẾT LẠI LỜI THEO MÔ TẢ HÌNH (nối đúng triết lý 15/9 "kịch bản đi đôi với video").
// Gọi mạng chỉ ở 2 hàm mỏng (semanticFitCheck, semanticRewriteScenes); phần lưới + cập nhật nằm ở
// applySemanticRewrites (thuần, test không mạng). Model lỗi/429/parse hỏng => bỏ qua bước, build vẫn chạy.
export const SEMANTIC_FIT_MAX = 4;

const assetTextOf = (a) => `${a?.title || ''} ${a?.description || ''} ${a?.label || ''}`.replace(/\s+/g, ' ').trim();
const wordsOf = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;

// Chấm độ khớp nghĩa lời và hình cho mọi cảnh (trừ skip) bằng 1 lời gọi. Trả [{scene (1-based), fit, vi_sao}].
// Lỗi bất kỳ => [] (coi như mọi cảnh đạt).
export async function semanticFitCheck(ai, scenes, picks, assetById, { generate = generateWithRetry, model = MKT_MODEL, skip = [], client = null, log = console } = {}) {
  const skipSet = new Set(skip);
  const lines = [];
  scenes.forEach((s, i) => {
    if (skipSet.has(i)) return;
    const a = assetById.get(picks[i]?.assetId);
    if (!a) return;
    lines.push(`CẢNH ${i + 1} [${s.role}] | LỜI: ${s.narration} | HÌNH ĐÃ CHỌN: ${String(assetTextOf(a)).slice(0, 320) || '(chưa có mô tả)'}`);
  });
  if (!lines.length) return [];
  const system = 'Bạn là người duyệt video. Với từng cảnh, chấm hình đã chọn có KHỚP NGHĨA với lời đọc không khi hai thứ phát cùng lúc: 10 = đúng bối cảnh; 5 = không chướng; từ 4 trở xuống = người xem thấy sai (lời tả trong hầm máy mà hình ngoài trời, lời tả trên biển mà hình trên bờ, lời tả người đang làm việc mà hình không có ai...). Chỉ chấm theo MÔ TẢ hình, không suy diễn thêm.';
  const user = `${lines.join('\n')}\n\nTrả JSON đúng dạng {"picks":[{"scene":1,"fit":0-10,"vi_sao":"một câu ngắn"}]}, mỗi cảnh một mục, không chữ ngoài JSON.`;
  try {
    const res = await generate(ai, { model, contents: user, config: { systemInstruction: system, responseMimeType: 'application/json' } });
    logTokenUsage(client, 'creator_video_semantic_fit', res?.modelUsed || model, res?.usageMetadata);
    const parsed = extractFirstJson(res?.text || '');
    const list = Array.isArray(parsed?.picks) ? parsed.picks : [];
    return list
      .map((p) => ({ scene: Number(p?.scene), fit: Number(p?.fit), vi_sao: String(p?.vi_sao || '').trim().slice(0, 160) }))
      .filter((p) => Number.isInteger(p.scene) && p.scene >= 1 && p.scene <= scenes.length && Number.isFinite(p.fit));
  } catch (e) {
    log.warn(`[script] soát nghĩa lời-hình bỏ qua (model lỗi: ${String(e?.message || e).slice(0, 80)}) — giữ nguyên.`);
    return [];
  }
}

// Viết lại lời các cảnh lệch (badIdx: chỉ số 0-based) theo MÔ TẢ hình, 1 lời gọi gộp. Trả [{scene (1-based), loi_moi}].
export async function semanticRewriteScenes(ai, scenes, picks, assetById, badIdx, { generate = generateWithRetry, model = MKT_MODEL, client = null, log = console } = {}) {
  if (!badIdx.length) return [];
  const blocks = badIdx.map((i) => {
    const a = assetById.get(picks[i]?.assetId);
    const old = String(scenes[i].narration || '');
    const nSent = Math.max(1, old.split(/(?<=[.!?…])\s+/).filter(Boolean).length);
    const nWords = wordsOf(old);
    return [
      `CẢNH ${i + 1} [${scenes[i].role}]`,
      `LỜI CŨ (lệch hình): ${old}`,
      `MÔ TẢ HÌNH: ${assetTextOf(a).slice(0, 320)}`,
      `Số câu tối đa: ${nSent}. Độ dài khoảng ${Math.round(nWords * 0.7)} tới ${Math.round(nWords * 1.3)} chữ.`,
      `Ngữ cảnh (KHÔNG viết lại): cảnh trước: ${i > 0 ? scenes[i - 1].narration : '(không có)'} | cảnh sau: ${i + 1 < scenes.length ? scenes[i + 1].narration : '(không có)'}`,
    ].join('\n');
  });
  const system = 'Bạn viết lời đọc cho video ngắn của SDVICO (thiết bị tàu cá), giọng nói chuyện với bà con ngư dân. Với từng cảnh, VIẾT LẠI lời cảnh theo ĐÚNG những gì MÔ TẢ HÌNH nói có: tả cảnh, vật, người có trong mô tả, không nhắc bối cảnh nào mô tả không ghi (không hầm máy nếu hình ngoài trời, không biển động nếu hình trên bờ, không người nếu hình không có người). Giữ mạch với cảnh trước và cảnh sau (chỉ đưa để làm ngữ cảnh, KHÔNG viết lại chúng). Không bịa chi tiết ngoài mô tả, không nhắc giá hay số tiền, không lời chào, mỗi câu tối đa 14 chữ, tôn trọng số câu tối đa. Gọi người trung tính ("nhân viên", "người thợ") nếu mô tả không ghi nam hay nữ.';
  const user = `${blocks.join('\n\n')}\n\nTrả JSON đúng dạng {"scenes":[{"scene":1,"loi_moi":"lời đã viết lại"}]}, mỗi cảnh một mục, không chữ ngoài JSON.`;
  try {
    const res = await generate(ai, { model, contents: user, config: { systemInstruction: system, responseMimeType: 'application/json' } });
    logTokenUsage(client, 'creator_video_semantic_rewrite', res?.modelUsed || model, res?.usageMetadata);
    const parsed = extractFirstJson(res?.text || '');
    const list = Array.isArray(parsed?.scenes) ? parsed.scenes : [];
    return list
      .map((p) => ({ scene: Number(p?.scene), loi_moi: String(p?.loi_moi || '').trim() }))
      .filter((p) => Number.isInteger(p.scene) && p.loi_moi);
  } catch (e) {
    log.warn(`[script] viết lại lời theo hình bỏ qua (model lỗi: ${String(e?.message || e).slice(0, 80)}) — giữ nguyên.`);
    return [];
  }
}

// Phần THUẦN (không mạng): nhận kết quả model đã parse, đưa lời mới qua các lưới hiện có rồi mới nhận.
// rawScenes: [{role, narration, ...}], picks: [{assetId, fit, why, by}] (cả hai sửa tại chỗ),
// rewrites: [{scene (1-based), loi_moi}]. banned: cụm cấm/mòn (cắt câu chứa). extraBad(text, scene, i): hàm trả
// thêm cụm cần cắt (sản phẩm kia, phần trăm không nguồn, máy này...). Trả { applied: [i], kept: [i] }.
export function applySemanticRewrites(rawScenes, picks, rewrites, { skip = [], assetById = new Map(), banned = [], extraBad = null, log = console } = {}) {
  const skipSet = new Set(skip);
  const applied = [];
  const kept = [];
  for (const r of Array.isArray(rewrites) ? rewrites : []) {
    const i = Number(r?.scene) - 1;
    if (!Number.isInteger(i) || i < 0 || i >= rawScenes.length || skipSet.has(i)) continue;
    const pick = picks[i];
    const a = assetById.get(pick?.assetId);
    if (!pick || !a) continue;
    // Lưới giá + câu dài + cụm cấm: giống đường sinh kịch bản ban đầu.
    let text = redactExactPrices(String(r?.loi_moi || '').trim());
    text = breakLongSentences(text);
    const bad = [...banned, ...(extraBad ? extraBad(text, rawScenes[i], i) : [])];
    if (bad.length) text = stripSentencesWith(text, bad);
    if (!text.trim()) {
      log.warn(`[script] cảnh ${i + 1}: lời viết lại bị cắt rỗng bởi lưới cụm cấm — giữ lời cũ.`);
      picks[i] = { ...pick, why: `${pick.why || ''} | CẢNH BÁO: lời có thể lệch hình, bản viết lại không qua lưới cụm cấm`.slice(0, 220) };
      kept.push(i);
      continue;
    }
    const at = assetTextOf(a);
    const drift = [...imageryDriftSentences(text, at), ...inventedDetailSentences(text, at)];
    if (drift.length) {
      log.warn(`[script] cảnh ${i + 1}: lời viết lại vẫn trôi khỏi hình ("${drift[0].slice(0, 60)}") — giữ lời cũ.`);
      picks[i] = { ...pick, why: `${pick.why || ''} | CẢNH BÁO: lời viết lại vẫn lệch hình ("${drift[0].slice(0, 60)}")`.slice(0, 220) };
      kept.push(i);
      continue;
    }
    rawScenes[i].narration = text;
    picks[i] = { ...pick, why: 'viết lại lời theo hình (soát nghĩa 1/10)', by: 'semantic' };
    applied.push(i);
  }
  return { applied, kept };
}

// Nối A + B + C: chấm nghĩa -> viết lại cảnh fit <= SEMANTIC_FIT_MAX -> nhận qua lưới. Chỉ gọi mạng khi có
// pick; model lỗi => không đổi gì. Cảnh bị chấm lệch mà không được viết lại thì ghi CẢNH BÁO vào why.
export async function semanticRecheck({ ai, rawScenes, picks, assets, skip = [], banned = [], extraBad = null, generate = generateWithRetry, model = MKT_MODEL, client = null, log = console }) {
  const result = { applied: [], kept: [], flagged: [] };
  if (!assets.length || !picks.some(Boolean)) return result;
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const skipSet = new Set(skip);
  const fits = await semanticFitCheck(ai, rawScenes, picks, assetById, { generate, model, skip, client, log });
  const bad = fits.filter((f) => f.fit <= SEMANTIC_FIT_MAX && !skipSet.has(f.scene - 1) && picks[f.scene - 1]?.assetId);
  for (const f of bad) log.warn(`[script] soát nghĩa: cảnh ${f.scene} chấm ${f.fit}/10 — ${f.vi_sao || 'lời lệch hình'}`);
  if (!bad.length) return result;
  const badIdx = [...new Set(bad.map((f) => f.scene - 1))];
  const rewrites = await semanticRewriteScenes(ai, rawScenes, picks, assetById, badIdx, { generate, model, client, log });
  const res = applySemanticRewrites(rawScenes, picks, rewrites, { skip, assetById, banned, extraBad, log });
  result.applied = res.applied;
  result.kept = res.kept;
  for (const f of bad) {
    const i = f.scene - 1;
    if (res.applied.includes(i) || res.kept.includes(i)) continue;
    picks[i] = { ...picks[i], why: `${picks[i].why || ''} | CẢNH BÁO: chấm lệch nghĩa ${f.fit}/10 (${f.vi_sao || 'lời lệch hình'}), chưa viết lại được`.slice(0, 220) };
    result.flagged.push(i);
  }
  return result;
}

// content: {title, draft, brief}. assets: [{id, kind, title}]. facts: PRODUCT_FACTS.
// opts.short: chế độ VIDEO SHORTS 10-20 giây (flowchart v3, bài thuộc cặp thử A/B) — ít cảnh,
// lời thoại ngắn, câu đầu là móc câu. Mặc định false = bản dài 40-50 giây như cũ.
export async function generateVideoScript(content, assets, facts = [], opts = {}, client = null) {
  const short = !!opts.short;
  // 8/9 (luật giá úp mở, Thanh): video BÁN HÀNG đọc 1 câu mốc giá ở cảnh cuối; video content, trend,
  // bài quy định KHÔNG có giá. Dữ liệu ở products.mjs (không có số chính xác trong code).
  const teaser = opts.salesVideo && opts.productGroup ? getPriceTeaser(opts.productGroup) : null;
  const shownName = (opts.productGroup && publicName(opts.productGroup)) || null;
  const priceException = teaser ? ' Ngoại lệ duy nhất: câu mốc giá đã dặn ở phần GIÁ, đặt ở CUỐI cảnh này.' : '';
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const allowed = facts
    .filter((f) => f.value)
    .map((f) => `${f.brand || ''} ${f.model || ''} ${f.attribute}: ${f.value}${f.verified ? '' : ' (CHƯA XÁC NHẬN)'}`.trim());

  // 15/9 (sếp: kịch bản phải đi đôi với hình): danh sách tư liệu KÈM MÔ TẢ + folder (brand_assets.description).
  const assetList = assetListForPrompt(assets);

  // 9/9 (user: video "người thật tàu thật"): video CONTENT dựng từ clip thật, không bán hàng.
  // 11/9 (Thanh: "kịch bản nó cứ 1 màu miết"): trước đây cảnh đầu luôn "kết quả + đây là cảnh thật ở
  // đâu", cảnh cuối luôn "1 câu hỏi mở", ví dụ trong prompt lại có "Bà con có thấy vậy không?" nên
  // video nào cũng một khuôn. Nay 6 KIỂU KỂ xoay theo bài (băm id, cùng bài dựng lại vẫn cùng kiểu;
  // opts.styleIdx / env VIDEO_CONTENT_STYLE ghi đè), mỗi kiểu mở khác, kết khác, nhịp khác, kèm
  // danh sách cụm đã mòn bị cấm.
  // Cụm đã mòn (lặp ở nhiều video trước). Dùng 2 chỗ: cấm trong prompt + soát sau khi sinh, dính thì
  // sinh lại 1 lần (bản 5392815a vẫn chép "mấy hôm nay ghé cảng", "đời người đi biển gắn liền với con
  // tàu" từ bài nguồn dù prompt đã cấm).
  const WORN_PHRASES = [
    'đây là cảnh thật', 'cảnh quay thực tế', 'bà con có thấy vậy không', 'anh em có thấy vậy không',
    'đời người đi biển gắn liền với con tàu', 'thương cái nghiệp biển khơi', 'thương các nghiệp biển khơi',
    'mấy hôm nay ghé cảng', 'cặm cụi kiểm tra từng con ốc',
    // 17/9 (ChatGPT chấm video 8c8347a4: "thấu hiểu sóng gió", "lênh đênh bám biển", "thuận buồm xuôi
    // gió, đầy ắp khoang tôm cá" = văn phong video thương hiệu, ngư dân nghe 1 câu biết ngay quảng cáo).
    ...EXTRA_WORN,
  ];
  // 14/9 (sếp: "kịch bản video lọc dầu / lọc nước đừng cứ mãi mất luồng cá lớn, đổi cho đừng giống
  // nhau quá"): video BÁN HÀNG trước đây ép đúng 1 kiểu hook nghịch lý + ví dụ toàn "trúng luồng cá
  // phải quay bờ", cảnh 2 lại gợi ý "vợ con đợi tiền / xót đứt ruột / nằm bờ cả tuần" nên bài nào
  // cũng một khuôn. Nay: 6 KIỂU MỞ xoay theo bài (băm id như video content, env VIDEO_SALES_STYLE
  // ghi đè), mỗi kiểu kèm 1 TÌNH HUỐNG MẤT MÁT khác nhau, và danh sách cụm đã mòn bị cấm + soát sau
  // khi sinh (dính thì sinh lại 1 lần).
  const SALES_WORN = [
    'trúng luồng cá', 'luồng cá lớn', 'mất luồng cá', 'quay vào bờ', 'quay đầu về bờ', 'phải quay bờ',
    'chuyến đi đứt', 'chuyến biển đi đứt', 'chuyến biển đứt', 'đứt gánh', 'trong nháy mắt',
    'xót đứt ruột', 'tiếc đứt ruột', 'uất nghẹn', 'uất không nói nên lời', 'vợ con ở nhà',
    'nằm bờ cả tuần', 'giữa khơi xa', 'tàu bạc tỷ', 'chén nước lã',
    // 17/9 (ChatGPT chấm 7e9cab1a + 492313ac: "xót cả ruột gan", "hại lắm nha", "bảo vệ sức khỏe" nghe
    // như quảng cáo hàng tiêu dùng, không phải tư vấn thiết bị cho chủ tàu).
    ...EXTRA_WORN,
  ];
  // 17/9: video bán hàng CHỈ nói về sản phẩm của bài. Video lọc nước 7e9cab1a đọc "lọc dầu ngao ngán
  // dưới khoang tàu" trong khi hình là máy lọc nước; video lọc dầu 492313ac mở màn bằng "đầy ắp nước
  // ngọt, về bến cạn khô". Cụm của sản phẩm kia bị cấm trong prompt + soát sau khi sinh (rules.mjs).
  const crossTerms = !opts.contentVideo ? crossProductTerms(opts.productGroup) : [];
  // 17/9 chiều: clip bắt buộc nằm ở cảnh nào (build-video quyết qua rules.mjs mustUseRoleFor): 'hook' | 'solution'.
  const mustRole = opts.mustUseRole === 'solution' ? 'solution' : 'hook';
  // 17/9 vòng 2: từ khóa outro của video này (content = SDVICO, không nhắc sản phẩm).
  const outroKw = opts.contentVideo ? 'SDVICO' : outroKeywordOf(opts.productGroup);
  // 17/9 vòng 2 (ChatGPT: "người xem chưa biết chuyện này liên quan tới lọc dầu"): 2 câu đầu phải có chữ sản phẩm.
  const hookTerm = !opts.contentVideo ? hookProductTerm(opts.productGroup) : null;
  // 17/9 vòng 3 (ChatGPT: hook "thợ máy sửa tới lần thứ ba" nhưng hình không có thợ máy — "ý nói gì thì
  // hình phải chứng minh đúng ý đó"): khi cảnh 1 KHÔNG bị ghim clip bắt buộc, CHỌN TRƯỚC tư liệu cảnh 1
  // từ kho nỗi đau rồi bắt lời cảnh 1 viết theo mô tả tư liệu đó (cùng cơ chế với clip bắt buộc).
  const hookPin = !opts.contentVideo && (mustRole === 'solution' || !opts.mustUseAssetId)
    ? pickByRole(problemPool(assets, 'hook', opts.productGroup || null), 'hook', {}) || null
    : null;
  if (hookPin) console.log(`Tư liệu cảnh 1 chọn trước (17/9 vòng 3): "${String(hookPin.title || '').slice(0, 60)}" (${String(hookPin.id).slice(0, 8)})`);
  // 17/9: mọi tỷ lệ phần trăm phải có trong BÀI NGUỒN hoặc thông số được phép (492313ac đọc "ngốn gần
  // 40 phần trăm chi phí chuyến đi" không có nguồn — Điều cấm 5). Soát sau khi sinh: unsourcedPercents.
  const percentSources = [content.title || '', content.draft || '', ...allowed];
  const SALES_STYLES = [
    { key: 'nghich-ly', label: 'Nghịch lý mất mát',
      open: 'mở bằng 1 CÂU KHẲNG ĐỊNH <=15 chữ có 2 mảnh đối lập: việc đã làm đúng / đầu tư lớn NHƯNG hỏng vì 1 thứ nhỏ trong dầu hoặc trong nước. KHÔNG dùng tình huống trúng cá phải về bờ',
      situation: 'máy đang chạy ngon bỗng khục khặc rồi tắt giữa chừng, thợ tháo ra thấy toàn cặn' },
    { key: 'con-so', label: 'Con số túi tiền',
      open: 'mở bằng MỘT CON SỐ tiền hoặc lít dầu hoặc ngày công (có trong bài nguồn, không có thì nói "mấy triệu", "cả chục triệu", "cả tuần") đặt ngay đầu câu, rồi 1 câu số đó bay đi đâu',
      situation: 'tiền thay kim phun, bơm cao áp, tiền dầu đốt hao, tiền nước ngọt mua từ bờ cộng dồn mỗi chuyến' },
    { key: 'loi-tho-may', label: 'Lời thợ máy',
      open: 'mở bằng MỘT CÂU NÓI TRỰC TIẾP của thợ máy hoặc chủ tàu (trong ngoặc kép, không bịa tên, gọi "anh thợ máy", "bác chủ tàu"), rồi 1 câu ai vừa nói và nói lúc nào',
      situation: 'thợ máy sửa tới lần thứ ba trong tháng, lắc đầu vì nguyên nhân vẫn là dầu bẩn / nước lợ' },
    { key: 'thoi-quen-sai', label: 'Thói quen hay mắc',
      open: 'mở bằng 1 THÓI QUEN nhiều tàu vẫn làm mà tưởng đúng (đổ dầu là chạy, mua nước bờ chở theo, xả cặn qua loa), 1 câu <=14 chữ, rồi 1 câu cái giá phải trả. KHÔNG bịa tỷ lệ phần trăm hay "9 trên 10 tàu"',
      situation: 'tưởng tiết kiệm được chút ban đầu, cuối chuyến tính lại tốn gấp mấy lần' },
    { key: 'giac-quan', label: 'Giác quan tại chỗ',
      open: 'mở bằng ÂM THANH, MÙI hoặc HÌNH ẢNH cụ thể trên tàu (tiếng máy lịm dần, mùi khét, nước lợ mặn chát, vệt cặn đen trong cốc dầu), 1 câu ngắn, rồi 1 câu điều đó báo hiệu gì',
      situation: 'cả tàu im lặng nghe máy, hoặc anh em nhăn mặt vì ca nước lợ' },
    { key: 'truoc-sau', label: 'Trước và sau',
      open: 'mở bằng HAI TÀU hoặc HAI CHUYẾN đặt cạnh nhau trong cùng 1 câu (tàu lắp / tàu chưa lắp, chuyến trước / chuyến này), rồi 1 câu khác nhau ở đâu. Không bịa tên tàu, tên người',
      situation: 'tàu bên cạnh về bến đúng hẹn còn tàu mình còn loay hoay sửa máy hoặc chia từng ca nước' },
  ];
  const CONTENT_STYLES = [
    { key: 'chung-kien', label: 'Chứng kiến tại chỗ',
      open: 'mở bằng MỘT CHI TIẾT NHỎ nhìn thấy trong clip (bàn tay, con ốc, vệt dầu, tiếng máy), 1 câu <=12 chữ, KHÔNG nói "đây là cảnh thật", địa điểm chỉ lướt qua trong cảnh giữa nếu bài nguồn có',
      close: 'kết bằng 1 câu hỏi về KINH NGHIỆM riêng của bà con (họ làm khác chỗ nào), không hỏi "có thấy vậy không"' },
    { key: 'loi-ke', label: 'Lời một người trên tàu',
      open: 'mở bằng MỘT CÂU NÓI TRỰC TIẾP của người trong clip theo bài nguồn (đặt trong ngoặc kép, không bịa tên; không có tên thì gọi "chú", "anh thợ máy", "bác tài công"), rồi 1 câu ai vừa nói câu đó',
      close: 'kết bằng LỜI NHẮN của chính người đó gửi anh em đi biển, câu cảm, KHÔNG câu hỏi' },
    { key: 'con-so', label: 'Con số thật',
      open: 'mở bằng MỘT CON SỐ có trong bài nguồn (ngày, chuyến, lít, năm nghề), 1 câu ngắn, rồi 1 câu con số đó đổi lấy cái gì; không có con số trong bài thì dùng mốc thời gian (bao nhiêu năm, mấy giờ sáng)',
      close: 'kết bằng câu đố nhẹ: mời bà con bình luận con số của tàu mình (bao nhiêu ngày, bao nhiêu chuyến)' },
    { key: 'truoc-sau', label: 'Trước và sau',
      open: 'mở bằng HAI THỜI ĐIỂM đối lập trong cùng 1 câu (lúc ra khơi / lúc về bến, sáng / chiều, ngày xưa / bây giờ), rồi 1 câu cái gì đổi khác giữa hai lúc đó',
      close: 'kết bằng 1 câu hỏi "tàu bà con đang ở đoạn nào", hoặc câu cảm ngắn về đoạn sau' },
    { key: 'nhip-nhanh', label: 'Nhịp nhanh câu ngắn',
      open: 'mở bằng ĐỘNG TỪ, câu 4 tới 7 chữ, 3 câu liên tiếp như đếm nhịp (siết. kiểm. nổ máy.), không câu nào quá 8 chữ trong cảnh đầu',
      close: 'kết bằng 1 câu cảm ngắn có dấu chấm than về nghề, KHÔNG câu hỏi, KHÔNG lời chúc' },
    { key: 'tam-su', label: 'Tâm sự chậm',
      // 17/9 vòng 3: ví dụ cũ "sáng sớm sương chưa tan" đã vào danh sách cấm (model chép y nguyên) -> đổi ví dụ.
      open: 'mở bằng THỜI ĐIỂM TRONG NGÀY và một hình ảnh tĩnh (chiều muộn ở cảng, sáng tinh mơ trên bến), giọng kể chậm, câu 8 tới 12 chữ',
      // 17/9 (ChatGPT: "chúc thuận buồm xuôi gió, đầy ắp khoang" = lời chúc fanpage, không phải người kể):
      // bỏ kiểu kết lời chúc, kết bằng chi tiết thật của người trong clip.
      close: 'kết bằng 1 câu cảm ngắn về ĐIỀU NGƯỜI TRONG CLIP đang làm hoặc vừa làm xong (bàn tay, cái máy, con tàu), KHÔNG lời chúc chung chung, không câu hỏi, không kêu gọi' },
  ];
  const styleIdx = Number.isInteger(opts.styleIdx) ? opts.styleIdx
    : process.env.VIDEO_CONTENT_STYLE !== undefined && process.env.VIDEO_CONTENT_STYLE !== '' ? Number(process.env.VIDEO_CONTENT_STYLE)
      : [...String(content.id || '')].reduce((s, ch) => s + ch.charCodeAt(0), 0);
  const STYLE = CONTENT_STYLES[Math.abs(styleIdx) % CONTENT_STYLES.length];
  if (opts.contentVideo) console.log(`Kiểu kể video content: ${STYLE.label} (${STYLE.key})`);
  const salesIdx = process.env.VIDEO_SALES_STYLE !== undefined && process.env.VIDEO_SALES_STYLE !== '' ? Number(process.env.VIDEO_SALES_STYLE) : styleIdx;
  const SALES_STYLE = SALES_STYLES[Math.abs(salesIdx) % SALES_STYLES.length];
  if (!opts.contentVideo) console.log(`Kiểu mở video bán hàng: ${SALES_STYLE.label} (${SALES_STYLE.key})`);
  const CONTENT_STRUCTURE = [
    'ĐÂY LÀ VIDEO CỘNG ĐỒNG "NGƯỜI THẬT TÀU THẬT": dựng từ clip THẬT đội SDVICO quay tại tàu, cảng, xưởng. KHÔNG bán hàng, KHÔNG nhắc giá, KHÔNG kêu nhắn Page hay gọi điện. Sản phẩm chỉ xuất hiện khi bài nguồn kể tới, và chỉ như một phần câu chuyện.',
    `KIỂU KỂ CỦA VIDEO NÀY: "${STYLE.label}". Bám đúng kiểu này, không trộn kiểu khác.`,
    `CẢNH ĐẦU: ${STYLE.open}. Câu đầu tiên là câu người xem nghe đầu tiên, phải khác hẳn các video trước.`,
    'CẢNH GIỮA PHẢI CÓ NGƯỜI LÀM VIỆC SỚM (17/9 vòng 6, ChatGPT: "bằng chứng làm thật bị dồn về cuối"): cảnh story ĐẦU TIÊN ưu tiên hình NGƯỜI SDVICO đang thao tác (kỹ thuật viên kiểm tra, lắp, sửa) — hình tàu, cảng, biển chỉ làm nền SAU đó.',
    'CẢNH GIỮA: kể chuyện có người: ai đang làm gì, vất vả chỗ nào, bà con nói gì. Chạm 1 chữ cảm xúc NGHỀ / TIỀN / RỦI RO / TỰ HÀO như bài nguồn. Không bịa tên người, con số không có trong bài nguồn. Địa điểm (tên cảng, tỉnh) chỉ nói nếu bài nguồn có. KỂ LẠI BẰNG LỜI CỦA MÌNH: giữ ý của bài nguồn nhưng KHÔNG chép nguyên câu, không lặp lại cụm từ của bài nguồn quá 5 chữ liền nhau.',
    `CẢNH CUỐI: ${STYLE.close}. Không lời kêu gọi bán hàng.`,
    `CỤM ĐÃ MÒN, CẤM DÙNG (đã lặp ở nhiều video trước, kể cả khi bài nguồn có): ${WORN_PHRASES.map((p) => `"${p}"`).join(', ')}. Muốn nói ý đó thì tìm cách nói khác.`,
  ];
  const SALES_STRUCTURE = [
    `KIỂU MỞ CỦA VIDEO NÀY (sếp 14/9: mỗi video một kiểu, không được giống nhau): "${SALES_STYLE.label}". CẢNH ĐẦU: ${SALES_STYLE.open}. Cảnh đầu = câu mở + 1 câu tô đậm nỗi mất, KHÔNG có câu chào phía trước, KHÔNG câu hỏi thăm chung chung ("có thấy vậy không?", "có gặp chưa?"). Bám 1 trong 4 CHỮ CẢM XÚC: NGHỀ (khoe kinh nghiệm) / TIỀN (con số túi tiền) / RỦI RO (cảnh báo sai lầm, mất chuyến) / TỰ HÀO (lộc biển, danh dự nghề). Bài phải chạm đúng 1 chữ, không sáo rỗng.`,
    `TÌNH HUỐNG MẤT MÁT của video này (dùng cho cảnh đầu và cảnh đồng cảm, kể bằng lời mình theo bài nguồn): ${SALES_STYLE.situation}. CẤM dùng lại tình huống "đang trúng cá / trúng luồng cá phải quay về bờ" trừ khi bài nguồn kể đúng chuyện đó, và kể cả khi đó cũng phải nói bằng cách khác.`,
    `CỤM ĐÃ MÒN, CẤM DÙNG (đã lặp ở nhiều video bán hàng trước): ${SALES_WORN.map((p) => `"${p}"`).join(', ')}. Muốn nói ý đó thì tìm cách nói khác.`,
    crossTerms.length
      ? `CHỈ NÓI VỀ ĐÚNG SẢN PHẨM CỦA BÀI (17/9): toàn bộ lời thoại chỉ được nói về ${shownName || opts.productGroup}. CẤM nhắc sản phẩm kia hay nỗi đau của sản phẩm kia: ${crossTerms.map((p) => `"${p}"`).join(', ')}. Tình huống mất mát ở trên có nêu cả dầu lẫn nước thì CHỈ lấy vế thuộc sản phẩm này.`
      : '',
    hookTerm ? `CẢNH 1 PHẢI LỘ SẢN PHẨM SỚM (17/9 vòng 2): trong 2 câu đầu tiên phải có chữ "${hookTerm}" để người xem biết ngay video nói về chuyện ${hookTerm} trên tàu, không mở màn mơ hồ.` : '',
    !opts.contentVideo ? 'HÌNH SẢN PHẨM PHẢI RA TRƯỚC GIÂY 15 (17/9 vòng 6, luật cứng): tổng lời cảnh hook + empathy TỐI ĐA 55 từ (~15 giây đọc) để cảnh giải pháp chiếu máy thật vào sớm. Gọi tên máy trong phụ đề KHÔNG thay được hình máy.' : '',
    'CÂU KẾT QUẢ PHẢI CÓ HÌNH CHỨNG MINH (17/9 vòng 6): không nói "tuyệt đối", "đảm bảo 100%", "sạch bong" hay kết quả vận hành (máy nổ êm, dầu sạch) nếu tư liệu không quay được điều đó; thay bằng lợi ích MÔ TẢ ("nước sau lọc dùng cho sinh hoạt", "giữ dầu sạch hơn trước khi vào máy").',
    'TỶ LỆ PHẦN TRĂM (17/9, Điều cấm 5): CẤM mọi con số phần trăm ("40%", "gần 40 phần trăm chi phí") không có nguyên văn trong BÀI NGUỒN hoặc THÔNG SỐ ĐƯỢC PHÉP bên dưới. Không có thì nói "một phần lớn", "cả đống tiền".',
    'NỖI ĐAU LÀ CỦA TÀU CHƯA LẮP MÁY SDVICO (17/9 chiều): máy hỏng, sửa hoài, cặn, nước đục, cạn nước trong cảnh đầu và cảnh đồng cảm là chuyện của tàu CHƯA có thiết bị SDVICO. TUYỆT ĐỐI KHÔNG viết như thể máy SDVICO hỏng hay phải sửa; không đặt tên máy SDVICO vào câu tả sự cố. Cũng KHÔNG viết "máy lọc nước này", "máy lọc dầu này", "máy này sửa/hỏng" trong cảnh nỗi đau (18/9 vòng 10: người xem tưởng chiếc máy đang bán chính là chiếc vừa bị chê hỏng) — gọi là "máy lọc cũ", "bộ lọc cũ trên tàu".',
    'CẢNH 2 (đồng cảm) BẮT BUỘC — không được bỏ để nhảy thẳng vào lối thoát: tả đúng khoảnh khắc đau bà con thấy "ủa mình rồi", tạo cảm xúc TIẾC + UẤT + LO (playbook chốt: cảm xúc mạnh nhất ở nhịp này). Kể ra HẬU QUẢ cụ thể (kim phun hỏng mất bao nhiêu tiền, chuyến biển bị bỏ dở, tàu nằm bờ). Không lan man.',
    'CẢNH GIỮA: lối thoát bằng LỢI ÍCH cụ thể (không liệt kê thông số kỹ thuật khô) → phần thưởng cụ thể (đỡ tốn bao nhiêu, đi được bao xa, chở thêm được gì) → tin cậy 1 câu ngắn (lắp tận bến, bảo hành).',
    'CẢNH CUỐI: 1 câu chốt ngắn về LỢI ÍCH/thông điệp sản phẩm (đã có luật ở trên), có thể là câu hỏi mở nhẹ cho bà con nghĩ tiếp. KHÔNG nhắc "gọi", "liên hệ", "hotline" — outro cố định đầu ký đã lo phần đó.',
  ];

  // 1/10 (Thanh bỏ bài 22452d7f sau 5 bản dựng: "viết lời trước, tìm hình sau" vô nghiệm với kho Content
  // mỏng, lời cuối cùng thành thuyết minh ảnh rời rạc): video CONTENT chốt TRỌN BỘ HÌNH TRƯỚC, model viết
  // MỘT câu chuyện liền mạch bám đúng bộ hình. Chỉ nhánh content; không đủ tư liệu (sb null) thì chạy đường cũ.
  // Video BÁN HÀNG không đổi một dòng.
  const sbMustAsset = opts.mustUseAssetId ? assets.find((a) => a.id === opts.mustUseAssetId) || null : null;
  const sb = opts.contentVideo ? pickStoryboard(assets, { mustAsset: sbMustAsset, recentUse: opts.recentUse || new Map(), productGroup: null }) : null;
  const sbMode = !!(sb && sb.length);
  const sbDesc = (a) => String(a.description || a.title || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  if (sbMode) {
    console.log(`Storyboard video content (1/10): ${sb.length} hình chốt trước: ${sb.map((a, i) => `${i + 1}) ${a.kind} "${String(a.title || '').slice(0, 40)}" (${String(a.id).slice(0, 8)})`).join(' | ')}`);
  }
  const STORYBOARD_STRUCTURE = !sbMode ? [] : [
    CONTENT_STRUCTURE[0],
    `BỘ HÌNH ĐÃ CHỐT TRƯỚC (1/10, Thanh: lời phải đi đôi với đúng hình): video có ĐÚNG ${sb.length} cảnh. Cảnh i chiếu đúng tư liệu i dưới đây, lời cảnh i phải bám NHỮNG GÌ MÔ TẢ NÓI CÓ:\n${sb.map((a, i) => `CẢNH ${i + 1} chiếu ${a.kind === 'video' || a.kind === 'clip' ? 'CLIP' : 'ẢNH'} "${String(a.title || '').trim()}": ${sbDesc(a)}`).join('\n')}`,
    'Kể thành MỘT câu chuyện liền mạch từ bộ hình trên: cảnh 1 mở hút theo hình của nó, các cảnh giữa nối nhau bằng câu chuyển (không cảnh nào đứng riêng như thuyết minh ảnh rời rạc), cảnh cuối kết bằng đúng một câu hỏi giao lưu với bà con. Không bịa chi tiết (người, đồ vật, địa danh, hành động) không có trong mô tả hình của cảnh đó. Mỗi câu <= 14 chữ.',
    'Chạm 1 chữ cảm xúc NGHỀ / TIỀN / RỦI RO / TỰ HÀO như bài nguồn. Không bịa tên người, con số không có trong bài nguồn. Địa điểm (tên cảng, tỉnh) chỉ nói nếu bài nguồn có và hình cho phép. KỂ LẠI BẰNG LỜI CỦA MÌNH: giữ ý của bài nguồn nhưng KHÔNG chép nguyên câu, không lặp lại cụm từ của bài nguồn quá 5 chữ liền nhau. Không lời kêu gọi bán hàng, không giá, không gọi, không nhắn Page.',
    CONTENT_STRUCTURE[CONTENT_STRUCTURE.length - 1],
  ];

  const system = [
    'Bạn dựng kịch bản video ngắn cho Công ty SDVICO, nhà phân phối thiết bị hàng hải và giám sát tàu cá.',
    'Giọng gần gũi bà con ngư dân, câu ngắn gọn, dễ nghe khi lồng tiếng. Nhấn lợi ích ĐÚNG VỚI SẢN PHẨM trong bài nguồn (xem SỰ THẬT NGHỀ bên dưới); KHÔNG tự thêm lợi ích không có trong bài.',
    'LỜI THOẠI PHẢI CÓ CẢM XÚC như người kể chuyện cho bạn nghe (sếp góp ý 21/8: giọng đọc đều đều buồn ngủ): xen câu hỏi tu từ đúng chỗ (tự nghĩ câu mới theo nội dung, KHÔNG dùng lại "Bà con có thấy vậy không?" vì đã mòn), câu cảm ngắn ("Nhẹ cả người!", "Yên tâm hẳn!"), ngắt nhịp bằng dấu phẩy và câu ngắn 6 tới 12 chữ. Máy đọc lên xuống giọng THEO DẤU CÂU, nên dấu chấm hỏi, chấm than, dấu phẩy đặt đúng chỗ là giọng có hồn. BẮT BUỘC (sếp 5/9, các sếp chê giọng đều đều): MỖI CẢNH có ít nhất 1 câu cảm ngắn kết bằng dấu chấm than hoặc 1 câu hỏi ngắn kết bằng dấu chấm hỏi; câu dài quá 14 chữ phải tách thành 2 câu.',
    'KHÔNG MỞ ĐẦU BẰNG LỜI CHÀO (sếp bỏ 4/9): CẤM mọi câu chào kiểu "Alo alo bà con ơi!", "Hello anh em đi biển ơi!", "Hello các thuyền trưởng!", "Hello các con vợ ơi!", "Anh em ơi, nghe nè!", "Xin chào bà con", "Chào cả nhà"... Câu ĐẦU TIÊN của video phải là HOOK vào thẳng vấn đề, không chào, không xưng tên kênh. Cả video vẫn nói như người trẻ kể chuyện cho anh em đi biển nghe: năng lượng cao, tự nhiên, có thể chêm "nha", "nè", "luôn á"; NHƯNG vẫn tôn trọng bà con, không chửi bậy, không lố tới mức mất uy tín thiết bị.',
    ...(sbMode ? STORYBOARD_STRUCTURE : opts.contentVideo ? CONTENT_STRUCTURE : SALES_STRUCTURE),
    shownName ? `TÊN SẢN PHẨM: gọi đúng "${shownName}" trong lời thoại, KHÔNG gọi tên khác, KHÔNG đọc mã SD12-300.` : '',
    teaser
      ? `GIÁ (luật 8/9, BẮT BUỘC): CẢNH CUỐI phải có đúng 1 câu mốc giá, dùng NGUYÊN VĂN: "${teaser.spoken}". Câu này CHỈ nói giá, KHÔNG kêu bình luận, nhắn Page hay gọi (phần OUTRO cuối video đã lo: "${outroText(outroKw)}"). Các cảnh khác cũng không nhắc bình luận, nhắn Page hay gọi. TUYỆT ĐỐI KHÔNG đọc giá chính xác (không 9.900.000, không 42 triệu, không 9,9 triệu, không giá cũ 49 hay 38 triệu), KHÔNG tự thêm con số tiền nào khác. Các cảnh trước KHÔNG nhắc giá.`
      : '',
    ...guardLines(`${content.title || ''} ${content.draft || ''} ${content.brief?.rotation_group || ''}`),
    'Số theo chuẩn Việt Nam (dấu chấm ngăn hàng nghìn). KHÔNG dùng gạch dài, mũi tên, dấu chấm tròn giữa câu.',
    'CẤM bịa model và thông số. Chỉ nêu thông số có trong danh sách được phép; không có thì nói chung chung.',
    'CẤM mô tả phần mềm đối tác (Viettel S-Tracking, VNPT VSS, Vishipel, Thuraya) như của SDVICO; chỉ nói phân phối, lắp đặt, tương thích.',
    sbMode ? 'HÌNH ĐÃ CHỐT TRƯỚC (1/10): hình của từng cảnh là tư liệu đã nêu ở phần BỘ HÌNH, bạn KHÔNG chọn hình và KHÔNG cần ghi asset_id hay "visual". Chỉ viết lời thoại từng cảnh sao cho mọi câu đều tả hoặc dẫn từ đúng những gì hình đó có.' : 'MỖI CẢNH ghi field "visual" = HÌNH CẦN THẤY cho cảnh đó (1 câu cụ thể). Cảnh vấn đề (hook/empathy/story) hình phải là cảnh cũ/hư/cặn/nước đục/thợ đang sửa/tàu thật/khoang máy, KHÔNG phải sản phẩm mới bóng; cảnh giải pháp (solution/reward/closing) mới tới hình sản phẩm, lắp đặt, máy chạy. Field "asset_id" chỉ là GỢI Ý (tuỳ chọn) chọn từ danh sách theo MÔ TẢ tư liệu; máy sẽ khớp lại hình theo "visual" sau khi bạn viết xong.',
    // 17/9 (Thanh xem bài 8c8347a4: lời mở "cảng cá sương mờ" nhưng clip bắt buộc là nhân viên
    // văn phòng): kịch bản phải BIẾT clip quay gì và viết cảnh đầu THEO clip, không tả cảnh tự bịa.
    opts.mustUseAssetId
      ? (() => {
          const m = assets.find((a) => a.id === opts.mustUseAssetId);
          const desc = String(m?.description || m?.title || '').replace(/\s+/g, ' ').trim().slice(0, 600);
          // 17/9 chiều (user: video lọc nước mở màn "thợ máy sửa lần thứ ba" trên hình máy SEA-40 của công ty
          // đang chạy): clip sản phẩm đang chạy phải vào cảnh GIẢI PHÁP, cảnh đầu là nỗi đau trên tàu CHƯA lắp.
          if (mustRole === 'solution') {
            return `TƯ LIỆU BẮT BUỘC (9/9, sửa 17/9): cảnh GIẢI PHÁP (role solution) phải dùng id=${opts.mustUseAssetId} (clip thật mới quay MÁY SDVICO ĐANG CHẠY / ĐANG LẮP). CLIP NÀY QUAY: ${desc || '(chưa có mô tả)'}. Lời thoại và "visual" cảnh giải pháp PHẢI tả đúng những gì clip quay. Cảnh ĐẦU và cảnh ĐỒNG CẢM KHÔNG dùng clip này: nỗi đau phải là chuyện trên tàu CHƯA LẮP máy SDVICO (hình tàu thật, khoang máy cũ, thợ sửa máy cũ). TUYỆT ĐỐI KHÔNG viết như thể máy SDVICO hỏng, sửa hoài, ra cặn, cạn nước. Mô tả KHÔNG ghi nam hay nữ thì gọi trung tính ("nhân viên SDVICO", "người thợ"), CẤM đoán "anh" hay "chị". CẤM thêm đồ vật hay hành động không có trong mô tả (vali, xách đồ nghề, bước xuống mạn...).`;
          }
          return `TƯ LIỆU BẮT BUỘC (9/9): cảnh ĐẦU TIÊN phải dùng id=${opts.mustUseAssetId} (clip thật mới quay). CLIP NÀY QUAY: ${desc || '(chưa có mô tả)'}. LỜI THOẠI và "visual" của cảnh đầu PHẢI xuất phát từ đúng những gì clip quay — mở màn bằng chính cảnh trong clip rồi dẫn vào chuyện; CẤM tả cảnh không có trong clip (bình minh, cảng cá, sóng gió, khoang máy...) nếu clip không quay cảnh đó. Các cảnh khác ưu tiên tư liệu có nhãn clip thật hơn ảnh. Mô tả KHÔNG ghi nam hay nữ thì gọi trung tính ("nhân viên SDVICO", "người thợ"), CẤM đoán "anh" hay "chị". CẤM thêm đồ vật hay hành động không có trong mô tả (vali, xách đồ nghề, bước xuống mạn...).`;
        })()
      : '',
    hookPin
      ? `TƯ LIỆU CẢNH 1 ĐÃ CHỌN (17/9 vòng 3): cảnh ĐẦU TIÊN sẽ chiếu id=${hookPin.id} — ${String(hookPin.description || hookPin.title || '').replace(/\s+/g, ' ').trim().slice(0, 220)}. Lời thoại và "visual" cảnh 1 phải tả ĐÚNG những gì hình này có rồi dẫn vào nỗi đau; CẤM nhắc người hay vật KHÔNG có trong hình (không "anh thợ máy nói" nếu hình không có người, không "thùng nước" nếu hình không có thùng). Mô tả không ghi nam hay nữ thì gọi trung tính, không đoán "anh" hay "chị".`
      : '',
    'Lời thoại mỗi cảnh là câu nói trơn, không ghi chú, không tiêu đề, vì sẽ được máy đọc thành tiếng.',
    'CẤM CHÉP VÍ DỤ (5/9: video SF-50 đọc y nguyên câu mẫu trong hướng dẫn): mọi câu VÍ DỤ trong hướng dẫn này chỉ minh họa CẤU TRÚC và cố ý nói về chủ đề khác; không được chép nguyên văn hay gần nguyên văn, không lấy sản phẩm/tình huống trong ví dụ. Lời thoại phải viết MỚI từ chính BÀI NGUỒN bên dưới, dùng tình huống và con số có trong bài.',
    `CẤM cảnh cuối gọi điện / mời liên hệ / kêu bình luận - phần OUTRO cuối video đã đọc "${outroText(outroKw)}" rồi, KHÔNG lặp lại ở nội dung chính (tránh trùng).`,
    'Cảnh cuối nên là một câu chốt ngắn về lợi ích/thông điệp sản phẩm (vd "yên tâm vươn khơi cùng thiết bị bền bỉ"), KHÔNG nhắc số điện thoại hay từ "gọi", "liên hệ".',
    'MỌI SỐ phải VIẾT DẠNG SỐ (95%, 220V, 80 lít, 0939 243 222, 5 năm...), KHÔNG viết ra chữ ("chín lăm phần trăm", "hai trăm hai mươi vôn"). Lý do: PHỤ ĐỀ video lấy nguyên văn kịch bản này - bà con nhìn thấy "95%" dễ hiểu hơn "chín lăm phần trăm". Máy đọc tiếng sẽ tự đọc số ra chữ.',
    '',
    allowed.length ? 'Thông số được phép nêu:\n' + allowed.join('\n') : 'Chưa có thông số được duyệt: nói chung chung, không nêu số cụ thể.',
    '',
    'Tư liệu có sẵn (chỉ được dùng id trong đây):',
    sbMode ? assetListForPrompt(sb) : assetList,
  ].filter((line) => line !== '').join('\n');

  const user = [
    `Nội dung nguồn (đã đăng): "${content.title || ''}".`,
    content.draft ? `Bài viết:\n${String(content.draft).slice(0, 2000)}` : '',
    '',
    'Trả về JSON đúng cấu trúc sau, không thêm chữ ngoài JSON:',
    '{',
    '  "titles": ["ba tiêu đề khác nhau, ngắn, hấp dẫn"],',
    sbMode
      ? '  "vertical": {"scenes": [{"role": "hook|story|closing", "narration": "câu thoại bám đúng hình của cảnh này"}]}'
      : '  "vertical": {"scenes": [{"role": "hook|empathy|solution|reward|closing", "narration": "câu thoại", "visual": "hình cần thấy cho cảnh này", "asset_id": "id gợi ý (tuỳ chọn)"}]}',
    'CHỈ CÓ BẢN DỌC (vertical). Không sinh "horizontal" (sếp 5/9: mọi video đăng lên chỉ 1 dạng dọc cho đồng bộ).',
    '}',
    'FIELD "role" BẮT BUỘC — không được thiếu, không được trùng. Model hay bỏ qua role và gộp/bỏ nhịp; đây là cách ép cấu trúc.',
    ...(sbMode
      ? [
          `ĐÂY LÀ VIDEO CỘNG ĐỒNG 30-45 giây. CHÍNH XÁC ${sb.length} CẢNH theo đúng bộ hình ở phần BỘ HÌNH: cảnh 1 role="hook" (8-12s, ~25-35 từ)${sb.length > 2 ? `, cảnh 2${sb.length > 3 ? ` tới ${sb.length - 1}` : ''} role="story" (mỗi cảnh ~35-45 từ)` : ''}, cảnh ${sb.length} role="closing" (6-10s, ~20-30 từ, đúng một câu hỏi giao lưu). KHÔNG thêm, KHÔNG bớt cảnh.`,
          'Cả bài là MỘT câu chuyện liền mạch: cảnh sau nối tiếp cảnh trước bằng câu chuyển; mỗi câu chỉ nói điều mô tả hình của cảnh đó có.',
        ]
    : opts.contentVideo
      ? [
          'ĐÂY LÀ VIDEO CỘNG ĐỒNG 30-45 giây. CHÍNH XÁC 3 CẢNH, role LẦN LƯỢT: "hook", "story", "closing". KHÔNG thêm, KHÔNG bớt, KHÔNG lặp role.',
          `CẢNH 1 role="hook" (8-12s, ~25-35 từ): theo KIỂU KỂ "${STYLE.label}" ở trên (${STYLE.open}).`,
          'CẢNH 2 role="story" (15-20s, ~45-60 từ): chuyện người thật, việc thật, cảm xúc thật theo bài nguồn.',
          `CẢNH 3 role="closing" (6-10s, ~20-30 từ): ${STYLE.close}. Không giá, không gọi, không nhắn Page.`,
        ]
      : short
        ? [
          'ĐÂY LÀ VIDEO SHORTS GÂY CHÚ Ý (40-55 giây, tăng từ 18-25s để cảnh empathy có chỗ nêu HẬU QUẢ CHI TIẾT — user 26/8: "thời gian có thể tăng miễn dưới 1 phút").',
          'CHÍNH XÁC 3 CẢNH, role LẦN LƯỢT: "hook", "empathy", "solution". KHÔNG thêm cảnh, KHÔNG bớt cảnh, KHÔNG lặp role.',
          'Bản dọc (vertical): 3 cảnh, tổng lời thoại 40-55 giây (~120-160 từ tiếng Việt). Cả video DƯỚI 60 giây (kể cả outro cố định ~5s).',
          '',
          'CẢNH 1 role="hook" (6-9s, ~20-28 từ) — 17/9 vòng 4 (ChatGPT: sản phẩm ra quá muộn): ngắn thôi, vào thẳng:',
          `  Theo KIỂU MỞ "${SALES_STYLE.label}" ở trên: ${SALES_STYLE.open}. Rồi 1 câu tô đậm nỗi mất theo TÌNH HUỐNG đã cho.`,
          '  CẤM: câu chào mở đầu ("Alo alo", "Hello anh em", "Xin chào bà con"...), câu hỏi thăm chung chung ("xót ruột không?", "có thấy vậy không?"), câu chung chung không có hình ảnh cụ thể, và mọi cụm đã mòn ở trên.',
          '',
          'CẢNH 2 role="empathy" (10-14s, ~35-45 từ) — nhịp cảm xúc mạnh nhất playbook. BẮT BUỘC, KHÔNG được gộp/bỏ (17/9 vòng 4: rút ngắn để sản phẩm xuất hiện trước giây 18):',
          '  Tả 2-3 HẬU QUẢ CỤ THỂ để bà con thấy TIẾC + UẤT + LO, bám TÌNH HUỐNG MẤT MÁT đã cho ở trên (17/9 vòng 4: chọn 2-3 ý ĐẮT nhất trong 4 ý, không cần đủ cả 4):',
          '  1. Tiền mất (phụ tùng, tiền dầu, tiền nước, tiền công thợ)',
          '  2. Thời gian mất (chờ sửa, chờ phụ tùng, chuyến bị ngắn lại)',
          '  3. Cơ hội mất (chuyến biển, con nước, mối hàng, uy tín với bạn ghe)',
          '  4. Tâm trạng (chọn 1 cảm xúc cụ thể của người trong cuộc, KHÔNG dùng "xót đứt ruột", "uất nghẹn", "vợ con ở nhà")',
          '  Ví dụ về CẤU TRÚC (chủ đề khác, CẤM chép): "Bình chết là đèn tắt, máy dò tắt, cả tàu mù giữa đêm. Thay bình mới mất mấy triệu, thêm hai ngày nằm chờ hàng về. Tức nhất là bạn ghe bên cạnh vẫn sáng đèn kéo mực đều đều!"',
          '  CẤM: câu ngắn cụt ("máy hỏng vặt lắm"), lặp lại hook, nhắc sản phẩm SDVICO (chưa tới lối thoát).',
          '',
          'CẢNH 3 role="solution" (10-15s, ~35-45 từ):',
          '  LỐI THOÁT bằng sản phẩm + PHẦN THƯỞNG cụ thể + CHỐT lợi ích. Có chỗ nêu 2-3 lợi ích cụ thể (dầu sạch, máy khỏe, tiết kiệm bao nhiêu). KHÔNG nhắc gọi/liên hệ (outro cố định lo).' + priceException,
          // 17/9 vòng 2: ví dụ cũ mở bằng "May mà có" + kết "Yên tâm bám biển" — cả 2 đã vào danh sách cấm
          // (cả 2 video bán hàng đều chép khuôn "May mà có..."), đổi ví dụ để model khỏi học lại.
          '  Ví dụ về CẤU TRÚC (chủ đề khác, CẤM chép): "Đổi qua bộ sạc thông minh là bình luôn no điện, đèn sáng suốt đêm không lo! Bình bền gấp đôi, đỡ tiền thay, chuyến nào cũng trọn con nước."',
        ]
      : [
          'ĐÂY LÀ VIDEO DÀI (40-60 giây). CHÍNH XÁC 5 CẢNH, role LẦN LƯỢT: "hook", "empathy", "solution", "reward", "closing".',
          'Bản dọc (vertical): 5 cảnh, tổng lời thoại 55-60 giây.',
          'Lời thoại mỗi cảnh 8-12 giây (~20-30 từ). Súc tích, không lặp ý.',
          '',
          `CẢNH 1 role="hook": theo KIỂU MỞ "${SALES_STYLE.label}" (${SALES_STYLE.open}), rồi 1 câu tô đậm nỗi mất theo TÌNH HUỐNG đã cho. KHÔNG câu chào mở đầu, KHÔNG câu hỏi thăm chung chung.`,
          'CẢNH 2 role="empathy" (BẮT BUỘC, không bỏ): tả HẬU QUẢ TIẾC + UẤT + LO cụ thể (tiền mất, thời gian mất, cơ hội mất, tâm trạng) bám TÌNH HUỐNG đã cho, không dùng cụm đã mòn. Không nhắc sản phẩm SDVICO.',
          'CẢNH 3 role="solution": sản phẩm xuất hiện như LỐI THOÁT, nói bằng LỢI ÍCH (không thông số kỹ thuật khô).',
          'CẢNH 4 role="reward": PHẦN THƯỞNG cụ thể (chở thêm bao nhiêu, đi xa bao nhiêu, tiết kiệm gì).',
          'CẢNH 5 role="closing": câu chốt ngắn về lợi ích. Cấm nhắc gọi/liên hệ/hotline (outro cố định lo).' + priceException,
        ]),
  ].filter(Boolean).join('\n');

  // Sinh -> quét SỰ THẬT NGHỀ trên lời thoại -> dính thì sinh lại 1 lần; vẫn dính thì CẮT câu sai
  // (19/8: thuyết minh video SEA-40 từng đọc "bớt chở nước nhẹ tàu tiết kiệm nhiên liệu" - sai nghề,
  // cấp trên phản hồi trong nhóm Zalo nội bộ).
  const topic = `${content.title || ''} ${content.draft || ''} ${content.brief?.rotation_group || ''}`;
  let parsed = {};
  let viol = [];
  let worn = [];
  let cross = [];   // 17/9: cụm sản phẩm kia lọt vào video bán hàng
  let pct = [];     // 17/9: phần trăm không có nguồn
  let hookMiss = false; // 17/9 vòng 2: cảnh 1 chưa có chữ sản phẩm (dầu / nước)
  let hookPinMiss = false; // 17/9 vòng 3: lời cảnh 1 không ăn nhập tư liệu cảnh 1 đã chọn trước
  let solutionLate = false; // 17/9 vòng 6: lời trước cảnh giải pháp quá dài, hình máy ra muộn
  let painSelf = []; // 18/9 vòng 10: cảnh nỗi đau trỏ "máy lọc ... này" vào sự cố (tưởng máy đang bán hỏng)
  // 17/9: clip bắt buộc cảnh 1 — kịch bản mở màn không ăn nhập nội dung clip thì sinh lại 1 lần.
  const mustAsset = opts.mustUseAssetId ? assets.find((a) => a.id === opts.mustUseAssetId) : null;
  let mustMiss = false;
  let storyboardMiss = []; // 1/10: cảnh có lời lệch hình đã chốt trước (chỉ nhánh content storyboard-first)
  let storyboardCountMiss = false;
  const sbScenesOf = () => (parsed.vertical?.scenes || []).filter((s) => String(s?.narration || '').trim());
  for (let attempt = 0; attempt < 2; attempt++) {
    const extra = (!viol.length ? '' :
      `\n\nLẦN TRƯỚC LỜI THOẠI SAI NGHỀ, phải bỏ hẳn các ý: ${viol.map((v) => `"${v.phrase}"`).join(', ')}. ${viol[0].why}`)
      + (!worn.length ? '' :
      `\n\nLẦN TRƯỚC LỜI THOẠI VẪN DÙNG CỤM ĐÃ MÒN: ${worn.map((p) => `"${p}"`).join(', ')}. Viết lại toàn bộ, diễn đạt khác hẳn, tuyệt đối không dùng các cụm đó.`)
      + (!mustMiss ? '' :
      `\n\nLẦN TRƯỚC CẢNH ${mustRole === 'solution' ? 'GIẢI PHÁP' : 'ĐẦU'} KHÔNG ĂN NHẬP CLIP BẮT BUỘC. Clip quay: ${String(mustAsset?.description || mustAsset?.title || '').replace(/\s+/g, ' ').slice(0, 600)}. Viết lại cảnh ${mustRole === 'solution' ? 'giải pháp' : 'đầu'}: lời thoại và "visual" phải tả và dẫn chuyện từ ĐÚNG cảnh trong clip đó.`)
      + (!storyboardCountMiss ? '' :
      `\n\nLẦN TRƯỚC SỐ CẢNH SAI. Phải có ĐÚNG ${sb?.length} cảnh, mỗi cảnh ứng với đúng 1 hình trong BỘ HÌNH theo thứ tự.`)
      + (!storyboardMiss.length ? '' :
      storyboardMiss.map((m) => `\n\nLẦN TRƯỚC LỜI CẢNH ${m.scene} KHÔNG ĂN NHẬP HÌNH CỦA CẢNH ĐÓ${m.reason === 'no-overlap' ? ' (lời không nhắc gì có trong hình)' : m.sentences.length ? ` (câu trôi khỏi hình hoặc bịa chi tiết: "${m.sentences[0].slice(0, 80)}")` : ''}. Hình cảnh ${m.scene} là: ${String(m.asset?.title || '').trim()}. ${sbDesc(m.asset || {})}. Viết lại cảnh ${m.scene}: chỉ tả và dẫn chuyện từ ĐÚNG những gì hình đó có, không nhắc người hay vật không có trong mô tả, vẫn nối mạch với cảnh trước và cảnh sau.`).join(''))
      + (!cross.length ? '' :
      `\n\nLẦN TRƯỚC LỜI THOẠI NHẮC SẢN PHẨM KHÁC: ${cross.map((p) => `"${p}"`).join(', ')}. Video này chỉ về ${shownName || opts.productGroup}; viết lại, bỏ hẳn các ý đó.`)
      + (!pct.length ? '' :
      `\n\nLẦN TRƯỚC LỜI THOẠI CÓ SỐ PHẦN TRĂM KHÔNG CÓ NGUỒN: ${pct.map((p) => `"${p}"`).join(', ')}. Bỏ con số, nói chung chung ("một phần lớn", "cả đống tiền").`)
      + (!hookMiss ? '' :
      `\n\nLẦN TRƯỚC CẢNH 1 KHÔNG CÓ CHỮ "${hookTerm}" trong 2 câu đầu — người xem không biết video nói về gì. Viết lại cảnh 1 nêu thẳng chuyện ${hookTerm} trên tàu.`)
      + (!hookPinMiss ? '' :
      `\n\nLẦN TRƯỚC LỜI CẢNH 1 KHÔNG ĂN NHẬP TƯ LIỆU CẢNH 1 ĐÃ CHỌN. Hình cảnh 1 là: ${String(hookPin?.description || hookPin?.title || '').replace(/\s+/g, ' ').slice(0, 220)}. Viết lại cảnh 1 tả đúng hình đó, không nhắc người hay vật không có trong hình.`)
      + (!solutionLate ? '' :
      '\n\nLẦN TRƯỚC LỜI TRƯỚC CẢNH GIẢI PHÁP QUÁ DÀI — hình máy ra sau giây 15. Rút hook + empathy xuống TỐI ĐA 55 từ tổng cộng, mỗi cảnh 2 câu ngắn.')
      + (!painSelf.length ? '' :
      `\n\nLẦN TRƯỚC CẢNH NỖI ĐAU VIẾT ${painSelf.map((p) => `"${p}"`).join(', ')} — người xem tưởng chiếc máy đang bán chính là chiếc hỏng. Viết lại, gọi là "máy lọc cũ" / "bộ lọc cũ trên tàu", không dùng chữ "này".`);
    const res = await generateWithRetry(ai, {
      model: MKT_MODEL,
      contents: user + extra,
      config: { systemInstruction: system, responseMimeType: 'application/json' },
    });
    logTokenUsage(client, 'creator_video_script', res?.modelUsed || MKT_MODEL, res?.usageMetadata);
    parsed = parseJson(res.text || '');
    // 26/8 siết lần 3: log warning nếu SHORTS thiếu scene role='empathy' (model hay lách gộp
    // vào hook hoặc solution). Không auto-regenerate (đắt token) nhưng log để soi khi debug.
    if (short && !opts.contentVideo) {
      for (const k of ['vertical']) { // 14/9: chỉ còn bản dọc, bỏ cảnh báo thừa cho horizontal
        const roles = (parsed[k]?.scenes || []).map((s) => s?.role);
        if (!roles.includes('empathy')) {
          console.warn(`[script] SHORTS ${k} thieu scene role='empathy' (roles=${JSON.stringify(roles)}) - can canh 2 dong cam TIEC+UAT theo playbook.`);
        }
      }
    }
    const all = [...(parsed.vertical?.scenes || []), ...(parsed.horizontal?.scenes || [])].map((x) => x?.narration || '').join('\n');
    viol = guardViolations(all, topic);
    worn = (opts.contentVideo ? WORN_PHRASES : SALES_WORN).filter((p) => all.toLowerCase().includes(p));
    if (worn.length) console.warn(`[script] loi thoai dung cum da mon (lan ${attempt + 1}): ${worn.join(' | ')}`);
    cross = crossTerms.length ? crossProductViolations(all, opts.productGroup) : [];
    if (cross.length) console.warn(`[script] loi thoai nhac san pham KHAC (lan ${attempt + 1}): ${cross.join(' | ')}`);
    pct = unsourcedPercents(all, percentSources);
    if (pct.length) console.warn(`[script] loi thoai co phan tram KHONG NGUON (lan ${attempt + 1}): ${pct.join(' | ')}`);
    const firstNarr = String((parsed.vertical?.scenes || [])[0]?.narration || '').toLowerCase();
    hookMiss = !!hookTerm && !!firstNarr && !firstNarr.includes(hookTerm);
    if (hookMiss) console.warn(`[script] canh 1 chua co chu "${hookTerm}" (lan ${attempt + 1}) — nguoi xem khong biet video noi ve gi.`);
    solutionLate = !opts.contentVideo && wordsBeforeSolution(parsed.vertical?.scenes || []) > 58;
    if (solutionLate) console.warn(`[script] loi truoc canh giai phap ${wordsBeforeSolution(parsed.vertical?.scenes || [])} tu (> 58) — hinh may se ra muon (lan ${attempt + 1}).`);
    // 18/9 vòng 10: cảnh nỗi đau không được trỏ "máy lọc ... này" vào sự cố.
    painSelf = [];
    if (!opts.contentVideo) {
      for (const [si, sc] of (parsed.vertical?.scenes || []).entries()) {
        const role = String(sc?.role || '').toLowerCase();
        if (si !== 0 && !['hook', 'empathy', 'story'].includes(role)) continue;
        painSelf.push(...selfProductFaultPhrases(sc?.narration || ''));
      }
      if (painSelf.length) console.warn(`[script] canh noi dau tro "may ... nay" vao su co (lan ${attempt + 1}): ${painSelf.join(' | ')} — nguoi xem tuong may dang ban hong.`);
    }
    hookPinMiss = false;
    if (hookPin) {
      const first = (parsed.vertical?.scenes || [])[0];
      // 17/9 vòng 9: overlap > 0 chưa đủ — model có thể ghi "visual" đúng hình nhưng LỜI vẫn tả cảnh vật
      // không có trong hình ("thùng inox trên boong" trên ảnh hội thảo). Soát thêm lời trôi khỏi hình.
      const pinText = `${hookPin.title || ''} ${hookPin.description || ''}`;
      const drift = first ? [...imageryDriftSentences(first.narration || '', pinText), ...inventedDetailSentences(first.narration || '', pinText)] : [];
      if (first && (visualOverlap(`${first.visual || ''} ${first.narration || ''}`, hookPin) === 0 || drift.length)) {
        hookPinMiss = true;
        console.warn(`[script] loi canh 1 khong an nhap tu lieu da chon "${String(hookPin.title || '').slice(0, 50)}" (lan ${attempt + 1})${drift.length ? ` — cau troi khoi hinh: "${drift[0].slice(0, 60)}"` : ''} — sinh lai theo mo ta hinh.`);
      }
    }
    // 17/9: cảnh 1 phải chung từ ngữ với mô tả clip bắt buộc (visualOverlap 0 = mở màn lạc đề).
    mustMiss = false;
    if (mustAsset) {
      // 17/9 chiều: so với cảnh mang clip bắt buộc (cảnh 1, hoặc cảnh giải pháp khi clip là máy đang chạy).
      const scs = parsed.vertical?.scenes || [];
      const target = mustRole === 'solution' ? (scs.find((s) => String(s?.role || '').toLowerCase() === 'solution') || scs[scs.length - 1]) : scs[0];
      if (target) {
        const ov = visualOverlap(`${target.visual || ''} ${target.narration || ''}`, mustAsset);
        // 17/9 vòng 9: cảnh gắn clip bắt buộc cũng soát lời trôi khỏi hình (video cộng đồng 8c8347a4 đọc
        // "quây quần bên mâm cơm nóng trên boong" trên clip văn phòng dù câu đầu đã viết đúng theo clip).
        const mustText = `${mustAsset.title || ''} ${mustAsset.description || ''}`;
        const drift = [...imageryDriftSentences(target.narration || '', mustText), ...inventedDetailSentences(target.narration || '', mustText)];
        if (ov === 0 || drift.length) {
          mustMiss = true;
          console.warn(`[script] canh ${mustRole === 'solution' ? 'giai phap' : '1'} khong an nhap clip bat buoc "${String(mustAsset.title || '').slice(0, 50)}" (lan ${attempt + 1})${drift.length ? ` — cau troi khoi hinh: "${drift[0].slice(0, 60)}"` : ''} — sinh lai theo mo ta clip.`);
        }
      }
    }
    // 1/10: video content storyboard-first — lời từng cảnh phải bám mô tả đúng hình đã chốt cho cảnh đó.
    storyboardMiss = [];
    storyboardCountMiss = false;
    if (sbMode) {
      const scs = sbScenesOf();
      storyboardCountMiss = scs.length !== sb.length;
      storyboardMiss = storyboardDrift(scs, sb);
      if (storyboardCountMiss) console.warn(`[script] storyboard: model tra ${scs.length} canh, can DUNG ${sb.length} (lan ${attempt + 1}) — sinh lai.`);
      for (const m of storyboardMiss) console.warn(`[script] storyboard: canh ${m.scene} khong an nhap hinh chot truoc "${String(m.asset?.title || '').slice(0, 50)}" (${m.reason}, lan ${attempt + 1})${m.sentences.length ? ` — cau: "${m.sentences[0].slice(0, 60)}"` : ''} — sinh lai theo mo ta hinh.`);
    }
    if (!viol.length && !worn.length && !mustMiss && !storyboardMiss.length && !storyboardCountMiss && !cross.length && !pct.length && !hookMiss && !hookPinMiss && !solutionLate && !painSelf.length) break;
  }
  // 17/9 vòng 9: bẻ câu 30-40 từ nối bằng dấu phẩy thành câu ngắn TRƯỚC mọi đường cắt — câu khổng lồ
  // làm cắt-cụm-cấm rỗng cả cảnh (bị khôi phục nguyên cụm cấm) và làm tách-cảnh-dài bất lực (ảnh đứng
  // 13,7 giây). Prompt đã cấm câu quá 14 chữ nhưng model vẫn viết.
  for (const k of ['vertical', 'horizontal']) {
    for (const sc of parsed[k]?.scenes || []) {
      if (!sc) continue;
      const broken = breakLongSentences(sc.narration || '');
      if (broken !== sc.narration) { sc.narration = broken; console.warn(`[script] cau qua dai noi bang day phay — da be thanh cau ngan (${k})`); }
    }
  }
  // 17/9 tối (bản 492313ac: cảnh GIẢI PHÁP bị cắt rỗng vì dính cụm cấm nên biến mất, video bán hàng
  // không còn cảnh sản phẩm): giữ bản gốc từng cảnh; cắt xong mà rỗng thì KHÔI PHỤC lời gốc (chấp
  // nhận sót 1 cụm cấm còn hơn mất cả nhịp cấu trúc).
  const originalNarrations = (parsed.vertical?.scenes || []).map((s) => String(s?.narration || ''));
  if (viol.length) {
    // Dự phòng: cắt câu sai khỏi từng cảnh, cảnh rỗng sẽ bị fix() loại.
    for (const k of ['vertical', 'horizontal']) {
      for (const sc of parsed[k]?.scenes || []) sc.narration = stripViolatingSentences(sc.narration || '', topic);
    }
    console.warn('[script] da cat cau SAI NGHE khoi loi thoai:', viol.map((v) => v.phrase).join(', '));
  }
  // 17/9: sinh lại vẫn dính sản phẩm khác / phần trăm không nguồn / cụm đã mòn -> cắt câu chứa (dự phòng
  // như sai nghề; bản dựng lại 7e9cab1a vẫn còn "bảo vệ sức khỏe" sau 2 lần sinh). Cảnh mà cắt hết
  // câu thì giữ nguyên lời cũ (không để mất cảnh, nhất là cảnh 1 gắn clip bắt buộc).
  if (cross.length || pct.length || worn.length) {
    const bad = [...cross, ...pct, ...worn];
    for (const k of ['vertical', 'horizontal']) {
      for (const sc of parsed[k]?.scenes || []) {
        const cut = stripSentencesWith(sc.narration || '', bad);
        if (cut && cut !== sc.narration) sc.narration = cut;
      }
    }
    console.warn('[script] da cat cau nhac san pham khac / phan tram khong nguon / cum da mon:', bad.join(', '));
  }
  // 18/9 vòng 10: sinh lại vẫn trỏ "máy ... này" vào sự cố -> cắt câu chứa khỏi cảnh nỗi đau (dự phòng,
  // cảnh rỗng sẽ được khối khôi phục bên dưới trả lời gốc).
  if (painSelf.length) {
    for (const [si, sc] of (parsed.vertical?.scenes || []).entries()) {
      const role = String(sc?.role || '').toLowerCase();
      if (si !== 0 && !['hook', 'empathy', 'story'].includes(role)) continue;
      const cut = stripSentencesWith(sc.narration || '', painSelf);
      if (cut && cut !== sc.narration) sc.narration = cut;
    }
    console.warn('[script] da cat cau "may ... nay" khoi canh noi dau:', painSelf.join(', '));
  }
  // Khôi phục cảnh bị cắt rỗng (mọi đường cắt ở trên).
  (parsed.vertical?.scenes || []).forEach((sc, i) => {
    if (!String(sc?.narration || '').trim() && originalNarrations[i]) {
      sc.narration = originalNarrations[i];
      console.warn(`[script] canh ${i + 1} (${sc?.role || '?'}) bi cat rong — khoi phuc loi goc de khong mat canh.`);
    }
  });

  // 1/10: storyboard-first — hết lượt sinh vẫn còn lời lệch hình thì CẮT câu trôi khỏi mô tả từng cảnh
  // (cutImageryDrift); cảnh cắt xong rỗng thì giữ lời gốc + cảnh báo để người duyệt soi tay.
  if (sbMode && storyboardMiss.length) {
    const scs = sbScenesOf();
    for (const m of storyboardMiss) {
      const sc = scs[m.index];
      if (!sc || !m.sentences.length) continue;
      const orig = String(sc.narration || '');
      const cut = cutImageryDrift(orig, `${m.asset.title || ''} ${m.asset.description || ''} ${m.asset.label || ''}`);
      let next = cut;
      for (const s of m.sentences) if (next.includes(s)) next = next.replace(s, '').replace(/\s{2,}/g, ' ').trim();
      if (next && next !== orig) {
        console.warn(`[script] storyboard: canh ${m.scene} cat cau troi khoi hinh "${m.sentences[0].slice(0, 60)}"`);
        sc.narration = next;
      } else if (!next) {
        console.warn(`[script] storyboard: canh ${m.scene} cat het se rong — giu loi goc (can soi tay).`);
      }
    }
  }
  // 17/9 vòng 6: sinh lại vẫn dài thì CẮT câu cuối của empathy (rồi hook) cho hình máy vào trước giây 15.
  if (solutionLate && parsed.vertical?.scenes) {
    const r = trimEarlyScenes(parsed.vertical.scenes, 58);
    if (r.trimmed) {
      parsed.vertical.scenes = r.scenes;
      console.warn('[script] da cat bot loi hook/empathy de canh giai phap vao truoc giay 15 (17/9 vong 6)');
    }
  }
  const ids = new Set(assets.map((a) => a.id));
  // 15/9: tách 2 bước — lời thoại + "visual" ở trên; HÌNH khớp ở đây bằng scene-match.mjs (mô tả tư liệu +
  // luật vai cảnh). Bỏ hẳn fallback assets[i % n] (xoay vòng mù nội dung — gốc lỗi "nói máy hư mà chiếu máy mới").
  const rawScenes = (parsed.vertical?.scenes || [])
    .map((s, i) => {
      let narration = String(s?.narration || '').trim();
      // 4/9: cảnh 1 không được mở bằng câu chào (xem stripGreeting).
      if (i === 0) {
        const cut = stripGreeting(narration);
        if (cut !== narration) console.warn(`[script] vertical: da cat cau chao dau canh 1: "${narration.slice(0, 60)}"`);
        narration = cut;
      }
      // 8/9: lưới giá — số tiền chính xác không được lọt vào lời thoại/phụ đề.
      narration = redactExactPrices(narration);
      const role = String(s?.role || '').trim().toLowerCase() || (i === 0 ? 'hook' : 'solution');
      const visual = String(s?.visual || '').trim().slice(0, 300);
      const hint = ids.has(s?.asset_id) ? String(s.asset_id) : null;
      return { role, narration, visual, hint };
    })
    .filter((s) => s.narration);
  // 1/10: chỉ số cảnh mang clip bắt buộc — dùng chung cho matchScenesToAssets và bước soát sau ghép.
  const mustIdxScene = mustRole === 'solution' ? Math.max(0, (() => { const k = rawScenes.findIndex((s) => s.role === 'solution'); return k >= 0 ? k : rawScenes.length - 1; })()) : 0;
  // 1/10: storyboard-first — hình đã chốt TRƯỚC khi viết lời nên KHÔNG ghép lại (không matchScenesToAssets,
  // refine, semanticRecheck): lời cảnh i đã được sinh và soát theo đúng mô tả hình i. Số cảnh model trả có thể
  // lệch sb.length: dư thì cắt cảnh thừa, thiếu thì cắt bớt hình cuối của bộ cho khớp.
  let sbUse = null;
  if (sbMode) {
    if (rawScenes.length > sb.length) {
      console.warn(`[script] storyboard: model tra ${rawScenes.length} canh > ${sb.length} hinh — cat canh thua.`);
      rawScenes.length = sb.length;
    }
    sbUse = sb.slice(0, rawScenes.length);
    if (sbUse.length < sb.length) console.warn(`[script] storyboard: model chi tra ${rawScenes.length} canh < ${sb.length} hinh — cat bot hinh cuoi cua bo cho khop.`);
    rawScenes.forEach((s, i) => {
      s.role = i === 0 ? 'hook' : i === sbUse.length - 1 ? 'closing' : 'story';
      s.visual = sbDesc(sbUse[i]).slice(0, 300);
      s.hint = null;
    });
  }
  const picks = sbMode
    ? sbUse.map((a) => ({ assetId: a.id, fit: 10, why: 'storyboard: hình chốt trước, lời viết theo hình', by: 'storyboard' }))
    : assets.length
    ? await matchScenesToAssets({
        ai, generate: generateWithRetry, model: MKT_MODEL, scenes: rawScenes, assets, mustUseAssetId: opts.mustUseAssetId || null, log: console,
        productGroup: opts.contentVideo ? null : opts.productGroup || null,
        // 29/9: tư liệu đã lên video 14 ngày gần nhất (build-video đếm) — scene-match phạt điểm để xoay kho.
        recentUse: opts.recentUse || new Map(),
        // 17/9 chiều: clip máy đang chạy ép vào cảnh giải pháp (không có role solution thì cảnh cuối).
        mustUseIndex: mustIdxScene,
      })
    : rawScenes.map(() => null);
  // 1/10 (Thanh, bài 22452d7f: lời "chòng chành sóng nước" trên hình CẢNG CÁ TRÊN BỜ): soát lời từng cảnh với
  // mô tả hình ĐÃ CHỌN (trừ cảnh must, và cảnh 1 khi hookPin sẽ ghi đè hình) — xem refinePicksByImagery.
  if (assets.length && !sbMode) {
    const refined = refinePicksByImagery({
      scenes: rawScenes, picks, assets, mustIdx: mustIdxScene, skip: hookPin ? [0] : [],
      productGroup: opts.contentVideo ? null : opts.productGroup || null, recentUse: opts.recentUse || new Map(), log: console,
    });
    refined.narrations.forEach((n, i) => { if (n && n !== rawScenes[i].narration) rawScenes[i].narration = n; });
  }
  // 1/10 vòng 2 (Thanh: bản dựng lần 4 đủ cả 3 bản vá từ khóa vẫn lệch 2 cảnh — "hầm máy siết vòng gen" trên
  // hình bơm ngoài trời, "chòng chành sóng nước" trên hình cảng): từ khóa không đo được NGHĨA. Nhờ model chấm
  // nghĩa lời với hình đã chọn, cảnh lệch thì VIẾT LẠI LỜI theo mô tả hình (semanticRecheck, +2 lời gọi,
  // model lỗi/429 thì bỏ qua). Miễn: cảnh clip bắt buộc và cảnh 1 khi hookPin ghi đè hình.
  if (assets.length && !sbMode) {
    const semSkip = [...(picks[mustIdxScene]?.by === 'must' ? [mustIdxScene] : []), ...(hookPin ? [0] : [])];
    const semBanned = opts.contentVideo ? WORN_PHRASES : SALES_WORN;
    await semanticRecheck({
      ai, rawScenes, picks, assets, skip: semSkip, banned: semBanned, client, log: console,
      extraBad: (text, scene, si) => [
        ...(crossTerms.length ? crossProductViolations(text, opts.productGroup) : []),
        ...unsourcedPercents(text, percentSources),
        ...(!opts.contentVideo && (si === 0 || ['hook', 'empathy', 'story'].includes(scene?.role)) ? selfProductFaultPhrases(text) : []),
      ],
    });
  }
  let vertical = rawScenes
    .map((s, i) => {
      const assetId = picks[i]?.assetId || s.hint || null;
      return { narration: s.narration, assetId, role: s.role, visual: s.visual, fit: picks[i]?.fit ?? null, matchBy: picks[i]?.by || (s.hint ? 'hint' : 'none'), why: picks[i]?.why || '' };
    })
    .filter((s) => s.assetId);
  // 17/9 vòng 3: cảnh 1 dùng đúng tư liệu đã chọn trước (lời đã viết theo mô tả hình này).
  if (hookPin && vertical.length && vertical[0].matchBy !== 'must') {
    vertical[0] = { ...vertical[0], assetId: hookPin.id, matchBy: 'hook-pin', why: 'tư liệu cảnh 1 chọn trước, lời viết theo hình (17/9 vòng 3)' };
  }
  // 17/9 vòng 9 (ChatGPT: "nút thắt là đồng bộ lời với đúng cảnh" — "mâm cơm trên boong" đọc trên clip
  // văn phòng, "thùng inox trên boong" trên ảnh hội thảo): sau khi biết cảnh nào mang tư liệu nào, cắt
  // câu tả cảnh vật KHÔNG có trong mô tả tư liệu (chỉ cảnh vấn đề / đời sống; cắt hết thì giữ nguyên
  // như luật cắt cụm cấm, có log để soi).
  for (const [i, s] of vertical.entries()) {
    if (!['hook', 'empathy', 'story'].includes(s.role)) continue;
    const a = assets.find((x) => x.id === s.assetId);
    if (!a) continue;
    const cut = cutImageryDrift(s.narration, `${a.title || ''} ${a.description || ''} ${a.label || ''}`);
    if (cut === s.narration) continue;
    if (cut) {
      console.warn(`[script] canh ${i + 1} (${s.role}): cat cau ta canh vat khong co trong tu lieu "${String(a.title || '').slice(0, 50)}"`);
      s.narration = cut;
    } else {
      console.warn(`[script] canh ${i + 1} (${s.role}): loi troi khoi hinh nhung cat het se rong canh — giu nguyen (can soi tay)`);
    }
  }
  // 17/9 vòng 7 (cắt câu chứa "sạch bóng" làm mất luôn tên máy — video bán hàng đọc "Thiết bị có độ
  // lọc..." không ai biết máy gì): cảnh giải pháp phải GỌI TÊN sản phẩm; mất thì chèn câu tên lên đầu.
  // 17/9 tối: SEA-40 không có PUBLIC_NAME nên chốt này từng bị bỏ qua (video mất tên máy khi câu chứa
  // tên bị cắt vì cụm cấm) — thiếu tên công khai thì lấy tên nhóm bỏ số thứ tự ("Máy lọc nước biển SEA-40").
  const guardName = shownName || (!opts.contentVideo && opts.productGroup ? String(opts.productGroup).replace(/^\d+\.\s*/, '').trim() : null);
  if (!opts.contentVideo && guardName && vertical.length) {
    const norm = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ');
    // Chấp nhận tên đầy đủ HOẶC riêng mã máy (model hay viết "máy SEA-40" thay vì nguyên tên nhóm).
    const code = (guardName.match(/[A-Za-z]{2,}-?\d+\w*/) || [])[0] || guardName;
    const anyHas = vertical.some((s) => norm(s.narration).includes(norm(guardName)) || norm(s.narration).includes(norm(code)));
    if (!anyHas) {
      // 17/9 tối: CHỈ chèn vào cảnh giải pháp/thưởng/chốt — chèn vào cảnh nỗi đau là tên máy dính liền
      // câu hỏng hóc (nghe như máy SDVICO hỏng, lỗi user đã mắng).
      const sol = vertical.find((s) => ['solution', 'reward', 'closing'].includes(s.role));
      if (sol) {
        sol.narration = `Đây là ${guardName}! ${sol.narration}`;
        console.warn(`[script] loi thoai mat ten "${guardName}" (thuong do cat cau) — da chen cau ten vao canh giai phap.`);
      } else {
        console.warn(`[script] loi thoai mat ten "${guardName}" nhung khong co canh giai phap de chen — bo qua.`);
      }
    }
  }
  // 8/9: cảnh cuối video bán hàng phải có câu mốc giá đọc được (model quên thì nối vào).
  if (teaser && vertical.length) {
    const last = vertical[vertical.length - 1];
    const before = last.narration;
    last.narration = ensureSpokenTeaser(last.narration, teaser);
    if (last.narration !== before) console.warn('[script] da noi cau gia up mo vao canh cuoi (model quen luat 8/9)');
    // 17/9 (ChatGPT chấm 7e9cab1a: ảnh sản phẩm nền trắng đứng 20 giây vì cảnh cuối gánh cả câu chốt
    // lẫn câu giá ~30 từ): tách câu giá thành cảnh riêng, chọn tư liệu KHÁC cảnh cuối (ưu tiên clip
    // máy đang lắp/đang chạy) để hình đổi, mỗi cảnh ngắn lại.
    const usedCount = new Map();
    for (const s of vertical) usedCount.set(s.assetId, (usedCount.get(s.assetId) || 0) + 1);
    const r = splitPriceScene(vertical, teaser, {
      pickAsset: (prevId) => pickByRole(assets, 'closing', { prevId, usedCount, visual: 'máy đang lắp trên tàu, đang chạy, kỹ thuật bàn giao' })?.id || null,
    });
    if (r.split) { vertical = r.scenes; console.log('[script] tach cau gia thanh canh rieng (17/9) de anh san pham khong dung qua lau'); }
  }
  // 17/9 (bản dựng lại 492313ac: cảnh 2 ảnh tàu 17s, cảnh 3 ảnh máy 19,5s): cảnh dùng ẢNH mà lời dài
  // thì tách đôi ở ranh giới câu, nửa sau đổi sang tư liệu khác để hình không đứng yên quá ~10s.
  // 1/10: storyboard-first KHÔNG tách cảnh ảnh dài: nửa sau sẽ sang hình khác trong khi lời vẫn viết theo hình đầu.
  if (!sbMode) {
    const isImage = (id) => { const a = assets.find((x) => x.id === id); return !!a && a.kind !== 'video' && a.kind !== 'clip'; };
    const usedCount = new Map();
    for (const s of vertical) usedCount.set(s.assetId, (usedCount.get(s.assetId) || 0) + 1);
    // 17/9 chiều (3): nửa sau của cảnh nỗi đau cũng phải chọn trong kho đời sống nghề (problemPool), không lấy
    // ruột máy lọc dầu / ảnh máy công ty (bản dựng lại 7e9cab1a cảnh 3 lấy "Hậu trường lắp ráp thiết bị").
    const groupForPool = opts.contentVideo ? null : opts.productGroup || null;
    const r = splitLongImageScenes(vertical, {
      isImage,
      videoToo: true, // 17/9 vòng 2: cảnh clip 12s đứng nguyên cũng tách (trừ clip bắt buộc và cảnh giá)
      pickAsset: (prevId, role, visual) => pickByRole(problemPool(assets, role, groupForPool), role, { prevId, usedCount, visual })?.id || null,
    });
    if (r.split) { vertical = r.scenes; console.log('[script] tach canh anh dai thanh 2 canh doi hinh (17/9)'); }
  }
  for (const [i, s] of vertical.entries()) {
    const a = assets.find((x) => x.id === s.assetId);
    console.log(`  cảnh ${i + 1} [${s.role}] ${s.matchBy} fit=${s.fit ?? '?'} -> ${a?.kind || '?'} "${String(a?.title || s.assetId).slice(0, 60)}"${s.visual ? ` | cần: ${s.visual.slice(0, 70)}` : ''}`);
  }
  const sceneAssets = [...new Set(vertical.map((s) => s.assetId))];
  // 5/9 (sếp): chỉ dựng BẢN DỌC. Giữ key horizontal trỏ cùng mảng để code gọi không đổi.
  const horizontal = vertical;
  const titles = Array.isArray(parsed.titles) ? parsed.titles.filter(Boolean).slice(0, 3).map((t) => redactExactPrices(String(t))) : [];

  // Quét tuân thủ trên toàn bộ lời thoại (điều cấm 3, 4, 5).
  const allText = [...vertical].map((s) => s.narration).join('\n');
  const assessment = assessDraft(allText, {
    knownFactValues: knownFactValues(facts),
    testFactValues: testFactValues(facts),
  });

  // 15/9: khớp cảnh ↔ tư liệu (id, vai, hình cần, điểm khớp) để ghi vào brief.video_scene_match + trang Video.
  const sceneMatch = vertical.map((s, i) => ({ scene: i + 1, role: s.role, assetId: s.assetId, visual: s.visual, fit: s.fit, by: s.matchBy, why: s.why }));
  return { titles, vertical, horizontal, assessment, sceneAssets, sceneMatch };
}
