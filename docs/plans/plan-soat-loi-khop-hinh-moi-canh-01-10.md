# Plan cho Sonnet: soát lời-khớp-hình MỌI cảnh sau khi ghép tư liệu (Thanh 1/10)

Người lập: Fable 5, 1/10/2026. Người thi công: Sonnet. Nhánh tách từ `origin/ngay2-marketing`
(phải chứa f6da8a0), xong push `nhánh:ngay2-marketing` và `nhánh:main`.

## 1. Bối cảnh

Bài 22452d7f dựng lại 2 lần trong ngày 1/10, Thanh soi video đều thấy lời không khớp hình
(đã xác nhận bằng frame thật, không phải đoán):
- Lần 1: "vệt dầu bám trên con ốc gỉ sét" đọc trên clip thợ lắp THIẾT BỊ MỚI; "đội ngũ kỹ
  thuật đi dây điện" trên hình CẢNG CÁ + tàu. Đã vá 2 mũi ở f6da8a0 (IMAGERY_TERMS thêm cụm
  ốc gỉ sét; ruleScore trừ 8 khi cảnh cần người thợ mà hình không có ai làm việc).
- Lần 2 (sau f6da8a0): hết 2 lỗi trên, NHƯNG cảnh 2 đọc "Mồ hôi vã ra như tắm giữa không
  gian chòng chành sóng nước" trên hình CẢNG CÁ TRÊN BỜ (clip "Cảnh ngư dân chuẩn bị ra
  khơi ở cảng") — lời tả trên biển, hình đứng trên bờ.

## 2. Root cause

`script.mjs` chỉ soát "lời trôi khỏi hình" (imageryDriftSentences + inventedDetailSentences)
cho CẢNH GẮN CLIP BẮT BUỘC và cảnh hookPin — trong vòng sinh kịch bản, TRƯỚC khi ghép hình.
Các cảnh còn lại: lời viết trước (kèm `visual` = hình mơ ước), hình ghép sau theo mô tả,
và KHÔNG AI soát lại lời với mô tả của hình ĐÃ CHỌN. Hình được chọn khớp `visual` tới đâu
tùy kho; kho Content mỏng thì lời "giữa biển chòng chành" dễ nhận hình "ở cảng".

## 3. Thiết kế: bước REFINE sau khi ghép hình (đổi hình theo lời, không sinh lại lời)

Nguyên tắc: lời đã qua đủ lưới (cấm cụm, giá, nghề...) — KHÔNG sinh lại lời ở bước này.
Chỉ (a) đổi sang hình không bị lệch nếu kho còn, (b) hết đường thì cắt câu lệch, (c) cắt
rỗng thì giữ nguyên và CẢNH BÁO rõ cho người duyệt. Cảnh must (mustIdx) miễn — đã có vòng
sinh-lại riêng trong attempt loop.

### Việc 1 — rules.mjs: thêm cụm "biển động" vào IMAGERY_TERMS

Dòng `const IMAGERY_TERMS = [...]` (~278, sau f6da8a0 đã có 'ốc gỉ'...'đi dây điện'):
thêm vào cuối mảng: `'chòng chành', 'sóng nhồi', 'lắc lư', 'sóng nước', 'giữa khơi', 'giữa biển', 'lênh đênh'`.
(hasImagery: cụm có khoảng trắng đi đường includes sau fold không dấu — không cần lo nguyên từ.)

### Việc 2 — scene-match.mjs: export hàm refinePicksByImagery

Import thêm từ './rules.mjs': `imageryDriftSentences, cutImageryDrift` (rules.mjs không
import ngược scene-match — đã kiểm, không vòng tròn).

Hàm mới (đặt dưới matchScenesToAssets, cùng file để tái dùng problemPool/pickByRole/textOf):

