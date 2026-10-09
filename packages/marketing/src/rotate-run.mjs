// Chạy 1 lượt xoay vòng theo folder trên máy nội bộ (giống hệt route /api/rotate).
// Tạo bài PENDING chờ duyệt, KHÔNG tự đăng (điều cấm 1). Dùng để test/chạy tay.
// Chạy: node packages/marketing/src/rotate-run.mjs [soFolder=1]
import { createClient } from '@supabase/supabase-js';
import { loadRealEnv } from './video/env.mjs';
import { pickFreshClips } from './video/fresh-clip.mjs';
import { filterContentClips, buildClipContentTopic, hasGenFlags, applyGenFlagsToTicket } from './clip-guard.mjs';

const N = Number(process.argv[2]) || 1;
const env = loadRealEnv();
const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { generateSocialPost, generateContentPost } = await import('./social.mjs');

const productName = (g) => g.replace(/^\s*\d+\.\s*/, '').trim();
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => [...a].sort(() => Math.random() - 0.5);

// 1. Gom folder.
// description: mô tả clip (8/10) để bài content bám đúng điều clip thể hiện + lọc clip R&D nội bộ.
const { data: assetsRaw } = await client.from('brand_assets').select('id, kind, title, product_group, source, created_at, description').not('product_group', 'is', null);
const folders = new Map();
for (const a of assetsRaw || []) {
  if (!folders.has(a.product_group)) folders.set(a.product_group, { images: [], videos: [] });
  const f = folders.get(a.product_group);
  if (a.kind === 'image') f.images.push(a); else if ((a.kind === 'video' || a.kind === 'clip') && a.source !== 'video-pipeline') f.videos.push(a);
}
// Folder 'Content' KHÔNG phải sản phẩm, loại khỏi vòng xoay sinh bài bán.
const eligible = [...folders.keys()].filter((g) => g !== 'Content' && g !== 'R&D nội bộ' && (folders.get(g).images.length || folders.get(g).videos.length));
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
const usedClipIds = new Set();
for (const c of contents || []) {
  const b = c.brief || {};
  for (const id of Array.isArray(b.video_scene_assets) ? b.video_scene_assets : []) usedClipIds.add(String(id));
  if (b.content_clip_id) usedClipIds.add(String(b.content_clip_id));
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
    kind: 'mkt_publish_content', title: `${displayTitle}`,
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
      // portrait=1 (sếp chốt 19/8): bài chân dung viết HOÀN CHỈNH với nhân vật ĐIỂN HÌNH (tên gọi
      // thân mật + tuổi + địa phương + câu nói), đăng ngay, không để ô trống điền tay.
      // news=0: giữ tắt, dễ chạm quy định (điều cấm 3). ĐỒNG BỘ với app/api/rotate/route.ts.
      // 9/10 (review Codex C2): portrait=0 khớp route.ts. Chân dung bắt model tự điền tên, tuổi, lời nói
      // nhân vật = bịa người (điều cấm 5); generateContentPost cũng tự đổi portrait sang engage.
      const KIND_WEIGHT = { qa: 2, checklist: 2, glossary: 1, tip: 1, engage: 1, portrait: 0, news: 0 };
      const kindTotal = Object.values(KIND_WEIGHT).reduce((a, b) => a + b, 0);
      let r = Math.random() * kindTotal;
      let chosenKind = 'qa';
      for (const [k, w] of Object.entries(KIND_WEIGHT)) { r -= w; if (r <= 0) { chosenKind = k; break; } }
      const topicsOfKind = CONTENT_TOPICS.filter((t) => t.type === chosenKind);
      let chosenTopic = topicsOfKind.length ? rnd(topicsOfKind) : undefined;
      // 9/10 (review Codex C2): tối đa 1 video content mỗi ngày (khớp route.ts: cờ content_video, ngày VN).
      // Không đếm được thì coi như đã có, không chọn clip.
      let contentVideoToday = 1;
      try {
        const vn = new Date(Date.now() + 7 * 3600 * 1000);
        const dayStartIso = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - 7 * 3600 * 1000).toISOString();
        const { count, error: cntErr } = await client
          .from('mkt_content').select('id', { count: 'exact', head: true })
          .gte('created_at', dayStartIso).eq('brief->>content_video', 'true');
        if (cntErr) throw cntErr;
        contentVideoToday = count || 0;
      } catch { /* giữ 1 */ }
      // 9/10 (review Codex C3): chỉ clip có mô tả đủ dài mới được viết bài (không viết từ TÊN clip).
      const contentClip = ['viral', 'seeding', 'engage', 'tip', 'qa'].includes(chosenKind) && contentVideoToday < 1
        ? (pickFreshClips(filterContentClips(folders.get('Content')?.videos || []), usedClipIds)[0] || null) : null;
      // 8/10 (bài afd3d0ec): chủ đề bám MÔ TẢ clip, giọng Page, cấm xưng người chứng kiến/ký ức bịa.
      // GIỮ KHỚP với app/api/rotate/route.ts (cùng buildClipContentTopic). fromClip: sinh với temperature thấp.
      if (contentClip) chosenTopic = { type: chosenKind, fromClip: true, topic: buildClipContentTopic(contentClip.title, contentClip.description) };

      const gen = await generateContentPost({ topic: chosenTopic });
      const kind = gen.contentType || chosenKind;
      // 9/10 (review Codex C1): cảnh báo câu bịa/mất câu hỏi kết đi tới người duyệt (phiếu + bài).
      const genFlags = hasGenFlags(gen.genFlags) ? gen.genFlags : null;
      const KIND_LABEL = { qa: '❓ Hỏi-Đáp', checklist: '📋 Checklist', glossary: '📖 Thuật ngữ', tip: '💡 Mẹo', engage: '💬 Hỏi bà con', portrait: '👤 Chân dung', news: '⚠️ Thời sự (chờ duyệt QL)' };
      const kindTag = KIND_LABEL[kind] || '📰';
      const displayTitle = (gen.headline && gen.headline.length >= 4) ? gen.headline : 'Bài content';
      // Câu bịa còn giữ hoặc mất câu hỏi kết: tiêu đề phiếu thêm "⚠️ Cần sửa: ", risk tối thiểu amber.
      const ticket = applyGenFlagsToTicket({ title: `${kindTag} ${displayTitle}`, risk: gen.assessment?.risk || 'none', genFlags });
      const risk = ticket.risk;
      const needsGov = risk === 'red' || kind === 'news';
      const assets = { image: media.id, video: null };
      const { data: ins } = await client.from('mkt_content').insert({
        kind: 'social', title: displayTitle,
        brief: { keyword: 'Bài content', intent: 'thong_tin', assets, channels: ['facebook'], generator: 'rotation', rotation: true, rotation_group: 'Bài content', post_kind: 'content', topic: gen.topic, content_type: kind, ...(genFlags ? { gen_flags: genFlags } : {}), ...(contentClip ? { video_requested: true, video_short: true, content_video: true, content_clip_id: contentClip.id, content_clip_title: contentClip.title } : {}) },
        draft: gen.text, status: 'review', needs_gov_review: needsGov,
      }).select('id').single();
      if (ins) {
        await client.from('approval_queue').insert({
          kind: 'mkt_publish_content', title: ticket.title,
          payload: { content_id: ins.id, format: 'social', keyword: 'Bài content', intent: 'thong_tin', risk, assets, channels: ['facebook'], authored: 'ai', post_kind: 'content', content_type: kind, needs_manager_approval: needsGov, ...(genFlags ? { gen_flags: genFlags } : {}) }, status: 'pending',
        });
        console.log(`Cycle ${cycle} | [Facebook] ${kindTag} ${displayTitle} | ${ins.id.slice(0, 8)} | risk=${risk}${needsGov ? ' | NEEDS_GOV_REVIEW' : ''} | chu de: ${gen.topic}${contentClip ? ' | VIDEO clip: ' + contentClip.title : ''}`);
      }
    } catch (e) { console.log('  Loi bai content:', e.message); }
  }
}
process.exit(0);
