// test-cluster-segments.mjs — kiểm ĐỢT A (9/10): chọn đoạn trong clip + giữ một cụm tư liệu xuyên suốt video.
// Không gọi mạng. Chạy: npm run test:cluster
import {
  matchScenesToAssets, pickPrimaryCluster, pickClusterForVideo, pickInCluster, allocateSceneSegments, refinePicksByImagery,
  hasSegments, chooseSegment, clusterGroups,
} from './video/scene-match.mjs';
import { normalizeSegments, parseTime, planSceneSegments, segmentsEnabled, estimateSpeechSec, segKey } from './video/segments.mjs';
import { splitLongImageScenes } from './video/rules.mjs';
import { assignClusters, zaloDateOf, clusterIdOf } from './video/segment-clips.mjs';

let fails = 0;
const check = (cond, msg) => { if (!cond) { fails += 1; console.error('  ✗', msg); } else console.log('  ✓', msg); };
const silent = { warn() {}, log() {} };
const failing = async () => { throw new Error('429 giả lập'); };

const G = '6. Thiết bị lọc dầu SF-50';
const seg = (start, end, action, extra = {}) => ({ start, end, action, people: '1 người, kỹ thuật viên', equipment: 'máy lọc dầu inox, ống dẫn', setting: 'khoang máy chật hẹp', vertical_ok: true, note: '', ...extra });
const clA = { id: 'cl-A', confidence: 'chac', basis: 'cùng người áo xanh, cùng máy trên vách' };
const clB = { id: 'cl-B', confidence: 'co_the', basis: 'cùng loại việc' };

// Cụm A: 3 clip lắp đặt máy lọc dầu trong khoang máy. Cụm B: 2 clip lắp máy lọc nước ngoài bến.
const A1 = { id: 'A1', kind: 'video', title: 'Lắp máy lọc dầu A1', folder: G, description: 'Kỹ thuật viên lắp máy lọc dầu', shoot_cluster: clA, segments: [seg(0, 6, 'kỹ thuật viên lắp đường ống vào máy lọc dầu inox'), seg(6, 12, 'đấu nối dây điện phía trên máy lọc dầu')] };
const A2 = { id: 'A2', kind: 'video', title: 'Siết đầu nối A2', folder: G, description: 'Thợ siết đầu nối', shoot_cluster: clA, segments: [seg(0, 5, 'thợ kỹ thuật siết đầu nối máy lọc dầu'), seg(5, 11, 'kiểm tra van khóa máy lọc dầu sau lắp đặt')] };
const A3 = { id: 'A3', kind: 'video', title: 'Kiểm tra A3', folder: G, description: 'Kiểm tra máy', shoot_cluster: clA, segments: [seg(0, 4, 'kỹ thuật viên kiểm tra thiết bị lọc dầu đã lắp')] };
const B1 = { id: 'B1', kind: 'video', title: 'Lắp máy lọc nước B1', folder: '2. Máy lọc nước biển SEA-40', description: 'Lắp máy lọc nước', shoot_cluster: clB, segments: [seg(0, 7, 'kỹ thuật viên lắp máy lọc nước', { equipment: 'máy lọc nước, bình', setting: 'boong tàu' })] };
const B2 = { id: 'B2', kind: 'video', title: 'Nước ngọt B2', folder: '2. Máy lọc nước biển SEA-40', description: 'Nước ngọt chảy', shoot_cluster: clB, segments: [seg(0, 6, 'rót nước ngọt từ máy lọc nước', { setting: 'boong tàu' })] };
const O1 = { id: 'O1', kind: 'video', title: 'Máy lọc dầu đang chạy, kỹ thuật bàn giao thiết bị', folder: G, description: 'Máy lọc dầu đang chạy, kỹ thuật bàn giao sản phẩm sạch trong' }; // không có segments
const O2 = { id: 'O2', kind: 'image', title: 'Ảnh máy lọc dầu', folder: G, description: 'Ảnh sản phẩm máy lọc dầu' };
const all = [A1, A2, A3, B1, B2, O1, O2];

