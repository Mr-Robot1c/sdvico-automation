// test-llm-client.mjs — kiểm bộ gọi model chung (Gemma 15/10). Không gọi mạng. Chạy: npm run test:llm
import { wrapAi, modelFor, isGemma, isLocal, callLocal, extractJsonText, estimateTokens, gemmaWaitMs, setRunDeadline, _resetGemmaWindow } from './llm-client.mjs';

let fails = 0;
const check = (cond, msg) => { if (!cond) { fails += 1; console.error('  ✗', msg); } else console.log('  ✓', msg); };
const silent = { warn() {} };
// Client giả: script là danh sách phản hồi theo thứ tự (Error = ném lỗi, string = text), ghi lại params mỗi lượt.
function fakeAi(script) {
  const calls = [];
  return {
    calls,
    models: {
      async generateContent(params) {
        calls.push(params);
        const next = script.shift();
        if (next instanceof Error) throw next;
        return { text: next, usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } };
      },
    },
  };
}
const jsonParams = (model) => ({ model, contents: 'x', config: { systemInstruction: 's', responseMimeType: 'application/json', responseSchema: { type: 'OBJECT' }, temperature: 1 } });

console.log('1. Chọn model theo việc');
check(modelFor('blog', {}) === 'gemma-4-26b-a4b-it' && modelFor('content', {}) === 'gemma-4-26b-a4b-it' && modelFor('social', {}) === 'gemma-4-26b-a4b-it', 'blog, content, bài bán mặc định Gemma 4 26B');
check(modelFor('blog', { MKT_MODEL_BLOG: 'gemini-flash-lite-latest' }) === 'gemini-flash-lite-latest', 'MKT_MODEL_BLOG đổi lại được không cần sửa code');
check(modelFor('video', { MKT_MODEL: 'gemini-x' }) === 'gemini-x' && modelFor('video', {}) === 'gemini-flash-lite-latest', 'việc khác giữ MKT_MODEL / flash-lite');
check(isGemma('gemma-4-26b-a4b-it') && isGemma('models/gemma-4-31b-it') && !isGemma('gemini-flash-lite-latest'), 'isGemma nhận đúng tên');

console.log('2. Lọc JSON');
check(extractJsonText('```json\n{"a":1}\n```') === '{"a":1}', 'bỏ ```json');
check(extractJsonText('{"a":"x}y"}\n\nGhi chú thêm {b}') === '{"a":"x}y"}', 'cắt chữ thừa sau JSON, không nhầm ngoặc trong chuỗi');
check(extractJsonText('Đây là bài: {"a":{"b":2}} xong') === '{"a":{"b":2}}', 'ngoặc lồng nhau');

console.log('3. Gemma: bỏ responseSchema, lọc JSON');
{
  const ai = fakeAi(['{"body":"ok"}\nCảm ơn!']);
  const res = await wrapAi(ai, { log: silent }).models.generateContent(jsonParams('gemma-4-26b-a4b-it'));
  check(!('responseSchema' in ai.calls[0].config) && ai.calls[0].config.responseMimeType === 'application/json', 'gửi Gemma không có responseSchema, vẫn giữ mime JSON');
  check(ai.calls[0].config.systemInstruction === 's', 'schema không có properties: chỉ dẫn hệ thống giữ nguyên');
  check(res.text === '{"body":"ok"}' && res.usedModel === 'gemma-4-26b-a4b-it' && res.fellBack === false, 'trả JSON sạch, usedModel Gemma');
}
{
  const ai = fakeAi(['{"article":"a","social":"b","video":"c"}']);
  const p = jsonParams('gemma-4-26b-a4b-it');
  p.config.responseSchema = { type: 'OBJECT', properties: { article: {}, social: {}, video: {} }, required: ['article', 'social', 'video'] };
  await wrapAi(ai, { log: silent }).models.generateContent(p);
  check(/các khóa article, social, video/.test(ai.calls[0].config.systemInstruction) && ai.calls[0].config.systemInstruction.startsWith('s'), 'bỏ schema thì ghi tên khóa vào chỉ dẫn hệ thống (blog 070278db)');
}

console.log('4. Gemma lỗi 500 thì thử lại, rồi lùi flash-lite');
{
  const ai = fakeAi([new Error('{"error":{"code":500,"status":"INTERNAL"}}'), '{"body":"lan 2"}']);
  const res = await wrapAi(ai, { log: silent }).models.generateContent(jsonParams('gemma-4-26b-a4b-it'));
  check(ai.calls.length === 2 && res.text === '{"body":"lan 2"}' && !res.fellBack, '500 lần đầu, lần 2 Gemma trả được');
}
{
  const ai = fakeAi([new Error('503 UNAVAILABLE'), 'khong phai json', '{"body":"lite"}']);
  const res = await wrapAi(ai, { log: silent, fallbackModel: 'gemini-flash-lite-latest' }).models.generateContent(jsonParams('gemma-4-26b-a4b-it'));
  const last = ai.calls[2];
  check(res.fellBack && res.usedModel === 'gemini-flash-lite-latest' && res.text === '{"body":"lite"}', '503 rồi JSON hỏng: lùi flash-lite');
  check(last.model === 'gemini-flash-lite-latest' && last.config.responseSchema && last.config.abortSignal, 'lượt dự phòng trả lại responseSchema và có hạn chờ riêng');
}
{
  const ai = fakeAi([new Error('400 INVALID_ARGUMENT bad request'), '{"body":"lite"}']);
  const res = await wrapAi(ai, { log: silent }).models.generateContent(jsonParams('gemma-4-26b-a4b-it'));
  check(ai.calls.length === 2 && res.fellBack, 'lỗi không thử lại được (400): không thử Gemma lần 2, lùi thẳng dự phòng');
}

