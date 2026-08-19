import { NextResponse } from 'next/server';
import { getServerClient } from '../../../../lib/supabase-server';
import { getValidTikTokToken } from '../../../../lib/tiktok';

// Trả creator_info của tài khoản TikTok đang nối để MÀN COMPOSER hiện ô chọn mức riêng tư + khóa
// bình luận/duet/stitch theo đúng cài đặt tài khoản. Đây là yêu cầu UX của audit TikTok: ô chọn
// riêng tư phải đổ từ creator_info, không được bịa. Chỉ đọc, không đăng gì.
// Nằm trong /api/* nên middleware đã miễn basic-auth; chỉ trả cài đặt tài khoản (không nhạy cảm).
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TT = 'https://open.tiktokapis.com';

export async function GET() {
  const client = getServerClient();
  try {
    const { accessToken } = await getValidTikTokToken(client);
    const r = await fetch(`${TT}/v2/post/publish/creator_info/query/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
    });
    const j: any = await r.json();
    if (!r.ok || (j?.error && j.error.code && j.error.code !== 'ok')) {
      return NextResponse.json({ ok: false, error: j?.error?.message || `HTTP ${r.status}` });
    }
    const d = j?.data || {};
    return NextResponse.json({
      ok: true,
      nickname: d.creator_nickname || null,
      privacyOptions: Array.isArray(d.privacy_level_options) ? d.privacy_level_options : [],
      commentDisabled: !!d.comment_disabled,
      duetDisabled: !!d.duet_disabled,
      stitchDisabled: !!d.stitch_disabled,
      maxDurationSec: d.max_video_post_duration_sec || null,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) });
  }
}