const solScenes = [
  { role: 'solution', narration: 'Kỹ thuật viên lắp máy lọc dầu ngay trong khoang máy.', visual: 'kỹ thuật viên lắp máy lọc dầu trong khoang máy' },
  { role: 'reward', narration: 'Máy lọc dầu đấu nối xong, kiểm tra từng van.', visual: 'đấu nối dây điện, kiểm tra van máy lọc dầu' },
  { role: 'closing', narration: 'Thiết bị lọc dầu bàn giao tận tàu.', visual: 'kỹ thuật viên kiểm tra thiết bị lọc dầu đã lắp' },
];

console.log('1. Tiện ích đoạn');
check(hasSegments(A1) && !hasSegments(O1) && !hasSegments(O2), 'hasSegments: clip có đoạn / không có / ảnh');
check(clusterGroups(all).size === 2 && clusterGroups(all).get('cl-A').clips.length === 3, 'clusterGroups gom đúng 2 cụm, cụm A có 3 clip');
check(parseTime('0:05') === 5 && parseTime('01:05.5') === 65.5 && parseTime(12.5) === 12.5 && parseTime('abc') === null, 'parseTime hiểu số, "m:ss", rác -> null');
check(segmentsEnabled({}) === true && segmentsEnabled({ VIDEO_SEGMENTS: 'off' }) === false && segmentsEnabled({ VIDEO_SEGMENTS: 'on' }) === true, 'segmentsEnabled mặc định on, off tắt hẳn');

console.log('2. Chuẩn hóa đoạn model trả về');
const norm = normalizeSegments([
  { start: -3, end: 5, action: 'a thấy', vertical_ok: true },            // kẹp đầu về 0
  { start: 4, end: 9, action: 'chồng lấn đoạn trước' },                   // bị cắt đầu về 5, còn 4s
  { start: 9, end: 10.2, action: 'quá ngắn' },                            // < 2s bỏ
  { start: '0:12', end: '0:40', action: 'đoạn dài 28s' },                // tách khúc <= 12s, kẹp theo duration 30
  { start: 20, end: 22, action: '' },                                     // không ghi hành động -> bỏ
], 30);
check(norm[0].start === 0 && norm[0].end === 5, 'kẹp start âm về 0');
check(norm[1].start === 5 && norm[1].end === 9, 'đoạn chồng lấn bị cắt đầu về cuối đoạn trước');
check(!norm.some((s) => s.action === 'quá ngắn') && !norm.some((s) => s.action === ''), 'bỏ đoạn < 2s và đoạn không có hành động');
const longParts = norm.filter((s) => s.action === 'đoạn dài 28s');
check(longParts.length >= 2 && longParts.every((s) => s.end - s.start <= 12.001) && longParts[longParts.length - 1].end === 30, 'đoạn dài bị tách <= 12s và kẹp theo độ dài clip');

