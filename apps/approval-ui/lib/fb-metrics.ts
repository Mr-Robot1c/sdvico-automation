import { getServerClient } from './supabase-server';

// Kéo số liệu từng bài Facebook về mkt_metrics.
// - Cơ bản (reactions/like, comments, shares): chỉ cần pages_read_engagement.
// - Lượt xem (impressions / video views) + số giây xem (video): CẦN quyền read_insights trên
//   token Page. Thiếu quyền thì các chỉ số này để trống, số cơ bản vẫn lấy được. Mỗi chỉ số
//   insights gọi RIÊNG + try/catch để một metric lỗi không làm mất chỉ số khác.
//
// Hiệu năng: gọi Graph API SONG SONG (pool giới hạn) + timeout từng request + GỘP insert một
// lần. Bản cũ gọi tuần tự từng bài rồi insert từng dòng nên tới 50 vòng chờ nối tiếp, dễ treo.
type Client = ReturnType<typeof getServerClient>;

function objectIdFromUrl(u: string | null): string | null {
  if (!u) return null;
  const seg = u.split('?')[0].split('/').filter(Boolean);
  return seg.length ? seg[seg.length - 1] : null;
}

function todayVN(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Chạy fn cho từng phần tử, tối đa `limit` việc chạy cùng lúc. Nhanh hơn tuần tự nhiều lần.
async function mapPool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length || 1) }, worker));
  return out;
}

// fetch có timeout: FB chậm/treo một bài không được làm kẹt cả lượt cập nhật.
async function fetchJsonWithTimeout(url: string, token: string, timeoutMs = 8000): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal });
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

