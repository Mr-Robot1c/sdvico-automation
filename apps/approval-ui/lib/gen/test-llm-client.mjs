// test-llm-client.mjs — kiểm bộ gọi model chung (Gemma 15/10). Không gọi mạng. Chạy: npm run test:llm
import { wrapAi, modelFor, isGemma, extractJsonText } from './llm-client.mjs';

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
check(modelFor('blog', {}) === 'gemma-4-26b-a4b-it' && modelFor('content', {}) === 'gemma-4-26b-a4b-it', 'blog và content mặc định Gemma 4 26B');
check(modelFor('blog', { MKT_MODEL_BLOG: 'gemini-flash-lite-latest' }) === 'gemini-flash-lite-latest', 'MKT_MODEL_BLOG đổi lại được không cần sửa code');
check(modelFor('social', { MKT_MODEL: 'gemini-x' }) === 'gemini-x' && modelFor('social', {}) === 'gemini-flash-lite-latest', 'việc khác giữ MKT_MODEL / flash-lite');
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

console.log('6. Model không phải Gemma: đi thẳng, giữ nguyên params');
{
  const ai = fakeAi(['{"x":1} thừa']);
  const p = jsonParams('gemini-flash-lite-latest');
  const res = await wrapAi(ai, { log: silent }).models.generateContent(p);
  check(ai.calls[0] === p && res.text === '{"x":1} thừa' && res.usedModel === 'gemini-flash-lite-latest', 'gửi đúng params cũ, không lọc, không thử lại');
}

console.log(fails ? `\n${fails} kiểm tra SAI` : '\nOK: mọi kiểm tra đạt');
process.exit(fails ? 1 : 0);