console.log('3. pickPrimaryCluster chọn MỘT cụm phủ nhiều cảnh nhất');
const pc = pickPrimaryCluster(solScenes, all, { productGroup: G });
check(pc && pc.id === 'cl-A' && pc.covered === 3, `cụm A phủ 3 cảnh (được ${pc?.id}/${pc?.covered})`);
check(pc && pc.clipIds.length === 3 && !pc.clipIds.includes('B1'), 'cụm chính chỉ chứa clip cụm A');
check(pickPrimaryCluster(solScenes, [O1, O2], { productGroup: G }) === null, 'kho không có clip mang cụm -> null (đường cũ)');
check(pickPrimaryCluster(solScenes, [A1, { ...A2, shoot_cluster: null }, O1], { productGroup: G }) === null, 'cụm chỉ còn 1 clip -> không đủ >= 2 clip -> null');
const unrelated = [{ role: 'solution', narration: 'Sóng biển dập dềnh.', visual: 'sóng biển' }, { role: 'reward', narration: 'Mặt trời lên.', visual: 'bình minh' }];
const eat = (id) => ({ id, kind: 'video', title: 'Ăn cơm', folder: 'Content', description: 'bữa cơm', shoot_cluster: { id: 'cl-eat', confidence: 'co_the', basis: 'x' }, segments: [seg(0, 6, 'ngồi ăn cơm', { people: 'nhiều người', equipment: 'mâm cơm', setting: 'boong' })] });
check(pickPrimaryCluster(unrelated, [eat('E1'), eat('E2')], { productGroup: G }) === null, 'cụm có >= 2 clip nhưng không đoạn nào hợp 2 cảnh -> null');
const tieAssets = [A1, A2, { ...B1, id: 'B1x', segments: [seg(0, 6, 'kỹ thuật viên lắp máy lọc dầu', { equipment: 'máy lọc dầu' })], shoot_cluster: clB, folder: G }, { ...B2, id: 'B2x', segments: [seg(0, 6, 'đấu nối kiểm tra máy lọc dầu', { equipment: 'máy lọc dầu' })], shoot_cluster: clB, folder: G }];
const pTie = pickPrimaryCluster(solScenes.slice(0, 2), tieAssets, { productGroup: G, mustAssetId: 'B2x', mustIdx: 1 });
check(pTie && pTie.id === 'cl-B', `hòa độ phủ: cụm chứa clip bắt buộc thắng (được ${pTie?.id})`);

console.log('4. Chọn trong cụm: đoạn khác nhau, nguồn ghi "cluster"');
const picks = await matchScenesToAssets({ ai: null, generate: failing, model: 'x', scenes: solScenes, assets: all, productGroup: G, useSegments: true, log: silent });
check(picks.every((p) => p?.by === 'cluster'), `cả 3 cảnh chọn theo cụm (${picks.map((p) => p?.by).join(',')})`);
check(picks.every((p) => ['A1', 'A2', 'A3'].includes(p.assetId)), 'cả 3 cảnh nằm trong cụm A, không lẫn clip ngoài cụm (kể cả O1 điểm cao)');
const keys = picks.map((p) => segKey(p.segment.assetId, p.segment.idx));
check(new Set(keys).size === 3, 'mỗi cảnh một đoạn riêng, không chiếu lại cùng một đoạn');

console.log('5. Chống lặp / recentUse KHÔNG đá pick trong cụm ra ngoài cụm');
const recent = new Map([['A1', 9], ['A2', 9], ['A3', 9]]);
const pRecent = await matchScenesToAssets({ ai: null, generate: failing, model: 'x', scenes: solScenes, assets: all, productGroup: G, recentUse: recent, useSegments: true, log: silent });
check(pRecent.every((p) => p.by === 'cluster'), 'cả cụm đã lên nhiều video gần đây vẫn ở trong cụm (recentUse chỉ xếp thứ tự)');
const modelOut = async () => ({ text: JSON.stringify({ picks: solScenes.map((_, i) => ({ scene: i + 1, asset_id: 'O1', fit: 10, why: 'máy chạy' })) }) });
const pModelOut = await matchScenesToAssets({ ai: null, generate: modelOut, model: 'x', scenes: solScenes, assets: all, productGroup: G, useSegments: true, log: silent });
check(pModelOut.every((p) => p.by === 'cluster' && p.assetId !== 'O1'), 'model chọn clip ngoài cụm (fit 10) vẫn bị cụm thắng khi trong cụm còn đoạn hợp');
const twoClip = [A1, A2, O1];
const pPrev = await matchScenesToAssets({ ai: null, generate: failing, model: 'x', scenes: solScenes, assets: twoClip, productGroup: G, useSegments: true, log: silent });
check(pPrev.filter((p) => p.by === 'cluster').length === 3 && pPrev.every((p) => p.assetId !== 'O1'), 'chỉ 2 clip trong cụm, 3 cảnh (4 đoạn): cảnh liền nhau cùng clip khác đoạn vẫn ở trong cụm');

