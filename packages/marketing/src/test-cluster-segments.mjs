// test-cluster-segments.mjs — kiểm ĐỢT A (9/10): chọn đoạn trong clip + giữ một cụm tư liệu xuyên suốt video.
// Không gọi mạng. Chạy: npm run test:cluster
import {
  matchScenesToAssets, pickPrimaryCluster, pickClusterForVideo, pickInCluster, allocateSceneSegments, refinePicksByImagery,
  hasSegments, chooseSegment, clusterGroups, findProductSegment, countProductSegments,
} from './video/scene-match.mjs';
import {
  normalizeSegments, parseTime, planSceneSegments, segmentsEnabled, estimateSpeechSec, segKey,
  sentenceSubject, sceneNeed, segProductState, segFitLevel, progressAdjust, actionSimilarity, overlapFraction,
} from './video/segments.mjs';
import { splitLongImageScenes } from './video/rules.mjs';
import { assignClusters, zaloDateOf, clusterIdOf, needsRelabel } from './video/segment-clips.mjs';

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

// ======================================================================================================
// ĐỢT A2 (9/10): chọn đoạn phục vụ ĐÚNG CÂU đang nói.
// ======================================================================================================
const lseg = (start, end, action, lab = {}, extra = {}) => seg(start, end, action, { ...lab, ...extra });
const mkCl = (id, clipIds) => ({ id, confidence: 'chac', basis: 'x', clipIds });
const CG2 = 'Content';

console.log('18. A2.1 nhãn đoạn: chuẩn hóa + tương thích đoạn cũ');
{
  const n = normalizeSegments([
    { start: 0, end: 6, action: 'a', subject: 'Nguoi', product_visible: 'ro_sau', product_clear_from: 3, stage: 'thao-tac' },
    { start: 6, end: 12, action: 'b', subject: 'lạ', product_visible: 'ro_sau', stage: 'lạ' },            // ro_sau mà không có giây -> mo
    { start: 12, end: 18, action: 'c' },                                                                 // thiếu nhãn = không biết
    { start: 18, end: 40, action: 'd', product_visible: 'ro_sau', product_clear_from: 33 },              // đoạn dài tách 2 khúc
  ], 40);
  check(n[0].subject === 'nguoi' && n[0].stage === 'thao_tac' && n[0].product_visible === 'ro_sau' && n[0].product_clear_from === 3, 'nhãn hợp lệ được chuẩn hóa (hoa/thường, gạch nối)');
  check(n[1].subject === 'canh_chung' && n[1].stage === 'khac' && n[1].product_visible === 'mo' && n[1].product_clear_from === null, 'nhãn lạ -> giá trị trung tính; ro_sau thiếu giây hiện rõ -> mo');
  check(n[2].subject === null && n[2].product_visible === null && n[2].stage === null, 'đoạn model không gán nhãn = null (không biết)');
  const dd = n.filter((x) => x.action === 'd');
  check(dd.length === 2 && dd[0].product_visible === 'mo' && dd[1].product_visible === 'ro_sau' && dd[1].product_clear_from === 33, 'đoạn dài bị tách: khúc trước giây hiện rõ -> mo, khúc chứa giây đó giữ ro_sau');
  check(needsRelabel([seg(0, 5, 'x')]) === true && needsRelabel(n) === false && needsRelabel([]) === true, 'needsRelabel: đoạn đợt A cần mô tả lại, đoạn có nhãn thì không');
}

