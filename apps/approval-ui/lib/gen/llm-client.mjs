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
// 16/10: bài bán (social) cũng sang Gemma (chấm mù 6,3 so với flash-lite 5,5). Video, BOSS giữ model cũ: prompt
// 17.000 tới 39.000 token mỗi lượt, vượt hạn mức miễn phí 16.000 token/phút của Gemma.
const TASK_DEFAULTS = { blog: 'gemma-4-26b-a4b-it', content: 'gemma-4-26b-a4b-it', social: 'gemma-4-26b-a4b-it' };

// Model cho một việc: env MKT_MODEL_<VIỆC> (vd MKT_MODEL_BLOG) > mặc định của việc > MKT_MODEL > flash-lite.
// Quay về flash-lite cho blog: đặt MKT_MODEL_BLOG=gemini-flash-lite-latest, không cần sửa code.
export function modelFor(task, env = process.env) {
  const own = String(env[`MKT_MODEL_${String(task).toUpperCase()}`] || '').trim();
  return own || TASK_DEFAULTS[task] || String(env.MKT_MODEL || '').trim() || 'gemini-flash-lite-latest';
}

export function isGemma(model) {
  return /^(models\/)?gemma/i.test(String(model || ''));
}

// MODEL TRÊN MÁY (19/10): tên "ollama:<model>" (vd MKT_MODEL_BLOG=ollama:sdvico-gemma) gọi Ollama theo chuẩn OpenAI
// ở MKT_OLLAMA_URL (mặc định localhost:11434/v1) thay cho Gemini API. Chỉ dùng khi chạy trên máy nội bộ (rotate-now.mjs);
// Vercel và GitHub Actions không thấy localhost. Đi chung đường vá Gemma (lọc JSON, thử lại, lùi flash-lite) nhưng
// không tính hạn mức token/phút. Cách cài và tạo model ngữ cảnh 32K: docs/runbook-bot-tim-kiem-model.md.
export function isLocal(model) {
  return /^ollama:/i.test(String(model || ''));
}

function contentsToText(contents) {
  if (typeof contents === 'string') return contents;
  const list = Array.isArray(contents) ? contents : [contents];
  return list.map((c) => (typeof c === 'string' ? c : (c?.parts || []).map((p) => p?.text || '').join(''))).join('\n');
}

// Gọi Ollama, trả về cùng dạng phản hồi Gemini mà wrapAi đọc (text, usageMetadata).
// MKT_OLLAMA_REASONING mặc định "none": Gemma 4 trên Ollama tự "suy nghĩ" trước khi trả lời, chậm gấp 4 tới 10 lần (đo 19/10).
export async function callLocal(params, signal, { fetchImpl = globalThis.fetch, env = process.env } = {}) {
  const base = String(env.MKT_OLLAMA_URL || 'http://localhost:11434/v1').replace(/\/$/, '');
  const cfg = params?.config || {};
  const messages = [];
  if (cfg.systemInstruction) messages.push({ role: 'system', content: String(cfg.systemInstruction) });
  messages.push({ role: 'user', content: contentsToText(params?.contents) });
  const effort = String(env.MKT_OLLAMA_REASONING ?? 'none').trim();
  const r = await fetchImpl(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: String(params?.model).replace(/^ollama:/i, ''),
      messages,
      ...(cfg.temperature != null ? { temperature: cfg.temperature } : {}),
      ...(cfg.responseMimeType === 'application/json' ? { response_format: { type: 'json_object' } } : {}),
      ...(effort ? { reasoning_effort: effort } : {}),
    }),
    signal,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`ollama ${r.status}: ${String(j?.error?.message || j?.error || '').slice(0, 140)}`);
  const u = j?.usage || {};
  return {
    text: String(j?.choices?.[0]?.message?.content || ''),
    usageMetadata: { promptTokenCount: u.prompt_tokens || 0, candidatesTokenCount: u.completion_tokens || 0, totalTokenCount: u.total_tokens || 0 },
    modelVersion: params?.model,
  };
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

