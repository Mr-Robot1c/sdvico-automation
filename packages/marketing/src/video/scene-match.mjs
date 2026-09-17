// scene-match.mjs — KHỚP CẢNH ↔ TƯ LIỆU theo MÔ TẢ (15/9, sếp qua kế hoạch "SDVICO sửa web":
// "kịch bản nói máy hư hỏng, nước đục mà lại lấy hình máy sản phẩm mới bóng thì sao mà bán?
// Kịch bản phải đi đôi với đúng video. ĐÂY LÀ CÁI PHẢI SỬA CHO ĐÚNG").
//
// Trước: model viết lời thoại + tự chọn asset_id trong CÙNG một lượt, chỉ nhìn "id | kind | title"
// (title 8-12 chữ, không phân biệt máy mới / máy hư / nước đục); id sai thì rơi về assets[i % n]
// (mù nội dung). Nay tách 2 bước:
//   1. Kịch bản (script.mjs) sinh lời thoại + `visual` = hình cần cho cảnh (không chọn id).
//   2. Module này: đưa các cảnh + danh sách tư liệu KÈM MÔ TẢ (brand_assets.description) cho
//      model chấm, trả asset_id + điểm khớp 0-10 + lý do; điểm thấp / id sai -> chọn theo LUẬT VAI
//      CẢNH (pickByRole) chứ không xoay vòng mù nữa.
//
// Luật vai cảnh (cố định, không cần model):
//   - hook / empathy / story (cảnh VẤN ĐỀ, đời sống): ưu tiên clip thật, tư liệu mô tả có dấu hiệu
//     "cũ, hư, bẩn, cặn, đục, sửa, tháo, khói, rỉ, nằm bờ, biển, tàu, ngư dân"; TRÁNH ảnh sản phẩm
//     mới bóng (studio, nền trắng, "mới", "trưng bày").
//   - solution / reward / closing (cảnh GIẢI PHÁP): ưu tiên tư liệu sản phẩm (đúng folder), cảnh lắp
//     đặt, máy chạy; ảnh sản phẩm được phép.
//   - Không dùng cùng một tư liệu ở 2 cảnh liền nhau nếu còn lựa chọn khác.

const PROBLEM_ROLES = new Set(['hook', 'empathy', 'story']);
const PROBLEM_WORDS = ['cũ', 'hư', 'hỏng', 'bẩn', 'cặn', 'đục', 'sửa', 'tháo', 'khói', 'rỉ', 'gỉ', 'nằm bờ', 'lợ', 'mặn', 'lọc thô bẩn', 'đen', 'nghẹt', 'kẹt', 'chết máy', 'biển', 'tàu', 'ngư dân', 'bà con', 'cảng', 'khoang máy', 'thợ máy', 'lưới', 'khơi', 'sóng', 'ra khơi', 'cập bến'];
const SHINY_WORDS = ['mới', 'trưng bày', 'nền trắng', 'studio', 'showroom', 'bóng', 'catalog', 'ảnh sản phẩm', 'đóng gói', 'hộp'];
const SOLUTION_WORDS = ['lắp', 'lắp đặt', 'đang chạy', 'vận hành', 'sạch', 'trong', 'máy lọc', 'thiết bị', 'sản phẩm', 'nước ngọt', 'dầu sạch', 'bàn giao', 'kỹ thuật'];

function textOf(a) {
  return `${a.title || ''} ${a.description || ''} ${a.label || ''}`.toLowerCase();
}
// 17/9: so KHÔNG DẤU cả hai phía (mô tả cũ hay ghi không dấu); từ ngắn <= 3 ký tự sau khi bỏ
// dấu ("cũ" -> "cu") phải khớp nguyên từ, tránh dính "cua", "cum"...
function count(text, list) {
  const t = fold(text);
  let n = 0;
  for (const w of list) {
    const f = fold(w);
    const hit = f.length <= 3 ? new RegExp(`(^|[^a-z0-9])${f}($|[^a-z0-9])`).test(t) : t.includes(f);
    if (hit) n += 1;
  }
  return n;
}
function isVideoAsset(a) { return a.kind === 'video' || a.kind === 'clip'; }

