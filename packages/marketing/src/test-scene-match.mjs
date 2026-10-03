// test-scene-match.mjs — kiểm luật khớp cảnh ↔ tư liệu (không gọi mạng). Chạy: npm run test:scene
// Bài toán sếp nêu 15/9: kịch bản "máy hư, nước đục" KHÔNG được chiếu ảnh máy mới bóng.
import { matchScenesToAssets, pickByRole, ruleScore, problemPool, refinePicksByImagery, pickStoryboard, storyboardDrift, storyboardDriftKeChuyen } from './video/scene-match.mjs';

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

// 17/9 (bài 8c8347a4: lời "cảng cá sương mờ" nhưng clip văn phòng): điểm khớp cảnh 1 phải là
// điểm THẬT, không gán cứng 10 — kịch bản lệch clip thì fit thấp để script.mjs sinh lại.
console.log('5. Clip bắt buộc nhưng lời lệch -> fit thấp, không phải 10');
const officeAssets = [...assets, { id: 'v-office', kind: 'video', title: 'Nhan vien van phong thao tac may tinh', folder: 'Content', description: 'Nhan vien nu ngoi truoc may tinh van phong, cuoi vui ve, khong co thiet bi tau ca', label: 'CLIP THẬT MỚI', fresh: true }];
const mismatchScenes = [{ role: 'hook', narration: 'Sáng sớm sương mờ buông xuống cảng cá vắng lặng.', visual: 'Bình minh sương mờ trên cảng cá vắng lặng' }, ...scenes.slice(1)];
const picks4 = await matchScenesToAssets({ ai: null, generate: failing, model: 'x', scenes: mismatchScenes, assets: officeAssets, mustUseAssetId: 'v-office', log: { warn() {}, log() {} } });
check(picks4[0].assetId === 'v-office' && picks4[0].by === 'must', 'cảnh 1 vẫn dùng clip bắt buộc (luật 9/9 giữ)');
check(picks4[0].fit < 5, `fit thật khi lệch (${picks4[0].fit}) phải dưới 5, không gán cứng 10`);
const matchScenes2 = [{ role: 'hook', narration: 'Ngồi văn phòng nhìn màn hình máy tính, nhớ biển.', visual: 'nhân viên văn phòng ngồi trước máy tính' }, ...scenes.slice(1)];
const picks5 = await matchScenesToAssets({ ai: null, generate: failing, model: 'x', scenes: matchScenes2, assets: officeAssets, mustUseAssetId: 'v-office', log: { warn() {}, log() {} } });
check(picks5[0].fit >= 5, `lời khớp clip thì fit khá (${picks5[0].fit} >= 5)`);

// 17/9 chiều (video lọc nước 7e9cab1a: "thợ máy sửa lần thứ ba" trên hình máy SEA-40 của công ty đang chạy):
// clip sản phẩm đang chạy ép vào cảnh GIẢI PHÁP (mustUseIndex), cảnh 1 phải là tư liệu khác.
console.log('6. Clip máy đang chạy ép vào cảnh giải pháp, không vào cảnh 1');
const picks6 = await matchScenesToAssets({ ai: null, generate: failing, model: 'x', scenes, assets, mustUseAssetId: 'v-install', mustUseIndex: 2, log: { warn() {}, log() {} } });
check(picks6[2].assetId === 'v-install' && picks6[2].by === 'must', 'cảnh 3 (solution) = clip bắt buộc');
check(picks6[0].assetId !== 'v-install' && picks6[0].by !== 'must', 'cảnh 1 không dùng clip máy đang chạy');
const picks7 = await matchScenesToAssets({ ai: null, generate: failing, model: 'x', scenes, assets, mustUseAssetId: 'v-boat', mustUseIndex: 99, log: { warn() {}, log() {} } });
check(picks7[2].assetId === 'v-boat' && picks7[2].by === 'must', 'mustUseIndex vượt số cảnh thì kẹp về cảnh cuối');

