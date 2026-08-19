// Kho góc bài tương tác để hâm nóng trang tuyển dụng SDVICO.
// Ba chủ đề: đời sống công ty (doi_song), ngành biển thủy sản (nganh_bien), hỏi đáp mẹo nghề (hoi_dap).
//
// Mỗi góc bài có sẵn tieu_de và noi_dung dùng được ngay (bản lùi khi không có khóa mô hình),
// và goc là chỉ dẫn để mô hình viết bản mới cùng ý nhưng tươi hơn.
//
// Thứ tự trong TOPICS được cài xen kẽ ba chủ đề, để một lần chạy mặc định ba bài rải đều
// mỗi chủ đề một bài.
//
// Dữ kiện trong kho này bám CLAUDE.md, không bịa (điều cấm 5), phân biệt rõ sản phẩm SDVICO
// tự làm với thiết bị của hãng mà SDVICO phân phối và lắp đặt (điều cấm 4), tránh khẳng định
// về quy định nhà nước và IUU (điều cấm 3).

export const THEMES = {
  doi_song: 'Đời sống công ty, con người và chuyện nghề ở SDVICO',
  nganh_bien: 'Kiến thức và mẹo thực tế cho ngành biển và thủy sản',
  hoi_dap: 'Câu hỏi mở và bình chọn để bà con vào bình luận'
};