// HẠN MỨC PHÚT (đo 15/10: 429 "GenerateContentInputTokensPerModelPerMinute-FreeTier", 16.000 token đầu vào/phút,
// tính chung mọi việc dùng Gemma trong cùng project). Đếm token đã gửi trong 60 giây gần nhất của tiến trình này;
// lượt sắp vượt thì chờ cửa sổ trôi, chờ không kịp trong quỹ thì lùi dự phòng. Ước token trước khi gọi bằng số ký tự
// chia 2,5 (prompt bài bán 14.500 ký tự đo ra khoảng 5.600 token), gọi xong thay bằng số thật usageMetadata.
const GEMMA_TPM = Number(process.env.MKT_GEMMA_TPM) || 15000;
const WINDOW_MS = 60000;
let gemmaWindow = [];
export function _resetGemmaWindow() { gemmaWindow = []; runDeadline = 0; }
export function estimateTokens(params) {
  const sys = String(params?.config?.systemInstruction || '');
  const c = params?.contents;
  const body = typeof c === 'string' ? c : JSON.stringify(c || '');
  return Math.ceil((sys.length + body.length) / 2.5);
}
// Số mili giây phải chờ để gửi thêm 'tokens' mà không vượt GEMMA_TPM trong cửa sổ 60 giây (0 = gửi ngay).
export function gemmaWaitMs(tokens, t, tpm = GEMMA_TPM) {
  gemmaWindow = gemmaWindow.filter((e) => t - e.at < WINDOW_MS);
  let used = gemmaWindow.reduce((a, e) => a + e.tokens, 0);
  if (used + tokens <= tpm) return 0;
  for (const e of [...gemmaWindow].sort((a, b) => a.at - b.at)) {
    used -= e.tokens;
    if (used + tokens <= tpm) return e.at + WINDOW_MS - t + 500;
  }
  return WINDOW_MS;
}

// HẠN CHÓT CẢ LƯỢT (16/10): rotate sinh 2 bài bán hoặc 1 bán + 1 content trong một lần gọi, maxDuration 180 giây. Route
// đặt hạn chót chung; mọi wrapAi trong lượt lấy hạn sớm hơn giữa quỹ riêng và hạn này. Hạn đã qua thì bỏ qua (tiến trình
// Vercel dùng lại cho lượt sau, hạn cũ không được chặn Gemma oan).
let runDeadline = 0;
export function setRunDeadline(ts) { runDeadline = Number(ts) || 0; }

const RETRIABLE = /429|500|503|INTERNAL|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand|aborted|timeout|JSON/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function withTimeout(promiseFactory, ms) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  return promiseFactory(ac.signal).finally(() => clearTimeout(timer));
}

// Bọc client. opts: budgetMs = quỹ thời gian cho CẢ lần sinh một bài (mọi lượt gọi qua client này),
// gemmaTimeoutMs = hạn mỗi lượt Gemma, tries = số lượt Gemma tối đa mỗi lần gọi, fallbackModel, log,
// local = hàm gọi model "ollama:" (mặc định callLocal, test thay bằng hàm giả).
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
    local = callLocal,
  } = opts;
  const t0 = now();
  const deadline = runDeadline > t0 ? Math.min(t0 + budgetMs, runDeadline) : t0 + budgetMs;
  return {
    models: {
      async generateContent(params) {
        const model = params?.model;
        const onMachine = isLocal(model);
        if (!isGemma(model) && !onMachine) {
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
          const est = estimateTokens({ ...params, config: gemmaCfg });
          const wait = onMachine ? 0 : gemmaWaitMs(est, now());
          if (wait > 0) {
            if (deadline - now() - wait < minGemmaMs) { lastErr = new Error(`han muc 16.000 token/phut, phai cho ${Math.round(wait / 1000)} giay, khong kip quy`); break; }
            log?.warn?.(`[llm-client] ${model} cho ${Math.round(wait / 1000)} giay cho het han muc token/phut`);
            await sleep(wait);
          }
          const left = deadline - now();
          if (left < minGemmaMs) { lastErr = new Error(`het quy thoi gian (con ${Math.round(left / 1000)} giay)`); break; }
          const entry = { at: now(), tokens: est };
          if (!onMachine) gemmaWindow.push(entry);
          try {
            const res = await withTimeout(
              (signal) => (onMachine
                ? local({ ...params, config: gemmaCfg }, signal)
                : ai.models.generateContent({ ...params, config: { ...gemmaCfg, abortSignal: signal } })),
              Math.min(gemmaTimeoutMs, left - 5000),
            );
            if (Number(res?.usageMetadata?.promptTokenCount) > 0) entry.tokens = Number(res.usageMetadata.promptTokenCount);
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
            // 429 hạn mức: coi như cửa sổ phút đã đầy để lượt sau chờ đúng, không bắn tiếp cho tốn hạn mức ngày.
            if (/429|RESOURCE_EXHAUSTED/.test(String(e?.message || e))) entry.tokens = GEMMA_TPM;
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