console.log('19. A2.2 sentenceSubject + sceneNeed');
{
  check(sentenceSubject('Nhìn người thợ ướt đẫm mồ hôi mới thấm thía hết nỗi vất vả.') === 'nguoi', 'câu thợ đẫm mồ hôi -> nguoi');
  check(sentenceSubject('Lắp ngay Máy lọc dầu SF300B với độ lọc từ 1 tới 10 micromet.') === 'san_pham', 'câu lắp Máy lọc dầu SF300B -> san_pham');
  check(sentenceSubject('Sóng biển dập dềnh suốt đêm.') === 'chung' && sentenceSubject('Miền Tây chú ý thời tiết xấu.') === 'chung', 'câu chung; "tây", "chú ý" không bị nhầm là người');
  check(sentenceSubject('Máy SDVICO-X lắp xong.', { productTerms: ['SDVICO-X'] }) === 'san_pham' && sentenceSubject('Tay bám từng con ốc dưới hầm tàu!') === 'nguoi', 'tên riêng truyền vào nhận ra sản phẩm; "Tay bám..." -> nguoi');
  const n1 = sceneNeed({ narration: 'Anh em thợ kiên nhẫn căn chỉnh. Nhìn người thợ ướt đẫm mồ hôi.' }, 'story');
  check(n1.nguoi === true && n1.product === false && n1.subject === 'nguoi', 'sceneNeed: cảnh toàn câu về người -> cần người');
  const n2 = sceneNeed({ narration: 'Lắp ngay Máy lọc dầu SF300B.' }, 'solution', { salesVideo: true });
  const n3 = sceneNeed({ narration: 'Thợ lắp xong.' }, 'solution', { salesVideo: true });
  check(n2.product && n2.productFolderOnly && n3.product && !n3.nguoi, 'video bán: cảnh solution luôn cần thấy máy, ưu tiên máy hơn người');
}

console.log('20. A2.2 câu về người phải lấy đoạn có người, dù đoạn kia điểm chữ cao hơn');
{
  const NA = { id: 'NA', kind: 'video', title: 'Hầm máy A', folder: CG2, description: 'Hầm máy tàu cá', segments: [
    lseg(0, 5, 'động cơ và đường ống cũ rỉ sét cặn bẩn trong khoang máy tàu', { subject: 'thiet_bi', stage: 'khac', product_visible: 'khong' }, { people: '0', equipment: 'động cơ, ống rỉ, cặn', setting: 'khoang máy tàu cá' }),
    lseg(5, 10, 'thợ lau mồ hôi, tay giữ cờ lê trong khoang máy', { subject: 'nguoi', stage: 'thao_tac', product_visible: 'khong' }, { people: '1 thợ', equipment: 'cờ lê', setting: 'khoang máy' }),
  ] };
  const NB = { id: 'NB', kind: 'video', title: 'Hầm máy B', folder: CG2, description: 'Hầm máy tàu cá', segments: [lseg(0, 5, 'thợ siết ốc dưới khoang máy', { subject: 'ca_hai', stage: 'thao_tac', product_visible: 'mo' }, { setting: 'khoang máy' })] };
  const cl3 = mkCl('cl-N', ['NA', 'NB']);
  const sc = { role: 'story', narration: 'Nhìn người thợ ướt đẫm mồ hôi mới thấm thía nỗi vất vả.', visual: 'đường ống động cơ rỉ cặn trong khoang máy tàu cá' };
  const ctrl = pickInCluster(cl3, [NA, NB], sc, 'story', { usedSegKeys: new Set([segKey('NB', 0)]) });
  check(ctrl.assetId === 'NA' && ctrl.segment.idx === 0, 'đối chứng: không khai nhu cầu thì đoạn động cơ/ống (điểm chữ cao) thắng');
  const need = sceneNeed(sc, 'story');
  const got = pickInCluster(cl3, [NA, NB], sc, 'story', { usedSegKeys: new Set([segKey('NB', 0)]), need });
  check(got.assetId === 'NA' && got.segment.idx === 1 && got.segment.subject === 'nguoi' && got.level === 3, 'có nhu cầu "người": lấy đoạn thợ lau mồ hôi (subject nguoi), không lấy đoạn động cơ');
  const noMan = pickInCluster(cl3, [NA], sc, 'story', { usedSegKeys: new Set([segKey('NA', 1)]), need });
  check(noMan && noMan.segment.idx === 0 && noMan.level === 0 && noMan.unmet.length > 0, 'cụm hết đoạn có người: vẫn trả đoạn còn lại (đường cũ) nhưng ghi nhu cầu chưa đáp ứng để log');
  const picks = await matchScenesToAssets({ ai: null, generate: failing, model: 'x', scenes: [sc], assets: [NA, NB], useSegments: true, cluster: cl3, log: silent });
  check(picks[0].by === 'cluster' && picks[0].segment.subject !== 'thiet_bi', 'matchScenesToAssets: cảnh nói về người không rơi vào đoạn thiết bị');
}

