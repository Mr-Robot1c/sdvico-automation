// Page CHÍNH SDVICO VN (facebook.com/SDVICOVN). 8/10: chuẩn bị cho máy đăng THẲNG lên Page chính.
// Bật bằng cấu hình, không cần sửa mã: trên Vercel đặt FACEBOOK_PAGE_ID = id Page chính và
// FACEBOOK_PAGE_ACCESS_TOKEN = Page token của Page chính có quyền pages_manage_posts. Khi đó:
//  - bài đăng xong tự ghi brief.fb_real_url (khỏi đăng tay + Ghép link, chia sẻ group dùng được ngay);
//  - dòng Đích đăng, trang Kết nối ghi đúng là Page chính;
//  - đo lường/báo cáo tuần vốn coi FACEBOOK_PAGE_ID là page chính (lib/page-origin.mjs) nên tự đúng.
// Chưa đổi env thì mọi thứ giữ nguyên như cũ (máy đăng Page phụ, người đăng tay Page chính).
export const FB_MAIN_PAGE_ID = (process.env.FACEBOOK_MAIN_PAGE_ID || process.env.FB_SUITE_ASSET_ID || '101052306114292').trim();

export function postsToMainPage(): boolean {
  const pid = String(process.env.FACEBOOK_PAGE_ID || '').trim();
  return !!pid && pid === FB_MAIN_PAGE_ID;
}
