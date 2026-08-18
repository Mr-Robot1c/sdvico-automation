// rotate-now.mjs - chay tay MOT vong xoay sinh bai ngay (bypass Vercel khi can gap):
// lay 1 huong di chua dung cua ke hoach dang ap dung -> sinh CAP bai A/B + 1 bai content
// -> day Hang doi duyet (pending, nguoi bam Duyet moi dang - dieu cam 1) -> danh dau used_at.
// Logic dong bo app/api/rotate/route.ts (phien A/B v3). Chi dung khi can bai gap ngoai cron sang.
//
// Chay:  node apps/approval-ui/scripts/rotate-now.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, parse } from 'node:path';

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
  let dir = dirname(fileURLToPath(import.meta.url));
  const root = parse(dir).root;
  while (true) {
    const p = join(dir, '.env');
    if (existsSync(p)) {
      const e = parseEnv(p);
      if ((e.SUPABASE_URL || '').includes('supabase.co')) {
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

// Modules JS thuan cua app (cung logic voi route).
const { generateSocialPost, generateContentPost } = await import('../lib/gen/social.mjs');
const { guessGroup, CONTENT_TOPICS } = await import('../lib/gen/products.mjs');

const productName = (g) => (g || '').replace(/^\s*\d+\.\s*/, '').trim();
const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

// 0. Cong tac dung khan (Phan 5.4).
const { data: stopRow } = await client.from('app_config').select('value').eq('key', 'emergency_stop').maybeSingle();
if (stopRow?.value === true) { console.error('DUNG KHAN dang bat (/van-hanh) - khong sinh bai.'); process.exit(1); }

// 1. Ke hoach dang ap dung + huong di chua dung.
const { data: planRow } = await client.from('mkt_plans').select('id, data').eq('applied', true)
  .order('created_at', { ascending: false }).limit(1).maybeSingle();
if (!planRow) { console.error('Chua co ke hoach nao dang ap dung. Vao /ke-hoach bam Ap dung truoc.'); process.exit(1); }
const allSuggestions = Array.isArray(planRow.data?.content_suggestions) ? planRow.data.content_suggestions : [];
const sugIdx = allSuggestions.findIndex((s) => !s.used_at);
if (sugIdx < 0) { console.error('Het huong di chua dung trong ke hoach dang ap. Tao ke hoach moi + Ap dung.'); process.exit(1); }
const sug = allSuggestions[sugIdx];
console.log(`Huong di chon: "${sug.title}" (san pham: ${sug.product})${sug.needs_gov_review ? ' [can duyet QL]' : ''}`);

// 2. Tu lieu theo folder.
const { data: assetsRaw } = await client.from('brand_assets')
  .select('id, kind, title, product_group').not('product_group', 'is', null);
const folders = new Map();
for (const a of assetsRaw || []) {
  if (!folders.has(a.product_group)) folders.set(a.product_group, { images: [], videos: [] });
  const f = folders.get(a.product_group);
  if (a.kind === 'image') f.images.push(a);
  else if (a.kind === 'video' || a.kind === 'clip') f.videos.push(a);
}
// guessGroup tra NHAN FOLDER day du kem STT ("6. Thiet bi loc dau SF-50") — so sanh phai
// strip STT CA HAI ve (bug bat duoc 18/8: mot ve giu STT nen khong bao gio khop).
const guessed = guessGroup(sug.product);
const group = [...folders.keys()].find(
  (g) => g !== 'Content' && guessed && productName(g).toLowerCase() === productName(guessed).toLowerCase()
);
if (!group || !folders.get(group).images.length) {
  console.error(`Khong tim thay folder anh khop san pham "${sug.product}" (guess: ${guessed}).`); process.exit(1);
}
const f = folders.get(group);
const name = productName(group);
console.log(`Folder: ${group} (${f.images.length} anh)`);

// 3. Vong xoay hien tai (de stamp rotation_cycle nhu route).
const { data: contents } = await client.from('mkt_content').select('brief')
  .order('created_at', { ascending: false }).limit(1000);
let cycle = 1;
for (const c of contents || []) {
  const b = c.brief || {};
  if (b.rotation && b.rotation_cycle) cycle = Math.max(cycle, Number(b.rotation_cycle));
}

const CONTRAST_ANGLES = [
  'nhấn tiết kiệm chi phí cụ thể cho mỗi chuyến biển rồi mời bà con liên hệ',
  'nhấn ra khơi an toàn, gia đình ở nhà yên tâm, rồi mời lắp đặt',
  'kể một tình huống thật ngoài khơi rồi dẫn vào sản phẩm, kết bằng mời gọi',
];
const pairId = `${planRow.id.slice(0, 8)}-s${sugIdx}`;
const created = [];
let firstImgId = null;

// 4. Sinh cap A/B.
for (const variant of ['A', 'B']) {
  const pool = variant === 'B' && firstImgId && f.images.length > 1
    ? f.images.filter((i) => i.id !== firstImgId) : f.images;
  const img = pickRandom(pool);
  if (variant === 'A') firstImgId = img.id;

  const angleOverride = variant === 'A' ? sug.why : pickRandom(CONTRAST_ANGLES);
  const preferredHeadline = variant === 'A' ? sug.title : null;

  console.log(`\nSinh ban ${variant}...`);
  let gen;
  try {
    gen = await generateSocialPost({
      productGroup: group, productName: name, channel: 'facebook', hasVideo: false,
      angleOverride, preferredHeadline,
    });
  } catch (e) { console.error(`  gen ${variant} loi: ${e?.message || e}`); continue; }

  const risk = gen.assessment?.risk || 'none';
  const forcedGov = !!sug.needs_gov_review;
  const needsGov = risk === 'red' || forcedGov;
  const displayTitle = (gen.headline && gen.headline.length >= 4) ? gen.headline : (sug.title || name);
  const assets = { image: img.id, video: null };
  const channels = ['facebook'];

  const { data: ins, error: e1 } = await client.from('mkt_content').insert({
    kind: 'social', title: displayTitle,
    brief: {
      keyword: name, intent: 'giao_dich', assets, channels, generator: 'rotation',
      rotation: true, rotation_cycle: cycle, rotation_group: group, video_requested: true,
      plan_id: planRow.id, suggestion_index: sugIdx, suggestion_title: sug.title,
      suggestion_sources: sug.sources, ab_pair_id: pairId, ab_variant: variant,
    },
    draft: gen.text, status: 'review', needs_gov_review: needsGov,
  }).select('id').single();
  if (e1 || !ins) { console.error(`  insert ${variant} loi: ${e1?.message}`); continue; }

  const govBadge = forcedGov ? ' ⚠️' : '';
  // Khong nhet A/B vao tieu de - payload.ab_variant lo badge "Thu A/B" tren Hang doi.
  const qTitle = `[Facebook]${govBadge} ${displayTitle}`;
  await client.from('approval_queue').insert({
    kind: 'mkt_publish_content', title: qTitle,
    payload: {
      content_id: ins.id, format: 'social', keyword: name, intent: 'giao_dich',
      risk, assets, channels, authored: 'ai',
      from_plan_direction: true, suggestion_sources: sug.sources, ab_pair_id: pairId, ab_variant: variant,
    },
    status: 'pending',
  });
  created.push(qTitle);
  console.log(`  ✓ ${qTitle}`);
}

// 5. Bai content (khong ban) - giu nhip 2 ban + 1 content.
const KIND_WEIGHT = { qa: 2, checklist: 2, glossary: 1, tip: 1, engage: 1, portrait: 0, news: 0 };
const kindTotal = Object.values(KIND_WEIGHT).reduce((a, b) => a + b, 0);
let r = Math.random() * kindTotal, chosenKind = 'qa';
for (const [k, w] of Object.entries(KIND_WEIGHT)) { r -= w; if (r <= 0) { chosenKind = k; break; } }
const topicsOfKind = CONTENT_TOPICS.filter((t) => t.type === chosenKind);
const contentImgs = folders.get('Content')?.images || [];
const poolImgs = contentImgs.length ? contentImgs : [...folders.values()].flatMap((x) => x.images);
const media = poolImgs.length ? pickRandom(poolImgs) : null;
if (media) {
  console.log(`\nSinh bai content (${chosenKind})...`);
  try {
    const gen = await generateContentPost({ topic: topicsOfKind.length ? pickRandom(topicsOfKind) : undefined });
    const kind = gen.contentType || chosenKind;
    const risk = gen.assessment?.risk || 'none';
    const needsGov = risk === 'red' || kind === 'news' || kind === 'portrait';
    const KIND_LABEL = { qa: '❓ Hỏi-Đáp', checklist: '📋 Checklist', glossary: '📖 Thuật ngữ', tip: '💡 Mẹo', engage: '💬 Hỏi bà con' };
    const displayTitle = (gen.headline && gen.headline.length >= 4) ? gen.headline : 'Bài content';
    const assets = { image: media.id, video: null };
    const { data: ins } = await client.from('mkt_content').insert({
      kind: 'social', title: displayTitle,
      brief: { keyword: 'Bài content', intent: 'thong_tin', assets, channels: ['facebook'], generator: 'rotation', rotation: true, rotation_group: 'Bài content', post_kind: 'content', topic: gen.topic, content_type: kind },
      draft: gen.text, status: 'review', needs_gov_review: needsGov,
    }).select('id').single();
    if (ins) {
      const qTitle = `[Facebook] ${KIND_LABEL[kind] || '📰'} ${displayTitle}`;
      await client.from('approval_queue').insert({
        kind: 'mkt_publish_content', title: qTitle,
        payload: { content_id: ins.id, format: 'social', keyword: 'Bài content', intent: 'thong_tin', risk, assets, channels: ['facebook'], authored: 'ai', post_kind: 'content', content_type: kind, needs_manager_approval: needsGov },
        status: 'pending',
      });
      created.push(qTitle);
      console.log(`  ✓ ${qTitle}`);
    }
  } catch (e) { console.warn(`  content loi (bo qua): ${e?.message || e}`); }
}

// 6. Danh dau huong di da dung (co it nhat 1 ban A/B sinh thanh cong).
const abCreated = created.length > 0 && created.some((t) => !t.includes('💬') && !t.includes('❓') && !t.includes('📋') && !t.includes('📖') && !t.includes('💡'));
if (abCreated) {
  const updated = allSuggestions.map((s, i) => (i === sugIdx ? { ...s, used_at: new Date().toISOString() } : s));
  await client.from('mkt_plans').update({ data: { ...planRow.data, content_suggestions: updated } }).eq('id', planRow.id);
  console.log(`\nDa danh dau huong di #${sugIdx} used_at.`);
}

console.log(`\n== XONG: ${created.length} bai dang cho o Hang doi duyet ==`);
for (const t of created) console.log('  ' + t);
console.log('\nVao https://sdvico-mktit.vercel.app/ bam Duyet tung bai de dang that.');
console.log('Video shorts A/B: cron GitHub */10 phut se tu dung tu 2 bai 🎯 (co video_requested).');