console.log('21. A2.2 cảnh giá / cảnh sản phẩm: đoạn thấy rõ máy, ro_sau cắt từ product_clear_from');
{
  const PG = 'SF-50';
  const mkP = (id, segs) => ({ id, kind: 'video', title: `Máy ${id}`, folder: PG, description: 'Máy lọc dầu', segments: segs });
  const needPrice = sceneNeed({ narration: 'Giá chỉ từ bốn mươi triệu.' }, 'price', { salesVideo: true });
  const sRoSau = lseg(0, 6, 'thợ vươn tay che máy lọc dầu rồi lùi ra', { product_visible: 'ro_sau', product_clear_from: 3, subject: 'ca_hai' });
  const sMo = lseg(6, 12, 'máy lọc dầu trong góc tối', { product_visible: 'mo', subject: 'thiet_bi' });
  const sRo = lseg(12, 18, 'máy lọc dầu inox đang chạy', { product_visible: 'ro_tu_dau', subject: 'thiet_bi' });
  const P1 = mkP('P1', [sRoSau, sMo]);
  const cut = chooseSegment(P1, { role: 'price', visual: 'máy đang lắp trên tàu', narration: '' }, 'price', { need: needPrice });
  check(cut && cut.idx === 0 && cut.start === 3 && cut.end === 6 && cut.cut === true, 'cảnh giá: ro_sau được cắt BẮT ĐẦU từ product_clear_from (3s), không phải từ đầu đoạn');
  const P2 = mkP('P2', [lseg(0, 6, 'thợ che máy lọc dầu', { product_visible: 'ro_sau', product_clear_from: 5, subject: 'ca_hai' }), sMo]);
  check(segProductState(P2.segments[0]).level === 0, 'ro_sau mà phần rõ còn < 1,5s (5s trên đoạn 6s) bị loại (mức 0)');
  check(findProductSegment([P2], { role: 'price', visual: 'máy', narration: '' }, 'price', {}) === null, 'findProductSegment: đoạn ro_sau còn < 1,5s không được chọn');
  const P3 = mkP('P3', [sRoSau, sRo]);
  const pr = chooseSegment(P3, { role: 'price', visual: 'máy đang lắp trên tàu, đang chạy', narration: '' }, 'price', { need: needPrice });
  check(pr.idx === 1 && !pr.cut, 'cảnh giá: ro_tu_dau thắng ro_sau (ưu tiên tuyệt đối đoạn rõ từ đầu)');
  const legacy = mkP('P4', [seg(0, 6, 'máy lọc dầu đang chạy, kỹ thuật bàn giao thiết bị sạch trong'), lseg(6, 12, 'máy', { product_visible: 'ro_tu_dau' })]);
  const lg = chooseSegment(legacy, { role: 'price', visual: 'máy đang chạy, kỹ thuật bàn giao', narration: '' }, 'price', { need: needPrice });
  check(lg.idx === 1, 'đoạn cũ chưa gán nhãn không được ưu tiên cho cảnh sản phẩm khi đã có đoạn biết là rõ');
  const lgOnly = chooseSegment(mkP('P5', [seg(0, 6, 'máy lọc dầu đang chạy, kỹ thuật bàn giao thiết bị')]), { role: 'price', visual: 'máy đang chạy', narration: '' }, 'price', { need: needPrice });
  check(lgOnly && lgOnly.idx === 0, 'clip chỉ có đoạn cũ: vẫn chọn được như trước (tương thích)');
  const cOnly = { id: 'C9', kind: 'video', title: 'Thợ', folder: CG2, segments: [lseg(0, 6, 'máy lọc dầu', { product_visible: 'ro_tu_dau' })] };
  check(segFitLevel(cOnly.segments[0], needPrice, cOnly).level === 0, 'video bán: đoạn "rõ máy" của tư liệu Content không tính (không đảm bảo đúng model)');
}

