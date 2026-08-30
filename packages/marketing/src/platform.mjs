// Tiện ích đa nền (30/8): gom mọi thứ vốn ghim cứng đường dẫn Windows về một chỗ, để script
// chạy được trên Windows, macOS và Linux mà KHÔNG cần Docker. Mọi giá trị đều có env override
// (đặt trong .env) rồi mới tới mặc định tự dò theo hệ điều hành.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const IS_WIN = process.platform === 'win32';
export const IS_MAC = process.platform === 'darwin';

// Thư mục dữ liệu ghi được, riêng theo máy (profile trình duyệt quét, file trạng thái...).
// Mặc định ~/.sdvico/<sub>; đổi cả gốc bằng env SDVICO_DATA_DIR.
export function dataDir(sub = '') {
  const base = (process.env.SDVICO_DATA_DIR || '').trim() || join(homedir(), '.sdvico');
  return sub ? join(base, sub) : base;
}

// Thư mục ảnh/tư liệu nguồn để upload. Mặc định ~/Pictures/SDViCo; đổi bằng env SDVICO_MEDIA_DIR.
export function mediaDir() {
  return (process.env.SDVICO_MEDIA_DIR || '').trim() || join(homedir(), 'Pictures', 'SDViCo');
}

// Lệnh Python. Windows hay chỉ có 'python'; macOS/Linux thường là 'python3'. Đổi bằng env PYTHON.
export function pythonCmd() {
  return (process.env.PYTHON || '').trim() || (IS_WIN ? 'python' : 'python3');
}

// Dò trình duyệt Chromium (Chrome/Edge/Brave/Chromium) theo hệ điều hành. Trả về đường dẫn đầu
// tiên tồn tại, hoặc undefined để nơi gọi nhường cho chrome-launcher tự dò. Ưu tiên env.
function chromiumCandidates() {
  if (IS_WIN) {
    const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    return [
      join(pf, 'Google\\Chrome\\Application\\chrome.exe'),
      join(pf86, 'Google\\Chrome\\Application\\chrome.exe'),
      join(pf, 'Microsoft\\Edge\\Application\\msedge.exe'),
      join(pf86, 'Microsoft\\Edge\\Application\\msedge.exe'),
      join(pf, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'),
    ];
  }
  if (IS_MAC) {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
  }
  // Linux
  return [
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/brave-browser', '/usr/bin/microsoft-edge',
    '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ];
}

export function findChromium(envOverride) {
  const pref = (envOverride || process.env.SDVICO_BROWSER || '').trim();
  if (pref && existsSync(pref)) return pref;
  return chromiumCandidates().find((p) => existsSync(p)); // undefined nếu không thấy
}

// Thư mục "User Data" của Brave (để MƯỢN cookie phiên đăng nhập sống). Khác nhau mỗi hệ.
export function braveUserDataDir() {
  const env = (process.env.FB_SUITE_LIVE_UD || '').trim();
  if (env) return env;
  if (IS_WIN) {
    const local = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
    return join(local, 'BraveSoftware', 'Brave-Browser', 'User Data');
  }
  if (IS_MAC) return join(homedir(), 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser');
  return join(homedir(), '.config', 'BraveSoftware', 'Brave-Browser');
}
