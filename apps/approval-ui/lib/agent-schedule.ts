// lib/agent-schedule.ts — LỊCH CHẠY THẬT + HOẠT ĐỘNG 7 NGÀY của từng AI (15/9, sếp: "muốn biết các
// Agent hoạt động vào thời gian nào, thời điểm nào").
//
// Lịch chép từ chính file cron (đối chiếu lại 15/10/2026, Thanh: "hệ thống 2 tháng rồi mà vẫn chưa hoạt động
// trơn tru" — bản 15/9 vẫn ghi "mỗi giờ" / "30 phút" sau khi giảm cron 22/9):
//   .github/workflows/mkt-metrics-pull.yml (0 */6 * * * UTC = 1h, 7h, 13h, 19h VN), apps/approval-ui/vercel.json
//   (0 1, 0 7 UTC = 8h, 14h VN), video-build.yml (0 22,6 UTC = 5h, 13h VN + dựng theo yêu cầu), mkt-blog-keyword.yml
//   (0 23 UTC = 6h VN), seo-weekly.yml (30 1 * * 1 UTC = 8h30 thứ Hai), Task Scheduler SDVICO-BossCron1h
//   (scripts/boss-cron.bat mỗi giờ khi máy bật, Chủ nhật chỉ 8h tới 10h), SDVICO-DayKhoZalo (20h, 2 ngày một lần),
//   lib/plan.ts planSlotVN (CN từ 8h soạn, T2 từ 8h áp, T6 từ 8h cập nhật), lib/plan-live.ts isEveningVN (từ 20h,
//   lỡ thì bù sáng hôm sau), lib/learn-weekly.ts (CN từ 20h, bù sáng T2 trước 12h). Đổi cron thì sửa ở đây cùng commit.
import type { getServerClient } from './supabase-server';
import type { AgentKey } from './agent-defs';

type Client = ReturnType<typeof getServerClient>;

export type AgentSchedule = { where: string; when: string[]; tasks: string[] };

export const AGENT_SCHEDULE: Record<AgentKey, AgentSchedule> = {
  boss: { where: 'Chạy tự động trên mạng', when: ['1h, 7h, 13h, 19h: kéo số và kiểm việc', 'Chủ nhật: soạn kế hoạch tuần sau; 8h thứ Hai tự áp kèm trọng số vừa học', 'Mỗi tối từ 20h: chỉnh nhẹ trọng số'], tasks: ['mkt.plan', 'mkt.plan_manual', 'mkt.live_apply', 'mkt.apply_learn', 'mkt.posting_plan_boss'] },
  creator: { where: 'Chạy tự động trên mạng', when: ['8h00 sáng và 14h00 chiều sinh bài theo ô lịch đăng', 'Nạp thêm hướng đi khi cạn, đi cùng lượt kéo số (tối đa 4 lượt/ngày)'], tasks: ['mkt.rotate', 'mkt.suggestions_refill'] },
  video: { where: 'Chạy tự động trên mạng', when: ['5h và 13h mỗi ngày: dựng các bài đang chờ video', 'Ngay khi bấm Làm video'], tasks: ['mkt.video_build'] },
  voice: { where: 'Cùng lượt dựng video', when: ['Đọc lời thoại ngay trong lượt dựng video (VieNeu; dự phòng Gemini, edge)'], tasks: [] },
  seo: { where: 'Chạy tự động trên mạng', when: ['6h mỗi ngày: viết bài blog theo kho từ khóa (vào trang Duyệt bài)', 'Thứ 2 8h30: rà điểm SEO, đề xuất từ khóa', 'Mỗi ngày một lần: kéo số Search Console'], tasks: ['mkt.blog_keyword', 'mkt.seo_audit', 'mkt.seed_keywords', 'mkt.keyword_suggest', 'mkt.gsc_pull'] },
  'lich-kenh': { where: 'Chạy tự động trên mạng', when: ['Kéo số Facebook, YouTube, TikTok + tin nhắn Page: 6 tiếng một lần (1h, 7h, 13h, 19h)', 'Ngay khi bấm Duyệt: đăng lên kênh (Facebook, YouTube đúng giờ hẹn; TikTok xuất tay)'], tasks: ['mkt.publish_facebook_ui', 'mkt.publish_facebook', 'mkt.publish_youtube', 'mkt.publish_tiktok', 'mkt.metrics_pull'] },
  'bao-cao': { where: 'Chạy tự động trên mạng', when: ['Chủ nhật từ 20h học số liệu 4 tuần gần nhất, đề xuất trọng số', 'Chủ nhật không có lượt chạy thì bù sáng thứ Hai trước 12h'], tasks: ['mkt.learn_weekly'] },
  data1: { where: 'Máy nội bộ chạy 24/7', when: ['17h30 thứ Tư và thứ Bảy: quét Zalo, đẩy tư liệu vào kho, tóm tắt, mô tả', 'Ngay khi bấm nạp kho ở trang Chi tiết AI'], tasks: ['mkt.knowledge_internal', 'mkt.asset_describe'] },
  data2: { where: 'Chạy tự động trên mạng', when: ['Quét tin + chấm bậc cùng lượt kéo số (6 tiếng một lần)', 'Sáng 7h tới 10h, mỗi ngày một lần: quét sâu'], tasks: ['mkt.knowledge_public_deep', 'mkt.knowledge_score'] },
  'danh-gia': { where: 'Chạy tự động trên mạng', when: ['Cập nhật đề xuất cùng lượt kéo số', 'Tối từ 20h chỉnh trọng số, lỡ thì bù sáng hôm sau', 'Chủ nhật từ 20h xếp bậc trên 4 tuần, bù sáng thứ Hai'], tasks: ['mkt.live_apply', 'mkt.learn_weekly'] },
  'hoi-dap': { where: 'Chạy khi có người hỏi', when: ['Không theo lịch: chạy khi ai đó hỏi ở trang Agent, nút Hỏi bot hoặc /hoi-dap'], tasks: ['mkt.hoi_dap_bot'] },
};

