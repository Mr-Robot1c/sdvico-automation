// Browser runner theo thiết kế bắt buộc ở kế hoạch Phần 6.4. Viết một lần, hai mảng dùng chung.
// Playwright nạp động để core vẫn dùng được khi chưa cài playwright, ví dụ tác vụ demo.
//
// Nguyên lý bám kế hoạch Phần 6:
//  - Giữ hồ sơ trình duyệt theo tài khoản, không đăng nhập lặp.
//  - Chrome thật, channel chrome, có giao diện.
//  - Nhịp độ của người, giãn cách ngẫu nhiên, gõ từng ký tự.
//  - Công tắc dừng khẩn kiểm trước mỗi thao tác.
//  - Chế độ diễn tập, dừng trước nút gửi cuối cùng, chụp màn hình.
//  - Gặp rào chắn thì dừng và đẩy vào approval_queue, không phá rào.

import { logRun } from './run-log.js';
import { pushApproval } from './approval.js';
import { assertNotStopped } from './emergency-stop.js';

// Ném lỗi này khi gặp mã xác nhận hình ảnh, xác thực hai bước, hoặc cảnh báo bất thường.
export class BarrierError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BarrierError';
  }
}

export function randomDelay(min = 800, max = 3000) {
  const ms = Math.floor(min + Math.random() * (max - min));
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Gõ từng ký tự có độ trễ, không dùng fill cho ô nội dung dài.
export async function humanType(locator, text, { min = 40, max = 120 } = {}) {
  for (const ch of text) {
    await locator.type(ch, { delay: Math.floor(min + Math.random() * (max - min)) });
    if (Math.random() < 0.08) await randomDelay(120, 400);
  }
}

// Chạy một luồng trình duyệt cho một tài khoản. flow là hàm nghiệp vụ do mảng hr hoặc marketing truyền vào.
// flow nhận các tiện ích và phải tự dừng trước nút gửi cuối khi dryRun bằng true.
export async function runBrowserFlow(client, {
  account,
  profileDir,
  task,
  dryRun = true,
  flow
}) {
  await assertNotStopped(client);

  const { chromium } = await import('playwright');
  const ctx = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1440, height: 900 }
  });
  const page = ctx.pages()[0] || (await ctx.newPage());

  // Nơi gọi phải gọi checkStop trước mỗi thao tác quan trọng.
  const checkStop = async () => { await assertNotStopped(client); };

  try {
    await flow({ page, dryRun, checkStop, humanType, randomDelay, BarrierError });
    await logRun(client, {
      task,
      actor: 'browser-runner',
      status: 'ok',
      detail: { account, dryRun }
    });
  } catch (err) {
    let shot = null;
    try {
      // Ghi chú: bản hoàn thiện nên tải ảnh lên Supabase Storage rồi lưu đường dẫn Storage.
      shot = 'tmp/' + account + '-' + Date.now() + '.png';
      await page.screenshot({ path: shot, fullPage: true });
    } catch (e) {
      shot = null;
    }
    const isBarrier = err instanceof BarrierError;
    await logRun(client, {
      task,
      actor: 'browser-runner',
      status: 'error',
      detail: { account, dryRun, barrier: isBarrier, message: String((err && err.message) || err) },
      screenshotPath: shot
    });
    if (isBarrier) {
      // Gặp rào là dừng, đẩy cho người xử lý bằng tay. Không phá rào, không giải mã xác nhận hình ảnh.
      await pushApproval(client, {
        kind: 'browser_barrier',
        title: 'Gặp rào chắn khi chạy ' + task + ' trên ' + account,
        payload: { account, task, message: String(err.message), screenshotPath: shot }
      });
    }
    throw err;
  } finally {
    await ctx.close();
  }
}
