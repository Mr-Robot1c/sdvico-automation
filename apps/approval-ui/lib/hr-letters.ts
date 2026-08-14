// Soạn thư kết quả tuyển dụng. Máy soạn, người bấm Duyệt mới gửi (điều cấm 1).
// Giọng văn người Việt, không gạch dài, không sáo rỗng.

function greetingOf(name: string | null | undefined, xh: string): string {
  const has = name && name.trim() && name.trim() !== 'anh/chị';
  return has ? `Kính gửi ${xh} ${name!.trim()},` : `Kính gửi ${xh},`;
}

const SIGN = ['', 'Trân trọng,', 'Phòng Nhân sự, Công ty TNHH Hiệp Lực Phát Triển Việt (SDVICO)'];

// Thư mời nhận việc (trúng tuyển).
export function composeOfferLetter({ name, position, xh = 'anh/chị' }: { name?: string | null; position: string; xh?: string }): string {
  return [
    greetingOf(name, xh),
    '',
    `Cảm ơn ${xh} đã tham gia phỏng vấn vị trí ${position} tại Công ty SDVICO.`,
    `Chúng tôi rất vui được thông báo ${xh} đã trúng tuyển và mong được chào đón ${xh} gia nhập đội ngũ.`,
    '',
    `Phòng Nhân sự sẽ liên hệ để trao đổi chi tiết về thời gian nhận việc, hợp đồng lao động và các thủ tục liên quan.`,
    `Nếu có thắc mắc, ${xh} vui lòng phản hồi thư này hoặc gọi hotline 1900 23 23 49.`,
    ...SIGN,
  ].join('\n');
}

// Thư từ chối sau phỏng vấn.
export function composeRejectLetter({ name, position, xh = 'anh/chị' }: { name?: string | null; position: string; xh?: string }): string {
  return [
    greetingOf(name, xh),
    '',
    `Cảm ơn ${xh} đã quan tâm và dành thời gian ứng tuyển vị trí ${position} tại Công ty SDVICO.`,
    `Sau khi cân nhắc kỹ, chúng tôi rất tiếc chưa thể mời ${xh} vào vị trí này trong đợt tuyển dụng lần này.`,
    '',
    `Chúng tôi trân trọng hồ sơ của ${xh} và mong có dịp hợp tác khi có vị trí phù hợp hơn trong tương lai.`,
    `Chúc ${xh} sức khỏe và sớm tìm được công việc như ý.`,
    ...SIGN,
  ].join('\n');
}
