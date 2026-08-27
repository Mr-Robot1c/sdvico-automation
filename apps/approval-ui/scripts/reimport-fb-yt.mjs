// reimport-fb-yt.mjs — Nhập lại lịch sử bài Facebook + YouTube về DB SDVICO khi user lỡ tay
// xoá bài viết trong app (deleteContent cũ hard-delete 4 bảng làm mất luôn Like/View).
// User 26/8: "về những dữ liệu đã mất, m lên ytb và facebook đọc và ghi lại dữ liệu được không?"
// Câu trả lời: CÓ. Script này:
//   1. Gọi Facebook Graph API list bài của Page + insights → tạo lại mkt_content + mkt_posts + mkt_metrics
//   2. Gọi YouTube Data API list video của channel + stats → tạo lại tương tự
// Idempotent: bài nào đã có row mkt_posts (khớp external_url) thì skip.
// LƯU Ý: chỉ có SNAPSHOT HIỆN TẠI làm baseline, không có timeline like/view theo từng ngày quá khứ.
//
// CHẠY: node apps/approval-ui/scripts/reimport-fb-yt.mjs
// Tuỳ chọn: node apps/approval-ui/scripts/reimport-fb-yt.mjs --since=2026-06-01
//
// Yêu cầu env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FACEBOOK_PAGE_ID,
//   FACEBOOK_PAGE_ACCESS_TOKEN, YOUTUBE_CHANNEL_ID (có thể lấy tự động), và OAuth YouTube
//   token trong mkt_oauth_tokens (provider='youtube').

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

