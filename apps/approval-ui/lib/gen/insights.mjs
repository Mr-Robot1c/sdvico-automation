// insights.mjs — THƯ VIỆN INSIGHT / PAINPOINT khách hàng theo từng sản phẩm SDVICO.
//
// User 21/8: "content phải có Ý NGHĨA, không lặp lại — mỗi bài đi từ thông điệp / insight /
// painpoint thật của khách". Đây là nguyên liệu để AI Creator viết bài xoáy vào MỘT nỗi thật
// của bà con ngư dân, thay vì "góc tiếp cận" chung chung xoay vòng.
//
// Khung mỗi insight = Situation -> Tension -> Motivation -> Insight (STMI, theo ví dụ user đưa):
//   situation:  bối cảnh đời thật của bà con
//   tension:    mâu thuẫn / nỗi khó họ đang mắc
//   motivation: điều họ THỰC SỰ muốn
//   insight:    tiếng lòng của khách (câu nói nội tâm) — kim chỉ nam giọng bài
//
// QUAN TRỌNG (điều cấm 5): insight nói về SỰ THẬT CẢM XÚC / HÀNH VI của nghề biển, KHÔNG chứa
// thông số, model, con số bịa. Thông số vẫn chỉ lấy từ product-facts.mjs (allowlist). Vì vậy
// thêm insight ở đây KHÔNG mở đường cho bịa số — nó chỉ định HƯỚNG THÔNG ĐIỆP.
//
// Key = tên nhóm sản phẩm y như products.mjs (có số thứ tự). Khớp linh hoạt qua insightsFor().