// 17/9 chiều (2): cảnh vấn đề chiếu ảnh đồng hồ máy SEA-40 (folder sản phẩm, không có từ "mới bóng" nên luật
// cũ không bác). Nay cảnh vấn đề chỉ lấy kho Content hoặc tư liệu quay sự cố.
console.log('7. Cảnh vấn đề không được dùng tư liệu folder sản phẩm (kể cả không "mới bóng")');
const gaugeAssets = [...assets, { id: 'a-gauge', kind: 'image', title: 'Cụm đồng hồ áp suất và màng lọc máy lọc nước biển SEA-40', folder: '2. Máy lọc nước biển SEA-40', description: 'Cận cảnh đồng hồ áp suất và hệ thống ống dẫn của thiết bị trong nhà xưởng' }];
const gaugeModel = async () => ({ text: JSON.stringify({ picks: [{ scene: 1, asset_id: 'a-gauge', fit: 8, why: 'có máy lọc nước' }, { scene: 2, asset_id: 'v-boat', fit: 8, why: 'tàu' }, { scene: 3, asset_id: 'v-install', fit: 9, why: 'lắp' }] }) });
const picks8 = await matchScenesToAssets({ ai: null, generate: gaugeModel, model: 'x', scenes, assets: gaugeAssets, log: { warn() {}, log() {} } });
check(picks8[0].assetId !== 'a-gauge' && ['a-dirty', 'v-boat'].includes(picks8[0].assetId), `cảnh hook bác ảnh đồng hồ máy công ty, lấy kho Content (${picks8[0].assetId})`);
check(problemPool(gaugeAssets, 'hook').every((a) => a.folder === 'Content'), 'problemPool(hook) chỉ còn kho Content');
check(problemPool(gaugeAssets, 'solution').length === gaugeAssets.length, 'problemPool(solution) giữ nguyên');
const faultClip = { id: 'v-fault', kind: 'video', title: 'Xử lý sự cố máy lọc dầu SD12-300', folder: '9. Máy Lọc Dầu Diesel SD12-300', description: 'thợ tháo cốc lọc đầy cặn' };
check(problemPool([faultClip, assets[0]], 'hook').some((a) => a.id === 'v-fault') && !problemPool([faultClip, assets[0]], 'hook').some((a) => a.id === 'a-new'), 'clip quay sự cố ở folder sản phẩm vẫn được vào cảnh vấn đề');

// 17/9 chiều (3): kho Content lẫn ảnh ruột máy lọc dầu, bình inox, văn bản, bánh sinh nhật -> cảnh nỗi đau
// chỉ lấy tư liệu đời sống nghề (tàu, cảng, ngư dân, khoang máy).
console.log('8. Cảnh nỗi đau không lấy ảnh ruột máy / giấy tờ / văn phòng dù nằm ở kho Content');
const messyContent = [
  { id: 'c-parts', kind: 'image', title: 'Hậu trường lắp ráp thiết bị tàu cá của SDVICO', folder: 'Content', description: 'Canh goc close-up hai ong thiet bi cu co dau ban va linh kien ben trong' },
  { id: 'c-tank', kind: 'image', title: 'Bình chứa inox chuyên dụng dùng cho thiết bị tàu cá', folder: 'Content', description: 'Binh loc dau va nuoc bien bang inox co nhieu vet ban' },
  { id: 'c-cake', kind: 'image', title: 'Bánh kem mừng kỷ niệm sinh nhật tại văn phòng', folder: 'Content', description: 'Bánh kem đặt trên bàn làm việc' },
  { id: 'c-doc', kind: 'image', title: 'Nghị quyết của Hội đồng nhân dân', folder: 'Content', description: 'Văn bản pháp lý' },
  { id: 'c-boat', kind: 'image', title: 'Tàu cá neo đậu tại cảng trong chuyến đi biển', folder: 'Content', description: 'Tau ca cu, son bong troc, co nguoi dang sua chua tren tau' },
  { id: 'c-engine', kind: 'image', title: 'Thợ máy đang kiểm tra sửa chữa động cơ tàu cá', folder: 'Content', description: 'Hai thợ máy đang đứng sửa chữa phần động cơ trên tàu cá' },
  assets[3],
];
const G2 = '2. Máy lọc nước biển SEA-40';
const pool8 = problemPool(messyContent, 'empathy', G2).map((a) => a.id);
check(pool8.includes('c-boat') && pool8.includes('c-engine'), `giữ tàu cũ + thợ máy (${pool8.join(',')})`);
check(!pool8.some((id) => ['c-parts', 'c-tank', 'c-cake', 'c-doc', 'v-install'].includes(id)), 'loại ruột máy, bình inox, bánh kem, văn bản, clip lắp đặt');
const waterScenes = [{ role: 'hook', narration: 'Thùng chứa trên boong cạn sạch nước rồi anh em ơi!', visual: 'thùng nước cạn đáy trên boong tàu' }, { role: 'empathy', narration: 'Hết nước ngọt đành nhổ neo quay bờ sớm.', visual: 'tàu cá quay về cảng' }, scenes[2]];
const partsModel = async () => ({ text: JSON.stringify({ picks: [{ scene: 1, asset_id: 'c-parts', fit: 8, why: 'ống' }, { scene: 2, asset_id: 'c-tank', fit: 8, why: 'bình' }, { scene: 3, asset_id: 'v-install', fit: 9, why: 'lắp' }] }) });
const picks9 = await matchScenesToAssets({ ai: null, generate: partsModel, model: 'x', scenes: waterScenes, assets: messyContent, productGroup: G2, log: { warn() {}, log() {} } });
check(['c-boat', 'c-engine'].includes(picks9[0].assetId) && ['c-boat', 'c-engine'].includes(picks9[1].assetId), `cảnh hết nước không còn ảnh ruột máy lọc dầu (${picks9[0].assetId}, ${picks9[1].assetId})`);
check(picks9[0].assetId !== picks9[1].assetId, 'hai cảnh nỗi đau liền nhau khác tư liệu');
// Cùng kho đó nhưng video LỌC DẦU: cốc lọc dầu đầy cặn (a-dirty) là nỗi đau đúng, phải được giữ; video lọc nước thì loại.
const G9 = '9. Máy Lọc Dầu Diesel SD12-300';
check(problemPool([...messyContent, assets[1]], 'hook', G9).some((a) => a.id === 'a-dirty'), 'video lọc dầu: cốc lọc dầu cặn đen vẫn được vào cảnh nỗi đau');
check(!problemPool([...messyContent, assets[1]], 'hook', G2).some((a) => a.id === 'a-dirty'), 'video lọc nước: cốc lọc dầu cặn đen bị loại khỏi cảnh nỗi đau');

