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
// Folder 'Content' KHÔNG phải sản phẩm, loại khỏi vòng xoay sinh bài bán.
const eligible = [...folders.keys()].filter((g) => g !== 'Content' && (folders.get(g).images.length || folders.get(g).videos.length));
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
  // Bài BÁN chỉ dùng ẢNH; video sản phẩm gốc không đăng thẳng nữa (user chốt 18/8), thay bằng
  // video AI dựng qua dây chuyền build-video. Đặt video_requested=true để cron GA quét dựng.
  const img = f.images.length ? rnd(f.images) : null;
  if (!img) { console.log(`  Bo qua ${name}: folder chua co anh`); continue; }
  const channels = ['facebook'];
  const assets = { image: img.id, video: null };
  let gen;
  try { gen = await generateSocialPost({ productGroup: group, productName: name, channel: 'facebook', hasVideo: false }); }
  catch (e) { console.log(`  Loi gen ${name}: ${e.message}`); continue; }
  const risk = gen.assessment?.risk || 'none';
  const displayTitle = (gen.headline && gen.headline.length >= 4) ? gen.headline : name;
  const { data: ins } = await client.from('mkt_content').insert({
    kind: 'social', title: displayTitle,
    brief: { keyword: name, intent: 'giao_dich', assets, channels, generator: 'rotation', rotation: true, rotation_cycle: cycle, rotation_group: group, video_requested: true },
    draft: gen.text, status: 'review', needs_gov_review: risk === 'red',
  }).select('id').single();
  if (!ins) continue;
  await client.from('approval_queue').insert({
    kind: 'mkt_publish_content', title: `[Facebook] ${displayTitle}`,
    payload: { content_id: ins.id, format: 'social', keyword: name, intent: 'giao_dich', risk, assets, channels, authored: 'ai' }, status: 'pending',
  });
  console.log(`Cycle ${cycle} | [Facebook + video_req] ${displayTitle} | ${ins.id.slice(0, 8)} | risk=${risk}`);
}

// 1 bài content mỗi lượt (không bán).
if (process.env.ROTATE_CONTENT !== '0') {
  // Ưu tiên ảnh trong folder 'Content'; trống thì fallback ảnh bất kỳ.
  const contentImgs = folders.get('Content')?.images || [];
  const fallbackImgs = [...folders.values()].flatMap((f) => f.images);
  const poolImgs = contentImgs.length ? contentImgs : fallbackImgs;
  const media = poolImgs.length ? rnd(poolImgs) : null;
  if (media) {
    try {
      // Chọn cụm content theo tỷ lệ đề xuất Phòng KD (tuần 5 bài content):
      // qa=2, checklist=2, glossary=1, tip=1, engage=1, portrait=1, news=1.
      const { CONTENT_TOPICS } = await import('./products.mjs');
      // portrait=0, news=0: tắt hai cụm này, cần tư liệu thật + xin phép (điều cấm 5).
      const KIND_WEIGHT = { qa: 2, checklist: 2, glossary: 1, tip: 1, engage: 1, portrait: 0, news: 0 };
      const kindTotal = Object.values(KIND_WEIGHT).reduce((a, b) => a + b, 0);
      let r = Math.random() * kindTotal;
      let chosenKind = 'qa';
      for (const [k, w] of Object.entries(KIND_WEIGHT)) { r -= w; if (r <= 0) { chosenKind = k; break; } }
      const topicsOfKind = CONTENT_TOPICS.filter((t) => t.type === chosenKind);
      const chosenTopic = topicsOfKind.length ? rnd(topicsOfKind) : undefined;

      const gen = await generateContentPost({ topic: chosenTopic });
      const kind = gen.contentType || chosenKind;
      const risk = gen.assessment?.risk || 'none';
      const needsGov = risk === 'red' || kind === 'news' || kind === 'portrait';
      const KIND_LABEL = { qa: '❓ Hỏi-Đáp', checklist: '📋 Checklist', glossary: '📖 Thuật ngữ', tip: '💡 Mẹo', engage: '💬 Hỏi bà con', portrait: '👤 Chân dung (điền tay)', news: '⚠️ Thời sự (chờ duyệt QL)' };
      const kindTag = KIND_LABEL[kind] || '📰';
      const displayTitle = (gen.headline && gen.headline.length >= 4) ? gen.headline : 'Bài content';
      const assets = { image: media.id, video: null };
      const { data: ins } = await client.from('mkt_content').insert({
        kind: 'social', title: displayTitle,
        brief: { keyword: 'Bài content', intent: 'thong_tin', assets, channels: ['facebook'], generator: 'rotation', rotation: true, rotation_group: 'Bài content', post_kind: 'content', topic: gen.topic, content_type: kind },
        draft: gen.text, status: 'review', needs_gov_review: needsGov,
      }).select('id').single();
      if (ins) {
        await client.from('approval_queue').insert({
          kind: 'mkt_publish_content', title: `[Facebook] ${kindTag} ${displayTitle}`,
          payload: { content_id: ins.id, format: 'social', keyword: 'Bài content', intent: 'thong_tin', risk, assets, channels: ['facebook'], authored: 'ai', post_kind: 'content', content_type: kind, needs_manager_approval: needsGov }, status: 'pending',
        });
        console.log(`Cycle ${cycle} | [Facebook] ${kindTag} ${displayTitle} | ${ins.id.slice(0, 8)} | risk=${risk}${needsGov ? ' | NEEDS_GOV_REVIEW' : ''} | chu de: ${gen.topic}`);
      }
    } catch (e) { console.log('  Loi bai content:', e.message); }
  }
}
process.exit(0);