{
  const ai = fakeAi(['{"article":"a","social":"b"}', '{"article":"a","social":"b","video":"c"}']);
  const p = jsonParams('gemma-4-26b-a4b-it');
  p.config.responseSchema = { type: 'OBJECT', required: ['article', 'social', 'video'] };
  const res = await wrapAi(ai, { log: silent }).models.generateContent(p);
  check(ai.calls.length === 2 && !res.fellBack && JSON.parse(res.text).video === 'c', 'JSON thiếu khóa bắt buộc (blog 0cf02b6a) tính là lỗi, Gemma lần 2 đủ khóa');
}

console.log('5. Quỹ thời gian');
{
  let t = 0;
  const ai = fakeAi(['{"body":"lite"}']);
  const w = wrapAi(ai, { log: silent, budgetMs: 15000, now: () => t });
  const res = await w.models.generateContent(jsonParams('gemma-4-26b-a4b-it'));
  check(ai.calls.length === 1 && ai.calls[0].model !== 'gemma-4-26b-a4b-it' && res.fellBack, 'quỹ còn dưới 20 giây: không gọi Gemma, đi thẳng dự phòng');
}
{
  const expired = AbortSignal.abort();
  const ai = fakeAi(['{"body":"gemma"}']);
  const p = jsonParams('gemma-4-26b-a4b-it');
  p.config.abortSignal = expired;
  const res = await wrapAi(ai, { log: silent }).models.generateContent(p);
  check(ai.calls[0].config.abortSignal !== expired && !ai.calls[0].config.abortSignal.aborted && res.text === '{"body":"gemma"}', 'abortSignal đã hết hạn của nơi gọi (genOnce 20 giây) không chặn lượt Gemma');
}