// 17/9 vòng 9 (ChatGPT chấm lọc nước 60/100: cảnh 1 "thùng inox trên boong" chiếu ảnh "Hội thảo tập
// huấn ngư dân"): ảnh hội thảo / tập huấn / trình chiếu không phải đời sống nghề, phải rời kho nỗi đau.
const seminar = { id: 'c-seminar', kind: 'image', title: 'Hội thảo tập huấn và phổ biến thiết bị cho ngư dân', folder: 'Content', description: 'Khung cảnh hội thảo tập huấn có đông đảo ngư dân, màn hình trình chiếu và người thuyết trình ở bục phát biểu' };
const pool10 = problemPool([...messyContent, seminar], 'hook', G2).map((a) => a.id);
check(!pool10.includes('c-seminar'), `ảnh hội thảo bị loại khỏi cảnh nỗi đau (${pool10.join(',')})`);
check(pool10.includes('c-boat'), 'tàu cũ vẫn ở lại kho nỗi đau');

// 17/9 vòng 9 (ChatGPT: ảnh SF300B đứng 13,7 giây — model chọn cùng tư liệu cho 2 cảnh giải pháp liền
// nhau, luật "không trùng cảnh liền trước" mới chỉ nằm trong prompt): pick trùng prevId phải bị chọn lại.
const dupScenes = [
  { role: 'solution', narration: 'Đã có máy lọc dầu SF300B giữ dầu sạch.', visual: 'máy lọc dầu SF300B' },
  { role: 'reward', narration: 'Kim phun với bơm cao áp được bảo vệ.', visual: 'máy đang chạy trên tàu' },
];
const dupModel = async () => ({ text: JSON.stringify({ picks: [{ scene: 1, asset_id: assets[0].id, fit: 9, why: 'máy' }, { scene: 2, asset_id: assets[0].id, fit: 9, why: 'máy' }] }) });
const picks11 = await matchScenesToAssets({ ai: null, generate: dupModel, model: 'x', scenes: dupScenes, assets, log: { warn() {}, log() {} } });
check(picks11[0].assetId === assets[0].id, 'cảnh 1 giữ pick của model');
check(picks11[1].assetId !== picks11[0].assetId, `2 cảnh liền nhau không trùng tư liệu (${picks11[0].assetId} vs ${picks11[1].assetId})`);

// 29/9 (Thanh: "1 số video gần đây bắt đầu dùng chung video nội bộ" — 5 video 23-29/9 chung đúng 4 clip):
// tư liệu vừa lên nhiều video 2 tuần qua phải nhường chỗ khi kho còn cái khác hợp.
console.log('12. Xoay kho: tư liệu vừa lên nhiều video gần đây phải nhường chỗ');
const twin = { id: 'v-boat-2', kind: 'video', title: 'Ghe cá về bến chiều muộn', folder: 'Content', description: 'Clip ghe gỗ cũ về bến, ngư dân khiêng cá, khoang máy tàu | Hợp cảnh: doi_song' };
const recentUse = new Map([['v-boat', 3]]);
check(pickByRole([assets[2], twin], 'hook', { recentUse }).id === 'v-boat-2', 'pickByRole né clip đã lên 3 video, lấy clip cùng loại ít dùng');
const wornModel = async () => ({ text: JSON.stringify({ picks: [{ scene: 1, asset_id: 'v-boat', fit: 9, why: 'tàu' }, { scene: 2, asset_id: 'a-dirty', fit: 8, why: 'cặn' }, { scene: 3, asset_id: 'v-install', fit: 9, why: 'lắp' }] }) });
const picks12 = await matchScenesToAssets({ ai: null, generate: wornModel, model: 'x', scenes, assets: [...assets, twin], recentUse, log: { warn() {}, log() {} } });
check(picks12[0].assetId !== 'v-boat', `cảnh 1: model chọn clip đã lên 3 video bị ép chọn lại (${picks12[0].assetId})`);
check(picks12[1].assetId && picks12[1].assetId !== picks12[0].assetId, 'cảnh 2: có tư liệu và không trùng cảnh 1 (cảnh 1 đổi thành a-dirty nên pick a-dirty của model nhường theo luật liền kề)');
const picks13 = await matchScenesToAssets({ ai: null, generate: wornModel, model: 'x', scenes, assets, recentUse: new Map([['v-boat', 3], ['a-dirty', 3]]), log: { warn() {}, log() {} } });
check(picks13[0] && picks13[0].assetId, 'kho toàn tư liệu mòn: vẫn chọn được, không để cảnh trống');