export type DayCell = { date: string; label: string; ok: number; err: number; warn: number };
export type AgentActivity = { days: DayCell[]; total: number; errors: number; lastErr: string | null };

function vnDate(iso: string): string { return new Date(new Date(iso).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10); }

// Hoạt động 7 ngày gần nhất theo agent: đếm dòng run_log (ok/err/warn) từng ngày VN. Video và DATA 1 không
// ghi run_log đều -> đếm thêm brand_assets (video dựng) và mkt_knowledge_internal (mẩu tri thức).
export async function loadAgentActivity(client: Client, now: Date = new Date()): Promise<Record<AgentKey, AgentActivity>> {
  const since = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
  const allTasks = [...new Set(Object.values(AGENT_SCHEDULE).flatMap((s) => s.tasks))];
  const [logRes, videoRes, internalRes] = await Promise.all([
    client.from('run_log').select('task, status, created_at, detail').in('task', allTasks).gte('created_at', since).order('created_at', { ascending: false }).limit(800),
    client.from('brand_assets').select('created_at').eq('source', 'video-pipeline').gte('created_at', since).limit(200),
    client.from('mkt_knowledge_internal').select('created_at').gte('created_at', since).limit(400),
  ]);
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) days.push(new Date(now.getTime() + 7 * 3600 * 1000 - i * 24 * 3600 * 1000).toISOString().slice(0, 10));
  const mk = (): AgentActivity => ({ days: days.map((d) => ({ date: d, label: `${d.slice(8, 10)}/${d.slice(5, 7)}`, ok: 0, err: 0, warn: 0 })), total: 0, errors: 0, lastErr: null });
  const out = Object.fromEntries((Object.keys(AGENT_SCHEDULE) as AgentKey[]).map((k) => [k, mk()])) as Record<AgentKey, AgentActivity>;
  const bump = (key: AgentKey, iso: string, status: string, err?: string) => {
    const a = out[key]; const d = vnDate(iso); const cell = a.days.find((x) => x.date === d);
    if (!cell) return;
    a.total += 1;
    if (status === 'error') { cell.err += 1; a.errors += 1; if (!a.lastErr && err) a.lastErr = err; }
    else if (status === 'warn') cell.warn += 1;
    else cell.ok += 1;
  };
  for (const r of (logRes.data || []) as any[]) {
    for (const [key, s] of Object.entries(AGENT_SCHEDULE) as [AgentKey, AgentSchedule][]) {
      // 16/9 (Thanh: "3 lỗi mà bấm vô xem không được"): lỗi dựng video ghi detail {title, exit_code}
      // không có error/msg nên dòng "Lỗi gần nhất" không bao giờ hiện — thêm đường lùi về tên bài.
      if (s.tasks.includes(String(r.task))) {
        const err = String(r.detail?.error || r.detail?.msg || (r.detail?.title ? `bài "${r.detail.title}" dựng lỗi${r.detail?.exit_code != null ? ` (mã ${r.detail.exit_code})` : ''}` : '')).slice(0, 140);
        bump(key, String(r.created_at), String(r.status), err);
      }
    }
  }
  for (const r of (videoRes.data || []) as any[]) { bump('video', String(r.created_at), 'ok'); bump('voice', String(r.created_at), 'ok'); }
  for (const r of (internalRes.data || []) as any[]) bump('data1', String(r.created_at), 'ok');
  return out;
}
