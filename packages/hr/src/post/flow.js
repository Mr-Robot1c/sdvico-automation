// Luồng đăng tin bằng Playwright, bám kế hoạch Phần 6.
// Điền form theo nhịp người, gặp rào thì dừng, diễn tập thì dừng trước nút gửi cuối.
// Định vị phần tử theo nhãn (getByLabel), không theo lớp CSS sinh tự động (Phần 6 Nguyên lý 6).

// Tạo hàm flow cho một tin đăng cụ thể, chạy trên một trang (thật hoặc bản sao T0).
export function makePostJobFlow({ post, pageUrl, screenshotPath = null }) {
  return async function postJobFlow({ page, dryRun, checkStop, humanType, randomDelay, BarrierError }) {
    await checkStop();
    await page.goto(pageUrl);
    await randomDelay(600, 1500);

    // Gặp rào là dừng: mã xác nhận, xác thực hai bước, cảnh báo bất thường (Phần 6 Nguyên lý 7).
    const barrier = await page.getByText(/mã xác nhận|captcha|xác thực hai bước|hoạt động bất thường/i).count();
    if (barrier > 0) throw new BarrierError('Gặp rào xác thực khi đăng tin, dừng để người xử lý.');

    // Điền từng ô, gõ như người, chờ theo trạng thái.
    await humanType(page.getByLabel('Tiêu đề tin tuyển dụng'), post.tieu_de);
    await randomDelay();
    await checkStop();
    await humanType(page.getByLabel('Địa điểm'), post.dia_diem);
    await randomDelay();
    await humanType(page.getByLabel('Mức lương'), post.muc_luong);
    await randomDelay();
    await humanType(page.getByLabel('Email liên hệ'), post.email);
    await randomDelay();
    await checkStop();
    await humanType(page.getByLabel('Mô tả công việc'), post.noi_dung);
    await randomDelay();

    // Chụp màn hình toàn trang đã điền, để người kiểm tra nội dung và vị trí.
    if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true });

    if (dryRun) {
      // Diễn tập: dừng ngay trước nút gửi cuối. KHÔNG bấm Đăng tin (điều cấm 1).
      return { dryRun: true, da_dien: true, screenshot: screenshotPath };
    }

    // Chạy thật: chỉ tới đây khi người vận hành đã mở khóa (điều cấm 1: người bấm gửi).
    await checkStop();
    await page.getByRole('button', { name: 'Đăng tin' }).click();
    await page.getByText('Đã đăng tin thành công').waitFor({ timeout: 10000 });
    return { dryRun: false, da_dang: true, screenshot: screenshotPath };
  };
}