// 1/10 (Thanh xem 22452d7f: "đội ngũ kỹ thuật đi dây điện" trên hình cảng cá + tàu): cảnh cần
// NGƯỜI THỢ thì tư liệu toàn tàu/cảng không người làm việc phải thua tư liệu có thợ, kể cả khi
// tư liệu thợ bị recentUse phạt và tư liệu cảng đầy từ nghề biển.
console.log('13. Cảnh cần người thợ không được chiếu cảng cá chung chung');
const portClip = { id: 'v-port', kind: 'video', title: 'Cảnh ngư dân chuẩn bị ra khơi ở cảng', folder: 'Content', description: 'Cảnh hoạt động nhộn nhịp tại cảng cá, tàu thuyền neo đậu, ngư dân, biển, ra khơi | Hợp cảnh: doi_song' };
const techClip = { id: 'v-tech', kind: 'video', title: 'Thợ kỹ thuật lắp đặt thiết bị trong khoang máy', folder: 'Content', description: 'Thợ đang thao tác lắp đặt thiết bị trong khoang máy tàu chật hẹp | Hợp cảnh: van_de' };
const techScene = { role: 'story', narration: 'Đội ngũ kỹ thuật cúi gằm đi dây điện cho chuẩn xác.', visual: 'thợ kỹ thuật đang đi dây điện lắp đặt trong khoang máy' };
check(pickByRole([portClip, techClip], 'story', { visual: techScene.visual, recentUse: new Map([['v-tech', 3]]) }).id === 'v-tech', 'clip thợ thắng ảnh cảng dù bị phạt xoay kho');
const portModel = async () => ({ text: JSON.stringify({ picks: [{ scene: 1, asset_id: 'v-port', fit: 8, why: 'cảng' }] }) });
const picks14 = await matchScenesToAssets({ ai: null, generate: portModel, model: 'x', scenes: [techScene], assets: [portClip, techClip], log: { warn() {}, log() {} } });
check(picks14[0].assetId === 'v-tech', `model chọn cảng cho cảnh cần thợ bị ép chọn lại (${picks14[0].assetId})`);
const seaScene = { role: 'empathy', narration: 'Tàu nằm bờ chờ con nước.', visual: 'tàu cá neo đậu ở cảng' };
check(pickByRole([portClip, techClip], 'empathy', { visual: seaScene.visual }).id === 'v-port', 'cảnh không cần thợ vẫn chọn được ảnh cảng');