export const INSIGHTS = {
  '1. PV Engine RMI Nano Graphene': [
    { id: 'dau-giu-may', situation: 'Máy tàu chạy liên tục nhiều ngày ngoài khơi, tiền dầu nhớt là khoản chi đều mỗi chuyến.',
      tension: 'Bà con muốn máy bền và tiết kiệm, nhưng ngại đổi loại dầu lạ vì sợ hại máy giữa biển.',
      motivation: 'Muốn dầu vừa giữ máy chạy êm, đỡ hao mòn, vừa đỡ hỏng vặt khi đang đánh bắt.',
      insight: 'Máy hỏng giữa biển là mất cả chuyến, tôi cần dầu giữ máy khỏe chứ không chỉ rẻ.' },
    { id: 'con-tau-gia-tai', situation: 'Con tàu và cái máy là cả gia tài, một lần đại tu máy tốn kém và phải nằm bờ.',
      tension: 'Máy cũ chạy nóng, hao dầu, nhưng thợ sửa giỏi lại ở trong bờ, ngoài khơi tự xoay.',
      motivation: 'Muốn kéo dài tuổi thọ máy, giảm số lần hỏng hóc phải vào bờ sửa.',
      insight: 'Con tàu là cả gia tài, giữ được cái máy là giữ được nghề.' },
    { id: 'tien-dau-an-lai', situation: 'Giá dầu lên xuống thất thường, chi phí nhiên liệu ăn thẳng vào tiền lời mỗi chuyến.',
      tension: 'Tiết kiệm thì sợ hàng dỏm, dùng hàng tốt thì lo giá cao.',
      motivation: 'Muốn giảm ma sát, đỡ hao nhiên liệu một cách thật, tính được trên nhiều chuyến.',
      insight: 'Lời hay lỗ một chuyến nhiều khi nằm ở tiền dầu.' },
  ],
  '2. Máy lọc nước biển SEA-40': [
    { id: 'lo-het-nuoc', situation: 'Chuyến biển dài ngày phải chở theo nhiều can nước ngọt cho cả anh em trên tàu.',
      tension: 'Nước chở theo có hạn, hết nước giữa chuyến thì khổ, mà can nước lại chiếm khoang chứa cá.',
      motivation: 'Muốn chủ động nguồn nước ngọt, khỏi phải tính từng ca nước.',
      insight: 'Ra khơi dài ngày, thứ tôi lo không kém con cá là còn đủ nước ngọt cho anh em không.' },
    { id: 'anh-em-co-nuoc', situation: 'Anh em thợ trên tàu tắm giặt, nấu ăn, uống đều trông vào lượng nước mang theo.',
      tension: 'Nước phải dè sẻn từng ngày, đi biển đã cực còn thiếu nước sạch.',
      motivation: 'Muốn anh em sinh hoạt thoải mái hơn để giữ sức đi biển dài.',
      insight: 'Đi biển đã cực, ít ra anh em phải có nước sạch mà dùng.' },
    { id: 'bam-bien-lau-hon', situation: 'Đang gặp luồng cá, muốn ở lại đánh bắt thêm để được nhiều hơn.',
      tension: 'Hết nước ngọt là phải quay vào bờ sớm, dù cá còn nhiều.',
      motivation: 'Muốn bám biển lâu hơn mà không bị nước ngọt giới hạn chuyến đi.',
      insight: 'Cá đang nhiều mà phải vào bờ vì hết nước thì tiếc đứt ruột.' },
  ],
  '3. Thiết bị giám sát hành trình Viettel S-Tracking': [
    { id: 'ra-khoi-hop-le', situation: 'Tàu cá bắt buộc lắp thiết bị giám sát hành trình theo quy định để được ra khơi.',
      tension: 'Thiết bị trục trặc hay mất kết nối là bị nhắc nhở, bị phạt, ảnh hưởng chuyến biển.',
      motivation: 'Muốn ra khơi hợp lệ, thiết bị chạy ổn định, khỏi nơm nớp lo.',
      insight: 'Tôi chỉ muốn ra khơi làm ăn đàng hoàng, không phải nơm nớp lo mất tín hiệu.' },
    { id: 'biet-minh-o-dau', situation: 'Ranh giới vùng biển được phép khai thác không nhìn thấy bằng mắt giữa biển khơi.',
      tension: 'Vô tình đi lố ranh giới là rắc rối lớn, mà biển thì mênh mông.',
      motivation: 'Muốn biết chắc mình đang ở đâu, còn trong vùng cho phép hay không.',
      insight: 'Biển mênh mông, tôi cần biết chắc mình còn trong vùng được phép.' },
    { id: 'co-nguoi-lo-giup', situation: 'Lắp đặt thiết bị, làm hồ sơ, thao tác kỹ thuật là chuyện bà con không rành.',
      tension: 'Ngư dân rành đi biển chứ không rành máy móc giấy tờ, tự làm thì rối.',
      motivation: 'Muốn có đơn vị lo trọn gói lắp đặt, hướng dẫn, hỗ trợ khi cần.',
      insight: 'Tôi rành đi biển chứ không rành thủ tục máy móc, cần chỗ lo giùm.' },
  ],
  '4. Thuraya Marine Star MNB-01': [
    { id: 'nghe-giong-nha', situation: 'Tàu đi xa bờ nhiều ngày, sóng điện thoại thường mất hẳn ngoài khơi.',
      tension: 'Muốn gọi về nhà, gọi bạn thuyền mà không có sóng di động.',
      motivation: 'Muốn thiết bị vừa giám sát hành trình vừa nghe gọi được trên biển.',
      insight: 'Ngoài khơi mà nghe được giọng vợ con một câu là ấm lòng cả chuyến.' },
    { id: 'luc-nguy-goi-duoc', situation: 'Thời tiết xấu, sự cố máy móc có thể xảy ra ở vùng ngoài phủ sóng.',
      tension: 'Lúc nguy cấp mà không liên lạc được với ai là nỗi sợ lớn nhất.',
      motivation: 'Muốn luôn có đường liên lạc kể cả khi ở xa bờ.',
      insight: 'Điều tôi sợ nhất là lúc nguy mà không gọi được cho ai.' },
    { id: 'gon-mot-thiet-bi', situation: 'Trên tàu cần vừa báo vị trí vừa liên lạc, đồ đạc thì đã chật chỗ.',
      tension: 'Mang nhiều thiết bị rời rạc vừa tốn chỗ vừa phiền.',
      motivation: 'Muốn một thiết bị làm được nhiều việc.',
      insight: 'Trên tàu đồ đã chật, thiết bị nào làm được nhiều việc thì đỡ.' },
  ],
  '5. Điện thoại vệ tinh XT-Pro': [
    { id: 'nha-do-lo', situation: 'Tàu đi khơi xa mất sóng di động hoàn toàn, người nhà ở bờ ngóng tin.',
      tension: 'Mấy ngày mất liên lạc làm gia đình lo lắng, sốt ruột.',
      motivation: 'Muốn gọi về báo bình an bất cứ lúc nào, ở bất cứ đâu.',
      insight: 'Nhà ở bờ lo nhất là mấy ngày mất liên lạc, có cái gọi về là cả nhà nhẹ lòng.' },
    { id: 'goi-cuu-khi-bat-trac', situation: 'Đi biển luôn có rủi ro bất ngờ về thời tiết, sức khỏe, sự cố.',
      tension: 'Gặp tình huống khẩn mà không có cách gọi cứu hộ là rất nguy.',
      motivation: 'Muốn có đường gọi khẩn, báo vị trí khi bất trắc.',
      insight: 'Đi biển ai cũng mong bình an, nhưng phải có đường gọi cứu khi bất trắc.' },
    { id: 'doi-tau-khong-le-loi', situation: 'Nhiều tàu đi cùng đội, cần phối hợp và báo nhau luồng cá, tình hình.',
      tension: 'Ra khơi xa không liên lạc được nhau thì mỗi tàu như đi lẻ.',
      motivation: 'Muốn giữ kết nối với anh em bạn thuyền ngoài khơi.',
      insight: 'Anh em đi cùng mà không gọi được nhau thì như đi lẻ.' },
  ],
  '6. Thiết bị lọc dầu SF-50': [
    { id: 'dau-ban-pha-may', situation: 'Dầu diesel mua về nhiều khi lẫn cặn, lẫn nước, không thấy bằng mắt.',
      tension: 'Dầu bẩn làm nghẹt kim phun, máy hỏng vặt và hao thêm dầu.',
      motivation: 'Muốn dầu vào máy sạch để máy khỏe, đỡ hỏng, đỡ tốn.',
      insight: 'Tiền dầu đã nặng, tôi không muốn đổ thêm tiền vì dầu bẩn phá máy.' },
    { id: 'may-khong-nam-giua-bien', situation: 'Máy chạy liên tục nhiều ngày, cách bờ hàng chục hải lý.',
      tension: 'Máy hỏng giữa khơi là mất chuyến, mà còn mất an toàn cho cả tàu.',
      motivation: 'Muốn máy bền, ít trục trặc suốt chuyến biển dài.',
      insight: 'Máy nằm giữa biển thì không chỉ mất tiền, mà mất cả an toàn.' },
    { id: 'tiet-kiem-cong-don', situation: 'Chi phí mỗi chuyến tăng, lãi mỏng dần vì tiền nhiên liệu.',
      tension: 'Tiết kiệm được chút mỗi chuyến thì khó thấy, nhưng cộng cả năm là đáng kể.',
      motivation: 'Muốn giảm hao dầu một cách thật, bền vững qua nhiều chuyến.',
      insight: 'Tiết kiệm được chút dầu mỗi chuyến, cuối năm là con số không nhỏ.' },
  ],
  '7. Ắc quy Accu Nano SDViCo': [
    { id: 'mat-dien-mat-dinh-vi', situation: 'Trên tàu nhiều thiết bị điện quan trọng: định vị, bộ đàm, giám sát hành trình.',
      tension: 'Hơi muối biển ăn mòn cọc, ắc quy yếu làm thiết bị chập chờn, tụt điện.',
      motivation: 'Muốn nguồn điện ổn định, bền được với môi trường muối mặn.',
      insight: 'Mất điện giữa biển là mất luôn định vị với liên lạc, tôi cần ắc quy chịu được muối mà vẫn khỏe.' },
    { id: 'de-khong-noi', situation: 'Mỗi chuyến biển phải khởi động máy nhiều lần.',
      tension: 'Ắc quy chai theo thời gian, đề mãi không nổ máy giữa khơi thì hoảng.',
      motivation: 'Muốn ắc quy đề khỏe, tuổi thọ cao, bền qua nhiều chuyến.',
      insight: 'Đề mãi không nổ máy giữa khơi thì đứng tim.' },
    { id: 'nguon-rieng-cho-dinh-vi', situation: 'Thiết bị định vị và giám sát cần nguồn điện ổn định, liên tục.',
      tension: 'Dùng chung một nguồn, khi tụt áp là mất tín hiệu định vị.',
      motivation: 'Muốn có nguồn riêng cho thiết bị giám sát để không lo mất tín hiệu.',
      insight: 'Cái định vị mà chập chờn vì thiếu điện thì vừa lo phạt vừa lo lạc.' },
  ],
  '8. Sơn RARE': [
    { id: 'khoang-nong-nhu-lo', situation: 'Tàu phơi nắng gắt cả ngày trên biển, khoang tàu nóng hầm hập.',
      tension: 'Khoang nóng làm đá bảo quản tan nhanh, cá mau ươn, anh em cũng đuối sức.',
      motivation: 'Muốn giảm nóng cho tàu và khoang chứa để giữ cá và giữ sức.',
      insight: 'Khoang tàu nóng như lò thì đá mau tan, cá mất giá, người cũng đuối.' },
    { id: 'giu-ca-tuoi', situation: 'Cá đánh được bảo quản bằng đá, chất lượng cá quyết định giá bán.',
      tension: 'Nắng nóng làm đá tan nhanh, phải tốn thêm đá mà cá vẫn kém tươi.',
      motivation: 'Muốn giữ khoang lạnh lâu hơn để cá tươi, bán được giá.',
      insight: 'Giữ được cá tươi thêm chút là được giá thêm chút.' },
    { id: 'son-dang-tien', situation: 'Sơn lại tàu là khoản tốn kém, vài năm mới làm một lần.',
      tension: 'Sơn thường mau xuống cấp, mà nóng thì vẫn nóng như cũ.',
      motivation: 'Muốn lớp sơn vừa bảo vệ vỏ tàu vừa chống nóng, đáng đồng tiền.',
      insight: 'Đã tốn tiền sơn tàu thì muốn lớp sơn làm được nhiều hơn là chỉ đẹp.' },
  ],
  // 26/8: SP moi user cung cap. Insight xoay vao 3 noi thuc su cua chu tau khi dung dau
  // diesel co nuoc/can — hong kim phun, ton tien sua, tau chet may giua bien.
  '9. Máy Lọc Dầu Diesel SD12-300': [
    { id: 'nuoc-lan-trong-dau', situation: 'Dầu diesel mua ngoài đôi khi lẫn nước hoặc cặn bẩn mà mắt thường khó thấy.',
      tension: 'Đổ nhầm dầu bẩn vào máy là hại kim phun, hại bơm cao áp — sửa vào là tốn cả chục triệu.',
      motivation: 'Muốn đảm bảo dầu vào máy sạch để bảo vệ những bộ phận đắt tiền nhất của động cơ.',
      insight: 'Dầu bẩn vô máy một lần, tiền sửa bơm kim phun bằng cả năm tiết kiệm.' },
    { id: 'may-chet-giua-bien', situation: 'Chuyến biển dài ngày cách bờ hàng chục hải lý, máy tàu là tất cả.',
      tension: 'Máy khục khặc giữa biển vì dầu bẩn thì gọi ai cứu, mất chuyến còn nguy hiểm.',
      motivation: 'Muốn máy chạy ổn định suốt chuyến, không phải nơm nớp lo dừng máy vì nhiên liệu.',
      insight: 'Ra khơi rồi thì máy chạy êm là an tâm hơn tất cả.' },
    { id: 'bao-duong-de-dang', situation: 'Đồ trên tàu nào cũng phải rửa mặn, chống ăn mòn thường xuyên.',
      tension: 'Thiết bị lọc mà khó tháo lắp, khó vệ sinh thì anh em lười làm, cuối cùng hư sớm.',
      motivation: 'Muốn thiết bị bền, dễ vệ sinh bảo dưỡng ngay trên tàu, khung inox chịu mặn được lâu.',
      insight: 'Thứ nào tháo lắp gọn, rửa dễ thì mới bền được với tàu.' },
  ],
};

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
}

