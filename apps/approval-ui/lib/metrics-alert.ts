import { getServerClient } from './supabase-server';

// Cảnh báo "Đo lường" dùng chung cho BOT chip (/api/bot-status) và trang /du-lieu-ai.
// Nguyên tắc (18/8): KHÔNG đoán nguyên nhân. Đọc run_log lượt kéo số liệu gần nhất
// (task mkt.metrics_pull) và nói đúng điều đã xảy ra: cron có chạy không, Facebook trả lỗi gì.
// Trước đây câu báo mặc định là "cron chưa chạy hoặc CRON_SECRET lệch" trong khi thực tế cron
// CÓ chạy và lỗi nằm ở phía Facebook (hỏi trường `shares` trên id ảnh) -> người đọc đi kiểm sai chỗ.
type Client = ReturnType<typeof getServerClient>;

export type MetricsAlert = { hoursSinceMetric: number | null; message: string } | null;

function fmtVN(iso: string) {
  try {
    return new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  } catch { return iso; }
}

export async function metricsAlert(client: Client): Promise<{ alert: MetricsAlert; hoursSinceMetric: number | null }> {
  const [{ data: lastMetric }, { data: lastPull }] = await Promise.all([
    client.from('mkt_metrics').select('created_at').order('created_at', { ascending: false }).limit(1),
    client.from('run_log').select('status, detail, created_at').eq('task', 'mkt.metrics_pull').order('created_at', { ascending: false }).limit(1),
  ]);
  const mIso = (lastMetric || [])[0]?.created_at as string | undefined;
  const hM = mIso ? (Date.now() - new Date(mIso).getTime()) / 3600000 : null;
  const pull = (lastPull || [])[0] as { status: string; detail: any; created_at: string } | undefined;

  // Đủ mới -> không báo.
  if (hM != null && hM <= 26) return { alert: null, hoursSinceMetric: hM };

  const errs: string[] = Array.isArray(pull?.detail?.errors) ? pull!.detail.errors.map((e: any) => String(e)) : [];
  const pulled = Number(pull?.detail?.pulled ?? 0);
  let message: string;
  if (!pull) {
    message = hM == null
      ? 'Chưa có lượt kéo số liệu Facebook nào được ghi nhận. Cron mkt-metrics-pull (Vercel 20h VN / GitHub 30 phút) chưa chạy — kiểm tra GitHub Actions, hoặc bấm "Cập nhật số liệu" ở trang Đo lường để chạy tay.'
      : `Đã ${Math.floor(hM)} giờ không có số liệu Facebook mới và không thấy lượt kéo nào được ghi nhận — cron có thể đã dừng.`;
  } else if (pull.status === 'error' || pulled === 0) {
    const why = errs.length ? errs[0] : 'không kéo được bài nào';
    message = `Lượt kéo gần nhất lúc ${fmtVN(pull.created_at)} CÓ chạy nhưng không lấy được số liệu — Facebook trả: "${why}". ${errs.length > 1 ? `(và ${errs.length - 1} lỗi khác) ` : ''}Bấm "Cập nhật số liệu" ở trang Đo lường để chạy lại sau khi sửa.`;
  } else {
    message = `Lượt kéo gần nhất lúc ${fmtVN(pull.created_at)} lấy được ${pulled} bài nhưng bảng Đo lường ${hM == null ? 'vẫn trống' : `đã ${Math.floor(hM)} giờ chưa có dòng mới`} — cần kiểm tra lại.`;
  }
  return { alert: { hoursSinceMetric: hM, message }, hoursSinceMetric: hM };
}