// 1/10 (2) (Thanh: bài 22452d7f dựng lần 2 vẫn cảnh 2 đọc "chòng chành sóng nước" trên hình CẢNG CÁ TRÊN BỜ):
// sau khi ghép hình phải soát lời từng cảnh với mô tả hình đã chọn.
console.log('14. Soát sau ghép: lời lệch hình thì đổi hình / cắt câu / cảnh báo');
const quiet = { warn() {}, log() {} };
const portShore = { id: 'v-port2', kind: 'video', title: 'Cảnh ngư dân chuẩn bị ra khơi ở cảng', folder: 'Content', description: 'Cảnh nhộn nhịp tại cảng cá trên bờ, tàu neo đậu, ngư dân chuẩn bị ra khơi | Hợp cảnh: doi_song' };
const seaClip = { id: 'v-sea', kind: 'video', title: 'Thợ sửa máy trên biển', folder: 'Content', description: 'Thợ sửa máy trên tàu giữa biển, sóng nước chòng chành, thao tác trong khoang máy | Hợp cảnh: doi_song' };
const swayScene = { role: 'empathy', narration: 'Mồ hôi vã ra giữa không gian chòng chành sóng nước.', visual: 'ngư dân làm việc trên tàu giữa biển' };
const mk = (id) => ({ assetId: id, fit: 7, why: 'x', by: 'model' });
const r1 = refinePicksByImagery({
  scenes: [{ role: 'hook', narration: 'Máy khục khặc.', visual: 'tàu' }, swayScene, { role: 'solution', narration: 'Lắp máy xong.', visual: 'máy' }],
  picks: [mk('a-new'), mk('v-port2'), mk('v-install')], assets: [portShore, seaClip, assets[0], assets[3]], log: quiet,
});
check(r1.picks[1].assetId === 'v-sea' && r1.picks[1].by === 'imagery', `lời biển động trên hình cảng đổi sang ảnh biển (${r1.picks[1].assetId}/${r1.picks[1].by})`);
check(r1.narrations[1] === swayScene.narration, 'đổi hình được thì giữ nguyên lời');
const calm = { role: 'empathy', narration: 'Tàu nằm bờ chờ con nước.', visual: 'tàu nằm bờ' };
const r2 = refinePicksByImagery({ scenes: [{ role: 'hook', narration: 'Máy khục khặc.', visual: 'tàu' }, calm], picks: [mk('a-new'), mk('v-port2')], assets: [portShore, seaClip, assets[0]], log: quiet });
check(r2.picks[1].assetId === 'v-port2' && r2.picks[1].by === 'model', 'lời khớp hình thì pick giữ nguyên');
const twoSent = { role: 'empathy', narration: 'Mồ hôi vã ra giữa không gian chòng chành sóng nước. Tàu nằm bờ chờ con nước.', visual: 'tàu' };
const r3 = refinePicksByImagery({ scenes: [{ role: 'hook', narration: 'Máy khục khặc.', visual: 'tàu' }, twoSent], picks: [mk('a-new'), mk('v-port2')], assets: [portShore], log: quiet });
check(r3.picks[1].assetId === 'v-port2', 'kho không còn hình hợp thì không đổi');
check(r3.narrations[1] === 'Tàu nằm bờ chờ con nước.', `cắt câu lệch, còn câu sạch (${r3.narrations[1]})`);
const r4 = refinePicksByImagery({ scenes: [{ role: 'hook', narration: 'Máy khục khặc.', visual: 'tàu' }, swayScene], picks: [mk('a-new'), mk('v-port2')], assets: [portShore], log: quiet });
check(r4.narrations[1] === swayScene.narration, 'cắt sẽ rỗng thì GIỮ NGUYÊN lời');
check(r4.picks[1].why.includes('CẢNH BÁO'), `ghi CẢNH BÁO vào why cho người duyệt (${r4.picks[1].why})`);
const r5 = refinePicksByImagery({
  scenes: [{ role: 'empathy', narration: swayScene.narration, visual: swayScene.visual }, calm],
  picks: [{ assetId: 'v-port2', fit: 8, why: 'clip thật bắt buộc', by: 'must' }, mk('a-dirty')], assets: [portShore, seaClip, assets[1]], mustIdx: 0, log: quiet,
});
check(r5.picks[0].assetId === 'v-port2' && r5.picks[0].by === 'must' && r5.narrations[0] === swayScene.narration, 'cảnh must được miễn, không đổi gì');
const r6 = refinePicksByImagery({
  scenes: [swayScene, { role: 'hook', narration: 'Máy khục khặc.', visual: 'tàu' }],
  picks: [mk('v-port2'), mk('a-dirty')], assets: [portShore, seaClip, assets[1]], skip: [0], log: quiet,
});
check(r6.picks[0].assetId === 'v-port2', 'cảnh nằm trong skip (hookPin ghi đè) cũng được miễn');

// 1/10 (2) (ban dung lan 3: LOI "anh em ky thuat can chinh" van len hinh cang vi "hinh can" cua
// model viet chung chung): needsWorker phai xet ca LOI DOC, khong chi truong visual.
console.log('15. Lời đọc nhắc kỹ thuật thì hình cảng thua, dù hình-cần chung chung');
{
  const portClip2 = { id: 'v-port2', kind: 'video', title: 'Cảnh ngư dân chuẩn bị ra khơi ở cảng', folder: 'Content', description: 'Cảnh hoạt động nhộn nhịp tại cảng cá, tàu thuyền neo đậu, ngư dân, biển, ra khơi' };
  const techClip2 = { id: 'v-tech2', kind: 'video', title: 'Thợ kỹ thuật lắp đặt thiết bị trong khoang máy', folder: 'Content', description: 'Thợ đang thao tác lắp đặt thiết bị trong khoang máy tàu chật hẹp' };
  const sc = { role: 'story', narration: 'Anh em kỹ thuật vẫn kiên nhẫn căn chỉnh từng li cho thật chuẩn xác.', visual: 'không khí làm việc khẩn trương trên tàu' };
  check(pickByRole([portClip2, techClip2], 'story', { visual: sc.visual, speech: sc.narration, recentUse: new Map([['v-tech2', 3]]) }).id === 'v-tech2', 'lời nhắc kỹ thuật: clip thợ thắng ảnh cảng dù visual chung chung');
  const portModel2 = async () => ({ text: JSON.stringify({ picks: [{ scene: 1, asset_id: 'v-port2', fit: 8, why: 'cảng' }] }) });
  const picks15 = await matchScenesToAssets({ ai: null, generate: portModel2, model: 'x', scenes: [sc], assets: [portClip2, techClip2], log: { warn() {}, log() {} } });
  check(picks15[0].assetId === 'v-tech2', 'model chọn cảng bị bác theo LỜI ĐỌC (' + picks15[0].assetId + ')');
}