// Danh sách insight cho một nhóm — khớp linh hoạt: tên nhóm có/không số thứ tự, viết hoa thường
// khác nhau đều nhận ra (rotation_group là "6. Thiết bị lọc dầu SF-50").
export function insightsFor(group) {
  if (INSIGHTS[group]) return INSIGHTS[group];
  const k = norm(group).replace(/^\d+/, '');
  for (const [name, list] of Object.entries(INSIGHTS)) {
    const nk = norm(name).replace(/^\d+/, '');
    if (nk && (k.includes(nk) || nk.includes(k))) return list;
  }
  return [];
}

// Chọn `count` insight cho nhóm, ƯU TIÊN cái CHƯA dùng gần đây (usedIds = id đã dùng ở các bài
// trước của nhóm này). Thiếu thì mới cho phép dùng lại cái cũ nhất. `rand` là hàm 0..1 (rotate
// truyền Math.random; để test có thể truyền cố định) để 2 lần chạy không ra y hệt.
export function pickInsights(group, count = 2, usedIds = [], rand = Math.random) {
  const all = insightsFor(group);
  if (!all.length) return [];
  const used = new Set(usedIds);
  const fresh = all.filter((x) => !used.has(x.id));
  const stale = all.filter((x) => used.has(x.id));
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const ordered = [...shuffle(fresh), ...shuffle(stale)];
  return ordered.slice(0, Math.min(count, all.length));
}

// Gợi ý đưa vào prompt: khối STMI cho AI viết bài xoáy vào insight này.
export function insightBrief(ins) {
  if (!ins) return '';
  return [
    'XÂY BÀI QUANH MỘT INSIGHT KHÁCH HÀNG THẬT (đi theo mạch: tình huống, nỗi khó, mong muốn, tiếng lòng):',
    `- Tình huống: ${ins.situation}`,
    `- Nỗi khó: ${ins.tension}`,
    `- Mong muốn: ${ins.motivation}`,
    `- Tiếng lòng của bà con: "${ins.insight}"`,
    'Yêu cầu: câu MỞ ĐẦU phải chạm đúng tình huống và nỗi khó này để bà con đọc thấy "đúng mình", RỒI mới đưa sản phẩm ra như lời giải, kết bằng mời liên hệ. Insight là kim chỉ nam cho giọng và thông điệp, KHÔNG cần chép nguyên câu tiếng lòng vào bài. Mỗi bài một insight riêng, không trộn nhiều nỗi vào một bài, không nói chung chung.',
  ].join('\n');
}

export function insightById(group, id) {
  return insightsFor(group).find((x) => x.id === id) || null;
}