console.log('22. A2.3 diễn tiến: stage không lùi, không lặp việc cùng clip, cảnh kết không lấy lại cảnh mở');
{
  const mk = (id, segs) => ({ id, kind: 'video', title: id, folder: CG2, description: 'thợ tàu', segments: segs });
  const base = { setting: 'khoang máy tàu', people: '1 thợ', equipment: 'máy lọc dầu' };
  const Q1 = mk('Q1', [lseg(0, 6, 'thợ siết đầu nối vào thân máy lọc dầu', { stage: 'thao_tac', subject: 'nguoi' }, base), lseg(6, 12, 'thợ siết đầu nối vào thân máy lọc dầu lần nữa', { stage: 'thao_tac', subject: 'nguoi' }, base)]);
  const Q2 = mk('Q2', [lseg(0, 6, 'thợ bê máy lọc dầu vào khoang máy tàu chuẩn bị lắp', { stage: 'chuan_bi', subject: 'nguoi' }, base), lseg(6, 12, 'thợ kiểm tra van sau khi lắp xong máy lọc dầu', { stage: 'hoan_tat', subject: 'nguoi' }, base)]);
  const clQ = mkCl('cl-Q', ['Q1', 'Q2']);
  const scn = { role: 'story', narration: 'Thợ làm tiếp.', visual: 'thợ lắp máy lọc dầu trong khoang máy tàu' };
  const prev = [{ assetId: 'Q1', idx: 0, start: 0, end: 6, stage: 'thao_tac', action: 'thợ siết đầu nối vào thân máy lọc dầu' }];
  check(progressAdjust({ assetId: 'Q2', stage: 'chuan_bi', action: 'bê máy' }, prev).adj < 0 && progressAdjust({ assetId: 'Q2', stage: 'hoan_tat', action: 'kiểm tra van' }, prev).adj > 0, 'progressAdjust: stage lùi (thao_tac -> chuan_bi) bị trừ, tiến (-> hoan_tat) được cộng');
  const ctrl = pickInCluster(clQ, [Q1, Q2], scn, 'story', { usedSegKeys: new Set([segKey('Q1', 0)]), prevId: 'Q2' });
  const adv = pickInCluster(clQ, [Q1, Q2], scn, 'story', { usedSegKeys: new Set([segKey('Q1', 0)]), prevRefs: prev, progress: true });
  check(adv.segment.stage !== 'chuan_bi', `progress: sau thao_tac không quay lại chuan_bi (được ${adv.segment.stage}; đối chứng không progress: ${ctrl.segment.stage})`);
  check(actionSimilarity('thợ siết đầu nối vào thân máy lọc dầu', 'thợ siết đầu nối vào thân máy lọc dầu lần nữa') >= 0.5 && actionSimilarity('thợ siết đầu nối', 'kiểm tra van xong') < 0.5, 'actionSimilarity: việc gần giống >= 0,5; việc khác < 0,5');
  const pen = progressAdjust({ assetId: 'Q1', stage: 'thao_tac', action: 'thợ siết đầu nối vào thân máy lọc dầu lần nữa' }, prev);
  const freeA = progressAdjust({ assetId: 'Q1', stage: 'hoan_tat', action: 'thợ siết đầu nối vào thân máy lọc dầu lần nữa' }, prev);
  const freeB = progressAdjust({ assetId: 'Q1', stage: 'thao_tac', action: 'đấu nối dây điện phía trên bảng điều khiển' }, prev);
  check(pen.adj <= -8 && freeA.adj > -8 && freeB.adj > -8, 'dùng lại cùng clip: cùng stage + việc giống bị phạt nặng; đổi stage hoặc việc mới thì cho qua');
  const rep = pickInCluster(clQ, [Q1, Q2], scn, 'story', { usedSegKeys: new Set([segKey('Q1', 0), segKey('Q2', 0), segKey('Q2', 1)]), prevRefs: prev, progress: true });
  check(rep && rep.assetId === 'Q1', 'phạt là mềm: hết đoạn khác thì vẫn dùng lại được (không làm rỗng)');
  // cảnh kết không trùng khoảng giây của cảnh mở (>50%): dựng đoạn chồng nhau cùng clip
  const R1 = mk('R1', [lseg(0, 6, 'thợ lắp máy lọc dầu', { stage: 'thao_tac', subject: 'nguoi' }, base), lseg(2, 8, 'thợ lắp máy lọc dầu', { stage: 'thao_tac', subject: 'nguoi' }, base), lseg(10, 16, 'thợ bàn giao máy lọc dầu', { stage: 'hoan_tat', subject: 'nguoi' }, base)]);
  const clR = mkCl('cl-R', ['R1']);
  const open = { assetId: 'R1', idx: 0, start: 0, end: 6, stage: 'thao_tac', action: 'thợ lắp máy lọc dầu' };
  const cEnd = pickInCluster(clR, [R1], { role: 'closing', narration: 'Thợ bàn giao.', visual: 'thợ lắp máy lọc dầu' }, 'closing', { usedSegKeys: new Set([segKey('R1', 0)]), closing: true, openRef: open });
  check(cEnd.segment.idx === 2, 'cảnh kết bỏ đoạn chồng > 50% giây với đoạn cảnh mở (đoạn 2-8s vs 0-6s), lấy đoạn bàn giao');
  check(Math.abs(overlapFraction(0, 6, 2, 8) - 4 / 6) < 1e-9 && overlapFraction(0, 6, 7, 9) === 0, 'overlapFraction đo đúng');
}