console.log('6. Hết đoạn / không đoạn nào hợp -> lấy ngoài cụm và GHI LÝ DO');
const oneSegCluster = [{ ...A1, segments: [A1.segments[0]] }, { ...A2, segments: [A2.segments[0]] }, O1];
const pOut = await matchScenesToAssets({ ai: null, generate: failing, model: 'x', scenes: solScenes, assets: oneSegCluster, productGroup: G, useSegments: true, log: silent });
check(pOut.slice(0, 2).every((p) => p.by === 'cluster'), '2 đoạn đầu lấy trong cụm');
check(pOut[2].assetId === 'O1' && /ngoài cụm/.test(pOut[2].why), `cảnh 3 hết đoạn trong cụm: lấy ngoài cụm và why ghi "ngoài cụm" (${pOut[2].why.slice(0, 60)})`);

console.log('7. Trôi dần: cảnh 3 không bị kéo ra ngoài cụm chỉ vì giống cảnh 2');
const drift3 = [
  solScenes[0],
  { role: 'reward', narration: 'Máy lọc dầu đang chạy, bàn giao thiết bị sạch.', visual: 'máy lọc dầu đang chạy, kỹ thuật bàn giao thiết bị' },
  { role: 'closing', narration: 'Máy lọc dầu đang chạy, bàn giao thiết bị sạch trong.', visual: 'máy lọc dầu đang chạy, kỹ thuật bàn giao thiết bị sạch trong' }, // giống O1 ngoài cụm
];
const modelO1 = async () => ({ text: JSON.stringify({ picks: [{ scene: 1, asset_id: 'A1', fit: 9, why: 'x' }, { scene: 2, asset_id: 'O1', fit: 9, why: 'x' }, { scene: 3, asset_id: 'O1', fit: 9, why: 'x' }] }) });
const pDrift = await matchScenesToAssets({ ai: null, generate: modelO1, model: 'x', scenes: drift3, assets: all, productGroup: G, useSegments: true, log: silent });
check(pDrift.every((p) => ['A1', 'A2', 'A3'].includes(p.assetId)), `cả 3 cảnh ở trong cụm A dù model và cảnh 2 nghiêng về O1 (${pDrift.map((p) => p.assetId).join(',')})`);

console.log('8. Công tắc + clip không có đoạn: hành vi cũ y nguyên');
const pOff = await matchScenesToAssets({ ai: null, generate: failing, model: 'x', scenes: solScenes, assets: all, productGroup: G, useSegments: false, log: silent });
check(pOff.every((p) => p.by === 'rule' && !p.segment), 'useSegments=false: không cụm, không đoạn, nguồn "rule"');
const plain = [O1, O2, { id: 'O3', kind: 'video', title: 'Lắp thiết bị', folder: G, description: 'kỹ thuật lắp thiết bị' }];
const pPlain = await matchScenesToAssets({ ai: null, generate: failing, model: 'x', scenes: solScenes, assets: plain, productGroup: G, useSegments: true, log: silent });
check(pPlain.every((p) => p.by === 'rule' && !p.segment), 'kho không có clip mang đoạn: đường cũ, không đoạn');

console.log('9. Clip bắt buộc ngoài cụm vẫn được giữ, cảnh khác ở trong cụm');
const pMust = await matchScenesToAssets({ ai: null, generate: failing, model: 'x', scenes: solScenes, assets: all, productGroup: G, mustUseAssetId: 'O1', mustUseIndex: 0, cluster: pickPrimaryCluster(solScenes, all, { productGroup: G, mustAssetId: 'O1', mustIdx: 0 }), useSegments: true, log: silent });
check(pMust[0].assetId === 'O1' && pMust[0].by === 'must', 'cảnh 1 = clip bắt buộc ngoài cụm (ưu tiên như cũ)');
check(pMust.slice(1).every((p) => p.by === 'cluster'), 'cảnh 2, 3 vẫn lấy trong cụm');

