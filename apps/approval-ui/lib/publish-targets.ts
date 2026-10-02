// Đích đăng THẬT của từng kênh khi người duyệt bấm Duyệt (2/10, audit đợt A: "Duyệt xong bài đi đâu?").
// Một chỗ dùng chung để chữ ở thẻ duyệt, modal xem trước (hàng đợi và /noi-dung) không lệch nhau.
//
// Sự thật nghiệp vụ:
//  - Facebook: máy đăng bằng token lên Page phụ (kênh test). Page chính SDVICO VN do NGƯỜI đăng tay,
//    rồi bấm "Ghép link FB chính" để bài vào bảng đo lường và chia sẻ group.
//  - YouTube: máy tự đăng lên kênh YouTube SDVICO khi Duyệt.
//  - TikTok: API đăng đã bỏ (app chưa qua audit), duyệt xong xuất tay.
// Tên Page và kênh đổi được qua env phía server; mặc định theo trang Kết nối.

export const FB_AUTO_PAGE_NAME = process.env.FACEBOOK_AUTO_PAGE_NAME || 'SDViCo - Thiết bị tàu cá';
export const FB_MAIN_PAGE_NAME = process.env.FACEBOOK_MAIN_PAGE_NAME || 'SDVICO VN';
export const YT_CHANNEL_NAME = process.env.YOUTUBE_CHANNEL_NAME || 'SDVICO - Thiết bị tàu cá';

const LINES: Record<string, string> = {
  facebook: `Facebook: máy tự đăng lên Page phụ (${FB_AUTO_PAGE_NAME}). Page chính ${FB_MAIN_PAGE_NAME} người đăng tay rồi bấm Ghép link FB chính.`,
  youtube: `YouTube: máy tự đăng lên kênh ${YT_CHANNEL_NAME}.`,
  tiktok: 'TikTok: không tự đăng, duyệt xong xuất tay.',
  website: 'Website: hiện ở trang blog công khai khi duyệt.',
};

/** Dòng "đăng ở đâu" cho từng kênh của bài. Có plan_channel thì chỉ kênh đó (khớp nhãn 📍), không thì theo channels. */
export function publishTargetLines(planChannel?: string | null, channels?: string[] | null): string[] {
  const pc = String(planChannel || '').toLowerCase();
  const arr = pc && LINES[pc]
    ? [pc]
    : (Array.isArray(channels) && channels.length ? channels : ['facebook']).map((c) => String(c || '').toLowerCase());
  return [...new Set(arr)].filter((c) => LINES[c]).map((c) => LINES[c]);
}
