// Ghép thư mời và định dạng câu hỏi. Làm cục bộ, không nhờ mô hình.
// Tên và lời chào ghép ở đây, không đưa tên vào mô hình (điều cấm 6).
// Máy soạn, người bấm gửi (điều cấm 1): thư nằm trong hàng đợi duyệt, chưa gửi đi.

export function numberList(arr) {
  return (arr || []).map((s, i) => `${i + 1}. ${s}`).join('\n');
}

// Bài về nhà thành khối chữ dễ đọc.
export function composeTakeHome(bai) {
  if (!bai || !bai.de_bai) return '';
  const barem = bai.barem && bai.barem.length ? `\n\nBarem chấm:\n${numberList(bai.barem)}` : '';
  return `Đề bài (khoảng ba giờ):\n${bai.de_bai}${barem}`;
}

// Thư mời phỏng vấn. name có thể null. slots là mảng chuỗi khung giờ.
export function composeLetter({ name, position, slots }) {
  const hasName = name && name.trim() && name.trim() !== 'anh/chị';
  const greeting = hasName ? `Kính gửi anh/chị ${name.trim()},` : 'Kính gửi anh/chị,';
  const lines = [
    greeting,
    '',
    `Cảm ơn anh/chị đã ứng tuyển ${position} tại Công ty SDVICO. Sau khi xem hồ sơ, chúng tôi trân trọng mời anh/chị tham gia phỏng vấn.`,
    '',
    'Đề xuất ba khung giờ, anh/chị chọn giúp một khung phù hợp:',
    ...slots.map((s, i) => `${i + 1}. ${s}`),
    '',
    'Buổi làm việc gồm phần trao đổi chuyên môn và một bài về nhà ngắn khoảng ba giờ để anh/chị thể hiện năng lực thực tế. Chúng tôi sẽ gửi đề bài sau khi anh/chị xác nhận lịch.',
    '',
    'Anh/chị vui lòng phản hồi thư này để xác nhận khung giờ. Nếu cả ba đều chưa tiện, xin đề xuất giúp thời gian khác.',
    '',
    'Trân trọng,',
    'Phòng Nhân sự, Công ty TNHH Hiệp Lực Phát Triển Việt (SDVICO)'
  ];
  return lines.join('\n');
}