console.log('23. A2.3 đoạn nối: không nối hai đoạn cùng clip cùng stage liền nhau nếu cụm còn đoạn khác');
{
  const mk = (id, segs) => ({ id, kind: 'video', title: id, folder: CG2, description: 'thợ', segments: segs });
  const base = { setting: 'khoang máy tàu', people: '1 thợ', equipment: 'máy lọc dầu' };
  const T1 = mk('T1', [lseg(0, 4, 'thợ siết ốc máy lọc dầu', { stage: 'thao_tac' }, base), lseg(4, 8, 'thợ siết ốc máy lọc dầu góc khác', { stage: 'thao_tac' }, base)]);
  const T2 = mk('T2', [lseg(0, 4, 'thợ kiểm tra máy lọc dầu sau lắp', { stage: 'hoan_tat' }, base)]);
  const clT = mkCl('cl-T', ['T1', 'T2']);
  const longN = 'Thợ siết từng con ốc cho chắc tay rồi kiểm tra từng chỗ nối máy lọc dầu.';
  const sc1 = [{ role: 'story', narration: longN, visual: 'thợ siết ốc máy lọc dầu', assetId: 'T1', segment: null }];
  allocateSceneSegments(sc1, [T1, T2], { cluster: clT, contentVideo: true, log: silent });
  const ids1 = [sc1[0].segment, ...sc1[0].extraSegments].map((r) => `${r.assetId}#${r.idx}`);
  check(ids1.includes('T2#0') && !(ids1.includes('T1#0') && ids1.includes('T1#1')), `content + cụm: đoạn nối lấy clip khác thay vì hai đoạn thao_tac liền nhau (${ids1.join(', ')})`);
  const sc2 = [{ role: 'story', narration: longN, visual: 'thợ siết ốc máy lọc dầu', assetId: 'T1', segment: null }];
  allocateSceneSegments(sc2, [T1], { cluster: mkCl('cl-T1', ['T1']), contentVideo: true, log: silent });
  check(sc2[0].extraSegments.length === 1 && sc2[0].extraSegments[0].assetId === 'T1', 'cụm không còn đoạn khác: đành nối đoạn cùng stage còn lại (hơn giữ khung cuối)');
}