console.log('10. allocateSceneSegments: nối đoạn cùng việc, không lặp, báo thiếu');
const longNarr = 'Kỹ thuật viên lắp máy lọc dầu ngay trong khoang máy chật hẹp, siết từng đầu nối, đấu nối dây điện, kiểm tra lại từng van rồi mới bàn giao cho chủ tàu. Máy chạy êm.';
const scs = [
  { role: 'solution', narration: longNarr, visual: 'lắp máy lọc dầu', assetId: 'A1', segment: null },
  { role: 'reward', narration: 'Kiểm tra van xong.', visual: 'kiểm tra van', assetId: 'A2', segment: null },
];
const cl = pickPrimaryCluster(solScenes, all, { productGroup: G });
const rep = allocateSceneSegments(scs, all, { cluster: cl, productGroup: G, log: silent });
check(scs[0].segment && scs[0].segment.assetId === 'A1', 'cảnh 1 có đoạn chính của A1');
check(scs[0].extraSegments.length >= 1, `lời dài hơn đoạn: nối thêm đoạn (${scs[0].extraSegments.length} đoạn nối)`);
const playKeys = scs.flatMap((s) => [s.segment, ...s.extraSegments].map((r) => segKey(r.assetId, r.idx)));
check(new Set(playKeys).size === playKeys.length, 'không đoạn nào xuất hiện hai lần trong cả video');
const sameClipExtras = scs[0].extraSegments.filter((r) => r.assetId === 'A1');
check(sameClipExtras.every((r) => r.start >= scs[0].segment.start), 'đoạn cùng clip nối theo thứ tự thời gian');
const shortScenes = [{ role: 'solution', narration: Array(60).fill('lắp').join(' '), visual: 'lắp', assetId: 'A3', segment: null }];
const rep2 = allocateSceneSegments(shortScenes, [A3], { cluster: null, productGroup: G, log: silent });
check(rep2.short.length === 1 && shortScenes[0].segmentShortSec > 5, `lời 60 từ trên clip 4s, không còn đoạn khác: báo thiếu ${shortScenes[0].segmentShortSec}s, không lặp`);
const stale = [{ role: 'solution', narration: 'Lắp máy.', visual: 'lắp', assetId: 'A2', segment: { assetId: 'A1', idx: 0, start: 0, end: 6, text: 'cũ' } }];
allocateSceneSegments(stale, all, { cluster: cl, productGroup: G, log: silent });
check(stale[0].segment.assetId === 'A2', 'đoạn gán sót của clip khác (sau ghim/tách cảnh) bị thay bằng đoạn đúng clip hiện tại');
const dup = [
  { role: 'solution', narration: 'Lắp máy.', visual: 'lắp', assetId: 'A3', segment: null },
  { role: 'closing', narration: 'Bàn giao máy.', visual: 'bàn giao', assetId: 'A3', segment: null },
];
allocateSceneSegments(dup, [A3], { cluster: null, productGroup: G, log: silent });
check(dup[0].segment && dup[1].segment === null, 'clip chỉ 1 đoạn dùng cho 2 cảnh: cảnh thứ hai không chiếu lại đoạn đó (rơi về cách cũ, có cảnh báo)');

