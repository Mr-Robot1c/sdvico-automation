// lib/fb-comments.ts — đọc BÌNH LUẬN của 1 bài Facebook qua Graph API (15/9, Thanh: "comment đó là gì,
// cmt ở bài nào"). Chỉ ĐỌC (điều cấm 1: máy không trả lời khách). Token Page kênh chính (real) ưu tiên.
import { fbPageTokens } from './fb-metrics';

export type FbComment = { id: string; from: string; message: string; createdTime: string; likes: number; replies: number };

export function fbObjectIdFromUrl(u: string | null): string | null {
  if (!u) return null;
  const mP = u.match(/facebook\.com\/(\d{6,})\/posts\/(\d{6,})(?:$|[/?#])/);
  if (mP) return `${mP[1]}_${mP[2]}`;
  const mV = u.match(/facebook\.com\/(\d{6,})\/videos\/(\d{6,})/);
  if (mV) return `${mV[1]}_${mV[2]}`;
  const mR = u.match(/\/reel\/(\d{6,})/);
  if (mR) return mR[1];
  const seg = u.split('?')[0].split('/').filter(Boolean);
  return seg.length ? seg[seg.length - 1] : null;
}

export async function fetchFacebookComments(postUrl: string, limit = 50): Promise<{ comments: FbComment[]; error: string | null }> {
  const tokens = fbPageTokens();
  const tok = tokens.find((t) => t.label === 'real') || tokens[0];
  if (!tok) return { comments: [], error: 'Chưa có token Page Facebook (FACEBOOK_REAL_PAGE_ACCESS_TOKEN).' };
  const objId = fbObjectIdFromUrl(postUrl);
  if (!objId) return { comments: [], error: 'Không đọc được id bài từ link.' };
  const VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
  const fields = 'id,from{name},message,created_time,like_count,comment_count';
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`https://graph.facebook.com/${VERSION}/${objId}/comments?fields=${fields}&limit=${limit}&order=chronological`, { headers: { Authorization: `Bearer ${tok.token}` }, signal: ctrl.signal, cache: 'no-store' });
    const j: any = await r.json();
    if (j?.error) return { comments: [], error: String(j.error.message || 'Graph lỗi').slice(0, 200) };
    const comments: FbComment[] = (j.data || []).map((c: any) => ({ id: String(c.id), from: String(c.from?.name || 'Khách'), message: String(c.message || ''), createdTime: String(c.created_time || ''), likes: Number(c.like_count) || 0, replies: Number(c.comment_count) || 0 }));
    return { comments, error: null };
  } catch (e: any) {
    return { comments: [], error: e?.name === 'AbortError' ? 'Facebook không trả lời sau 8 giây' : String(e?.message || e).slice(0, 200) };
  } finally { clearTimeout(timer); }
}