```js
// 1/10 (Thanh, bài 22452d7f dựng 2 lần vẫn "lời biển - hình cảng"): sau khi ghép hình,
// soát LỜI từng cảnh với MÔ TẢ hình đã chọn. Lệch thì đổi sang hình không lệch (giữ mọi
// luật cũ: vai cảnh, recentUse, không trùng cảnh kề); kho hết hình hợp thì cắt câu lệch;
// cắt rỗng thì giữ nguyên + ghi cảnh báo vào why cho người duyệt thấy ở cột "Ghép từ".
// Cảnh mustIdx miễn: lời cảnh đó đã được sinh lại theo mô tả clip trong attempt loop.
// scenes: [{role, narration, visual}]; picks: kết quả matchScenesToAssets (sửa tại chỗ);
// Trả về { picks, narrations } — narrations là lời từng cảnh SAU khi có thể bị cắt.
export function refinePicksByImagery({ scenes, picks, assets, mustIdx = 0, productGroup = null, recentUse = new Map(), log = console }) {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const usedCount = new Map();
  for (const p of picks) if (p?.assetId) usedCount.set(p.assetId, (usedCount.get(p.assetId) || 0) + 1);
  const narrations = scenes.map((s) => s.narration);
  for (let i = 0; i < scenes.length; i++) {
    const pick = picks[i];
    if (!pick || i === mustIdx) continue;
    const role = scenes[i].role || 'solution';
    const cur = byId.get(pick.assetId);
    const drift = imageryDriftSentences(narrations[i] || '', textOf(cur || {}));
    if (!drift.length) continue;
    const prevId = i > 0 ? picks[i - 1]?.assetId || null : null;
    const nextId = picks[i + 1]?.assetId || null;
    const pool = problemPool(assets, role, productGroup);
    const fit = pool.filter((a) => a.id !== pick.assetId && a.id !== prevId && a.id !== nextId
      && !imageryDriftSentences(narrations[i] || '', textOf(a)).length);
    if (fit.length) {
      usedCount.set(pick.assetId, Math.max(0, (usedCount.get(pick.assetId) || 0) - 1));
      const a = pickByRole(fit, role, { prevId, usedCount, visual: scenes[i].visual, recentUse });
      usedCount.set(a.id, (usedCount.get(a.id) || 0) + 1);
      log.warn(`[scene-match] cảnh ${i + 1} (${role}): lời lệch hình "${String(cur?.title || '').slice(0, 40)}" ("${drift[0].slice(0, 50)}") -> đổi sang "${String(a.title || '').slice(0, 40)}"`);
      picks[i] = { assetId: a.id, fit: Math.max(0, Math.min(10, 4 + ruleScore(a, role, { visual: scenes[i].visual }) / 2)), why: 'đổi hình cho khớp lời (soát sau ghép 1/10)', by: 'imagery' };
      continue;
    }
    const cut = cutImageryDrift(narrations[i] || '', textOf(cur || {}));
    if (cut && cut.trim()) {
      log.warn(`[scene-match] cảnh ${i + 1} (${role}): không còn hình hợp, cắt câu lệch "${drift[0].slice(0, 50)}"`);
      narrations[i] = cut;
    } else {
      log.warn(`[scene-match] cảnh ${i + 1} (${role}): lời lệch hình nhưng cắt sẽ rỗng — GIỮ NGUYÊN, người duyệt tự cân.`);
      picks[i] = { ...pick, why: `${pick.why || ''} | CẢNH BÁO: lời có thể lệch hình ("${drift[0].slice(0, 60)}")`.slice(0, 220) };
    }
  }
  return { picks, narrations };
}
```

Lưu ý thi công: `ruleScore` đã export sẵn; nếu tham chiếu nội bộ cần gì thêm thì KHÔNG đổi
chữ ký các hàm cũ.

### Việc 3 — script.mjs: gọi refine sau matching

Chỗ hiện tại (sau `const picks = assets.length ? await matchScenesToAssets({...}) : ...`,
trước `let vertical = rawScenes.map(...)`): chèn