// 1/10 (Thanh bỏ bài 22452d7f sau 5 bản dựng "viết lời trước, ghép hình sau"): video CONTENT chọn TRỌN
// BỘ hình trước, rồi mới viết lời theo bộ hình. pickStoryboard trả bộ 3-4 tư liệu theo thứ tự cảnh.
console.log('16. pickStoryboard: chọn trọn bộ hình trước khi viết lời');
{
  const mkClip = (id, desc, extra = {}) => ({ id, kind: 'video', title: `Clip ${id}`, folder: 'Content', description: desc, ...extra });
  const c1 = mkClip('s-c1', 'Ngư dân kéo lưới trên boong tàu cá, sóng biển nhẹ, trời sáng sớm');
  const c2 = mkClip('s-c2', 'Thợ máy kiểm tra động cơ trong khoang máy tàu cá, tay siết ốc');
  const c3 = mkClip('s-c3', 'Tàu cá neo đậu ở cảng, ngư dân chuẩn bị ra khơi, bốc xếp đá lạnh');
  const c4 = mkClip('s-c4', 'Thợ kỹ thuật lắp đặt thiết bị lên tàu cá, đang thao tác trong khoang máy');
  const img = { id: 's-img', kind: 'image', title: 'Ảnh tàu cá', folder: 'Content', description: '' };
  const kho = [img, c1, c2, c3, c4];
  const sb = pickStoryboard(kho, { mustAsset: c3 });
  check(Array.isArray(sb) && sb.length === 4, `kho đủ thì bộ 4 hình (${sb && sb.length})`);
  check(sb[0].id === 's-c3', 'clip bắt buộc luôn đứng đầu bộ');
  check(new Set(sb.map((a) => a.id)).size === sb.length, 'không trùng tư liệu trong bộ');
  check(!sb.some((a) => a.id === 's-img'), 'ảnh không mô tả xếp sau clip có mô tả (kho đủ clip thì không vào bộ)');
  const sbNoMust = pickStoryboard(kho, {});
  check(sbNoMust.length === 4 && sbNoMust.every((a) => a.kind === 'video'), 'không có clip bắt buộc: vẫn ưu tiên clip có mô tả');
  // Né recentUse: 4 clip y hệt nhau, 1 cái vừa lên 3 video thì bị loại khi chỉ lấy 3.
  const same = 'Tàu cá neo ở cảng, ngư dân sắp xếp lưới trên boong tàu buổi sáng';
  const tt = ['t-1', 't-2', 't-3', 't-4'].map((id) => mkClip(id, same));
  const sbRecent = pickStoryboard(tt, { size: 3, recentUse: new Map([['t-1', 3]]) });
  check(sbRecent.length === 3 && !sbRecent.some((a) => a.id === 't-1'), `né tư liệu vừa lên 3 video (${sbRecent.map((a) => a.id).join(',')})`);
  // Mô tả "không thấy người" xếp sau tư liệu có người.
  const noPerson = mkClip('n-1', 'Cận cảnh động cơ tàu cá trong khoang máy, không thấy người trong khung hình');
  const person = mkClip('n-2', 'Cận cảnh động cơ tàu cá trong khoang máy, thợ máy đang siết ốc trong khung hình');
  const sbPerson = pickStoryboard([noPerson, person], { size: 2 });
  check(sbPerson[0].id === 'n-2' && sbPerson[1].id === 'n-1', 'tư liệu "không thấy người" xếp sau tư liệu có người');
  // Kho thiếu: tụt xuống số có được; dưới 2 thì null.
  check(pickStoryboard([c1, c2, c3]).length === 3, 'kho chỉ có 3 tư liệu thì bộ 3 hình');
  check(pickStoryboard([c1, c2], { mustAsset: c1 }).length === 2, 'must + 1 tư liệu khác thì bộ 2 hình');
  check(pickStoryboard([c1]) === null, 'kho 1 tư liệu thì null (caller rơi về đường cũ)');
  check(pickStoryboard([c1], { mustAsset: c1 }) === null, 'chỉ có clip bắt buộc, không còn gì khác thì null');
  check(pickStoryboard([]) === null && pickStoryboard(null) === null, 'kho rỗng thì null');
  // Folder sản phẩm không lọt vào bộ khi kho Content còn.
  const prod = { id: 'p-1', kind: 'video', title: 'Máy lọc đang chạy', folder: '2. Máy lọc nước biển SEA-40', description: 'Máy lọc nước SEA-40 đang chạy ra nước trong tại bến, kỹ thuật bàn giao' };
  check(!pickStoryboard([prod, c1, c2, c3]).some((a) => a.id === 'p-1'), 'tư liệu folder sản phẩm không vào bộ hình đời sống khi kho Content còn');
}