console.log('11. planSceneSegments: cắt theo độ dài tiếng thật, không lặp');
const scene = { segment: { assetId: 'A1', start: 2, end: 8 }, extraSegments: [{ assetId: 'A1', start: 10, end: 14 }] };
const pl1 = planSceneSegments(4, scene);
check(pl1.pieces.length === 1 && pl1.pieces[0].start === 2 && pl1.pieces[0].dur === 4 && pl1.shortSec === 0, 'tiếng ngắn hơn đoạn: chỉ lấy phần đầu đoạn');
const pl2 = planSceneSegments(8, scene);
check(pl2.pieces.length === 2 && pl2.pieces[1].start === 10 && pl2.pieces[1].dur === 2 && pl2.shortSec === 0, 'tiếng dài hơn đoạn chính: nối đoạn thứ hai vừa đủ');
const pl3 = planSceneSegments(15, scene);
check(pl3.pieces.length === 2 && pl3.shortSec === 5 && pl3.pieces.reduce((a, p) => a + p.dur, 0) === 10, 'hết đoạn vẫn thiếu 5s: báo shortSec = 5, tổng hình = 10s (không lặp)');
check(planSceneSegments(5, { segment: null }).pieces.length === 0, 'cảnh không có đoạn: không kế hoạch cắt (assemble dùng cách cũ)');
check(Math.abs(estimateSpeechSec('một hai ba bốn năm sáu bảy tám chín mười') - (10 / 3.6 + 0.4)) < 1e-9, 'ước lượng giây đọc theo số từ');

console.log('12. Soát lệch lời sau ghép: không đá pick trong cụm ra ngoài cụm');
{
  const scn = [{ role: 'solution', narration: 'Chiếc tàu cá neo ngoài khơi giữa cơn bão lớn.', visual: 'lắp máy lọc dầu' }];
  const pk = [{ assetId: 'A1', fit: 7, why: 'x', by: 'cluster', segment: { assetId: 'A1', idx: 0, start: 0, end: 6, text: A1.segments[0].action } }];
  const cl2 = pickPrimaryCluster(solScenes, all, { productGroup: G });
  const r = refinePicksByImagery({ scenes: scn, picks: pk, assets: all, mustIdx: 99, productGroup: G, cluster: cl2, log: silent });
  check(['A1', 'A2', 'A3'].includes(r.picks[0].assetId), `pick lệch lời vẫn ở trong cụm (${r.picks[0].assetId}), không nhảy sang O1/B*`);
}

console.log('13. Không tách cảnh đã có đoạn riêng');
{
  const wordy = Array(60).fill('lắp máy').join(' ') + '. ' + Array(60).fill('bàn giao').join(' ') + '.';
  const sc2 = [{ role: 'solution', narration: wordy, assetId: 'A1', matchBy: 'cluster', segment: { assetId: 'A1', idx: 0, start: 0, end: 6, text: 'x' } }];
  const sp = splitLongImageScenes(sc2, { isImage: () => false, videoToo: true, pickAsset: () => 'A2' });
  check(!sp.split && sp.scenes.length === 1, 'cảnh clip có đoạn riêng không bị tách đôi đổi hình');
  const sc3 = [{ ...sc2[0], segment: null }];
  const sp3 = splitLongImageScenes(sc3, { isImage: () => false, videoToo: true, pickAsset: () => 'A2' });
  check(sp3.split && sp3.scenes.length === 2, 'cùng cảnh đó nhưng không có đoạn: vẫn tách như cũ (hành vi cũ giữ nguyên)');
}

console.log('14. pickInCluster / chooseSegment');
{
  const c = pickInCluster(cl, all, solScenes[1], 'reward', { productGroup: G });
  check(c && ['A1', 'A2', 'A3'].includes(c.assetId) && c.segment.text.length > 0, 'pickInCluster trả đoạn trong cụm kèm chữ đoạn');
  check(pickInCluster(cl, all, solScenes[1], 'reward', { productGroup: G, accept: () => false }) === null, 'accept từ chối hết -> null (caller mới được lấy ngoài cụm)');
  const used = new Set([segKey('A1', 0), segKey('A1', 1)]);
  const cs = chooseSegment(A1, solScenes[0], 'solution', { usedSegKeys: used });
  check(cs === null, 'chooseSegment: hết đoạn chưa dùng -> null');
  const vertBad = { ...A3, id: 'A9', segments: [seg(0, 4, 'kỹ thuật viên kiểm tra thiết bị lọc dầu đã lắp', { vertical_ok: false }), seg(4, 8, 'kỹ thuật viên kiểm tra thiết bị lọc dầu đã lắp', { vertical_ok: true })] };
  check(chooseSegment(vertBad, solScenes[2], 'closing').idx === 1, 'đoạn cắt khung dọc không còn thấy chủ thể bị trừ điểm, chọn đoạn vertical_ok');
}