```js
// 1/10: soát lời từng cảnh với mô tả hình ĐÃ CHỌN (trừ cảnh must) — xem refinePicksByImagery.
if (assets.length) {
  const mustIdxForRefine = (opts.mustUseAssetId && mustRole === 'solution')
    ? Math.max(0, (() => { const k = rawScenes.findIndex((s) => s.role === 'solution'); return k >= 0 ? k : rawScenes.length - 1; })())
    : 0;
  const assetObjs = assets; // mảng {id, kind, title, description, folder, label, fresh} đã map ở caller
  const refined = refinePicksByImagery({ scenes: rawScenes, picks, assets: assetObjs, mustIdx: mustIdxForRefine, productGroup: opts.contentVideo ? null : opts.productGroup || null, recentUse: opts.recentUse || new Map(), log: console });
  refined.narrations.forEach((n, i) => { if (n && n !== rawScenes[i].narration) rawScenes[i].narration = n; });
}
```

`matchScenesToAssets` đã được import từ scene-match trong script.mjs? KIỂM: script.mjs
import gì từ './scene-match.mjs' — thêm `refinePicksByImagery` vào cùng dòng import.
mustIdx tính Y HỆT biểu thức mustUseIndex đang truyền vào matchScenesToAssets (xem chỗ gọi,
~dòng 515) — đừng tự chế công thức khác; tách ra biến dùng chung cho cả hai chỗ là đẹp nhất.

### Việc 4 — test

- `test-scene-match.mjs` thêm mục 14 (import thêm `refinePicksByImagery`):
  1. Cảnh lời "Mồ hôi vã ra giữa không gian chòng chành sóng nước" pick = ảnh cảng (mô tả
     "cảng cá, tàu neo đậu, trên bờ") trong khi kho còn ảnh "thợ sửa máy trên biển, sóng
     nước chòng chành" → pick đổi sang ảnh biển, by === 'imagery'.
  2. Lời khớp hình (không term lệch) → pick giữ nguyên.
  3. Kho không còn hình hợp, cảnh 2 câu (1 câu lệch + 1 câu sạch) → narration bị cắt còn câu sạch.
  4. Cảnh 1 câu lệch, không hình thay → narration GIỮ NGUYÊN, picks[i].why chứa 'CẢNH BÁO'.
  5. mustIdx được miễn: cảnh 0 lệch nhưng mustIdx=0 → không đổi gì.
- `test-video-rules.mjs`: thêm 1 ca imageryDriftSentences bắt "chòng chành sóng nước" trên
  mô tả cảng; 1 ca hình có "sóng nước" thì không bắt.

## 4. Ràng buộc và bẫy

- KHÔNG đụng cao độ/tốc độ giọng, KHÔNG silenceremove ffmpeg, KHÔNG sửa attempt loop sinh
  kịch bản (đó là điều kiện dừng).
- script.mjs dùng picks[i].fit/by/why khi build `vertical` và `sceneMatch` — refine phải chạy
  TRƯỚC đoạn đó để các trường mới đi theo.
- Worktree không có node_modules: junction từ checkout chính, XÓA trước khi xong. Test chạy
  Ở GỐC worktree: `npm run test:scene`, `npm run test:video`, chạy thêm `npm run test:price`
  cho chắc (không đụng nhưng rẻ).
- Hook app-map: thêm entry `<!-- re-verified: 2026-10-01 (2) - REFINE LOI KHOP HINH MOI CANH ... -->`
  đầu khối của `docs/app-map/marketing.md` + dòng `re-verify(docs/app-map/marketing.md): ...`
  trong commit message.
- Commit `fix(video): ...`, kết thúc `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## 5. Điều kiện dừng

- Phải sửa attempt loop / sinh lại lời mới xong việc → DỪNG, báo (ngoài phạm vi plan).
- Vòng import rules ↔ scene-match báo lỗi → DỪNG, báo.
- Test cũ đỏ mà không lý giải được bằng thay đổi của plan → DỪNG, báo.

## 6. Definition of Done

1. 3 file code (rules.mjs, scene-match.mjs, script.mjs) + 2 file test sửa đúng phạm vi.
2. test:scene (≥ +5 ca mới), test:video (≥ +2 ca, hiện 149), test:price xanh toàn bộ.
3. Push cả `ngay2-marketing` + `main`. KHÔNG tự dựng video — người lập plan sẽ dựng lại bài
   22452d7f lần 3 và soi frame bằng mắt sau khi code lên main.
