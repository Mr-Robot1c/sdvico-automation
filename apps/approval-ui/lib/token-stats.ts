// lib/token-stats.ts — GOM SỐ TOKEN (Gemini + Claude Code) thành bản tóm tắt nhỏ cho tab
// Quản trị token (16/9, Thanh: "web còn chậm và lag lắm... ưu tiên nhất"). Trước đây trang
// Nguồn học dữ liệu kéo 3.000 dòng run_log + 10.000 dòng claude_code_usage về rồi mới cộng,
// và kéo cho MỌI tab. Giờ phần cộng dồn nằm đây, kết quả nhỏ được cache (lib/cached.ts).
import type { getServerClient } from './supabase-server';

type Client = ReturnType<typeof getServerClient>;

export const TASK_LABEL: Record<string, string> = {
  plan_directions: '🧭 Sinh hướng đi (BOSS)',
  knowledge_internal_vision: '📁 Đọc ảnh Zalo (AI Data 1)',
  knowledge_internal_summary: '📁 Tóm tắt nội bộ (AI Data 1)',
  knowledge_public_search: '🌐 Tìm tin ngành (AI Data 2)',
  creator_social: '✍️ Viết bài bán (Creator)',
  creator_content: '✍️ Viết bài nuôi trang (Creator)',
  creator_content_old: '✍️ Viết bài theo từ khóa cũ (Creator)',
  creator_pick_image: '🖼️ Chọn ảnh Unsplash (Creator)',
  creator_video_script: '🎬 Sinh kịch bản video (Creator)',
  voice_tts: '🔊 Đọc lời video TTS (Voice)',
  keyword_suggest: '🔍 Đề xuất từ khóa (AI SEO)',
};
const AI_OF_TASK: Record<string, string> = {
  knowledge_internal_vision: 'Data 1', knowledge_internal_summary: 'Data 1',
  knowledge_public_search: 'Data 2',
  plan_directions: 'BOSS',
  creator_social: 'Creator', creator_content: 'Creator', creator_content_old: 'Creator', creator_pick_image: 'Creator', creator_video_script: 'Creator',
  voice_tts: 'Voice',
  keyword_suggest: 'SEO',
};
const AI_META: Record<string, { icon: string; note: string }> = {
  'Data 1': { icon: '📁', note: 'Đọc file Zalo Phòng Kinh doanh, tóm tắt về tri thức nội bộ' },
  'Data 2': { icon: '🌐', note: 'Quét báo ngành cá hằng ngày (Google News + Chủ nhật sâu)' },
  'BOSS':   { icon: '🧭', note: 'Sinh hướng đi tuần, cập nhật kế hoạch từ tri thức + số liệu' },
  'Creator':{ icon: '✍️', note: 'Viết bài bán, bài nuôi trang, kịch bản video, chọn ảnh Unsplash' },
  'Voice':  { icon: '🔊', note: 'Đọc lời video bằng Gemini TTS (Leda), fallback edge-tts miễn phí' },
  'Evaluator': { icon: '⚖️', note: 'Chấm điểm bài + xếp bậc sản phẩm theo tuần — chỉ đọc số liệu, không dùng token AI' },
  'SEO': { icon: '🔍', note: 'Đề xuất từ khóa hằng tuần' },
};

export type TokenStats = {
  todayVN: string;
  gemini: {
    today: number; total30: number;
    last7: Array<{ day: string; tokens: number }>; maxDay: number;
    tasks: Array<{ task: string; label: string; calls: number; tokens: number }>;
    ais: Array<{ ai: string; calls: number; tokens: number; taskLabels: string; icon: string; note: string }>;
    maxAi: number;
  };
  claude: {
    count: number; todayTokens: number; todayVnd: number;
    total30Tokens: number; total30Usd: number; total30Vnd: number;
    last7: Array<{ day: string; tokens: number; vnd: number }>; maxDay: number;
    models: Array<{ model: string; calls: number; tokens: number; usd: number; vnd: number }>;
  };
};

const dayOfVN = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);

