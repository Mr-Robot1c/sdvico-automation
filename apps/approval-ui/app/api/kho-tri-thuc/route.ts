import { NextResponse } from 'next/server';
import { getServerClient } from '../../../lib/supabase-server';
import { importInternalFromBucket } from '../../../lib/knowledge';
import { learnPublicKnowledge, isSundayVN } from '../../../lib/knowledge-public';

// Kho tri thức Kế hoạch AI v2: nạp NV1 (import file bucket) và NV2 (học public).
// Gọi tay để test/chạy khẩn: /api/kho-tri-thuc?secret=CRON_SECRET&do=internal|public|both.
// Cron mkt-metrics-pull tự gọi phần public vào Chủ nhật (giờ VN).
// Bảo vệ bằng CRON_SECRET như /api/plan, /api/rotate.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const url = new URL(req.url);
    const bearer = (req.headers.get('authorization') || '') === `Bearer ${secret}`;
    const query = url.searchParams.get('secret') === secret;
    if (!bearer && !query) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const doWhat = (url.searchParams.get('do') || 'both').toLowerCase();
  const client = getServerClient();

  const result: any = { ok: true, isSundayVN: isSundayVN(new Date()) };

  if (doWhat === 'internal' || doWhat === 'both') {
    try {
      result.internal = await importInternalFromBucket(client, { limit: 50 });
    } catch (e: any) {
      result.internal = { error: e?.message || String(e) };
    }
  }

  if (doWhat === 'public' || doWhat === 'both') {
    try {
      result.publicSrc = await learnPublicKnowledge(client);
    } catch (e: any) {
      result.publicSrc = { error: e?.message || String(e) };
    }
  }

  return NextResponse.json(result);
}