console.log('15. Script mô tả đoạn: id cụm + chuẩn hóa kết quả xét cụm');
{
  check(zaloDateOf('zalo-media:2026-09-19/abc.mp4') === '2026-09-19' && zaloDateOf('khac') === null, 'zaloDateOf đọc ngày từ license_note');
  check(clusterIdOf('2026-09-19', G, 1) === `2026-09-19|${G}|1`, 'id cụm dạng <ngày>|<nhóm>|<số>');
  const ids = ['c1', 'c2', 'c3', 'c4'];
  const m = assignClusters({ clusters: [{ clips: [1, 2], confidence: 'chac', basis: 'cùng người áo xanh' }, { clips: [3], confidence: 'chac', basis: 'chỉ 1 clip' }, { clips: [2, 4], confidence: 'lạ', basis: '' }], isolated: [3] }, ids, { date: '2026-09-19', group: G, checkedAt: 'T' });
  check(m.get('c1')?.id.endsWith('|1') && m.get('c1').confidence === 'chac' && m.get('c2')?.id === m.get('c1').id, 'hai clip cùng cụm số 1, confidence chac');
  check(m.get('c3') === null, 'cụm chỉ 1 clip bị bỏ, clip lạc cụm = null');
  check(m.get('c4') === null, 'clip đã thuộc cụm khác không bị gán lần hai; cụm còn 1 clip bị bỏ');
}

console.log('16. Bộ lọc ffmpeg cho cảnh cắt đoạn');
{
  const { buildPiecesFilter } = await import('./video/assemble.mjs');
  const fmt = { w: 1080, h: 1920 };
  const one = buildPiecesFilter(1, fmt, 0, ",subtitles=a.srt:fontsdir=.");
  check(!/concat/.test(one) && !/tpad/.test(one) && /\[p0\]subtitles=a\.srt/.test(one) && /\[v\]$/.test(one), '1 đoạn, đủ hình: không concat, không giữ khung, phụ đề nối thẳng');
  const two = buildPiecesFilter(2, fmt, 1.4, ",subtitles=a.srt");
  check(/\[p0\]\[p1\]concat=n=2:v=1:a=0\[vc\]/.test(two) && /tpad=stop_mode=clone:stop_duration=1\.400/.test(two), '2 đoạn + thiếu 1,4s: concat rồi tpad giữ khung cuối đúng 1,4s');
  check(!/loop/.test(two) && !/stream_loop/.test(two), 'bộ lọc không có vòng lặp');
  const noSub = buildPiecesFilter(2, fmt, 0, '');
  check(/\[vc\]null\[v\]$/.test(noSub), 'cảnh giá (không phụ đề): đi qua filter null');
}