// Từ có nghĩa trong câu "hình cần" (>= 3 ký tự, bỏ từ nối) để so với tiêu đề + mô tả tư liệu.
// 17/9: QUY VỀ KHÔNG DẤU trước khi so — nhiều mô tả tư liệu cũ ghi không dấu ("Nhan vien van
// phong"), so có dấu vs không dấu trượt hết làm visualOverlap luôn bằng 0 với các tư liệu đó.
function fold(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}
const STOP = new Set(['cua', 'cho', 'voi', 'tren', 'trong', 'dang', 'mot', 'cac', 'nhung', 'nay', 'kia', 'va', 'hoac', 'canh', 'hinh', 'anh', 'clip', 'video', 'thay', 'can', 'co', 'la', 'duoc', 'tai', 'tu', 'den', 'khi', 'thi', 'ma', 'rat', 'nhieu', 'do']);
function words(text) {
  return fold(text).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !STOP.has(w));
}
// Số từ trùng giữa "hình cần" của cảnh và tư liệu (0..n) — tín hiệu nội dung trực tiếp.
export function visualOverlap(visual, asset) {
  const v = new Set(words(visual));
  if (!v.size) return 0;
  const t = new Set(words(textOf(asset)));
  let n = 0;
  for (const w of v) if (t.has(w)) n += 1;
  return n;
}

// Lấy JSON object ĐẦU TIÊN cân bằng ngoặc trong chuỗi (model có khi trả 2 object hoặc kèm chữ thừa).
export function extractFirstJson(text) {
  const t = String(text || '');
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const src = fence ? fence[1] : t;
  try { return JSON.parse(src.trim()); } catch { /* thử cắt */ }
  const start = src.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') { depth -= 1; if (depth === 0) { try { return JSON.parse(src.slice(start, i + 1)); } catch { return null; } } }
  }
  return null;
}

// Điểm luật cho 1 tư liệu với 1 vai cảnh (càng cao càng hợp). Dùng cho fallback và để kiểm model.
export function ruleScore(asset, role, opts = {}) {
  const t = textOf(asset);
  const overlap = opts.visual ? visualOverlap(opts.visual, asset) : 0;
  const isContentFolder = String(asset.folder || asset.product_group || '') === 'Content';
  let s = 0;
  if (PROBLEM_ROLES.has(role)) {
    s += count(t, PROBLEM_WORDS) * 2;
    s -= count(t, SHINY_WORDS) * 3;
    if (isContentFolder) s += 3;            // đời sống nghề, tàu thật
    if (isVideoAsset(asset)) s += 2;        // cảnh vấn đề cần chuyển động
    if (asset.fresh) s += 2;                // clip thật mới
  } else {
    s += count(t, SOLUTION_WORDS) * 2;
    if (!isContentFolder) s += 3;           // đúng folder sản phẩm
    if (isVideoAsset(asset)) s += 1;
    s -= count(t, ['hư', 'hỏng', 'cặn', 'đục', 'khói']) * 1; // giải pháp không nên khoe máy hỏng
  }
  if (!asset.description) s -= 1;          // chưa có mô tả: kém tin cậy hơn
  s += Math.min(overlap, 4) * 2;           // 15/9: hình cần của cảnh trùng từ với tư liệu -> ưu tiên rõ
  return s;
}

// Chọn theo luật cho 1 cảnh, tránh trùng cảnh liền trước và hạn chế lặp trong video.
export function pickByRole(assets, role, { prevId = null, usedCount = new Map(), visual = '' } = {}) {
  let best = null;
  let bestScore = -Infinity;
  for (const a of assets) {
    let s = ruleScore(a, role, { visual });
    if (a.id === prevId) s -= 6;
    s -= (usedCount.get(a.id) || 0) * 2;
    if (s > bestScore) { bestScore = s; best = a; }
  }
  return best;
}

