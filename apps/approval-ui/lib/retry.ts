// fetch có thử lại với giãn cách tăng dần (Phần 6.3.1): lỗi TẠM THỜI (5xx, mạng/timeout) thì thử
// lại 1 -> 2 -> 4 giây (tối đa 3 lần). Lỗi VĨNH VIỄN (4xx) trả về ngay, KHÔNG thử lại.
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  opts?: { retries?: number; baseMs?: number }
): Promise<Response> {
  const retries = opts?.retries ?? 3;
  const baseMs = opts?.baseMs ?? 1000;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.status >= 500 && attempt < retries) {
        await sleep(baseMs * 2 ** attempt); // 1s, 2s, 4s
        continue;
      }
      return res; // 2xx/3xx/4xx: trả về ngay (4xx là lỗi vĩnh viễn, không thử lại)
    } catch (e) {
      lastErr = e; // lỗi mạng/timeout = tạm thời
      if (attempt < retries) {
        await sleep(baseMs * 2 ** attempt);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}