console.log('24. A2.4 video bán dùng cụm theo NGÀY khi đủ đoạn thấy rõ máy');
{
  const PG = '6. Thiết bị lọc dầu SF-50';
  const clD = { id: '2026-09-19|ca-ngay|1', confidence: 'chac', basis: 'cùng buổi' };
  const base = { setting: 'khoang máy tàu cá', people: '1 thợ', equipment: 'máy lọc dầu inox' };
  const CC1 = { id: 'CC1', kind: 'video', title: 'Thợ trong hầm', folder: CG2, description: 'thợ sửa máy', shoot_cluster: clD, segments: [lseg(0, 6, 'thợ ngồi thao tác với dây dẫn trong khoang máy', { subject: 'nguoi', product_visible: 'khong', stage: 'chuan_bi' }, base)] };
  const CC2 = { id: 'CC2', kind: 'video', title: 'Dầu cặn', folder: CG2, description: 'ống dầu cặn', shoot_cluster: clD, segments: [lseg(0, 6, 'đường ống dầu bám cặn đen trong khoang máy', { subject: 'thiet_bi', product_visible: 'mo', stage: 'khac' }, base)] };
  const PP1 = { id: 'PP1', kind: 'video', title: 'Máy SF50 lắp', folder: PG, description: 'Máy lọc dầu SF-50', shoot_cluster: clD, segments: [lseg(0, 6, 'kỹ thuật viên lắp máy lọc dầu inox lên vách', { subject: 'ca_hai', product_visible: 'ro_tu_dau', stage: 'thao_tac' }, base), lseg(6, 12, 'máy lọc dầu inox chạy êm, đồng hồ áp suất', { subject: 'thiet_bi', product_visible: 'ro_sau', product_clear_from: 8, stage: 'van_hanh' }, base)] };
  const scs = [
    { role: 'hook', narration: 'Cứ đổ dầu là nghĩ máy chạy bon bon.', visual: 'thợ trong khoang máy tàu cá' },
    { role: 'empathy', narration: 'Dầu lẫn cặn làm hỏng kim phun.', visual: 'đường ống dầu bám cặn' },
    { role: 'solution', narration: 'Lắp ngay máy lọc dầu giúp dầu sạch hơn.', visual: 'lắp máy lọc dầu trong khoang máy' },
  ];
  const all2 = [CC1, CC2, PP1];
  check(countProductSegments([CC1, CC2, PP1]) === 2 && countProductSegments([{ ...PP1, folder: CG2 }]) === 0, 'đếm đoạn thấy rõ máy: chỉ tư liệu thư mục sản phẩm, ro_tu_dau + ro_sau còn đủ dài');
  const c1 = pickClusterForVideo(scs, all2, { contentVideo: false, productGroup: PG, hasPriceScene: false });
  check(c1 && c1.id === clD.id, 'bán, 1 cảnh solution, cụm có 2 đoạn thấy rõ máy -> dùng cụm');
  const c2 = pickClusterForVideo(scs, all2, { contentVideo: false, productGroup: PG, hasPriceScene: true });
  check(c2 && c2.id === clD.id, 'bán, solution + cảnh giá = 2 đoạn cần, cụm có đủ 2 -> dùng cụm');
  const only1 = [CC1, CC2, { ...PP1, segments: [PP1.segments[0], lseg(6, 12, 'máy', { product_visible: 'ro_sau', product_clear_from: 11, stage: 'van_hanh' }, base)] }];
  check(pickClusterForVideo(scs, only1, { contentVideo: false, productGroup: PG, hasPriceScene: true }) === null, 'bán, cần solution + giá nhưng cụm chỉ còn 1 đoạn đủ dài (ro_sau còn 1s) -> null (đường cũ, như dbce022)');
  check(pickClusterForVideo(scs, [CC1, CC2, { ...PP1, segments: [seg(0, 6, 'máy lọc dầu'), seg(6, 12, 'máy lọc dầu')] }], { contentVideo: false, productGroup: PG }) === null, 'bán, đoạn sản phẩm cũ chưa gán nhãn -> không tính là thấy rõ -> null');
  const picksD = await matchScenesToAssets({ ai: null, generate: failing, model: 'x', scenes: scs, assets: all2, productGroup: PG, cluster: c1, useSegments: true, salesVideo: true, log: silent });
  check(picksD[2].assetId === 'PP1' && picksD[2].segment.idx === 0 && picksD[2].segment.product_visible === 'ro_tu_dau', 'cụm bán: cảnh solution lấy đoạn thấy rõ máy trong cụm (ro_tu_dau)');
  check(picksD.slice(0, 2).every((p) => p.by === 'cluster' && ['CC1', 'CC2'].includes(p.assetId)), 'cụm bán: hook / empathy lấy tư liệu đời sống TRONG cụm (cùng buổi quay)');
}

