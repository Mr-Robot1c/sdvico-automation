// Chạy thử luồng đăng tin ở mức T0: điền form trên bản sao trang lưu cục bộ.
// Không đụng sàn thật, không cần tài khoản. Bám kế hoạch Phần 5 (mức T0) và Phần 6.
//
// Cách chạy:
//   Diễn tập (mặc định), dừng trước nút gửi:  node packages/hr/src/post/run.mjs
//   Chạy đủ trên trang mô phỏng (bấm gửi):    node packages/hr/src/post/run.mjs --real
//
// --real ở đây vẫn an toàn vì chỉ chạy trên trang mô phỏng cục bộ, để kiểm cả nhánh gửi.

import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getServiceClient, runBrowserFlow } from '../../../core/src/index.js';
import { makePostJobFlow } from './flow.js';
import { composePosting } from './compose.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const SAMPLE_BODY = [
  'Công ty SDVICO tuyển Kỹ thuật viên lắp đặt và bảo trì thiết bị giám sát hành trình tàu cá.',
  '',
  'Mô tả công việc:',
  '- Lắp đặt, cấu hình, bảo trì thiết bị định vị cho tàu cá tại cảng.',
  '- Xử lý sự cố tại chỗ, hướng dẫn khách sử dụng.',
  '',
  'Yêu cầu:',
  '- Tốt nghiệp cao đẳng điện tử hoặc viễn thông.',
  '- Biết đọc sơ đồ mạch, lắp đặt thiết bị điện tử.',
  '- Sẵn sàng đi công tác cảng cá.',
  '',
  'Quyền lợi: lương thỏa thuận, bảo hiểm đầy đủ, đào tạo nghề.',
  'Nơi làm việc: Vũng Tàu. Ứng tuyển: gửi CV về tuyendung@sdvico.vn.'
].join('\n');

async function main() {
  const real = process.argv.includes('--real');
  const dryRun = !real;

  const post = composePosting({
    title: 'Kỹ thuật viên lắp đặt thiết bị giám sát tàu cá (Vũng Tàu)',
    jobBoardBody: SAMPLE_BODY,
    targeting: { dia_diem_uu_tien: [{ dia_diem: 'Vũng Tàu', uu_tien: 1 }] },
    salary: '10.000.000 - 15.000.000 đồng'
  });

  const pageUrl = pathToFileURL(path.join(here, 't0', 'mock-job-board.html')).href;
  const profileDir = path.join(os.tmpdir(), 'sdvico-t0-profile');
  const screenshotPath = path.join(os.tmpdir(), 'sdvico-t0-post.png');

  const client = getServiceClient();
  const flow = makePostJobFlow({ post, pageUrl, screenshotPath });

  const res = await runBrowserFlow(client, {
    account: 't0-mock',
    profileDir,
    task: 'hr-post-t0',
    dryRun,
    headless: true, // T0 chạy không cần màn hình
    channel: null, // dùng chromium đi kèm, không cần Chrome thật
    flow
  });

  console.log(JSON.stringify({ che_do: dryRun ? 'diễn tập' : 'gửi thật (trên trang mô phỏng)', ket_qua: res, tin_dang: post }, null, 2));
}

main().catch((err) => {
  console.error('Lỗi chạy T0:', err.message);
  process.exit(1);
});
