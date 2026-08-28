import { getServerClient } from '../../lib/supabase-server';

// 28/8 (user): block "Hoat dong gan day" dung chung — giong timeline ben Du lieu AI hoc cu,
// gio nam duoi dashboard agent o trang Nguon hoc du lieu (va tai su dung duoc noi khac).
// Gop 5 nguon: hoc noi bo (Data 1 / Evaluator), hoc public (Data 2), sinh ke hoach (BOSS),
// sinh bai (Creator), dang bai + keo so lieu (AI lich va kenh).

function fmtDT(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh', hourCycle: 'h23',
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value || '';
  return `${g('hour')}:${g('minute')} ${g('day')}/${g('month')}`;
}
const vnInt = (n: number) => (n || 0).toLocaleString('vi-VN');

export default async function RecentActivity({ limit = 20 }: { limit?: number }) {
  const client = getServerClient();
  const since7 = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const [internalRes, publicRes, plansRes, creatorRes, logRes] = await Promise.all([
    client.from('mkt_knowledge_internal').select('title, source_path, created_at').gte('created_at', since7).order('created_at', { ascending: false }).limit(6),
    client.from('mkt_knowledge_public').select('source_title, created_at').gte('created_at', since7).order('created_at', { ascending: false }).limit(6),
    client.from('mkt_plans').select('generated_by, data, applied, created_at').order('created_at', { ascending: false }).limit(3),
    client.from('mkt_content').select('title, brief, created_at').eq('brief->>generator', 'rotation').gte('created_at', since7).order('created_at', { ascending: false }).limit(6),
    client.from('run_log').select('task, status, detail, created_at').in('task', ['mkt.publish_facebook_ui', 'mkt.publish_youtube', 'mkt.knowledge_score', 'mkt.learn_weekly', 'mkt.live_apply']).order('created_at', { ascending: false }).limit(10),
  ]);

  type Ev = { at: string; who: string; icon: string; text: string };
  const timeline: Ev[] = [];
  for (const r of (internalRes.data || []) as any[]) {
    const isEval = String(r.source_path || '').startsWith('evaluator/');
    timeline.push({ at: r.created_at, who: isEval ? 'Evaluator' : 'DATA 1', icon: isEval ? '🧪' : '🏠', text: `${isEval ? 'Kết luận A/B' : 'Học nội bộ'}: ${String(r.title || '').slice(0, 90)}` });
  }
  for (const r of (publicRes.data || []) as any[]) {
    timeline.push({ at: r.created_at, who: 'DATA 2', icon: '🌐', text: `Học trên mạng: ${String(r.source_title || '').slice(0, 90)}` });
  }
  for (const p of (plansRes.data || []) as any[]) {
    timeline.push({ at: p.created_at, who: 'BOSS', icon: '👑', text: `Sinh kế hoạch (${p.data?.cadence === 'weekly' ? 'tuần' : p.data?.cadence === 'update' ? 'cập nhật' : p.generated_by === 'manual' ? 'tạo tay' : 'tự động'}), ${vnInt((p.data?.content_suggestions || []).length)} hướng đi${p.applied ? ', đang áp dụng' : ''}` });
  }
  for (const c of (creatorRes.data || []) as any[]) {
    timeline.push({ at: c.created_at, who: 'Kịch bản', icon: '✍️', text: `Sinh bài${c.brief?.ab_variant ? ` (thử ${c.brief.ab_variant})` : ''}: ${String(c.title || '').slice(0, 90)}` });
  }
  for (const l of (logRes.data || []) as any[]) {
    const map: Record<string, { who: string; icon: string; text: (d: any, ok: boolean) => string }> = {
      'mkt.publish_facebook_ui': { who: 'Lịch và kênh', icon: '📤', text: (d, ok) => (ok ? 'Đăng bài lên Facebook' : 'Đăng Facebook lỗi') },
      'mkt.publish_youtube': { who: 'Lịch và kênh', icon: '📤', text: (d, ok) => (ok ? 'Đăng video lên YouTube' : 'Đăng YouTube lỗi') },
      'mkt.knowledge_score': { who: 'DATA 2', icon: '🎯', text: (d, ok) => (ok ? `Chấm điểm ${vnInt(Number(d?.scored) || 0)} tin (tier S/A/B/C)` : 'Chấm điểm tin lỗi') },
      'mkt.learn_weekly': { who: 'Báo cáo tuần', icon: '📈', text: (d, ok) => (ok ? 'Học số liệu tuần xong, có đề xuất cho BOSS' : 'Học tuần lỗi') },
      'mkt.live_apply': { who: 'BOSS', icon: '👑', text: (d, ok) => (ok ? 'Chỉnh trọng số buổi tối theo số liệu ngày' : 'Chỉnh trọng số lỗi') },
    };
    const m = map[String(l.task)];
    if (m) timeline.push({ at: l.created_at, who: m.who, icon: m.icon, text: m.text(l.detail, l.status === 'ok') });
  }
  timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const top = timeline.slice(0, limit);

  return (
    <section className="ai-timeline">
      <h2>Hoạt động gần đây</h2>
      {top.length === 0 ? (
        <p className="sub">Chưa có hoạt động nào được ghi nhận.</p>
      ) : (
        <ul className="ai-tl-list">
          {top.map((e, i) => (
            <li key={i} className="ai-tl-item">
              <span className="ai-tl-time">{fmtDT(e.at)}</span>
              <span className="ai-tl-who"><span aria-hidden="true">{e.icon}</span> {e.who}</span>
              <span className="ai-tl-text">{e.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