function parseEnv(path) {
  const out = {};
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  } catch { /* bỏ qua */ }
  return out;
}
function loadEnv() {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    const p = join(dir, '.env');
    if (existsSync(p)) {
      const e = parseEnv(p);
      if ((e.SUPABASE_URL || '').includes('supabase.co')) {
        for (const [k, v] of Object.entries(e)) if (!process.env[k]) process.env[k] = v;
        return;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}
loadEnv();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY trong .env.');
  process.exit(1);
}
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// CLI arg --since=YYYY-MM-DD, mặc định 90 ngày qua.
const argSince = process.argv.find((a) => a.startsWith('--since='));
const sinceIso = argSince ? new Date(argSince.slice(8)).toISOString()
  : new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
console.log(`📅 Nhập lại lịch sử từ ${sinceIso.slice(0, 10)} tới nay.\n`);

// ─────────────────────────── FACEBOOK ───────────────────────────
async function importFacebook() {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const version = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
  if (!pageId || !token) {
    console.log('⏭ Facebook: thiếu FACEBOOK_PAGE_ID / FACEBOOK_PAGE_ACCESS_TOKEN.');
    return { added: 0, skipped: 0, errors: [] };
  }
  let added = 0, skipped = 0;
  const errors = [];
  const sinceSec = Math.floor(new Date(sinceIso).getTime() / 1000);
  let url = `https://graph.facebook.com/${version}/${pageId}/posts?` + new URLSearchParams({
    since: String(sinceSec),
    fields: 'id,message,story,created_time,permalink_url,reactions.summary(true).limit(0),comments.summary(true).limit(0),shares,attachments{media_type,url,title,description,type}',
    limit: '50',
    access_token: token
  });
  while (url) {
    const r = await fetch(url);
    const j = await r.json();
    if (j.error) { errors.push('FB list: ' + j.error.message); break; }
    for (const p of (j.data || [])) {
      try {
        const permalink = p.permalink_url || `https://www.facebook.com/${p.id}`;
        // Check exist by external_url
        const { data: existing } = await client.from('mkt_posts')
          .select('id').eq('external_url', permalink).eq('channel', 'facebook').maybeSingle();
        if (existing) { skipped++; continue; }
        // Tạo mkt_content mới. Fallback title: message -> attachment desc/title -> story
        // -> friendly (Video/Ảnh/Bài Facebook không caption). Không dùng raw ID.
        const message = String(p.message || '').trim();
        const att = Array.isArray(p.attachments?.data) ? p.attachments.data[0] : null;
        const attText = String(att?.description || att?.title || '').trim();
        const story = String(p.story || '').trim();
        const attType = String(att?.type || att?.media_type || '');
        const fallback = attType.includes('video') ? 'Video Facebook (không caption)' : (attType.includes('photo') ? 'Ảnh Facebook (không caption)' : 'Bài Facebook (không caption)');
        const title = (message || attText || story || fallback).slice(0, 100);
        const contentId = randomUUID();
        const { error: eC } = await client.from('mkt_content').insert({
          id: contentId,
          kind: 'social',
          title,
          draft: message,
          status: 'published',
          brief: { source: 'reimport_facebook', fb_post_id: p.id },
          created_at: p.created_time || new Date().toISOString()
        });
        if (eC) { errors.push(`insert content ${p.id}: ${eC.message}`); continue; }
        // mkt_posts
        const { error: eP } = await client.from('mkt_posts').insert({
          content_id: contentId,
          channel: 'facebook',
          status: 'published',
          published_at: p.created_time || new Date().toISOString(),
          external_url: permalink
        });
        if (eP) errors.push(`insert post ${p.id}: ${eP.message}`);
        // mkt_metrics: snapshot HIỆN TẠI
        const metrics = {
          reactions: p.reactions?.summary?.total_count || 0,
          comments: p.comments?.summary?.total_count || 0,
          shares: p.shares?.count || 0,
          views: 0 // insight riêng cần call thêm
        };
        const { error: eM } = await client.from('mkt_metrics').insert({
          source: 'facebook',
          entity_ref: contentId,
          metrics,
          created_at: new Date().toISOString()
        });
        if (eM) errors.push(`insert metric ${p.id}: ${eM.message}`);
        added++;
      } catch (e) { errors.push(`FB ${p.id}: ${e.message}`); }
    }
    url = j.paging?.next || null;
  }
  return { added, skipped, errors };
}

// ─────────────────────────── YOUTUBE ───────────────────────────
async function refreshYouTubeToken() {
  const { data } = await client.from('mkt_oauth_tokens').select('*').eq('provider', 'youtube').maybeSingle();
  if (!data) throw new Error('Chưa kết nối YouTube trong mkt_oauth_tokens.');
  const expMs = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  if (expMs && expMs - Date.now() > 5 * 60 * 1000) return data.access_token;
  // Refresh
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret || !data.refresh_token) throw new Error('Thiếu YOUTUBE_CLIENT_ID/SECRET hoặc refresh_token.');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: data.refresh_token, grant_type: 'refresh_token'
    })
  });
  const t = await r.json();
  if (!r.ok || !t.access_token) throw new Error('YT refresh lỗi: ' + (t.error_description || t.error));
  await client.from('mkt_oauth_tokens').update({
    access_token: t.access_token,
    expires_at: new Date(Date.now() + (Number(t.expires_in) || 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString()
  }).eq('provider', 'youtube');
  return t.access_token;
}

async function importYouTube() {
  let token;
  try { token = await refreshYouTubeToken(); }
  catch (e) { console.log(`⏭ YouTube: ${e.message}`); return { added: 0, skipped: 0, errors: [] }; }
  const auth = { Authorization: `Bearer ${token}` };
  // Lấy uploads playlist id
  const chR = await fetch('https://youtube.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true', { headers: auth });
  const ch = await chR.json();
  const uploadsId = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsId) return { added: 0, skipped: 0, errors: ['YT: không tìm được uploads playlist.'] };
  let added = 0, skipped = 0;
  const errors = [];
  let pageToken = '';
  const sinceMs = new Date(sinceIso).getTime();
  outer: while (true) {
    const plR = await fetch(`https://youtube.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsId}&maxResults=50${pageToken ? '&pageToken=' + pageToken : ''}`, { headers: auth });
    const pl = await plR.json();
    const items = pl.items || [];
    const videoIds = items.map((i) => i.contentDetails?.videoId).filter(Boolean);
    if (!videoIds.length) break;
    const statsR = await fetch(`https://youtube.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds.join(',')}`, { headers: auth });
    const stats = await statsR.json();
    const byId = new Map((stats.items || []).map((v) => [v.id, v]));
    for (const it of items) {
      const vid = it.contentDetails?.videoId;
      const v = byId.get(vid);
      if (!v) continue;
      const publishedAt = v.snippet?.publishedAt || it.snippet?.publishedAt;
      if (publishedAt && new Date(publishedAt).getTime() < sinceMs) break outer;
      const url = `https://www.youtube.com/watch?v=${vid}`;
      const { data: existing } = await client.from('mkt_posts')
        .select('id').eq('external_url', url).eq('channel', 'youtube').maybeSingle();
      if (existing) { skipped++; continue; }
      const title = String(v.snippet?.title || '').slice(0, 100) || `Video YT ${vid}`;
      const contentId = randomUUID();
      const { error: eC } = await client.from('mkt_content').insert({
        id: contentId,
        kind: 'video',
        title,
        draft: String(v.snippet?.description || '').slice(0, 1000),
        status: 'published',
        brief: { source: 'reimport_youtube', yt_video_id: vid },
        created_at: publishedAt || new Date().toISOString()
      });
      if (eC) { errors.push(`insert content ${vid}: ${eC.message}`); continue; }
      const { error: eP } = await client.from('mkt_posts').insert({
        content_id: contentId,
        channel: 'youtube',
        status: 'published',
        published_at: publishedAt || new Date().toISOString(),
        external_url: url
      });
      if (eP) errors.push(`insert post ${vid}: ${eP.message}`);
      const metrics = {
        views: Number(v.statistics?.viewCount || 0),
        reactions: Number(v.statistics?.likeCount || 0),
        comments: Number(v.statistics?.commentCount || 0),
        shares: 0
      };
      const { error: eM } = await client.from('mkt_metrics').insert({
        source: 'youtube', entity_ref: contentId, metrics, created_at: new Date().toISOString()
      });
      if (eM) errors.push(`insert metric ${vid}: ${eM.message}`);
      added++;
    }
    pageToken = pl.nextPageToken || '';
    if (!pageToken) break;
  }
  return { added, skipped, errors };
}

// ─────────────────────────── RUN ───────────────────────────
(async () => {
  console.log('🔵 Facebook…');
  const fb = await importFacebook();
  console.log(`   ✓ Thêm ${fb.added} bài mới, skip ${fb.skipped} bài đã có.`);
  if (fb.errors.length) console.log(`   ⚠ ${fb.errors.length} lỗi:`, fb.errors.slice(0, 5));

  console.log('\n🔴 YouTube…');
  const yt = await importYouTube();
  console.log(`   ✓ Thêm ${yt.added} video mới, skip ${yt.skipped} video đã có.`);
  if (yt.errors.length) console.log(`   ⚠ ${yt.errors.length} lỗi:`, yt.errors.slice(0, 5));

  // Ghi run_log
  try {
    await client.from('run_log').insert({
      task: 'mkt.reimport_history', actor: 'script', status: 'ok',
      detail: { fb_added: fb.added, fb_skipped: fb.skipped, yt_added: yt.added, yt_skipped: yt.skipped, since: sinceIso }
    });
  } catch { /* bỏ qua */ }

  console.log(`\n✅ Xong. Refresh dashboard xem lại số liệu.`);
  process.exit(0);
})().catch((e) => {
  console.error('❌ Lỗi:', e);
  process.exit(1);
});
