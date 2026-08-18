// [CẦN XÁC NHẬN Phòng Nhân sự/pháp lý trước khi dùng thật] Luồng tìm CV chủ động trên các
// trang như TopCV, dùng qua tài khoản nhà tuyển dụng TRẢ PHÍ của công ty, đúng tính năng tìm-CV
// nằm trong phạm vi gói dịch vụ đã mua — KHÔNG phải scraper vượt rào hay vượt giới hạn xem.
//
// CHƯA XÁC ĐỊNH TopCV (hay bất kỳ trang tương tự) có official API cho nhà tuyển dụng hay không.
// File này không tự bịa endpoint hay bộ chọn CSS cụ thể của trang ngoài — bộ chọn thật đổi theo
// giao diện trang tại thời điểm dùng, người cấu hình (đã xác nhận pháp lý) phải tự điền đúng
// theo UI thật lúc đăng nhập, không đoán trước trong code.
//
// Chạy qua packages/core/src/browser-runner.js (runBrowserFlow): Chrome thật, nhịp độ người,
// gặp CAPTCHA/giới hạn xem/đăng nhập lại thì ném BarrierError để dừng và đẩy pushApproval
// (kind='browser_barrier') cho người xử lý bằng tay — không phá rào, không giải mã xác nhận
// hình ảnh (CLAUDE.md Phần 7: "Gặp rào chắn của nền tảng thì dừng, không phá rào").

// cfg: { loginUrl, searchUrl, keywords } — lấy từ hr_cv_sources/hr_platforms, không hard-code.
// Trả về mảng { rawText, sourceRef } cho mỗi CV tìm được, để run.mjs đẩy qua pipeline hr-intake.
export function makeTopcvFlow(cfg) {
  return async function flow({ page, dryRun, checkStop, humanType, randomDelay, BarrierError }) {
    await checkStop();

    if (!cfg.loginUrl || !cfg.searchUrl) {
      throw new Error('Thiếu loginUrl/searchUrl trong cấu hình nguồn CV. Người cấu hình phải điền theo UI thật của trang, không đoán trước.');
    }

    await page.goto(cfg.loginUrl, { waitUntil: 'domcontentloaded' });
    await randomDelay();

    // Đăng nhập dựa vào phiên đã lưu trong profileDir (runBrowserFlow dùng launchPersistentContext).
    // Nếu trang yêu cầu đăng nhập lại (phiên hết hạn) hoặc hiện CAPTCHA, đó là rào chắn — dừng.
    const loginFormVisible = await page.locator('form[action*="login" i], input[type="password"]').first().isVisible().catch(() => false);
    if (loginFormVisible) {
      throw new BarrierError('Trang yêu cầu đăng nhập lại hoặc xác minh — cần người xử lý bằng tay, không tự điền mật khẩu ở đây.');
    }

    await checkStop();
    await page.goto(cfg.searchUrl, { waitUntil: 'domcontentloaded' });
    await randomDelay();

    const captchaVisible = await page.locator('[class*="captcha" i], iframe[src*="captcha" i]').first().isVisible().catch(() => false);
    if (captchaVisible) {
      throw new BarrierError('Gặp CAPTCHA khi tìm CV — dừng, không phá rào.');
    }

    // [CẦN XÁC NHẬN] Bộ chọn danh sách kết quả và nội dung CV thật phải điền theo giao diện
    // hiện hành của trang lúc dùng — không đoán trước ở đây. dryRun=true (mặc định) chỉ đếm số
    // kết quả tìm thấy, không mở/trích nội dung từng CV, để người cấu hình xác nhận luồng đúng
    // hướng trước khi cho trích dữ liệu thật.
    const resultCount = await page.locator(cfg.resultSelector || '[data-cv-result]').count().catch(() => 0);

    if (dryRun) {
      return { found: resultCount, items: [], dryRun: true };
    }

    if (!cfg.resultSelector || !cfg.detailSelector) {
      throw new Error('Thiếu resultSelector/detailSelector — chưa cấu hình đủ để trích nội dung CV thật.');
    }

    const items = [];
    const limit = Math.min(resultCount, cfg.maxPerRun || 5);
    for (let i = 0; i < limit; i++) {
      await checkStop();
      const el = page.locator(cfg.resultSelector).nth(i);
      await el.click().catch(() => {});
      await randomDelay();
      const text = await page.locator(cfg.detailSelector).innerText().catch(() => '');
      if (text.trim()) items.push({ rawText: text.trim(), sourceRef: cfg.searchUrl });
    }

    return { found: resultCount, items, dryRun: false };
  };
}
