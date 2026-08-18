import { NextResponse } from 'next/server';
import { getServerClient } from '../../../lib/supabase-server';

// /api/bot-status - tra so lieu tri thuc + so huong di con lai cho BOT chip goc duoi phai.
// Khong tra noi dung du lieu, chi tra COUNT + planDate -> khong lo lot du lieu noi bo.
// Khong can CRON_SECRET, khong lo dung 24/7 (client poll 60s). Nam trong /api/* nen middleware
// da mien basic-auth, nhung URL nay chi tra so nhu cong dong -> hop ly.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const client = getServerClient();
  const since = new Date(Date.now() - 7 * 86400000).toISOString();

  const [
    { count: internal },
    { count: publicSrc },
    { data: planRows },
  ] = await Promise.all([
    client.from('mkt_knowledge_internal').select('id', { count: 'exact', head: true }).gte('created_at', since),
    client.from('mkt_knowledge_public').select('id', { count: 'exact', head: true }).gte('created_at', since),
    client.from('mkt_plans').select('id, data, applied, applied_at, created_at').eq('applied', true).order('created_at', { ascending: false }).limit(1),
  ]);

  const applied = (planRows || [])[0] as any;
  const suggestions: any[] = Array.isArray(applied?.data?.content_suggestions) ? applied.data.content_suggestions : [];
  const suggestionsUsed = suggestions.filter((s) => s?.used_at).length;
  const suggestionsLeft = suggestions.length - suggestionsUsed;

  return NextResponse.json({
    internal: internal || 0,
    publicSrc: publicSrc || 0,
    planDate: applied?.applied_at || applied?.created_at || null,
    suggestions: suggestionsLeft,
    suggestionsUsed,
    latestPlanId: applied?.id || null,
  });
}
