// run-knowledge-now.mjs - chay tay ngay: import bucket + hoc public + sinh Ke hoach v2.
// Bypass Vercel/HTTP, goi thang Supabase + Gemini tu may noi bo.
// Dung khi can gap plan tuan (ko doi Chu nhat cron).
//
// Chay:
//   node apps/approval-ui/scripts/run-knowledge-now.mjs
//
// Env can: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, parse } from 'node:path';

// ===== ENV LOADER (lay tu packages/marketing/src/video/env.mjs) =====
function parseEnv(path) {
  const out = {};
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  } catch {}
  return out;
}
function loadRealEnv() {
  if ((process.env.SUPABASE_URL || '').includes('supabase.co') && process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env;
  let dir = dirname(fileURLToPath(import.meta.url));
  const root = parse(dir).root;
  while (true) {
    const p = join(dir, '.env');
    if (existsSync(p)) {
      const e = parseEnv(p);
      if ((e.SUPABASE_URL || '').includes('supabase.co') && e.SUPABASE_SERVICE_ROLE_KEY) {
        for (const [k, v] of Object.entries(e)) if (!process.env[k]) process.env[k] = v;
        return process.env;
      }
    }
    if (dir === root) break;
    dir = dirname(dir);
  }
  return process.env;
}

const env = loadRealEnv();
const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const MKT_MODEL = env.MKT_MODEL || 'gemini-flash-lite-latest';

// ===== NEEDS GOV REVIEW (dong bo lib/knowledge.ts) =====
const GOV_KEYWORDS = [
  'iuu', 'thẻ vàng', 'the vang', 'thẻ đỏ', 'the do',
  'cục thủy sản', 'cuc thuy san', 'cục kiểm ngư', 'cuc kiem ngu',
  'nghị định', 'nghi dinh', 'thông tư', 'thong tu',
  'quyết định', 'quyet dinh', 'luật thủy sản', 'luat thuy san',
  'giấy phép', 'giay phep', 'khai thác thủy sản', 'khai thac thuy san',
  'cấm biển', 'cam bien', 'vùng cấm', 'vung cam',
  'bộ nông nghiệp', 'bo nong nghiep', 'chính phủ', 'chinh phu',
];
function needsGovReview(text) {
  const t = String(text || '').toLowerCase();
  return GOV_KEYWORDS.some((k) => t.includes(k));
}

// ===== NV1: IMPORT INTERNAL BUCKET =====
const TEXT_EXT = ['.txt', '.md', '.markdown', '.html', '.htm', '.json', '.jsonl'];
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
const BUCKET = 'kho-tri-thuc-noi-bo';

function extOf(name) {
  const m = String(name || '').toLowerCase().match(/\.[a-z0-9]+$/);
  return m ? m[0] : '';
}
function stripHtml(s) {
  return String(s || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

async function readFileContent(path) {
  const dl = await client.storage.from(BUCKET).download(path);
  if (dl.error || !dl.data) return { excerpt: '', reason: 'download-fail: ' + (dl.error?.message || '') };
  const buf = Buffer.from(await dl.data.arrayBuffer());
  const e = extOf(path);
  if (TEXT_EXT.includes(e)) {
    let raw = buf.toString('utf8');
    if (e === '.html' || e === '.htm') raw = stripHtml(raw);
    if (e === '.json') { try { raw = JSON.stringify(JSON.parse(raw), null, 2); } catch {} }
    // .jsonl giu nguyen, la newline-delimited json
    return { excerpt: raw.slice(0, 15000) };
  }
  if (IMAGE_EXT.includes(e)) {
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
      const mimeType = e === '.png' ? 'image/png' : e === '.webp' ? 'image/webp' : 'image/jpeg';
      const res = await ai.models.generateContent({
        model: MKT_MODEL,
        contents: [{ role: 'user', parts: [
          { text: 'Trich xuat nguyen van moi chu tieng Viet trong anh chup man hinh nhom Zalo noi bo nay. Khong tom tat.' },
          { inlineData: { mimeType, data: buf.toString('base64') } }
        ]}],
        config: { temperature: 0 }
      });
      return { excerpt: (res.text || '').trim().slice(0, 15000) };
    } catch (e) { return { excerpt: '', reason: 'vision-loi: ' + (e?.message || e) }; }
  }
  return { excerpt: '', reason: 'khong-ho-tro: ' + e };
}

async function summarizeForPlan(text) {
  if (!text || text.trim().length < 20) return { title: '(nội dung quá ngắn)', summary: text.trim() };
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const res = await ai.models.generateContent({
      model: MKT_MODEL,
      contents: [{ role: 'user', parts: [{ text: [
        'Đây là nội dung trích xuất từ nhóm Zalo nội bộ của công ty phân phối thiết bị cho ngư dân và tàu cá (SDVICO).',
        'Nhiệm vụ: đọc kỹ, tóm tắt các điểm chính CÓ ÍCH cho lập kế hoạch marketing tuần tới.',
        'Ưu tiên: câu hỏi khách hay gặp, phản hồi Phòng Kinh doanh, sự cố sản phẩm, xu hướng đang nói tới.',
        'BỎ QUA: chào hỏi, tán gẫu, thông tin cá nhân.',
        'Văn phong: câu ngắn, gần gũi bà con ngư dân, KHÔNG dùng gạch dài, KHÔNG dùng mũi tên, số theo chuẩn Việt Nam.',
        'Trả JSON đúng dạng: {"title":"tiêu đề 5-10 chữ","summary":"tóm tắt 3-5 câu"}. Không thêm chữ ngoài JSON.',
        '', 'NỘI DUNG:', text.slice(0, 12000)
      ].join('\n') }] }],
      config: { responseMimeType: 'application/json', temperature: 0.4 }
    });
    const t = (res.text || '').trim();
    const m = t.match(/\{[\s\S]*\}/);
    if (!m) return { title: 'Ghi chú nội bộ', summary: text.slice(0, 500) };
    const p = JSON.parse(m[0]);
    return { title: String(p.title || 'Ghi chú nội bộ').slice(0, 200), summary: String(p.summary || '').slice(0, 2000) };
  } catch (e) { console.warn('summarize loi:', e?.message || e); return { title: 'Ghi chú nội bộ', summary: text.slice(0, 500) }; }
}

async function importInternal() {
  const stack = [''];
  const files = [];
  while (stack.length && files.length < 500) {
    const prefix = stack.pop();
    const { data, error } = await client.storage.from(BUCKET).list(prefix, { limit: 1000 });
    if (error) { console.error(`list ${prefix}: ${error.message}`); continue; }
    for (const entry of data || []) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (!entry.id) { stack.push(full); continue; }
      files.push({ path: full });
    }
  }
  console.log(`  Tim thay ${files.length} file trong bucket`);

  const paths = files.map((f) => f.path);
  const existing = new Set();
  if (paths.length) {
    for (let i = 0; i < paths.length; i += 100) {
      const { data } = await client.from('mkt_knowledge_internal').select('source_path').in('source_path', paths.slice(i, i + 100));
      for (const r of data || []) existing.add(r.source_path);
    }
  }

  let imported = 0, skipped = 0;
  for (const f of files) {
    if (existing.has(f.path)) { skipped += 1; continue; }
    const e = extOf(f.path);
    if (!TEXT_EXT.includes(e) && !IMAGE_EXT.includes(e)) { skipped += 1; continue; }
    console.log(`  Doc ${f.path}...`);
    const { excerpt, reason } = await readFileContent(f.path);
    if (!excerpt || excerpt.trim().length < 20) { skipped += 1; if (reason) console.warn(`    skip: ${reason}`); continue; }
    const { title, summary } = await summarizeForPlan(excerpt);
    const gov = needsGovReview(excerpt + ' ' + summary);
    const ins = await client.from('mkt_knowledge_internal').insert({
      source_path: f.path, title, summary, raw_excerpt: excerpt.slice(0, 5000), needs_gov_review: gov
    });
    if (ins.error) { console.error(`    insert loi: ${ins.error.message}`); continue; }
    imported += 1;
    console.log(`    ✓ ${title}${gov ? ' [⚠️ cần duyệt QL]' : ''}`);
  }
  return { scanned: files.length, imported, skipped };
}