// Loại node Graph đứng sau external_url. Quan trọng vì mỗi loại có trường KHÁC nhau:
//  - post  ("<PAGEID>_<POSTID>", hoặc /reel/<id>): đủ reactions, comments, `shares` và /insights.
//  - photo ("<id>" thuần số — /photos trả id ẢNH, không phải id bài; thấy 18/8): KHÔNG có `shares`,
//    KHÔNG có /insights -> hỏi `page_story_id` để lấy id BÀI chứa ảnh rồi hỏi như post.
//  - video (".../<pageid>/videos/<id>"): node Video KHÔNG có `shares` -> bài chứa video là post
//    "<pageid>_<videoid>"; lượt xem/giây xem vẫn lấy qua video_insights của node Video.
// Trước 18/8 code hỏi `shares` trên mọi node -> FB trả "(#100) nonexisting field (shares)" cho
// bài ảnh + bài video -> cả bài bị bỏ, mkt_metrics trống suốt mà không ai biết.
type NodeKind = 'post' | 'photo' | 'video';
function classify(url: string, objId: string): { kind: NodeKind; pageId: string | null } {
  const mVideo = url.match(/facebook\.com\/(\d+)\/videos\/(\d+)/);
  if (mVideo) return { kind: 'video', pageId: mVideo[1] };
  if (/\/reel\//.test(url) || objId.includes('_')) return { kind: 'post', pageId: null };
  return { kind: 'photo', pageId: null };
}

// Id Page đứng trước trong external_url (video ".../<pageId>/videos/..." hoặc bài "<pageId>_<postId>").
// Null nếu chưa biết (id ảnh trần) -> phải dò token.
function pageIdOf(url: string, objId: string): string | null {
  const mV = url.match(/facebook\.com\/(\d+)\/videos\//);
  if (mV) return mV[1];
  if (objId.includes('_')) return objId.split('_')[0];
  return null;
}

export type FbPageToken = { pageId: string | null; token: string; label: 'test' | 'real' };

// Danh sách token Page đang cấu hình.
//  - Page test (FACEBOOK_PAGE_*): MÁY ĐĂNG tự động + đọc số của chính nó.
//  - Page chính thức (FACEBOOK_REAL_PAGE_*): CHỈ để ĐỌC số bài đăng TAY (sếp muốn page chính thức
//    đăng tay). KHÔNG nhánh nào đăng bằng token này — publishContentToFacebook chỉ đọc token test.
// Vì sao cần 2 token: Facebook không cho token của page này đọc số liệu bài của page khác, nên mỗi
// bài phải hỏi bằng đúng token của page sở hữu nó.
export function fbPageTokens(): FbPageToken[] {
  const out: FbPageToken[] = [];
  const t1 = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (t1) out.push({ pageId: process.env.FACEBOOK_PAGE_ID || null, token: t1, label: 'test' });
  const t2 = process.env.FACEBOOK_REAL_PAGE_ACCESS_TOKEN;
  if (t2) out.push({ pageId: process.env.FACEBOOK_REAL_PAGE_ID || null, token: t2, label: 'real' });
  return out;
}

export async function pullFacebookMetrics(client: Client): Promise<{ pulled: number; results: any[] }> {
  const VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
  const tokens = fbPageTokens();
  if (!tokens.length) return { pulled: 0, results: [{ error: 'chưa cấu hình FACEBOOK_PAGE_ACCESS_TOKEN' }] };
  const graphT = (path: string, token: string, ms = 8000) => fetchJsonWithTimeout(`https://graph.facebook.com/${VERSION}/${path}`, token, ms);

  const { data: posts } = await client
    .from('mkt_posts')
    .select('id, content_id, external_url')
    .eq('channel', 'facebook')
    .eq('status', 'published')
    .not('external_url', 'is', null)
    .order('published_at', { ascending: false })
    .limit(80);

  // Khử trùng theo bài: mỗi cid chỉ đo 1 URL. Ưu tiên /videos/ (Post video) hơn /reel/ (Reel ghép,
  // ít chỉ số hơn). Bài chỉ có /reel/ (import tay từ page thật, hoặc bị Post) VẪN được đo.
  const byCid = new Map<string, any>();
  for (const p of posts || []) {
    const cid = (p as any).content_id as string | null;
    const url = (p as any).external_url as string | null;
    const objId = objectIdFromUrl(url);
    if (!cid || !objId || !url) continue;
    const isReel = /\/reel\//.test(url);
    const cur = byCid.get(cid);
    if (!cur) { byCid.set(cid, { row: p, url, objId, isReel }); continue; }
    if (cur.isReel && !isReel) byCid.set(cid, { row: p, url, objId, isReel });
  }
  const targets: { rowId: string; cid: string; objId: string; url: string; kind: NodeKind; pageId: string | null }[] = [];
  for (const [cid, x] of byCid) {
    const { kind, pageId } = classify(x.url, x.objId);
    targets.push({ rowId: (x.row as any).id, cid, objId: x.objId, url: x.url, kind, pageId });
  }

  const day = todayVN();

  // Gọi Graph API song song (tối đa 8 việc cùng lúc), mỗi request có timeout riêng.
  const results = await mapPool(targets, 8, async ({ rowId, cid, objId, url, kind, pageId }) => {
    try {
      // 0) Chọn TOKEN của đúng page sở hữu bài. Biết pageId (video / bài PAGEID_POSTID) -> khớp
      // token theo pageId. Không biết (id ảnh trần) -> dò lần lượt token bằng call rẻ objId?fields=id;
      // token nào đọc được là token page sở hữu. 1 token thì khỏi dò.
      const pid = pageIdOf(url, objId);
      const matched = pid ? tokens.filter((t) => t.pageId === pid) : [];
      const cands = matched.length ? matched : tokens;
      const note: string[] = [];
      let token = cands[0].token;
      if (cands.length > 1) {
        let found = false;
        for (const c of cands) {
          const probe = await graphT(`${objId}?fields=id`, c.token, 6000);
          if (probe && !probe.error && probe.id) { token = c.token; found = true; break; }
        }
        if (!found) note.push('không token nào đọc được bài này (kiểm token page chính thức có quyền đọc bài không)');
      }
      const graph = (path: string, ms = 8000) => graphT(path, token, ms);

      // 1) Tìm node BÀI (post) để hỏi reactions/comments/shares.
      let postId: string | null = kind === 'post' ? objId : null;
      if (kind === 'photo') {
        const pj = await graph(`${objId}?fields=page_story_id`);
        if (pj?.page_story_id) {
          postId = String(pj.page_story_id);
          // Tự chữa: lưu id BÀI vào external_url để lần sau hỏi thẳng, link cũng mở đúng bài.
          await client.from('mkt_posts').update({ external_url: `https://www.facebook.com/${postId}` }).eq('id', rowId);
        } else {
          note.push(pj?.error ? `photo: ${pj.error.message}` : 'photo: chưa có page_story_id (bài hẹn giờ chưa lên?)');
        }
      } else if (kind === 'video' && pageId) {
        postId = `${pageId}_${objId}`;
      }

      // 2) Hỏi tương tác. Có post -> hỏi post đủ 3 chỉ số; lỗi -> lùi về hỏi node gốc không `shares`.
      const askPost = postId ? await graph(`${postId}?fields=reactions.summary(total_count),comments.summary(total_count),shares`) : null;
      let j: any = askPost && !askPost.error ? askPost : null;
      if (!j) {
        if (askPost?.error) note.push(`post ${postId}: ${askPost.error.message}`);
        j = await graph(`${objId}?fields=reactions.summary(total_count),comments.summary(total_count)`);
        if (j?.error) return { contentId: cid, objId, error: j.error.message, note } as any;
        if (kind !== 'post') postId = null; // không có node bài dùng được -> khỏi hỏi /insights bài
      }
      const reactions = j?.reactions?.summary?.total_count ?? 0;
      const comments = j?.comments?.summary?.total_count ?? 0;
      const shares = j?.shares?.count ?? 0;
      const metrics: any = { reactions, comments, shares, engagement: reactions + comments + shares };
      const isVideo = kind === 'video';

      // Chỉ số CẦN read_insights: lượt xem + số giây xem. Gọi RIÊNG + try/catch từng cái để một
      // metric lỗi (thiếu quyền / sai tên) không làm mất chỉ số khác. Thiếu quyền -> để trống.
      const insightErr: string[] = [];
      const valOf = (r: any, name: string): number | null => {
        const d = Array.isArray(r?.data) ? r.data.find((x: any) => x?.name === name) : null;
        const v = d?.values?.[0]?.value;
        return v == null ? null : Number(v);
      };
      // Thử LẦN LƯỢT nhiều tên chỉ số cho cùng một ý (Meta đổi tên theo phiên bản: từ 15/11/2025
      // `post_impressions` -> `post_media_view`, `post_impressions_unique` -> `post_total_media_view_unique`;
      // 6/2026 bỏ tiếp các biến thể unique video). Cái nào FB trả số thì lấy, hết danh sách mới ghi lỗi.
      type Cand = { path: string; name: string; scale?: number };
      const grabFirst = async (key: string, cands: Cand[]) => {
        const errs: string[] = [];
        for (const c of cands) {
          try {
            const r = await graph(c.path, 6000);
            if (r?.error) { errs.push(`${c.name}: ${r.error.message}`); continue; }
            const v = valOf(r, c.name);
            if (v != null && !Number.isNaN(v)) { metrics[key] = c.scale ? Math.round(v * c.scale) : v; return; }
            errs.push(`${c.name}: không có giá trị`);
          } catch (e: any) {
            errs.push(`${c.name}: ${String(e?.message || e)}`);
          }
        }
        insightErr.push(`${key}: ${errs.join(' | ')}`.slice(0, 300));
      };
      const vi = (metric: string) => `${objId}/video_insights?metric=${metric}`;
      const pi = (metric: string) => `${postId}/insights?metric=${metric}`;
      if (isVideo) {
        // Lượt xem video + tổng thời gian xem (ms -> giây) + số NGƯỜI xem. video_insights nằm trên
        // node VIDEO (objId); dự phòng bằng chỉ số bài (postId = PAGEID_VIDEOID) nếu Meta bỏ tên cũ.
        await grabFirst('views', [
          ...(postId ? [
            { path: pi('post_media_view'), name: 'post_media_view' },
            { path: pi('blue_reels_play_count'), name: 'blue_reels_play_count' },
            { path: pi('post_video_views'), name: 'post_video_views' },
          ] : []),
          { path: vi('total_video_views'), name: 'total_video_views' },
        ]);
        await grabFirst('watchSec', [
          { path: vi('total_video_view_total_time'), name: 'total_video_view_total_time', scale: 1 / 1000 },
          ...(postId ? [{ path: pi('post_video_view_time'), name: 'post_video_view_time', scale: 1 / 1000 }] : []),
        ]);
        await grabFirst('reach', [
          { path: vi('total_video_views_unique'), name: 'total_video_views_unique' },
          ...(postId ? [{ path: pi('post_total_media_view_unique'), name: 'post_total_media_view_unique' }] : []),
        ]);
      } else if (postId) {
        // Bài ảnh/chữ: "lượt xem" = media view (tên mới) hoặc impressions (tên cũ);
        // "người xem" = unique media viewers hoặc impressions_unique. /insights chỉ có trên node BÀI.
        await grabFirst('views', [
          { path: pi('post_media_view'), name: 'post_media_view' },
          { path: pi('post_impressions'), name: 'post_impressions' },
        ]);
        await grabFirst('reach', [
          { path: pi('post_total_media_view_unique'), name: 'post_total_media_view_unique' },
          { path: pi('post_impressions_unique'), name: 'post_impressions_unique' },
        ]);
      } else {
        insightErr.push('views/reach: chưa có id bài để hỏi /insights');
      }

      return { contentId: cid, objId, postId, metrics, note: note.length ? note : undefined, insightErr: insightErr.length ? insightErr : undefined } as any;
    } catch (e: any) {
      return { contentId: cid, objId, error: String(e?.message || e) } as any;
    }
  });

  // Gộp mọi số liệu lấy được thành MỘT insert (thay vì insert từng dòng).
  const rows = results
    .filter((r: any) => r && r.metrics)
    .map((r: any) => ({ source: 'facebook', entity_ref: r.contentId, metric_date: day, metrics: r.metrics }));
  if (rows.length) await client.from('mkt_metrics').insert(rows);

  // Số NGƯỜI THEO DÕI Trang (page-level) cho MỖI page cấu hình. Lưu dòng entity_ref='__page__'
  // (page test) và '__page_real__' (page chính thức) để trang Đo lường hiện "X follower" làm mốc
  // so với reach từng bài. followers_count/fan_count là field cơ bản của Page (không cần read_insights).
  for (const t of tokens) {
    try {
      const pj = await fetchJsonWithTimeout(`https://graph.facebook.com/${VERSION}/me?fields=followers_count,fan_count,name`, t.token);
      if (pj && !pj.error) {
        const followers = Number(pj.followers_count) || Number(pj.fan_count) || 0;
        const fans = Number(pj.fan_count) || 0;
        if (followers || fans) {
          await client.from('mkt_metrics').insert({
            source: 'facebook',
            entity_ref: t.label === 'real' ? '__page_real__' : '__page__',
            metric_date: day,
            metrics: { followers, fans, name: pj.name || null, page: t.label }
          });
        }
      }
    } catch { /* bỏ qua lỗi lấy follower */ }
  }

  return { pulled: rows.length, results };
}
