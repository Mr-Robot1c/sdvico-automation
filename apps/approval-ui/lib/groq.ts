// Gọi Groq qua REST (tương thích OpenAI) từ phía máy chủ. Dùng cho trang Tạo JD,
// worker soạn bài, phân loại bình luận. Không có GROQ_API_KEY thì trả null để nơi
// gọi lùi về bản ghép, không làm hỏng trang.
// Điều cấm 7: khóa nằm trong biến môi trường máy chủ, không gửi xuống trình duyệt.
//
// P1-9: wrapper có retry cho 429/5xx và chuỗi model dự phòng.
//   - GROQ_MODELS: danh sách model cách nhau bằng dấu phẩy, thứ tự ưu tiên. Mặc định
//     "openai/gpt-oss-120b,llama-3.1-8b-instant" — nếu Groq gỡ model chính (đã có tiền
//     lệ với llama-3.3-70b-versatile), rơi tự động sang model kế.
//   - Retry: tối đa 3 lần với backoff 500ms / 1s / 2s cho 429 hoặc 5xx.
//   - Model kế được chọn khi lỗi là 404 model_not_found HOẶC hết retry vẫn 5xx.
//   - Ghi console.warn khi fallback để đội vận hành thấy trong Vercel logs.

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

function modelChain(): string[] {
  const fromEnv = (process.env.GROQ_MODELS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (fromEnv.length > 0) return fromEnv;
  // Backward-compat: các biến cũ HR_JD_MODEL / HR_SCREEN_MODEL / HR_POST_MODEL đứng đầu chain.
  const legacy = [process.env.HR_JD_MODEL, process.env.HR_SCREEN_MODEL, process.env.HR_POST_MODEL]
    .filter(Boolean) as string[];
  const defaults = ['openai/gpt-oss-120b', 'llama-3.1-8b-instant'];
  return Array.from(new Set([...legacy, ...defaults]));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callOnce(model: string, key: string, body: object): Promise<{ ok: true; text: string | null } | { ok: false; status: number; detail: string }> {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ ...body, model }),
      cache: 'no-store',
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false, status: res.status, detail: detail.slice(0, 400) };
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    return { ok: true, text: typeof text === 'string' ? text : null };
  } catch (err: unknown) {
    return { ok: false, status: 0, detail: err instanceof Error ? err.message : String(err) };
  }
}

export async function groqChat(
  system: string,
  user: string,
  opts: { json?: boolean; temperature?: number; maxTokens?: number } = {}
): Promise<string | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;

  const body = {
    temperature: opts.temperature ?? 0.5,
    max_tokens: opts.maxTokens ?? 2200,
    ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };

  const models = modelChain();
  const backoffs = [500, 1000, 2000];
  let lastError = '';

  for (let mi = 0; mi < models.length; mi++) {
    const model = models[mi];
    for (let attempt = 0; attempt <= backoffs.length; attempt++) {
      const r = await callOnce(model, key, body);
      if (r.ok) {
        if (mi > 0 || attempt > 0) {
          // Ghi ra logs để đội vận hành thấy nếu model chính chết hoặc bị 429.
          console.warn(`[groq] fallback đã dùng: model="${model}", model_index=${mi}, retry=${attempt}`);
        }
        return r.text;
      }
      lastError = `HTTP ${r.status}: ${r.detail}`;
      // Model không tồn tại → sang model kế ngay, không retry.
      if (r.status === 404 || /model_not_found|model_decommissioned|does not exist/i.test(r.detail)) break;
      // 429 hoặc 5xx → retry trong cùng model với backoff.
      if ((r.status === 429 || r.status >= 500) && attempt < backoffs.length) {
        await sleep(backoffs[attempt]);
        continue;
      }
      // 4xx khác (bad request, key sai, ...) → không retry, không fallback model — throw.
      throw new Error(`Groq lỗi ${lastError}`);
    }
    // Hết retry cho model này → thử model kế.
  }
  throw new Error(`Groq đã thử ${models.length} model, mọi lời gọi thất bại. Lỗi cuối: ${lastError}`);
}