// ===== NV2: HOC PUBLIC =====
const SEARCH_TOPICS = [
  'tin tức ngành thủy sản Việt Nam tuần này',
  'quy định mới cho tàu cá và ngư dân Việt Nam',
  'xu hướng đánh bắt cá xa bờ Việt Nam',
  'giá dầu diesel tàu cá Việt Nam gần đây',
  'thiết bị giám sát hành trình tàu cá VMS quy định mới',
  'thẻ vàng IUU EC đối với thủy sản Việt Nam',
];

async function searchTopic(topic) {
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const res = await ai.models.generateContent({
      model: MKT_MODEL,
      contents: [{ role: 'user', parts: [{ text: [
        `Tìm 2-3 nguồn tin GẦN ĐÂY (trong 7 ngày) về chủ đề: "${topic}".`,
        'Chỉ dùng nguồn tin chính thống Việt Nam (báo lớn, cổng thông tin bộ ngành).',
        'Mỗi nguồn phải có URL đầy đủ.',
        'Trả JSON đúng dạng, không thêm chữ ngoài JSON:',
        '{"findings":[{"source_url":"https://...","source_title":"...","summary":"2-3 câu tóm tắt tiếng Việt, câu ngắn, gần gũi bà con ngư dân, không gạch dài, không mũi tên"}]}',
        'Không tìm được thì trả {"findings":[]}.'
      ].join('\n') }] }],
      config: { temperature: 0.3, tools: [{ googleSearch: {} }] }
    });
    const t = (res.text || '').trim();
    const m = t.match(/\{[\s\S]*\}/);
    if (!m) return [];
    const p = JSON.parse(m[0]);
    return (Array.isArray(p.findings) ? p.findings : []).map((f) => ({
      source_url: String(f.source_url || '').trim(),
      source_title: String(f.source_title || '').slice(0, 200).trim(),
      summary: String(f.summary || '').slice(0, 1000).trim()
    })).filter((f) => f.source_url && /^https?:\/\//i.test(f.source_url) && f.summary);
  } catch (e) { console.warn(`  topic "${topic}" loi:`, e?.message || e); return []; }
}

