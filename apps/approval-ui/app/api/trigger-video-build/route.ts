import { NextResponse } from 'next/server';
import { isAuthorizedApiRequest } from '../../../lib/session-auth';

// Kích hoạt workflow GitHub Actions "video-build.yml" để dựng video các bài đã đánh dấu
// brief.video_requested. Backend Vercel gọi cái này ngay khi user bấm nút 🎬 -> không phải chờ
// cron 10 phút. Cần GITHUB_REPO ("Mr-Robot1c/sdvico-automation") + GITHUB_TOKEN (PAT với quyền
// workflow). Thiếu env thì trả lỗi mềm - cron 10 phút vẫn quét đều.
// 29/8 (audit bảo mật): PHẢI có phiên đăng nhập hoặc Bearer CRON_SECRET — trước đây ai biết
// URL cũng bắn được job GitHub Actions, đốt hết phút miễn phí. Server action trong
// actions.ts gọi nội bộ bằng Bearer CRON_SECRET.
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!(await isAuthorizedApiRequest(req))) {
    return NextResponse.json({ ok: false, error: 'can dang nhap hoac CRON_SECRET' }, { status: 401 });
  }
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) {
    return NextResponse.json({
      ok: false, error: 'chưa cấu hình GITHUB_REPO / GITHUB_TOKEN (cron 10 phút vẫn quét đều)'
    }, { status: 200 });
  }
  const url = `https://api.github.com/repos/${repo}/actions/workflows/video-build.yml/dispatches`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify({ ref: 'main', inputs: { limit: '3' } })
  });
  if (res.status === 204) return NextResponse.json({ ok: true });
  const txt = await res.text().catch(() => '');
  return NextResponse.json({ ok: false, error: `GitHub API ${res.status}: ${txt.slice(0, 300)}` }, { status: 200 });
}