export const TOPICS = [
  {
    id: 'doi_song_khoi_dau',
    chu_de: 'doi_song',
    goc: 'Kể câu chuyện khởi đầu của SDVICO năm 2014, nhóm giảng viên Bà Rịa Vũng Tàu làm máy lọc nước biển thành nước ngọt cho tàu cá. Giọng gần gũi, khép lại bằng lời mời theo dõi trang.',
    tieu_de: 'Bắt đầu từ một câu hỏi rất thật: làm sao có nước ngọt cho tàu đi biển dài ngày?',
    noi_dung: [
      'Năm 2014, một nhóm giảng viên ở Bà Rịa Vũng Tàu ngồi lại với nhau vì chuyện đó. Tàu ra khơi cả tháng, nước ngọt mang theo có hạn, cạn nước là phải quay vào dù con nước đang được. Họ bắt tay làm máy lọc nước biển thành nước ngọt ngay trên tàu. Đó là sản phẩm đầu tiên của SDVICO, Công ty Hiệp Lực Phát Triển Việt.',
      '',
      'Hơn mười năm, tụi mình vẫn giữ một cách làm: bám vào việc thật của bà con đi biển trước, rồi mới nghĩ tới công nghệ.',
      '',
      'Đây là trang tụi mình chia sẻ chuyện nghề, chuyện thiết bị trên tàu, và sắp tới là cả tin tuyển người về cùng làm. Anh em và bà con quan tâm thì bấm theo dõi nhé.'
    ].join('\n')
  },
  {
    id: 'nganh_bien_tiet_kiem_dau',
    chu_de: 'nganh_bien',
    goc: 'Mẹo bớt hao dầu mỗi chuyến biển: vòng tua kinh tế, vệ sinh vỏ tàu chân vịt, bảo dưỡng máy, chọn đúng dầu nhớt. Nhắc SDVICO có thiết bị xử lý dầu, mục tiêu tiết kiệm diesel, không bịa con số. Mời bà con góp mẹo.',
    tieu_de: 'Dầu là khoản tốn nhất mỗi chuyến biển. Vài cách anh em hay dùng để bớt hao:',
    noi_dung: [
      'Chạy đúng vòng tua kinh tế, đừng ép máy quá tải khi không cần.',
      '',
      'Vệ sinh vỏ tàu và chân vịt định kỳ, hà bám nhiều là dầu đội lên thấy rõ.',
      '',
      'Bảo dưỡng máy đúng hạn, lọc gió và lọc dầu sạch thì máy ăn dầu ít hơn.',
      '',
      'Chọn đúng loại dầu nhớt cho máy thủy, nhớt hợp máy giúp máy bền và chạy mượt.',
      '',
      'Ngoài mấy việc trên, hiện có thiết bị xử lý dầu lắp thêm cho tàu, mục tiêu là giúp tiết kiệm dầu diesel. SDVICO có làm dòng này, anh em muốn tìm hiểu thì nhắn tụi mình.',
      '',
      'Anh em còn mẹo nào hay, comment chia sẻ cho bà con cùng biết với.'
    ].join('\n')
  },
  {
    id: 'hoi_dap_lo_nhat',
    chu_de: 'hoi_dap',
    goc: 'Bài bình chọn: chuyến biển dài ngày anh em lo nhất điều gì, bốn lựa chọn đánh số. Mời comment con số. Không để link, để bài chạy tương tác tự nhiên.',
    tieu_de: 'Chuyến biển dài ngày, anh em lo nhất điều gì? Bình chọn giúp tụi mình với.',
    noi_dung: [
      'Số 1, hết nước ngọt.',
      '',
      'Số 2, hao dầu, giá dầu lên.',
      '',
      'Số 3, mất liên lạc, sóng chập chờn.',
      '',
      'Số 4, thời tiết trở gió bất ngờ.',
      '',
      'Comment con số bên dưới nhé. Bà con lo cái gì nhiều nhất, tụi mình làm bài kỹ về cái đó cho anh em.'
    ].join('\n')
  },
  {
    id: 'doi_song_ky_thuat',
    chu_de: 'doi_song',
    goc: 'Tả một ngày của anh em kỹ thuật SDVICO bắt đầu ở cảng cá, lắp thiết bị trên tàu. Nêu nghề hợp với người thích máy móc, từng làm điện, điện tử, cơ khí. Nhắc nhẹ sắp có tin tuyển.',
    tieu_de: 'Một ngày của anh em kỹ thuật SDVICO thường bắt đầu ở cảng cá, không phải trong văn phòng máy lạnh.',
    noi_dung: [
      'Anh em xuống tận tàu, lắp thiết bị giám sát hành trình, đấu nối máy lọc nước, kiểm lại từng mối nối cho chắc trước khi tàu rời bến. Nắng cảng cá thì gắt, việc thì tỉ mỉ, nhưng lắp xong nhìn tàu chạy êm ra khơi là thấy đáng.',
      '',
      'Nghề này hợp với người chịu khó, thích máy móc tay chân, và không ngại mùi biển. Ai từng làm điện, điện tử, cơ khí mà muốn gắn với ngành biển thì đây là chỗ đáng cân nhắc.',
      '',
      'Tuần tới trang sẽ có tin tuyển đợt mới. Theo dõi trang để không bỏ lỡ nhé.'
    ].join('\n')
  },
  {
    id: 'nganh_bien_nuoc_ngot',
    chu_de: 'nganh_bien',
    goc: 'Nói về chuyện nước ngọt trên tàu dài ngày, máy lọc nước biển thành nước ngọt của SDVICO tự phát triển từ 2014, có nhiều cỡ. Mời tư vấn, không bịa thông số.',
    tieu_de: 'Đi biển dài ngày, nước ngọt hết trước hay cá đầy khoang trước?',
    noi_dung: [
      'Nhiều chuyến phải quay vào sớm chỉ vì cạn nước ngọt, uổng cả con nước đang được. Máy lọc nước biển thành nước ngọt lắp ngay trên tàu xử lý đúng chỗ này, có nước dùng thì bám biển dài hơn.',
      '',
      'Đây là sản phẩm SDVICO tự phát triển từ năm 2014, có nhiều cỡ cho tàu lớn nhỏ khác nhau.',
      '',
      'Bà con đang tính chuyện nước ngọt cho tàu thì cứ nhắn, tụi mình tư vấn cỡ máy phù hợp với tàu và số người đi.'
    ].join('\n')
  },
  {
    id: 'hoi_dap_dang_tien',
    chu_de: 'hoi_dap',
    goc: 'Câu hỏi mở: trên tàu thiết bị nào đáng đồng tiền nhất. Gợi vài loại. Mời bà con comment chia sẻ kinh nghiệm.',
    tieu_de: 'Trên tàu của anh em, thiết bị nào thấy đáng đồng tiền nhất?',
    noi_dung: [
      'Máy định vị, máy dò, bộ đàm, máy lọc nước, hay cái gì khác? Mỗi người một kiểu tàu, một cách làm ăn, nên câu trả lời chắc cũng mỗi người một khác.',
      '',
      'Anh em comment cho vui, biết đâu người sau đọc được lại rút ra kinh nghiệm cho tàu mình.'
    ].join('\n')
  },
  {
    id: 'doi_song_vi_sao_nganh_bien',
    chu_de: 'doi_song',
    goc: 'Chia sẻ vì sao đội SDVICO chọn gắn với ngành biển: gần bà con ngư dân, việc làm ra thấy được kết quả thật trên tàu. Mời người cùng chí hướng theo dõi.',
    tieu_de: 'Làm công nghệ cho ngành biển có gì vui?',
    noi_dung: [
      'Cái vui là việc mình làm ra thấy được ngay trên tàu. Máy lọc nước chạy, tàu có nước ngọt đi dài ngày hơn. Thiết bị lắp xong, bà con ra khơi yên tâm hơn. Không phải thứ nằm trên giấy.',
      '',
      'Đội SDVICO phần lớn là người mê máy móc và quen với biển. Ở đây được xuống tận cảng, gặp bà con, nghe chuyện thật rồi về làm cho đúng cái người ta cần.',
      '',
      'Ai thấy hợp với kiểu làm này thì theo dõi trang, sắp tới tụi mình có tuyển thêm người.'
    ].join('\n')
  },
  {
    id: 'nganh_bien_giu_do_dien_tu',
    chu_de: 'nganh_bien',
    goc: 'Mẹo giữ đồ điện tử trên tàu khỏi hơi muối: lắp chỗ khô thoáng, xịt chống ẩm giắc cắm, kiểm dây mối nối. Nhắc SDVICO lắp đặt và bảo hành thiết bị của hãng, đúng vai trò phân phối lắp đặt.',
    tieu_de: 'Hơi muối là kẻ thù số một của đồ điện tử trên tàu. Vài cách giữ cho bền:',
    noi_dung: [
      'Lắp thiết bị ở chỗ khô thoáng, tránh nước tạt trực tiếp.',
      '',
      'Lau khô và xịt chống ẩm cho giắc cắm định kỳ.',
      '',
      'Kiểm dây và mối nối thường xuyên, thấy hoen gỉ là xử lý sớm, đừng để đứt giữa chuyến.',
      '',
      'Thiết bị giám sát hành trình, bộ đàm, máy định vị nếu được lắp đặt và đi dây gọn gàng ngay từ đầu thì đỡ hư vặt về sau. Khâu lắp đặt và bảo hành cho các loại thiết bị này là việc SDVICO làm cho bà con.',
      '',
      'Anh em có mẹo giữ đồ điện tử nào hay thì chia sẻ thêm nhé.'
    ].join('\n')
  },
  {
    id: 'hoi_dap_chuyen_bien_dau',
    chu_de: 'hoi_dap',
    goc: 'Câu hỏi gợi kỷ niệm: chuyến biển đầu tiên của anh em thế nào. Giọng thân tình, mời kể lại.',
    tieu_de: 'Anh em còn nhớ chuyến biển đầu tiên của mình không?',
    noi_dung: [
      'Người thì say sóng mấy ngày mới quen, người thì lần đầu kéo được mẻ cá lớn mừng rớt nước mắt. Mỗi người một câu chuyện.',
      '',
      'Kể lại cho vui đi anh em, chuyến đầu tiên của mình đáng nhớ vì điều gì?'
    ].join('\n')
  }
];

// Chọn danh sách góc bài để soạn. Lọc theo chủ đề nếu có, xoay vòng để không lặp một góc.
// Vì TOPICS cài xen kẽ ba chủ đề nên chạy mặc định ba bài sẽ rải đều mỗi chủ đề một bài.
// startAt cho phép lần chạy sau bắt đầu từ vị trí khác, tránh soạn trùng bài mỗi ngày.
export function pickTopics({ count = 3, themes = null, startAt = 0 } = {}) {
  let pool = TOPICS;
  if (themes && themes.length) {
    const set = new Set(themes);
    pool = TOPICS.filter((t) => set.has(t.chu_de));
  }
  if (pool.length === 0) pool = TOPICS;
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(pool[(startAt + i) % pool.length]);
  }
  return out;
}
