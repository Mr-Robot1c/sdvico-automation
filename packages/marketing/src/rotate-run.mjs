// Chạy 1 lượt xoay vòng theo folder trên máy nội bộ (giống hệt route /api/rotate).
// Tạo bài PENDING chờ duyệt, KHÔNG tự đăng (điều cấm 1). Dùng để test/chạy tay.
// Chạy: node packages/marketing/src/rotate-run.mjs [soFolder=1]
import { createClient } from '@supabase/supabase-js';
import { loadRealEnv } from './video/env.mjs';

const N = Number(process.argv[2]) || 1;
const env = loadRealEnv();
const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { generateSocialPost, generateContentPost } = await import('./social.mjs');

const productName = (g) => g.replace(/^\s*\d+\.\s*/, '').trim();
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => [...a].sort(() => Math.random() - 0.5);

// 1. Gom folder.
const { data: assetsRaw } = await client.from('brand_assets').select('id, kind, title, product_group').not('product_group', 'is', null);
const folders = new Map();
for (const a of assetsRaw || []) {
  if (!folders.has(a.product_group)) folders.set(a.product_group, { images: [], videos: [] });
  const f = folders.get(a.product_group);
  if (a.kind === 'image') f.images.push(a); else if (a.kind === 'video' || a.kind === 'clip') f.videos.push(a);
}
const eligible = [...folders.keys()].filter((g) => folders.get(g).images.length || folders.get(g).videos.length);
if (!eligible.length) { console.log('Chua folder nao co tu lieu.'); process.exit(0); }

// 2. Vòng + folder đã dùng.
const { data: contents } = await client.from('mkt_content').select('brief').order('created_at', { ascending: false }).limit(2000);
let cycle = 1; const usedByCycle = new Map();
for (const c of contents || []) {
  const b = c.brief || {};
  if (b.rotation && b.rotation_cycle && b.rotation_group) {
    const cy = Number(b.rotation_cycle); cycle = Math.max(cycle, cy);
    if (!usedByCycle.has(cy)) usedByCycle.set(cy, new Set());
    usedByCycle.get(cy).add(String(b.rotation_group));
  }
}
let unused = eligible.filter((g) => !(usedByCycle.get(cycle) || new Set()).has(g));
if (!unused.length) { cycle += 1; unused = [...eligible]; }

const picked = shuffle(unused).slice(0, N);
for (const group of picked) {
  const f = folders.get(group); const name = productName(group);
  const img = f.images.length ? rnd(f.images) : null;
  const vid = f.videos.length ? rnd(f.videos) : null;
  if (!img && !vid) continue;
  const channels = vid ? ['facebook', 'tiktok'] : ['facebook'];
  const assets = { image: img?.id || null, video: vid?.id || null };
  let gen;
  try { gen = await generateSocialPost({ productGroup: group, productName: name, channel: 'facebook', hasVideo: !!vid }); }
  catch (e) { console.log(`  Loi gen ${name}: ${e.message}`); continue; }
  const risk = gen.assessment?.risk || 'none';
  const displayTitle = (gen.headline && gen.headline.length >= 4) ? gen.headline : name;
  const { data: ins } = await client.from('mkt_content').insert({
    kind: 'social', title: displayTitle,
    brief: { keyword: name, intent: 'giao_dich', assets, channels, generator: 'rotation', rotation: true, rotation_cycle: cycle, rotation_group: group },
    draft: gen.text, status: 'review', needs_gov_review: risk === 'red',
  }).select('id').single();
  if (!ins) continue;
  const label = channels.length > 1 ? '[FB + TikTok]' : '[Facebook]';
  await client.from('approval_queue').insert({
    kind: 'mkt_publish_content', title: `${label} ${displayTitle}`,
    payload: { content_id: ins.id, format: 'social', keyword: name, intent: 'giao_dich', risk, assets, channels, authored: 'ai' }, status: 'pending',
  });
  console.log(`Cycle ${cycle} | ${label} ${displayTitle} | ${ins.id.slice(0, 8)} | risk=${risk}`);
}

// 1 bài content mỗi lượt (không bán).
if (process.env.ROTATE_CONTENT !== '0') {
  const allImgs = [...folders.values()].flatMap((f) => f.images);
  const media = allImgs.length ? rnd(allImgs) : null;
  if (media) {
    try {
      const gen = await generateContentPost({});
      const risk = gen.assessment?.risk || 'none';
      const displayTitle = (gen.headline && gen.headline.length >= 4) ? gen.headline : 'Bài content';
      const assets = { image: media.id, video: null };
      const { data: ins } = await client.from('mkt_content').insert({
        kind: 'social', title: displayTitle,
        brief: { keyword: 'Bài content', intent: 'thong_tin', assets, channels: ['facebook'], generator: 'rotation', rotation: true, rotation_group: 'Bài content', post_kind: 'content', topic: gen.topic, content_type: 'tips' },
        draft: gen.text, status: 'review', needs_gov_review: risk === 'red',
      }).select('id').single();
      if (ins) {
        await client.from('approval_queue').insert({
          kind: 'mkt_publish_content', title: `[Facebook] 📰 ${displayTitle}`,
          payload: { content_id: ins.id, format: 'social', keyword: 'Bài content', intent: 'thong_tin', risk, assets, channels: ['facebook'], authored: 'ai', post_kind: 'content' }, status: 'pending',
        });
        console.log(`Cycle ${cycle} | [Facebook] 📰 ${displayTitle} | ${ins.id.slice(0, 8)} | risk=${risk} | chu de: ${gen.topic}`);
      }
    } catch (e) { console.log('  Loi bai content:', e.message); }
  }
}
process.exit(0);
