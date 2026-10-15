// llm-client.mjs — chọn model theo từng việc + vá riêng cho Gemma (15/10/2026).
//
// 15/10 (Thanh: "có kiếm con nào free đi như gemma"): chấm mù 10 bài thật qua lưới sự thật, Gemma 4 26B
// (miễn phí, cùng khóa Gemini) 6,4 điểm so với flash-lite 5,7 (Sonnet 7,6). Thanh chốt chuyển BLOG và CONTENT
// sang Gemma trước. Gemma trên Gemini API khác Gemini ở 4 chỗ, đo được trong lần thử:
//   1. không nhận responseSchema (blog lùi về bài mẫu),
//   2. JSON hay kèm chữ thừa phía sau ("Unexpected non-whitespace character after JSON"),
//   3. hay lỗi 500 INTERNAL / 503 quá tải,
//   4. chậm: 16 tới 107 giây một lượt (flash-lite khoảng 9 giây).
// wrapAi bọc client GoogleGenAI: model Gemma thì bỏ responseSchema, lọc lấy MỘT khối JSON, thử lại 2 lượt trong
// quỹ thời gian; lỗi hoặc hết quỹ thì lùi về model dự phòng (flash-lite) cùng prompt, KHÔNG lùi về bài mẫu.
// Model khác Gemma: đi thẳng, y như cũ.

export const FALLBACK_MODEL = process.env.MKT_MODEL || 'gemini-flash-lite-latest';
const TASK_DEFAULTS = { blog: 'gemma-4-26b-a4b-it', content: 'gemma-4-26b-a4b-it' };

// Model cho một việc: env MKT_MODEL_<VIỆC> (vd MKT_MODEL_BLOG) > mặc định của việc > MKT_MODEL > flash-lite.
// Quay về flash-lite cho blog: đặt MKT_MODEL_BLOG=gemini-flash-lite-latest, không cần sửa code.
export function modelFor(task, env = process.env) {
  const own = String(env[`MKT_MODEL_${String(task).toUpperCase()}`] || '').trim();
  return own || TASK_DEFAULTS[task] || String(env.MKT_MODEL || '').trim() || 'gemini-flash-lite-latest';
}

export function isGemma(model) {
  return /^(models\/)?gemma/i.test(String(model || ''));
}