async function learnPublic() {
  const all = [];
  for (const t of SEARCH_TOPICS) {
    console.log(`  Tim: "${t}"...`);
    const findings = await searchTopic(t);
    console.log(`    → ${findings.length} nguon`);
    all.push(...findings);
  }
  const byUrl = new Map();
  for (const f of all) if (!byUrl.has(f.source_url)) byUrl.set(f.source_url, f);
  const uniq = [...byUrl.values()];

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const urls = uniq.map((f) => f.source_url);
  const seen = new Set();
  if (urls.length) {
    for (let i = 0; i < urls.length; i += 100) {
      const { data } = await client.from('mkt_knowledge_public').select('source_url').in('source_url', urls.slice(i, i + 100)).gte('created_at', thirtyDaysAgo);
      for (const r of data || []) seen.add(r.source_url);
    }
  }

  let inserted = 0;
  for (const f of uniq) {
    if (seen.has(f.source_url)) continue;
    const gov = needsGovReview(f.source_title + ' ' + f.summary);
    const ins = await client.from('mkt_knowledge_public').insert({
      source_url: f.source_url, source_title: f.source_title || null, summary: f.summary, needs_gov_review: gov
    });
    if (ins.error) { console.warn(`  insert loi ${f.source_url}: ${ins.error.message}`); continue; }
    inserted += 1;
    console.log(`  ✓ ${f.source_title || f.source_url}${gov ? ' [⚠️]' : ''}`);
  }
  return { topics: SEARCH_TOPICS.length, found: all.length, inserted };
}

// ===== NV3: SINH KE HOACH V2 (port tu lib/plan.ts) =====
// Port toi thieu buildPlan+narrative+loadMeasurement/knowledge, chi de sinh 1 record.
// Khong port productOf/guessGroup (complex), chi group theo brief.rotation_group thang.