// Danh sách tư liệu đưa cho model chấm — kèm mô tả, folder, nhãn clip thật.
export function assetListForPrompt(assets) {
  return assets.map((a) => {
    const desc = String(a.description || '').replace(/\s+/g, ' ').trim().slice(0, 220);
    return `- id=${a.id} | ${a.kind} | folder: ${a.folder || a.product_group || '?'} | ${a.title || ''}${a.label ? ` | ${a.label}` : ''}${desc ? ` | MÔ TẢ: ${desc}` : ' | (chưa có mô tả)'}`;
  }).join('\n');
}

// scenes: [{role, narration, visual}] ; assets: [{id, kind, title, description, folder, label, fresh}]
// generate: async (params) => res (generateWithRetry của script.mjs, đã có model chain).
// Trả về mảng cùng độ dài scenes: {assetId, fit, why, by: 'model'|'rule'|'must'}.
export async function matchScenesToAssets({ ai, generate, model, scenes, assets, mustUseAssetId = null, log = console }) {
  const ids = new Set(assets.map((a) => a.id));
  const byId = new Map(assets.map((a) => [a.id, a]));
  const out = scenes.map(() => null);
  let modelPicks = [];
  if (assets.length && scenes.length) {
    const system = [
      'Bạn là người dựng video cho SDVICO (thiết bị tàu cá). Nhiệm vụ: chọn TƯ LIỆU (ảnh/clip) cho từng CẢNH sao cho HÌNH ĐI ĐÔI VỚI LỜI.',
      'LUẬT CỨNG:',
      '- Cảnh role hook/empathy/story là cảnh VẤN ĐỀ hoặc đời sống: lời nói máy hư, cặn dầu, nước đục, sửa hoài, nằm bờ... thì hình PHẢI là cảnh cũ/hư/bẩn/tàu thật/khoang máy/thợ đang sửa. TUYỆT ĐỐI KHÔNG dùng ảnh sản phẩm mới bóng, ảnh trưng bày, nền trắng cho các cảnh này.',
      '- Cảnh role solution/reward/closing là cảnh GIẢI PHÁP: được dùng ảnh/clip sản phẩm, cảnh lắp đặt, máy chạy, nước trong, dầu sạch.',
      '- Ưu tiên clip (video) cho cảnh có chuyển động; ưu tiên tư liệu có nhãn CLIP THẬT.',
      '- Không dùng cùng một tư liệu cho 2 cảnh liền nhau nếu còn tư liệu khác hợp.',
      '- Chỉ được dùng id có trong danh sách. Không có tư liệu hợp thật sự thì vẫn chọn cái ÍT SAI NHẤT và cho điểm thấp (fit <= 4) kèm lý do.',
      mustUseAssetId && ids.has(mustUseAssetId) ? `- Cảnh 1 BẮT BUỘC dùng id=${mustUseAssetId}.` : '',
      '',
      'TƯ LIỆU CÓ SẴN:',
      assetListForPrompt(assets),
    ].filter(Boolean).join('\n');
    const user = [
      'CÁC CẢNH (theo thứ tự):',
      ...scenes.map((s, i) => `${i + 1}. role=${s.role || '?'} | HÌNH CẦN: ${s.visual || '(không ghi)'} | LỜI: ${String(s.narration || '').slice(0, 220)}`),
      '',
      'Trả về JSON, không thêm chữ ngoài JSON:',
      '{"picks":[{"scene":1,"asset_id":"id","fit":0-10,"why":"1 câu ngắn vì sao hợp"}]}',
      'fit = mức hình khớp lời (10 = đúng y chang, 5 = tạm được, <=3 = lệch). Mỗi cảnh đúng 1 mục.',
    ].join('\n');
    try {
      const res = await generate(ai, { model, contents: user, config: { systemInstruction: system, responseMimeType: 'application/json' } });
      const raw = String(res?.text || '');
      const parsed = extractFirstJson(raw);
      // Chấp nhận vài dạng model hay trả: {picks:[...]}, mảng trần [...], hoặc {"1": {...}, "2": {...}}.
      if (Array.isArray(parsed)) modelPicks = parsed;
      else if (Array.isArray(parsed?.picks)) modelPicks = parsed.picks;
      else if (parsed && typeof parsed === 'object') modelPicks = Object.entries(parsed).filter(([k, v]) => /^\d+$/.test(k) && v && typeof v === 'object').map(([k, v]) => ({ scene: Number(k), ...v }));
      if (!modelPicks.length) log.warn(`[scene-match] model trả JSON không có picks, dùng luật vai cảnh. Đầu trả lời: ${raw.replace(/\s+/g, ' ').slice(0, 200)}`);
    } catch (e) {
      log.warn('[scene-match] model chấm tư liệu lỗi, dùng luật vai cảnh:', e?.message || e);
    }
  }
  const usedCount = new Map();
  for (let i = 0; i < scenes.length; i++) {
    const role = scenes[i].role || (i === 0 ? 'hook' : i === scenes.length - 1 ? 'closing' : 'solution');
    const prevId = i > 0 ? out[i - 1]?.assetId || null : null;
    let pick = null;
    if (i === 0 && mustUseAssetId && ids.has(mustUseAssetId)) {
      // 17/9 (bài 8c8347a4 lời "cảng cá sương mờ" nhưng clip là văn phòng): vẫn ÉP clip thật
      // (luật 9/9) nhưng điểm khớp phải là điểm THẬT — model chấm nếu có, không thì đo trùng
      // từ với "hình cần"; lệch thì cảnh báo to (script.mjs đã có vòng sinh lại theo mô tả clip).
      const mp = modelPicks.find((p) => Number(p?.scene) === 1);
      const sameId = mp && String(mp.asset_id || '') === mustUseAssetId;
      const mFit = sameId && Number.isFinite(Number(mp.fit)) ? Math.max(0, Math.min(10, Number(mp.fit))) : null;
      const fit = mFit ?? Math.max(0, Math.min(10, 3 + visualOverlap(scenes[0]?.visual || '', byId.get(mustUseAssetId)) * 2));
      const why = (sameId && mp.why ? String(mp.why).slice(0, 140) + ' — ' : '') + 'clip thật bắt buộc (9/9)';
      if (fit < 5) log.warn(`[scene-match] cảnh 1: clip bắt buộc "${String(byId.get(mustUseAssetId)?.title || '').slice(0, 50)}" khớp lời YẾU (fit=${fit}) — kịch bản chưa mở theo nội dung clip.`);
      pick = { assetId: mustUseAssetId, fit, why, by: 'must' };
    } else {
      const mp = modelPicks.find((p) => Number(p?.scene) === i + 1);
      const mid = mp ? String(mp.asset_id || '') : '';
      const fit = mp ? Number(mp.fit) : NaN;
      if (mid && ids.has(mid) && Number.isFinite(fit) && fit >= 5) {
        // Kiểm lại bằng luật: cảnh vấn đề mà model chọn ảnh sản phẩm bóng (điểm luật âm) thì bỏ.
        const rs = ruleScore(byId.get(mid), role, { visual: scenes[i].visual });
        if (PROBLEM_ROLES.has(role) && rs < 0) {
          log.warn(`[scene-match] cảnh ${i + 1} (${role}): model chọn "${byId.get(mid).title}" nhưng luật vai cảnh chấm ${rs} (hình mới bóng cho cảnh vấn đề) -> chọn lại theo luật`);
        } else {
          pick = { assetId: mid, fit, why: String(mp.why || '').slice(0, 160), by: 'model' };
        }
      } else if (mid && ids.has(mid)) {
        log.warn(`[scene-match] cảnh ${i + 1} (${role}): model chấm fit=${fit} thấp ("${String(mp?.why || '').slice(0, 80)}") -> chọn theo luật vai cảnh`);
      }
      if (!pick) {
        const a = pickByRole(assets, role, { prevId, usedCount, visual: scenes[i].visual });
        if (a) pick = { assetId: a.id, fit: Math.max(0, Math.min(10, 4 + ruleScore(a, role, { visual: scenes[i].visual }) / 2)), why: 'chọn theo luật vai cảnh (mô tả tư liệu + hình cần)', by: 'rule' };
      }
    }
    if (pick) usedCount.set(pick.assetId, (usedCount.get(pick.assetId) || 0) + 1);
    out[i] = pick;
  }
  return out;
}