console.log('17. SỬA NÓNG 9/10 (2): chế độ cụm CHỈ cho video content, video bán giữ hình sản phẩm');
{
  // Kho giống bài 66b894f8: cụm Content (thợ, động cơ) mang đoạn + clip thư mục sản phẩm không mang cụm.
  const CG = 'Content';
  const clC = { id: '2026-09-19|Content|1', confidence: 'chac', basis: 'cùng buổi quay' };
  const cc = (id, act) => ({ id, kind: 'video', title: `Thợ máy ${id}`, folder: CG, description: 'Thợ sửa động cơ tàu', shoot_cluster: clC, segments: [seg(0, 6, act, { equipment: 'động cơ, máy lọc dầu', setting: 'khoang máy' })] });
  const C1 = cc('C1', 'kỹ thuật viên lắp máy lọc dầu vào khoang máy');
  const C2 = cc('C2', 'đấu nối kiểm tra van máy lọc dầu');
  const C3 = cc('C3', 'kỹ thuật viên kiểm tra thiết bị lọc dầu đã lắp');
  const P1 = { id: 'P1', kind: 'video', title: 'Máy lọc dầu đang chạy, kỹ thuật bàn giao thiết bị', folder: G, description: 'Máy lọc dầu đang chạy, kỹ thuật bàn giao sản phẩm sạch trong' };
  const khoBan = [C1, C2, C3, P1, O2];

  // (a) nhánh bán: không chọn cụm dù kho có cụm Content phủ đủ cảnh
  check(pickPrimaryCluster(solScenes, khoBan, { productGroup: G }) !== null, 'đối chứng: pickPrimaryCluster thuần vẫn thấy cụm Content phủ cảnh (nguồn lỗi)');
  check(pickClusterForVideo(solScenes, khoBan, { contentVideo: false, productGroup: G }) === null, 'video bán: pickClusterForVideo trả null, không chọn cụm Content');
  check(pickClusterForVideo(solScenes, khoBan, { productGroup: G }) === null, 'không khai contentVideo: mặc định coi là bán, null');

  // (b) nhánh content: vẫn chọn cụm
  const cContent = pickClusterForVideo(solScenes, khoBan, { contentVideo: true, productGroup: null });
  check(cContent && cContent.id === clC.id, `video content vẫn chọn cụm (được ${cContent?.id})`);

  // (c) video bán, cluster null: hình chọn đường cũ (ưu tiên hình sản phẩm), KHÔNG by 'cluster'
  const pBan = await matchScenesToAssets({ ai: null, generate: failing, model: 'x', scenes: solScenes, assets: khoBan, productGroup: G, cluster: null, useSegments: true, log: silent });
  check(pBan.every((p) => p && p.by !== 'cluster'), `bán, cluster null: không cảnh nào đi đường cụm (${pBan.map((p) => p?.by).join(',')})`);
  check(pBan.some((p) => p.assetId === 'P1'), 'bán, cluster null: hình máy lọc dầu (thư mục sản phẩm) có mặt, không toàn clip Content');

  // (d) cắt đoạn vẫn chạy cho video bán khi clip được chọn mang segments
  const pCat = await matchScenesToAssets({ ai: null, generate: failing, model: 'x', scenes: solScenes, assets: [C1, C2, C3], productGroup: G, cluster: null, useSegments: true, log: silent });
  const withSeg = pCat.filter((p) => p?.segment);
  check(withSeg.length >= 1 && withSeg.every((p) => p.by !== 'cluster' && p.segment.assetId === p.assetId), `bán: clip mang đoạn vẫn được gán đoạn để cắt -ss/-t (${withSeg.length} cảnh có đoạn)`);
  const scsBan = [{ role: 'solution', narration: 'Lắp máy lọc dầu trong khoang máy.', visual: 'lắp máy lọc dầu', assetId: 'C1', segment: null }];
  allocateSceneSegments(scsBan, khoBan, { cluster: null, productGroup: G, log: silent });
  check(scsBan[0].segment && scsBan[0].segment.assetId === 'C1', 'bán: allocateSceneSegments với cluster null vẫn gán đoạn chính');
  check(planSceneSegments(4, scsBan[0]).pieces.length >= 1, 'bán: có kế hoạch cắt đoạn (planSceneSegments) cho cảnh');
}

console.log(fails ? `\nTHẤT BẠI: ${fails} kiểm tra` : '\nOK: mọi kiểm tra đạt');
process.exit(fails ? 1 : 0);