function vnInt(n) { return Math.round(Number(n) || 0).toLocaleString('vi-VN'); }
function vnDec1(n) { const v = Math.round((Number(n) || 0) * 10) / 10; return v.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 1 }); }
function joinAnd(a) { if (a.length === 0) return ''; if (a.length === 1) return a[0]; return a.slice(0, -1).join(', ') + ' và ' + a[a.length - 1]; }
function weekWindowVN(now) {
  const vn = new Date(now.getTime() + 7 * 3600 * 1000);
  const dow = vn.getUTCDay(); const sinceMon = (dow + 6) % 7;
  const mon = new Date(vn); mon.setUTCDate(vn.getUTCDate() - sinceMon);
  const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { start: fmt(mon), end: fmt(sun) };
}

async function loadMeasurement() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: mrows } = await client.from('mkt_metrics').select('entity_ref, metrics, created_at').eq('source', 'facebook').gte('created_at', sevenDaysAgo).order('created_at', { ascending: false }).limit(500);
  const latest = new Map();
  for (const r of mrows || []) { if (r.entity_ref && !latest.has(r.entity_ref)) latest.set(r.entity_ref, r.metrics || {}); }
  const cids = [...latest.keys()];
  const contents = new Map();
  if (cids.length) {
    const { data: cs } = await client.from('mkt_content').select('id, title, brief, draft').in('id', cids);
    for (const c of cs || []) {
      const b = c.brief || {};
      const product = b.rotation_group ? String(b.rotation_group).replace(/^\s*\d+\.\s*/, '').trim() : (b.keyword || c.title || 'Khác');
      contents.set(c.id, { title: c.title || '(không tên)', product, conversions: Number(b.conversions) || 0 });
    }
  }
  const perPost = cids.map((cid) => {
    const m = latest.get(cid) || {}; const c = contents.get(cid) || { title: '(không rõ)', product: 'Khác', conversions: 0 };
    return { cid, title: c.title, product: c.product, engagement: (m.reactions || 0) + (m.comments || 0) + (m.shares || 0), conversions: c.conversions };
  });
  const byProduct = new Map();
  for (const r of perPost) {
    const g = byProduct.get(r.product) || { count: 0, engagement: 0, conversions: 0 };
    g.count += 1; g.engagement += r.engagement; g.conversions += r.conversions;
    byProduct.set(r.product, g);
  }
  const products = [...byProduct.entries()].map(([product, g]) => ({
    product, count: g.count, engagement: g.engagement, conversions: g.conversions,
    avgEng: g.count ? Math.round(g.engagement / g.count) : 0,
    avgConv: g.count ? Math.round((g.conversions / g.count) * 10) / 10 : 0
  }));
  return {
    products,
    totals: { posts: perPost.length, engagement: perPost.reduce((s, r) => s + r.engagement, 0), conversions: perPost.reduce((s, r) => s + r.conversions, 0) },
    topPosts: [...perPost].sort((a, b) => b.engagement - a.engagement).slice(0, 5).map((r) => ({ title: r.title, product: r.product, engagement: r.engagement }))
  };
}

