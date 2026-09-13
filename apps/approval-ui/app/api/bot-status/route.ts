import { NextResponse } from 'next/server';
import { getServerClient } from '../../../lib/supabase-server';
import { metricsAlert } from '../../../lib/metrics-alert';

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
    { data: lastInternal, error: errInternal },
    { data: lastPublic, error: errPublic },
    metric,
  ] = await Promise.all([
    client.from('mkt_knowledge_internal').select('id', { count: 'exact', head: true }).gte('created_at', since),
    client.from('mkt_knowledge_public').select('id', { count: 'exact', head: true }).gte('created_at', since),
    client.from('mkt_plans').select('id, data, applied, applied_at, created_at').eq('applied', true).order('created_at', { ascending: false }).limit(1),
    // 13/9 (kiểm 13/9 tối: 3 bảng KHÔNG có created_at NULL, nguyên nhân thật là truy vấn lỗi tạm; giữ guard cho chắc): Postgres xếp NULL LÊN ĐẦU khi ORDER BY ... DESC -> một bản ghi created_at rỗng là đủ làm
    // lastInternal[0].created_at = null -> chip báo "Chưa học nội bộ bao giờ" dù 7 ngày vẫn có 43 bản ghi.
    // Loại NULL ra khỏi truy vấn + nullsFirst:false, và giữ error để không suy diễn khi lỗi truy vấn.
    client.from('mkt_knowledge_internal').select('created_at').not('source_path', 'like', 'evaluator/%').not('created_at', 'is', null).order('created_at', { ascending: false, nullsFirst: false }).limit(1),
    client.from('mkt_knowledge_public').select('created_at').not('created_at', 'is', null).order('created_at', { ascending: false, nullsFirst: false }).limit(1),
    metricsAlert(client),
  ]);

  // TỰ PHÁT HIỆN ĐÓI (user 18/8: "AI tự học chứ không phải đợi tôi nhắc"): AI Data 1 quá 30h
  // không có bản ghi mới, Data 2 quá 30h, hoặc số liệu FB chưa bao giờ/quá 26h không kéo về ->
  // trả cờ để BOT chip + trang Dữ liệu cảnh báo đỏ. Phần Đo lường đọc run_log lượt kéo gần nhất
  // để nói ĐÚNG lỗi (lib/metrics-alert.ts), không đoán "cron chưa chạy".
  const hoursSince = (iso?: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 3600000 : Infinity);
  const hInternal = hoursSince((lastInternal || [])[0]?.created_at as string | undefined);
  const hPublic = hoursSince((lastPublic || [])[0]?.created_at as string | undefined);
  const hMetric = metric.hoursSinceMetric == null ? Infinity : metric.hoursSinceMetric;
  const alerts: Array<{ who: string; msg: string }> = [];
  // 13/9: lỗi truy vấn -> nói đúng là "không kiểm tra được", không kết luận "chưa học bao giờ".
  // "Chưa học bao giờ" chỉ khi KHÔNG có bản ghi nào cả (đếm 7 ngày cũng 0); còn đếm 7 ngày > 0 mà
  // không tìm được ngày hợp lệ thì là dữ liệu thiếu created_at, báo đúng bệnh để người sửa cột.
  if (errInternal) alerts.push({ who: 'Data 1', msg: `Không kiểm tra được lần học nội bộ gần nhất (lỗi truy vấn: ${errInternal.message}).` });
  else if (hInternal === Infinity && (internal || 0) > 0) alerts.push({ who: 'Data 1', msg: `Có ${internal} bản ghi nội bộ 7 ngày qua nhưng không bản ghi nào có ngày tạo hợp lệ (created_at rỗng). Kiểm tra cột created_at trong mkt_knowledge_internal.` });
  else if (hInternal > 30) alerts.push({ who: 'Data 1', msg: hInternal === Infinity ? 'Chưa học nội bộ bao giờ. Kiểm tra phiên đọc Zalo và task đẩy bucket (SDVICO-DayKhoZalo).' : `Đã ${Math.floor(hInternal)} giờ không có bản ghi nội bộ mới. Có thể phiên đọc Zalo hôm nay không chạy hoặc file chưa được đẩy lên bucket.` });
  if (errPublic) alerts.push({ who: 'Data 2', msg: `Không kiểm tra được lần học public gần nhất (lỗi truy vấn: ${errPublic.message}).` });
  else if (hPublic === Infinity && (publicSrc || 0) > 0) alerts.push({ who: 'Data 2', msg: `Có ${publicSrc} nguồn public 7 ngày qua nhưng không nguồn nào có ngày tạo hợp lệ (created_at rỗng).` });
  else if (hPublic > 30) alerts.push({ who: 'Data 2', msg: hPublic === Infinity ? 'Chưa học public bao giờ.' : `Đã ${Math.floor(hPublic)} giờ không có nguồn public mới. Cron mkt-metrics-pull (chạy học public) có thể đang không chạy.` });
  if (metric.alert) alerts.push({ who: 'Đo lường', msg: metric.alert.message });

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
    readErrors: [errInternal ? 'Data 1' : null, errPublic ? 'Data 2' : null, metric.readError ? 'Đo lường' : null].filter(Boolean),
    alerts,
  });
}