// Lấy khối JSON {...} đầu tiên CÂN NGOẶC (bỏ ```json, chữ dẫn trước, chữ thừa sau). Không có thì trả nguyên văn.
export function extractJsonText(text) {
  const t = String(text || '').replace(/```(?:json)?/gi, '');
  const start = t.indexOf('{');
  if (start < 0) return t.trim();
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return t.slice(start, i + 1);
  }
  return t.slice(start).trim();
}

const RETRIABLE = /429|500|503|INTERNAL|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand|aborted|timeout|JSON/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function withTimeout(promiseFactory, ms) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  return promiseFactory(ac.signal).finally(() => clearTimeout(timer));
}

// Bọc client. opts: budgetMs = quỹ thời gian cho CẢ lần sinh một bài (mọi lượt gọi qua client này),
// gemmaTimeoutMs = hạn mỗi lượt Gemma, tries = số lượt Gemma tối đa mỗi lần gọi, fallbackModel, log.
// Kết quả trả về có thêm usedModel (model thật đã trả lời) và fellBack (true khi đã lùi về dự phòng).
export function wrapAi(ai, opts = {}) {
  const {
    budgetMs = 90000,
    gemmaTimeoutMs = Number(process.env.MKT_GEMMA_TIMEOUT_MS) || 60000,
    tries = 2,
    fallbackModel = FALLBACK_MODEL,
    minGemmaMs = 30000,
    fallbackTimeoutMs = 30000,
    log = console,
    now = () => Date.now(),
  } = opts;
  const deadline = now() + budgetMs;
  return {
    models: {
      async generateContent(params) {
        const model = params?.model;
        if (!isGemma(model)) {
          const res = await ai.models.generateContent(params);
          return { text: res?.text, usageMetadata: res?.usageMetadata, modelVersion: res?.modelVersion, usedModel: model, fellBack: false };
        }
        const wantJson = params?.config?.responseMimeType === 'application/json';
        const { responseSchema, abortSignal, ...cfg } = params?.config || {};
        // Bỏ responseSchema thì Gemma không biết tên khóa (blog 070278db trả JSON không có khóa nào đúng): ghi tên khóa
        // vào chỉ dẫn hệ thống cho riêng lượt Gemma.
        const keys = responseSchema?.properties ? Object.keys(responseSchema.properties) : [];
        const gemmaCfg = keys.length
          ? { ...cfg, systemInstruction: `${cfg.systemInstruction || ''}\n\nĐỊNH DẠNG ĐẦU RA: đúng MỘT đối tượng JSON với các khóa ${keys.join(', ')}, giá trị là chuỗi văn bản; không markdown, không chữ nào ngoài JSON.`.trim() }
          : cfg;
        let lastErr = null;
        for (let i = 0; i < tries; i++) {
          const left = deadline - now();
          if (left < minGemmaMs) { lastErr = new Error(`het quy thoi gian (con ${Math.round(left / 1000)} giay)`); break; }
          try {
            const res = await withTimeout(
              (signal) => ai.models.generateContent({ ...params, config: { ...gemmaCfg, abortSignal: signal } }),
              Math.min(gemmaTimeoutMs, left - 5000),
            );
            let text = res?.text || '';
            if (wantJson) {
              text = extractJsonText(text);
              const obj = JSON.parse(text); // JSON hỏng thì tính là lỗi để thử lại / lùi về dự phòng
              // Gemma bỏ qua responseSchema nên có lúc thiếu khóa (blog 0cf02b6a thiếu 1 trong article/social/video,
              // bộ sinh lùi về bài mẫu): thiếu khóa bắt buộc cũng tính là JSON lỗi.
              const missing = (responseSchema?.required || []).filter((k) => !String(obj?.[k] ?? '').trim());
              if (missing.length) throw new Error(`JSON thieu khoa ${missing.join(', ')}`);
            }
            return { text, usageMetadata: res?.usageMetadata, modelVersion: res?.modelVersion, usedModel: model, fellBack: false };
          } catch (e) {
            lastErr = e;
            if (!RETRIABLE.test(String(e?.message || e?.name || e))) break;
            if (i < tries - 1) await sleep(2000);
          }
        }
        log?.warn?.(`[llm-client] ${model} khong tra loi duoc (${String(lastErr?.message || lastErr).slice(0, 120)}) -> lui ve ${fallbackModel}`);
        // abortSignal của nơi gọi (vd genOnce 20 giây ở blog) có thể đã hết hạn trong lúc chờ Gemma: lượt dự phòng
        // dùng hạn riêng; responseSchema trả lại vì model Gemini nhận được.
        // Dự phòng cũng có lúc trả JSON lỗi cú pháp (bài 4f0bfca0 khi đo 15/10): lọc khối JSON, hỏng thì gọi thêm 1 lần.
        let res = null;
        for (let j = 0; j < 2; j++) {
          res = await withTimeout(
            (signal) => ai.models.generateContent({ ...params, model: fallbackModel, config: { ...cfg, ...(responseSchema ? { responseSchema } : {}), abortSignal: signal } }),
            fallbackTimeoutMs,
          );
          if (!wantJson) break;
          try { const text = extractJsonText(res?.text); JSON.parse(text); res = { ...res, text }; break; } catch { /* thử lại 1 lần */ }
        }
        return { text: res?.text, usageMetadata: res?.usageMetadata, modelVersion: res?.modelVersion, usedModel: fallbackModel, fellBack: true };
      },
    },
  };
}