async function loadRecentKnowledge() {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const [{ data: i }, { data: p }] = await Promise.all([
    client.from('mkt_knowledge_internal').select('id, title, summary, needs_gov_review, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(30),
    client.from('mkt_knowledge_public').select('id, source_url, source_title, summary, needs_gov_review, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(30)
  ]);
  return { internal: i || [], publicSrc: p || [] };
}

const WEIGHT_BY_TIER = { winner: 3, watch: 2, weak: 1, insufficient: 1 };
function noteFor(p) {
  if (p.tier === 'winner') return 'Đang thắng, đẩy mạnh nhịp đăng.';
  if (p.tier === 'weak') return 'Đuối, giảm bài và đổi góc tiếp cận.';
  if (p.tier === 'insufficient') return `Mới ${vnInt(p.count)} bài, giữ nhịp để gom thêm số liệu.`;
  return 'Ổn định, giữ nhịp hiện tại.';
}

function buildNarrative(all, s, weeklyBudget, threshold, knowledge) {
  const paras = [];
  if (knowledge) {
    const nI = knowledge.internal, nP = knowledge.publicSrc;
    if (nI === 0 && nP === 0) paras.push('Tuần này bản kế hoạch chỉ dựa trên số đo lường Facebook, chưa có nguồn tri thức nội bộ hay public nào trong 7 ngày qua.');
    else if (nI === 0) paras.push(`Tuần này đã học được ${vnInt(nP)} nguồn tri thức public ngành cá, chưa có nguồn nội bộ nào.`);
    else if (nP === 0) paras.push(`Tuần này đã học được ${vnInt(nI)} bản ghi tri thức nội bộ, chưa có nguồn public nào (bot học vào Chủ nhật).`);
    else paras.push(`Tuần này đã học ${vnInt(nI)} bản ghi tri thức nội bộ và ${vnInt(nP)} nguồn tri thức public ngành cá. Cùng với số đo lường, đây là nguyên liệu cho các đoạn dưới đây.`);
  }
  if (s.totalPosts === 0) {
    paras.push('Chưa có bài nào có số liệu nên chưa xếp hạng sản phẩm được. Đăng bài lên Facebook, chờ có tương tác rồi bấm Cập nhật số liệu ở trang Đo lường.');
    return paras;
  }
  let overview = `Đợt này gom được ${vnInt(s.totalPosts)} bài có số liệu, ${vnInt(s.totalEngagement)} lượt tương tác`;
  if (s.totalConversions > 0) overview += ` và ${vnInt(s.totalConversions)} đơn hoặc lead`;
  overview += '. ';
  if (s.ranked > 0) { overview += `Có ${vnInt(s.ranked)} sản phẩm đủ mẫu để xếp hạng, từ ${vnInt(threshold)} bài trở lên`; if (s.insufficient > 0) overview += `, còn ${vnInt(s.insufficient)} sản phẩm ít bài nên chưa vội kết luận`; overview += '.'; }
  else overview += `Chưa sản phẩm nào đủ mẫu để xếp hạng, cần từ ${vnInt(threshold)} bài trở lên. ${vnInt(s.insufficient)} sản phẩm đang gom thêm số liệu.`;
  paras.push(overview);
  const winners = all.filter((p) => p.tier === 'winner');
  if (winners.length) {
    const top = winners[0];
    let lead = `Dẫn đầu là ${top.product}. Trung bình mỗi bài được ${vnInt(top.avgEng)} lượt tương tác`;
    if (top.avgConv > 0) lead += `, kéo về ${vnDec1(top.avgConv)} đơn hoặc lead mỗi bài`;
    lead += '. Nên tăng nhịp đăng nhóm này và giữ nguyên góc đang ăn khách.';
    if (winners.length > 1) lead += ` Cùng nhóm mạnh còn có ${joinAnd(winners.slice(1).map((p) => p.product))}.`;
    paras.push(lead);
  }
  const alloc = all.filter((p) => p.postsPerWeek > 0).sort((a, b) => b.postsPerWeek - a.postsPerWeek).map((p) => `${p.product} ${vnInt(p.postsPerWeek)} bài`);
  if (alloc.length) paras.push(`Gợi ý tuần tới chia khoảng ${vnInt(weeklyBudget)} bài, ưu tiên: ${joinAnd(alloc)}. Con số chỉ để tham khảo. Mở trang Kế hoạch bấm Áp dụng thì vòng xoay sinh bài mới ưu tiên theo hướng này.`);
  return paras;
}

function buildPlan(m, opts) {
  const threshold = opts.threshold ?? 3;
  const weeklyBudget = opts.weeklyBudget ?? 14;
  const knowledge = opts.knowledge;
  const ranked = m.products.filter((p) => p.count >= threshold).sort((a, b) => b.avgConv - a.avgConv || b.avgEng - a.avgEng);
  const insufficient = m.products.filter((p) => p.count < threshold);
  const n = ranked.length; const topCut = n ? Math.max(1, Math.round(n / 3)) : 0; const botStart = n - Math.max(1, Math.round(n / 3));
  const tierOf = (idx, p) => (idx < topCut ? 'winner' : (idx >= botStart && p.avgConv === 0 ? 'weak' : 'watch'));
  const rankedPlan = ranked.map((p, idx) => { const t = tierOf(idx, p); return { ...p, tier: t, weight: WEIGHT_BY_TIER[t], postsPerWeek: 0, note: '' }; });
  const insufPlan = insufficient.sort((a, b) => b.count - a.count).map((p) => ({ ...p, tier: 'insufficient', weight: WEIGHT_BY_TIER.insufficient, postsPerWeek: 0, note: '' }));
  const all = [...rankedPlan, ...insufPlan];
  const sumW = all.reduce((s, p) => s + p.weight, 0) || 1;
  for (const p of all) { p.postsPerWeek = Math.max(1, Math.round((p.weight / sumW) * weeklyBudget)); p.note = noteFor(p); }
  const weights = {}; for (const p of all) weights[p.product] = p.weight;
  const summary = { totalProducts: m.products.length, ranked: ranked.length, insufficient: insufficient.length, totalPosts: m.totals.posts, totalEngagement: m.totals.engagement, totalConversions: m.totals.conversions, topProduct: rankedPlan[0]?.product || null, knowledge };
  return { generatedAt: opts.generatedAt, threshold, weeklyBudget, products: all, weights, narrative: buildNarrative(all, summary, weeklyBudget, threshold, knowledge), summary };
}

async function generatePlan() {
  const [m, k] = await Promise.all([loadMeasurement(), loadRecentKnowledge()]);
  const knowledgeUsed = {
    internal: k.internal.length,
    publicSrc: k.publicSrc.length,
    internalHighlights: k.internal.slice(0, 5).map((x) => ({ id: x.id, title: x.title, needs_gov_review: !!x.needs_gov_review })),
    publicHighlights: k.publicSrc.slice(0, 5).map((x) => ({ id: x.id, source_title: x.source_title, source_url: x.source_url, needs_gov_review: !!x.needs_gov_review }))
  };
  const plan = buildPlan(m, { generatedAt: new Date().toISOString(), knowledge: knowledgeUsed });
  const win = weekWindowVN(new Date());
  const { data, error } = await client.from('mkt_plans').insert({
    period_start: win.start, period_end: win.end, generated_by: 'manual', data: plan, applied: false
  }).select('id').single();
  if (error) throw new Error(error.message);
  return { id: data.id, plan };
}

console.log('\n== BUOC 1: Import file tu bucket kho-tri-thuc-noi-bo ==');
const r1 = await importInternal();
console.log(`Ket qua: quet ${r1.scanned}, import ${r1.imported} moi, bo qua ${r1.skipped}`);

// --only-internal: chi cho AI Data 1 hoc (task Windows 16:30 goi sau khi day Zalo), khong hoc
// public / khong sinh ke hoach o day (cron Vercel + lich T2/T6 lo). Tranh sinh plan ngoai lich.
if (process.argv.includes('--only-internal')) {
  console.log('\n(--only-internal) Xong buoc 1, dung tai day.');
  process.exit(0);
}

console.log('\n== BUOC 2: Hoc tri thuc public nganh ca (Gemini google_search) ==');
const r2 = await learnPublic();
console.log(`Ket qua: ${r2.topics} chu de, ${r2.found} nguon tim thay, ${r2.inserted} nguon moi luu`);

console.log('\n== BUOC 3: Sinh Ke hoach tuan v2 (dung nguon vua hoc) ==');
const r3 = await generatePlan();
console.log(`Ke hoach id: ${r3.id}`);
console.log(`  Nguon noi bo dung: ${r3.plan.summary.knowledge.internal}`);
console.log(`  Nguon public dung: ${r3.plan.summary.knowledge.publicSrc}`);
console.log(`  Bai co so lieu: ${r3.plan.summary.totalPosts}`);
console.log(`  San pham xep hang: ${r3.plan.summary.ranked}`);
console.log(`  Dan dau: ${r3.plan.summary.topProduct || '(chua co du lieu)'}`);
console.log('\nDoan dinh huong:');
for (const p of r3.plan.narrative) console.log(`  ${p}`);

console.log('\n== XONG ==');
console.log('Vao https://sdvico-mktit.vercel.app/ke-hoach xem ban v2 vua sinh.');
console.log('Muon ap dung trong so vao vong xoay: bam "Ap dung trong so".');
