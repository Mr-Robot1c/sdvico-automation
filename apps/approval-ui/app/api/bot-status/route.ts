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
    { data: lastInternal },
    { data: lastPublic },
    { data: lastMetric },
  ] = await Promise.all([
    client.from('mkt_knowledge_internal').select('id', { count: 'exact', head: true }).gte('created_at', since),
    client.from('mkt_knowledge_public').select('id', { count: 'exact', head: true }).gte('created_at', since),
    client.from('mkt_plans').select('id, data, applied, applied_at, created_at').eq('applied', true).order('created_at', { ascending: false }).limit(1),
    client.from('mkt_knowledge_internal').select('created_at').not('source_path', 'like', 'evaluator/%').order('created_at', { ascending: false }).limit(1),
    client.from('mkt_knowledge_public').select('created_at').order('created_at', { ascending: false }).limit(1),
    client.from('mkt_metrics').select('created_at').order('created_at', { ascending: false }).limit(1),
  ]);

  // TỰ PHÁT HIỆN ĐÓI (user 18/8: "AI tự học chứ không phải đợi tôi nhắc"): AI Data 1 quá 30h
  // không có bản ghi mới, Data 2 quá 30h, hoặc số liệu FB chưa bao giờ/quá 26h không kéo về ->
  // trả cờ để BOT chip + trang Dữ liệu cảnh báo đỏ kèm nguyên nhân khả dĩ, không im lặng.
  const hoursSince = (iso?: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 3600000 : Infinity);
  const hInternal = hoursSince((lastInternal || [])[0]?.created_at as string | undefined);
  const hPublic = hoursSince((lastPublic || [])[0]?.created_at as string | undefined);
  const hMetric = hoursSince((lastMetric || [])[0]?.created_at as string | undefined);
  const alerts: Array<{ who: string; msg: string }> = [];
  if (hInternal > 30) alerts.push({ who: 'Data 1', msg: hInternal === Infinity ? 'Chưa học nội bộ bao giờ. Kiểm tra phiên đọc Zalo và task đẩy bucket (SDVICO-DayKhoZalo).' : `Đã ${Math.floor(hInternal)} giờ không có bản ghi nội bộ mới. Có thể phiên đọc Zalo hôm nay không chạy hoặc file chưa được đẩy lên bucket.` });
  if (hPublic > 30) alerts.push({ who: 'Data 2', msg: hPublic === Infinity ? 'Chưa học public bao giờ.' : `Đã ${Math.floor(hPublic)} giờ không có nguồn public mới. Cron mkt-metrics-pull (chạy học public) có thể đang không chạy.` });
  if (hMetric === Infinity) alerts.push({ who: 'Đo lường', msg: 'Chưa có số liệu Facebook nào được kéo về. Cron GitHub mkt-metrics-pull chưa chạy hoặc CRON_SECRET lệch — BOSS và Evaluator không có số để học.' });
  else if (hMetric > 26) alerts.push({ who: 'Đo lường', msg: `Đã ${Math.floor(hMetric)} giờ không kéo số liệu Facebook. Cron GitHub có thể đã dừng.` });

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
    lastInternalHours: hInternal === Infinity ? null : Math.round(hInternal),
    lastPublicHours: hPublic === Infinity ? null : Math.round(hPublic),
    lastMetricHours: hMetric === Infinity ? null : Math.round(hMetric),
    alerts,
  });
}