console.log('25. A2.2 video bán không cụm: cảnh sản phẩm đổi sang đoạn thấy rõ máy khi clip đã chọn chỉ có đoạn mờ');
{
  const PG = '6. Thiết bị lọc dầu SF-50';
  const base = { setting: 'khoang máy tàu cá', people: '1 thợ', equipment: 'máy lọc dầu inox' };
  const M1 = { id: 'M1', kind: 'video', title: 'Máy lọc dầu đang chạy bàn giao thiết bị', folder: PG, description: 'Máy lọc dầu đang chạy, kỹ thuật bàn giao thiết bị sạch trong', segments: [lseg(0, 6, 'thợ che máy lọc dầu đang chạy', { product_visible: 'mo', subject: 'nguoi', stage: 'van_hanh' }, base)] };
  const M2 = { id: 'M2', kind: 'video', title: 'Máy lọc dầu lắp', folder: PG, description: 'lắp máy lọc dầu', segments: [lseg(0, 6, 'máy lọc dầu inox lắp trên vách', { product_visible: 'ro_tu_dau', subject: 'thiet_bi', stage: 'thao_tac' }, base)] };
  const scs = [{ role: 'solution', narration: 'Lắp ngay máy lọc dầu, kỹ thuật bàn giao thiết bị.', visual: 'máy lọc dầu đang chạy, kỹ thuật bàn giao thiết bị' }];
  const pk = await matchScenesToAssets({ ai: null, generate: failing, model: 'x', scenes: scs, assets: [M1, M2], productGroup: PG, cluster: null, useSegments: true, salesVideo: true, log: silent });
  check(pk[0].assetId === 'M2' && pk[0].by === 'product-seg' && pk[0].segment.product_visible === 'ro_tu_dau', 'bán: M1 điểm chữ cao nhưng mọi đoạn đều mờ -> đổi sang M2 có đoạn ro_tu_dau');
  const pkNoAlt = await matchScenesToAssets({ ai: null, generate: failing, model: 'x', scenes: scs, assets: [M1], productGroup: PG, cluster: null, useSegments: true, salesVideo: true, log: silent });
  check(pkNoAlt[0].assetId === 'M1' && pkNoAlt[0].segment, 'kho không có đoạn thấy rõ máy nào khác: giữ clip đã chọn (không để trống cảnh)');
  const pkContent = await matchScenesToAssets({ ai: null, generate: failing, model: 'x', scenes: scs, assets: [M1, M2], productGroup: PG, cluster: null, useSegments: true, salesVideo: false, log: silent });
  check(pkContent[0].by !== 'product-seg', 'không phải video bán: không áp luật đổi sang đoạn thấy rõ máy');
}

console.log(fails ? `\nTHẤT BẠI: ${fails} kiểm tra` : '\nOK: mọi kiểm tra đạt');
process.exit(fails ? 1 : 0);