// 2/10 đêm (sinh lời 2 bước): storyboardDriftKeChuyen — câu TẢ trôi hình vẫn bị cắt, câu KỂ trôi hình được tha,
// câu bịa chi tiết vẫn bị bắt ở mọi câu.
{
  console.log('storyboardDriftKeChuyen: guard drift chỉ cắt câu tả, tha câu kể');
  const silent = { warn: () => {} };
  const hinhCang = { id: 'k-1', kind: 'video', title: 'Cảng cá Long Hải', folder: 'Content', description: 'Cảnh nhộn nhịp tại cảng cá trên bờ, tàu neo đậu, ngư dân chuẩn bị ra khơi' };
  const hinhMay = { id: 'k-2', kind: 'video', title: 'Cận cảnh động cơ', folder: 'Content', description: 'Cận cảnh động cơ tàu cá trong khoang máy, không thấy người' };
  const hinhCuoi = { id: 'k-3', kind: 'video', title: 'Tàu cá neo ở cảng', folder: 'Content', description: 'Tàu cá neo đậu ở cảng buổi chiều, ngư dân đứng trên boong' };
  const sbSet = [hinhCang, hinhMay, hinhCuoi];
  const cuoi = { narration: 'Bà con nghĩ sao về chuyện này?' };
  const mau = { narration: 'Tàu neo đậu ở cảng, mình nhớ chuyến ra khơi.' };
  // Câu kể ngôi mình trôi khỏi hình khoang máy: gốc bắt (drift), bản bọc tha.
  const ke = [mau, { narration: 'Động cơ trong khoang máy chạy đều. Ba giờ sáng giữa khơi, mình nghe tiếng sóng mà yên tâm.' }, cuoi];
  const goc = storyboardDrift(ke, sbSet);
  check(goc.length === 1 && goc[0].reason === 'drift', 'tiền đề: storyboardDrift gốc bắt câu kể trôi khỏi hình (drift)');
  const boc = storyboardDriftKeChuyen(ke, sbSet, { log: silent });
  check(boc.length === 0, 'bản bọc: câu kể ngôi mình trôi khỏi hình được tha, cảnh không bị bắt');
  // Cảnh bị tha phải có cảnh báo.
  const warns = [];
  storyboardDriftKeChuyen(ke, sbSet, { log: { warn: (m) => warns.push(m) } });
  check(warns.length === 1 && /canh 2/.test(warns[0]), 'bản bọc: câu kể được tha thì console.warn đúng 1 cảnh báo (cảnh 2)');
  // Câu TẢ ("X đang làm Y") trôi khỏi hình: vẫn bị bắt, chỉ câu tả nằm trong sentences.
  const ta = [mau, { narration: 'Thợ máy đang kéo lưới giữa khơi. Mình nhớ tiếng máy đều.' }, cuoi];
  const bt = storyboardDriftKeChuyen(ta, sbSet, { log: silent });
  check(bt.length === 1 && bt[0].reason === 'drift' && bt[0].scene === 2 && bt[0].sentences.length === 1 && /đang/.test(bt[0].sentences[0]), 'bản bọc: câu TẢ trôi hình vẫn bị bắt, câu kể cùng cảnh không nằm trong sentences');
  // Câu bịa chi tiết (giới tính người không có trong mô tả) vẫn bị bắt dù là câu kể.
  const bia = [{ narration: 'Anh thợ máy cười nói với mình ở cảng.' }, ke[1], cuoi];
  const bb = storyboardDriftKeChuyen(bia, sbSet, { log: silent });
  check(bb.some((m) => m.scene === 1 && m.reason === 'invented'), 'bản bọc: câu bịa giới tính người (anh thợ máy) vẫn bị bắt invented');
  // Bịa đạo cụ.
  const vali = [{ narration: 'Mình xách vali xuống cảng sáng nay.' }, ke[1], cuoi];
  check(storyboardDriftKeChuyen(vali, sbSet, { log: silent }).some((m) => m.scene === 1 && m.reason === 'invented'), 'bản bọc: câu bịa đạo cụ (xách vali) vẫn bị bắt invented');
  // no-overlap giữ nguyên cho cảnh giữa, tha cho cảnh cuối.
  const noOv = [mau, { narration: 'Bình lặng một buổi mai.' }, cuoi];
  const bn = storyboardDriftKeChuyen(noOv, sbSet, { log: silent });
  check(bn.length === 1 && bn[0].scene === 2 && bn[0].reason === 'no-overlap', 'bản bọc: cảnh giữa không chung từ nào với hình vẫn bị no-overlap');
  check(storyboardDriftKeChuyen([mau, ke[1], { narration: 'Anh em nghĩ sao?' }], sbSet, { log: silent }).length === 0, 'bản bọc: cảnh cuối câu hỏi giao lưu không bị no-overlap');
  // Hàm gốc không đổi hành vi với câu tả; đầu vào rỗng không lỗi.
  check(storyboardDrift(ta, sbSet).length === 1, 'hàm gốc storyboardDrift giữ nguyên (vẫn bắt)');
  check(storyboardDriftKeChuyen([], sbSet).length === 0 && storyboardDriftKeChuyen(null, null).length === 0, 'bản bọc: đầu vào rỗng không lỗi');
}

