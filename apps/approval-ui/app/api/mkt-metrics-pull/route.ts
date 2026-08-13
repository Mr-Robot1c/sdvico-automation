import { NextResponse } from 'next/server';
import { getServerClient } from '../../../lib/supabase-server';
import { pullFacebookMetrics } from '../../../lib/fb-metrics';

// Kéo số liệu tương tác Facebook về mkt_metrics. Gọi bởi Vercel Cron (Authorization: Bearer
// CRON_SECRET) hoặc thủ công (?secret=CRON_SECRET).
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
  const client = getServerClient();
  const res = await pullFacebookMetrics(client);
  return NextResponse.json({ ok: true, ...res });
}