console.log('5b. Hạn mức 16.000 token/phút và hạn chót cả lượt (16/10)');
{
  _resetGemmaWindow();
  check(estimateTokens({ contents: 'a'.repeat(2500), config: { systemInstruction: 'b'.repeat(2500) } }) === 2000, 'ước token = số ký tự / 2,5');
  check(gemmaWaitMs(14000, 0) === 0, 'cửa sổ trống: gửi ngay');
}
{
  _resetGemmaWindow();
  const big = { model: 'gemma-4-26b-a4b-it', contents: 'a'.repeat(30000), config: { responseMimeType: 'application/json' } };
  const ai = fakeAi(['{"a":1}', '{"b":2}']);
  const real = ai.models.generateContent;
  // Gemma báo đúng số token thật của lượt lớn (12.000) để bộ đếm ghi đúng.
  ai.models.generateContent = async (p) => ({ ...(await real(p)), usageMetadata: { promptTokenCount: 12000 } });
  const r1 = await wrapAi(ai, { log: silent }).models.generateContent(big);
  check(!r1.fellBack && r1.usedModel === 'gemma-4-26b-a4b-it', 'lượt 12.000 token đầu: Gemma trả lời');
  const r2 = await wrapAi(ai, { log: silent, budgetMs: 50000 }).models.generateContent(big);
  check(r2.fellBack && ai.calls.length === 2 && ai.calls[1].model !== 'gemma-4-26b-a4b-it', 'lượt 2 ngay sau sẽ vượt 15.000 token/phút, chờ không kịp quỹ: lùi flash-lite, không bắn Gemma');
  check(gemmaWaitMs(12000, Date.now()) > 50000, 'cửa sổ còn tính lượt vừa gửi, phải chờ gần hết phút');
}
{
  _resetGemmaWindow();
  const ai = fakeAi([new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}'), '{"lite":1}']);
  await wrapAi(ai, { log: silent, tries: 1 }).models.generateContent(jsonParams('gemma-4-26b-a4b-it'));
  check(gemmaWaitMs(100, Date.now()) > 0, 'gặp 429 hạn mức: coi cửa sổ phút đã đầy');
}
{
  _resetGemmaWindow();
  setRunDeadline(Date.now() - 1000);
  const ai = fakeAi(['{"ok":1}']);
  const r = await wrapAi(ai, { log: silent }).models.generateContent(jsonParams('gemma-4-26b-a4b-it'));
  check(!r.fellBack, 'hạn chót lượt đã qua (tiến trình Vercel dùng lại): bỏ qua, vẫn gọi Gemma');
  setRunDeadline(Date.now() + 10000);
  const ai2 = fakeAi(['{"lite":1}']);
  const r2 = await wrapAi(ai2, { log: silent }).models.generateContent(jsonParams('gemma-4-26b-a4b-it'));
  check(r2.fellBack && ai2.calls[0].model !== 'gemma-4-26b-a4b-it', 'hạn chót lượt còn 10 giây (dưới 30 giây): đi thẳng flash-lite');
  _resetGemmaWindow();
}

console.log('6. Model không phải Gemma: đi thẳng, giữ nguyên params');
{
  const ai = fakeAi(['{"x":1} thừa']);
  const p = jsonParams('gemini-flash-lite-latest');
  const res = await wrapAi(ai, { log: silent }).models.generateContent(p);
  check(ai.calls[0] === p && res.text === '{"x":1} thừa' && res.usedModel === 'gemini-flash-lite-latest', 'gửi đúng params cũ, không lọc, không thử lại');
}

console.log('7. Model trên máy (ollama:)');
check(isLocal('ollama:sdvico-gemma') && !isLocal('gemma-4-26b-a4b-it') && !isGemma('ollama:sdvico-gemma'), 'isLocal nhận đúng tên');
check(modelFor('blog', { MKT_MODEL_BLOG: 'ollama:sdvico-gemma' }) === 'ollama:sdvico-gemma', 'MKT_MODEL_BLOG=ollama:... chọn model trên máy');
{
  _resetGemmaWindow();
  const ai = fakeAi([]);
  const sent = [];
  const local = async (params) => { sent.push(params); return { text: 'Đây: {"article":"a","social":"b","video":"c"} xong', usageMetadata: { promptTokenCount: 14000 } }; };
  const p = { model: 'ollama:sdvico-gemma', contents: 'x', config: { systemInstruction: 's', responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', properties: { article: {}, social: {}, video: {} }, required: ['article', 'social', 'video'] } } };
  const res = await wrapAi(ai, { log: silent, local }).models.generateContent(p);
  check(ai.calls.length === 0 && sent.length === 1, 'gọi Ollama, không gọi Gemini API');
  check(!('responseSchema' in sent[0].config) && sent[0].config.systemInstruction.includes('article, social, video'), 'bỏ responseSchema, ghi tên khóa vào chỉ dẫn như Gemma');
  check(res.text === '{"article":"a","social":"b","video":"c"}' && res.usedModel === 'ollama:sdvico-gemma' && !res.fellBack, 'lọc JSON, usedModel là model trên máy');
  check(gemmaWaitMs(15000, Date.now()) === 0, 'không tính vào hạn mức token/phút của Gemma trên Gemini API');
}
{
  const ai = fakeAi(['{"body":"lite"}']);
  let n = 0;
  const local = async () => { n += 1; throw new Error('fetch failed'); };
  const res = await wrapAi(ai, { log: silent, local }).models.generateContent(jsonParams('ollama:sdvico-gemma'));
  check(n === 1 && res.fellBack && res.usedModel === 'gemini-flash-lite-latest', 'Ollama chưa bật: không thử lại, lùi thẳng flash-lite');
}
{
  let req = null;
  const fetchImpl = async (url, init) => { req = { url, body: JSON.parse(init.body) }; return { ok: true, json: async () => ({ choices: [{ message: { content: '{"a":1}' } }], usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 } }) }; };
  const out = await callLocal({ model: 'ollama:sdvico-gemma', contents: [{ role: 'user', parts: [{ text: 'hỏi' }] }], config: { systemInstruction: 'hệ', temperature: 1, responseMimeType: 'application/json' } }, undefined, { fetchImpl, env: {} });
  check(req.url === 'http://localhost:11434/v1/chat/completions' && req.body.model === 'sdvico-gemma', 'gọi localhost mặc định, bỏ tiền tố ollama:');
  check(req.body.messages[0].role === 'system' && req.body.messages[1].content === 'hỏi' && req.body.response_format?.type === 'json_object', 'chỉ dẫn hệ thống thành tin system, contents thành tin user, giữ JSON mode');
  check(req.body.reasoning_effort === 'none', 'mặc định tắt suy nghĩ của Gemma 4');
  check(out.text === '{"a":1}' && out.usageMetadata.promptTokenCount === 7 && out.usageMetadata.candidatesTokenCount === 3, 'trả về dạng Gemini (text, usageMetadata) cho token-log');
  await callLocal({ model: 'ollama:x', contents: 'y', config: {} }, undefined, { fetchImpl, env: { MKT_OLLAMA_URL: 'http://may-noi-bo:11434/v1/', MKT_OLLAMA_REASONING: '' } });
  check(req.url === 'http://may-noi-bo:11434/v1/chat/completions' && !('reasoning_effort' in req.body) && !('response_format' in req.body), 'MKT_OLLAMA_URL đổi máy chủ, MKT_OLLAMA_REASONING rỗng thì không gửi');
}

console.log(fails ? `\n${fails} kiểm tra SAI` : '\nOK: mọi kiểm tra đạt');
process.exit(fails ? 1 : 0);