// 3/10 (ChatGPT chấm video lọc nước: thiếu cảnh nước ngọt chảy ra): cảnh solution/reward của video lọc nước
// cộng +6 cho tư liệu mô tả nước chảy / vòi / ly nước / thử nước / đầu ra. Kho không có clip như vậy thì không đổi.
{
  console.log('Video lọc nước: ưu tiên clip nước chảy ra ở cảnh giải pháp');
  const G2 = '2. Máy lọc nước biển SEA-40';
  const silent = { warn() {}, log() {} };
  const waterFlow = { id: 'w-flow', kind: 'video', title: 'Nước ngọt chảy ra từ vòi', folder: G2, description: 'Cận cảnh nước chảy ra từ vòi máy lọc nước SEA-40, ly nước trong' };
  const installOnly = { id: 'w-inst', kind: 'video', title: 'Lắp máy lọc nước SEA-40', folder: G2, description: 'Kỹ thuật SDVICO đang lắp đặt máy lọc nước trên tàu, máy chạy ổn định' };
  const tuong = { id: 'w-tuong', kind: 'video', title: 'Cường độ làm việc', folder: G2, description: 'Kiên cường làm việc, đường dài, xương cá' };
  check(ruleScore(waterFlow, 'solution', { productGroup: G2 }) === ruleScore(waterFlow, 'solution', {}) + 6, 'solution + lọc nước: clip nước chảy cộng đúng +6');
  check(ruleScore(waterFlow, 'reward', { productGroup: G2 }) === ruleScore(waterFlow, 'reward', {}) + 6, 'reward + lọc nước: clip nước chảy cộng đúng +6');
  check(ruleScore(installOnly, 'solution', { productGroup: G2 }) === ruleScore(installOnly, 'solution', {}), 'clip lắp đặt không có nước chảy: điểm không đổi');
  check(ruleScore(waterFlow, 'solution', { productGroup: '9. Máy Lọc Dầu Diesel SD12-300' }) === ruleScore(waterFlow, 'solution', {}), 'video lọc dầu: không cộng điểm nước chảy');
  check(ruleScore(waterFlow, 'solution', {}) === ruleScore(waterFlow, 'solution', { productGroup: null }), 'không có productGroup: không cộng');
  check(ruleScore(waterFlow, 'hook', { productGroup: G2 }) === ruleScore(waterFlow, 'hook', {}), 'cảnh hook (vấn đề) không cộng điểm nước chảy');
  check(ruleScore(tuong, 'solution', { productGroup: G2 }) === ruleScore(tuong, 'solution', {}), '"cường/đường/xương" không bị nhầm thành "uống" (so nguyên từ)');
  const uongLy = { id: 'w-uong', kind: 'image', title: 'Thử nước', folder: G2, description: 'Ngư dân uống thử ly nước ngọt vừa lọc' };
  check(ruleScore(uongLy, 'reward', { productGroup: G2 }) === ruleScore(uongLy, 'reward', {}) + 6, '"uống thử ly nước" nhận +6 (một lần, không cộng dồn theo từ)');
  const pool = [installOnly, waterFlow];
  check(pickByRole(pool, 'solution', { productGroup: G2 }).id === 'w-flow', 'pickByRole(solution, lọc nước) chọn clip nước chảy');
  const sceneSol = [{ role: 'solution', narration: 'Máy cho nước ngọt dùng ngay.', visual: 'máy lọc nước đang chạy' }];
  const failing2 = async () => { throw new Error('429 giả lập'); };
  const pRule = await matchScenesToAssets({ ai: null, generate: failing2, model: 'x', scenes: sceneSol, assets: pool, productGroup: G2, log: silent });
  check(pRule[0].assetId === 'w-flow' && pRule[0].by === 'rule', 'matchScenesToAssets (model lỗi): cảnh solution lọc nước lấy clip nước chảy');
  const modelInst = async () => ({ text: JSON.stringify({ picks: [{ scene: 1, asset_id: 'w-inst', fit: 9, why: 'lắp đặt' }] }) });
  const pModel = await matchScenesToAssets({ ai: null, generate: modelInst, model: 'x', scenes: sceneSol, assets: pool, productGroup: G2, log: silent });
  check(pModel[0].assetId === 'w-flow', 'model chọn clip lắp đặt, kho còn clip nước chảy chưa dùng -> luật chọn lại clip nước chảy');
  const pModelDau = await matchScenesToAssets({ ai: null, generate: modelInst, model: 'x', scenes: sceneSol, assets: pool, productGroup: '9. Máy Lọc Dầu Diesel SD12-300', log: silent });
  check(pModelDau[0].assetId === 'w-inst' && pModelDau[0].by === 'model', 'video lọc dầu: lựa chọn của model được giữ nguyên');
  // Kho không có clip nước chảy: hành vi không đổi.
  const khoThieu = [installOnly, { ...installOnly, id: 'w-inst2', title: 'Máy chạy tại bến' }];
  const pThieu = await matchScenesToAssets({ ai: null, generate: modelInst, model: 'x', scenes: sceneSol, assets: khoThieu, productGroup: G2, log: silent });
  check(pThieu[0].assetId === 'w-inst' && pThieu[0].by === 'model', 'kho chưa có clip nước chảy: giữ nguyên lựa chọn của model (hành vi không đổi)');
}

console.log(fails ? `\nTHẤT BẠI: ${fails} kiểm tra` : '\nOK: mọi kiểm tra đạt');
process.exit(fails ? 1 : 0);
