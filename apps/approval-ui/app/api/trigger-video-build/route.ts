import { NextResponse } from 'next/server';
import { isAuthorizedApiRequest } from '../../../lib/session-auth';
import { dispatchGithubWorkflow } from '../../../lib/github-workflow';

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
  const result = await dispatchGithubWorkflow({
    repository: repo,
    workflow: 'video-build.yml',
    ref: 'main',
    token,
    inputs: { limit: '3' },
  });
  if (result.ok) return NextResponse.json({ ok: true });
  return NextResponse.json({ ok: false, error: result.error }, { status: 200 });
}