export async function loadTokenStats(client: Client): Promise<TokenStats> {
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const [{ data: tokenRows }, { data: ccRowsRaw }] = await Promise.all([
    client.from('run_log').select('detail, created_at').eq('task', 'mkt.token_usage').gte('created_at', since30).order('created_at', { ascending: false }).limit(3000),
    client.from('claude_code_usage').select('ts, model, input_tokens, cache_creation_tokens, cache_read_tokens, output_tokens, estimated_cost_usd, estimated_cost_vnd').gte('ts', since30).order('ts', { ascending: false }).limit(10000),
  ]);

  const todayVN = dayOfVN(new Date().toISOString());
  const byDay = new Map<string, number>();
  const byTask = new Map<string, { calls: number; tokens: number }>();
  let total30 = 0;
  for (const r of (tokenRows || []) as any[]) {
    const t = Number(r.detail?.totalTokens) || 0;
    if (!t) continue;
    total30 += t;
    const day = dayOfVN(r.created_at);
    byDay.set(day, (byDay.get(day) || 0) + t);
    const task = String(r.detail?.source_task || 'khac');
    const e = byTask.get(task) || { calls: 0, tokens: 0 };
    e.calls += 1; e.tokens += t;
    byTask.set(task, e);
  }
  const last7: Array<{ day: string; tokens: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400000 + 7 * 3600 * 1000).toISOString().slice(0, 10);
    last7.push({ day, tokens: byDay.get(day) || 0 });
  }
  const tasks = [...byTask.entries()].map(([task, e]) => ({ task, label: TASK_LABEL[task] || task, ...e })).sort((a, b) => b.tokens - a.tokens);

  const AI_ORDER = ['Creator', 'Voice', 'BOSS', 'Data 1', 'Data 2', 'Evaluator', 'SEO', 'AI khác'];
  const byAI = new Map<string, { calls: number; tokens: number; tasks: Set<string> }>();
  for (const [task, e] of byTask.entries()) {
    const ai = AI_OF_TASK[task] || 'AI khác';
    const row = byAI.get(ai) || { calls: 0, tokens: 0, tasks: new Set<string>() };
    row.calls += e.calls; row.tokens += e.tokens; row.tasks.add(task);
    byAI.set(ai, row);
  }
  if (!byAI.has('Evaluator')) byAI.set('Evaluator', { calls: 0, tokens: 0, tasks: new Set() });
  const ais = AI_ORDER.filter((ai) => byAI.has(ai)).map((ai) => {
    const r = byAI.get(ai)!;
    const meta = AI_META[ai] || { icon: '🤖', note: '' };
    return {
      ai, calls: r.calls, tokens: r.tokens,
      taskLabels: [...r.tasks].map((t) => TASK_LABEL[t] || t).join(', ') || (ai === 'Evaluator' ? 'Không gọi Gemini' : 'Chưa có'),
      icon: meta.icon, note: meta.note,
    };
  });

  const ccRows = (ccRowsRaw || []) as any[];
  let ccTotalTokens30 = 0, ccTotalUsd30 = 0, ccTotalVnd30 = 0, ccTodayTokens = 0, ccTodayVnd = 0;
  const ccByDay = new Map<string, { tokens: number; vnd: number }>();
  const ccByModel = new Map<string, { calls: number; tokens: number; usd: number; vnd: number }>();
  const bucketOf = (m: string): string => {
    const ml = String(m || '').toLowerCase();
    if (ml.includes('opus')) return 'Opus';
    if (ml.includes('sonnet')) return 'Sonnet';
    if (ml.includes('haiku')) return 'Haiku';
    if (ml.includes('fable')) return 'Fable';
    return 'Khác';
  };
  for (const r of ccRows) {
    const t = Number(r.input_tokens || 0) + Number(r.output_tokens || 0) + Number(r.cache_creation_tokens || 0) + Number(r.cache_read_tokens || 0);
    const usd = Number(r.estimated_cost_usd || 0);
    const vnd = Number(r.estimated_cost_vnd || 0);
    ccTotalTokens30 += t; ccTotalUsd30 += usd; ccTotalVnd30 += vnd;
    const day = dayOfVN(r.ts);
    const de = ccByDay.get(day) || { tokens: 0, vnd: 0 };
    de.tokens += t; de.vnd += vnd;
    ccByDay.set(day, de);
    if (day === todayVN) { ccTodayTokens += t; ccTodayVnd += vnd; }
    const b = bucketOf(r.model);
    const me = ccByModel.get(b) || { calls: 0, tokens: 0, usd: 0, vnd: 0 };
    me.calls += 1; me.tokens += t; me.usd += usd; me.vnd += vnd;
    ccByModel.set(b, me);
  }
  const ccLast7: Array<{ day: string; tokens: number; vnd: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400000 + 7 * 3600 * 1000).toISOString().slice(0, 10);
    const e = ccByDay.get(day) || { tokens: 0, vnd: 0 };
    ccLast7.push({ day, tokens: e.tokens, vnd: e.vnd });
  }

  return {
    todayVN,
    gemini: {
      today: byDay.get(todayVN) || 0, total30, last7,
      maxDay: Math.max(1, ...last7.map((d) => d.tokens)),
      tasks, ais, maxAi: Math.max(1, ...ais.map((r) => r.tokens)),
    },
    claude: {
      count: ccRows.length, todayTokens: ccTodayTokens, todayVnd: ccTodayVnd,
      total30Tokens: ccTotalTokens30, total30Usd: ccTotalUsd30, total30Vnd: ccTotalVnd30,
      last7: ccLast7, maxDay: Math.max(1, ...ccLast7.map((d) => d.tokens)),
      models: [...ccByModel.entries()].map(([model, e]) => ({ model, ...e })).sort((a, b) => b.vnd - a.vnd),
    },
  };
}
