// Kho 30 hook mẫu từ Playbook SDVICO PHỤ LỤC 1 — cảm hứng cho Creator khi bí. Chia theo
// 5 cơ chế tâm lý (PHẦN 5): gây shock bằng con số, phá niềm tin sai, kể tình huống cụ thể,
// câu hỏi tự soi, cảnh báo sai lầm đang mắc. Mỗi hook ≤15 chữ, có hình ảnh cụ thể.
//
// KHÔNG copy nguyên vào bài — chỉ tham khảo cấu trúc + cơ chế. Chèn vào prompt Creator
// KHI RETRY (không phải mọi lần), tiết kiệm token.

export const HOOK_LIBRARY = {
  // A — Gây shock bằng con số. Người đọc tự tính vào túi tiền.
  shock_number: [
    'Dầu 38.000đ/lít, mỗi chuyến anh đốt trôi bao nhiêu tiền vô ích?',
    'Từ nay 100% tàu bị kiểm tra khi ra vào cảng. Tàu anh sẵn chưa?',
    'Kim phun hỏng vì dầu bẩn = 5 triệu và cả chuyến biển bỏ dở.',
    'Tàu đốt 8.000 lít/chuyến, cắt 5% giữ lại 400 lít tiền tươi.',
    '10 ngày ngoài khơi, 3 khối nước ngọt chiếm chỗ đáng lẽ chở thêm cá.',
    'Máy tàu 300 triệu, chưa bỏ 1 đồng lọc sạch dầu cho nó.',
  ],
  // B — Phá vỡ niềm tin sai. Tò mò kiểm chứng.
  break_belief: [
    'Dầu mua cảng lớn chưa chắc sạch — đây là lý do.',
    'Máy càng chạy nhiều càng "lì"? Sai. Nó âm thầm hao mòn.',
    'Nhiều người nghĩ VMS chỉ để đối phó. Thực ra nó cứu anh nhiều hơn.',
    'Nước để can cả tuần vẫn uống ngon? Không như anh tưởng.',
    'Tiết kiệm dầu không phải chạy chậm mà là đốt sạch hơn.',
    'Kinh nghiệm 30 năm đi biển vẫn không thay được thứ này trên tàu.',
  ],
  // C — Kể chuyện tình huống cụ thể. Kéo vào cảnh (thời gian + địa điểm + nhân vật).
  story: [
    '3 giờ sáng, cách bờ 80 hải lý, máy tàu khục một tiếng rồi tắt.',
    'Chú 55 tuổi đi biển 25 năm, lần đầu quay bờ vì hết nước ngọt.',
    'Chuyến đó cá đầy khoang, về cảng bị giữ vì mất tín hiệu.',
    'Vợ ngồi trước hiên nhìn ra biển, điện thoại 2 ngày chưa đổ chuông.',
    'Sáng đó anh đổ can dầu mới, tới trưa máy khặc khừ.',
    'Đang kéo mẻ lưới đầy thì máy nóng ran, khói bốc lên khoang.',
  ],
  // D — Câu hỏi khiến người đọc tự thấy mình. Tự trả lời trong đầu, comment.
  self_question: [
    'Anh còn nhớ lần cuối súc rửa két nước ngọt là khi nào không?',
    'Mỗi lần đổ dầu, anh có thấy lợn cợn dưới đáy can không?',
    'Đi biển dài ngày, anh sợ hết nước hay chết máy giữa khơi hơn?',
    'Nếu tối nay máy chết giữa biển, anh gọi được cho ai?',
    'Một năm anh tốn bao nhiêu tiền sửa máy, bao nhiêu tránh được?',
    'Anh tin cái máy dò hay tin linh cảm đi biển của mình?',
  ],
  // E — Cảnh báo sai lầm đang mắc. Tâm lý né mất mát, mạnh nhất.
  warn_mistake: [
    'Đừng đợi kim phun hỏng mới nghĩ chuyện lọc dầu.',
    'Nếu anh vẫn đổ thẳng dầu vào máy không qua lọc, đọc trước chuyến sau.',
    'Sai lầm khiến máy tàu chết trẻ: coi thường nước lẫn trong dầu.',
    'Ra khơi mùa bão mà chỉ trông sóng điện thoại - quá mạo hiểm.',
    'Tắt VMS cho đỡ tốn pin - cái giá có thể là cả con tàu.',
    'Chở nước ngọt cả chuyến mà không lọc - anh đang uống thứ gì?',
  ],
};

// Chọn 3 hook đa dạng cơ chế (mỗi cơ chế 1 hook nếu có) để làm few-shot khi retry.
export function sampleHooks(n = 3) {
  const keys = Object.keys(HOOK_LIBRARY);
  const picked = [];
  const shuffled = [...keys].sort(() => Math.random() - 0.5);
  for (const k of shuffled) {
    if (picked.length >= n) break;
    const arr = HOOK_LIBRARY[k];
    picked.push(arr[Math.floor(Math.random() * arr.length)]);
  }
  return picked;
}
