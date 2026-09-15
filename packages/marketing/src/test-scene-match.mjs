// test-scene-match.mjs — kiểm luật khớp cảnh ↔ tư liệu (không gọi mạng). Chạy: npm run test:scene
// Bài toán sếp nêu 15/9: kịch bản "máy hư, nước đục" KHÔNG được chiếu ảnh máy mới bóng.
import { matchScenesToAssets, pickByRole, ruleScore } from './video/scene-match.mjs';

const assets = [
  { id: 'a-new', kind: 'image', title: 'Máy lọc dầu SF300B đặt trên tàu', folder: '6. Thiết bị lọc dầu SF-50', description: 'Máy lọc dầu mới bóng, nền trắng trưng bày, không có người | Hợp cảnh: san_pham_moi' },
  { id: 'a-dirty', kind: 'image', title: 'Cốc lọc thô đen cặn', folder: 'Content', description: 'Cốc lọc dầu cũ đầy cặn đen, tay thợ máy đang tháo trong khoang máy tàu, dầu bẩn | Hợp cảnh: van_de' },
  { id: 'v-boat', kind: 'video', title: 'Tàu cá cập cảng sáng sớm', folder: 'Content', description: 'Clip tàu gỗ cũ cập cảng, ngư dân kéo lưới, sóng biển | Hợp cảnh: doi_song', label: 'CLIP THẬT MỚI quay 12/09', fresh: true },
  { id: 'v-install', kind: 'video', title: 'Lắp máy lọc nước SEA-40 tại bến', folder: '2. Máy lọc nước biển SEA-40', description: 'Kỹ thuật SDVICO đang lắp đặt máy lọc nước, máy chạy ra nước trong | Hợp cảnh: lap_dat, giai_phap' },
];
const scenes = [
  { role: 'hook', narration: 'Sửa tới lần thứ ba trong tháng mà máy vẫn khục khặc.', visual: 'thợ máy tháo cốc lọc đầy cặn đen trong khoang máy' },
  { role: 'empathy', narration: 'Tiền kim phun, tiền dầu đốt hao, chuyến biển ngắn lại.', visual: 'tàu nằm bờ, anh em ngồi chờ' },
  { role: 'solution', narration: 'Bộ lọc dầu SDVICO giữ dầu sạch, máy khỏe.', visual: 'máy lọc dầu đang chạy, dầu trong' },
];

let fails = 0;
const check = (cond, msg) => { if (!cond) { fails += 1; console.error('  ✗', msg); } else console.log('  ✓', msg); };

console.log('1. Luật vai cảnh: ảnh mới bóng không được vào cảnh vấn đề');
check(ruleScore(assets[0], 'hook') < ruleScore(assets[1], 'hook'), 'cốc cặn đen điểm cao hơn máy mới bóng ở cảnh hook');
check(ruleScore(assets[0], 'solution') > ruleScore(assets[1], 'solution'), 'máy mới điểm cao hơn cốc cặn ở cảnh solution');
check(pickByRole(assets, 'hook').id !== 'a-new', 'pickByRole(hook) không chọn máy mới bóng');
check(['v-install', 'a-new'].includes(pickByRole(assets, 'reward').id), 'pickByRole(reward) chọn tư liệu sản phẩm');

console.log('2. Model lỗi -> rơi về luật, không xoay vòng mù');
const failing = async () => { throw new Error('429 giả lập'); };
const picks = await matchScenesToAssets({ ai: null, generate: failing, model: 'x', scenes, assets, log: { warn() {}, log() {} } });
check(picks.length === 3 && picks.every((p) => p && p.assetId), 'đủ 3 cảnh có tư liệu');
check(picks[0].assetId !== 'a-new' && picks[1].assetId !== 'a-new', 'cảnh 1, 2 (vấn đề) không dùng máy mới bóng');
check(picks[0].assetId !== picks[1].assetId, '2 cảnh liền nhau không trùng tư liệu');
check(picks.every((p) => p.by === 'rule'), 'nguồn chọn ghi là "rule"');

console.log('3. Model chọn sai (máy mới cho cảnh hư) -> bị luật bác');
const badModel = async () => ({ text: JSON.stringify({ picks: [{ scene: 1, asset_id: 'a-new', fit: 9, why: 'có máy' }, { scene: 2, asset_id: 'v-boat', fit: 8, why: 'tàu' }, { scene: 3, asset_id: 'v-install', fit: 9, why: 'lắp' }] }) });
const picks2 = await matchScenesToAssets({ ai: null, generate: badModel, model: 'x', scenes, assets, log: { warn() {}, log() {} } });
check(picks2[0].assetId !== 'a-new', 'cảnh hook: model chọn máy mới bóng bị bác, chọn lại theo luật');
check(picks2[1].assetId === 'v-boat' && picks2[1].by === 'model', 'cảnh empathy: model chọn clip tàu hợp lệ được giữ');
check(picks2[2].assetId === 'v-install' && picks2[2].by === 'model', 'cảnh solution: model chọn clip lắp đặt được giữ');

console.log('4. Clip thật bắt buộc ở cảnh 1');
const picks3 = await matchScenesToAssets({ ai: null, generate: failing, model: 'x', scenes, assets, mustUseAssetId: 'v-boat', log: { warn() {}, log() {} } });
check(picks3[0].assetId === 'v-boat' && picks3[0].by === 'must', 'cảnh 1 = clip bắt buộc');

console.log(fails ? `\nTHẤT BẠI: ${fails} kiểm tra` : '\nOK: mọi kiểm tra đạt');
process.exit(fails ? 1 : 0);
