// lib/agent-schedule.ts — LỊCH CHẠY THẬT + HOẠT ĐỘNG 7 NGÀY của từng AI (15/9, sếp: "muốn biết các
// Agent hoạt động vào thời gian nào, thời điểm nào").
//
// Lịch chép từ chính file cron (đối chiếu 15/9): .github/workflows/mkt-metrics-pull.yml (0 * * * * UTC =
// mỗi giờ), apps/approval-ui/vercel.json (0 1, 0 7 UTC = 8h, 14h VN), video-build.yml (*/30 0-16 UTC =
// 30 phút/lần 7h–23h30 VN), seo-weekly.yml (30 1 * * 1 UTC = 8h30 thứ Hai), scripts/day-kho-zalo-tudong.bat
// (Task Scheduler 8h15 / 16h30 / 20h30), lib/plan.ts planSlotVN (CN 8h soạn, T2 8h áp, T6 8h cập nhật),
// lib/plan-live.ts (19h chỉnh trọng số), lib/learn-weekly.ts (CN sau 20h). Đổi cron thì sửa ở đây cùng commit.
import type { getServerClient } from './supabase-server';
import type { AgentKey } from './agent-defs';

type Client = ReturnType<typeof getServerClient>;

export type AgentSchedule = { where: string; when: string[]; tasks: string[] };

export const AGENT_SCHEDULE: Record<AgentKey, AgentSchedule> = {
  boss: { where: 'Cloud (GitHub Actions gọi máy chủ)', when: ['Mỗi giờ phút 00 kiểm tra việc', 'Chủ nhật 8h soạn kế hoạch tuần sau', 'Thứ 2 8h áp bản đề xuất + xếp lịch đăng', 'Thứ 6 8h ra bản cập nhật', 'Mỗi tối từ 19h chỉnh trọng số (tối đa 0,5)'], tasks: ['mkt.plan', 'mkt.plan_manual', 'mkt.live_apply', 'mkt.apply_learn', 'mkt.posting_plan_boss'] },
  creator: { where: 'Cloud (cron Vercel)', when: ['8h00 sáng và 14h00 chiều sinh bài theo ô lịch', 'Mỗi giờ nạp thêm hướng đi khi cạn (tối đa 4 lượt/ngày)'], tasks: ['mkt.rotate', 'mkt.suggestions_refill'] },
  video: { where: 'Cloud (GitHub Actions) hoặc máy nội bộ (Watcher)', when: ['30 phút một lần, 7h00 tới 23h30', 'Máy nội bộ: chạy khi đăng nhập Windows (Task Scheduler)', 'Ngay khi bấm 🎬 ở Xưởng sản xuất'], tasks: ['mkt.video_build'] },
  voice: { where: 'Cùng lượt dựng video', when: ['Đọc lời thoại ngay trong lượt dựng video (VieNeu máy nội bộ; dự phòng Gemini, edge)'], tasks: [] },
  seo: { where: 'Cloud (GitHub Actions)', when: ['Thứ 2 8h30 hằng tuần: rà điểm SEO, đề xuất từ khóa', 'Mỗi ngày sau 6h: kéo số Search Console (khi đã nối)'], tasks: ['mkt.seo_audit', 'mkt.seed_keywords', 'mkt.keyword_suggest', 'mkt.gsc_pull'] },
  'lich-kenh': { where: 'Cloud (GitHub Actions + Vercel)', when: ['Mỗi giờ kéo số Facebook, YouTube, TikTok + tin nhắn Page', 'Ngay khi bấm Duyệt: đăng lên kênh (FB, YouTube)'], tasks: ['mkt.publish_facebook_ui', 'mkt.publish_facebook', 'mkt.publish_youtube', 'mkt.publish_tiktok', 'mkt.metrics_pull'] },
  'bao-cao': { where: 'Cloud', when: ['Chủ nhật tối (sau 20h) học số cả tuần, gửi đề xuất cho BOSS'], tasks: ['mkt.learn_weekly'] },
  data1: { where: 'Máy nội bộ (Task Scheduler)', when: ['8h15, 16h30, 20h30: đọc Zalo, tóm tắt video, đẩy tư liệu vào kho', 'Ngay khi bấm nạp kho ở Nguồn học dữ liệu'], tasks: ['mkt.knowledge_internal', 'mkt.asset_describe'] },
  data2: { where: 'Cloud', when: ['Mỗi giờ quét tin RSS + chấm tier 20 mục', 'Sáng 7h–10h, hai ngày một lần: quét sâu'], tasks: ['mkt.knowledge_public_deep', 'mkt.knowledge_score'] },
  'danh-gia': { where: 'Cloud', when: ['Mỗi giờ cập nhật đề xuất', 'Mỗi tối 19h chỉnh trọng số', 'Chủ nhật tối xếp bậc tuần'], tasks: ['mkt.live_apply', 'mkt.learn_weekly'] },
  'hoi-dap': { where: 'Cloud, khi có người hỏi', when: ['Không theo lịch: chạy khi ai đó hỏi ở trang Agent, nút Hỏi bot hoặc /hoi-dap'], tasks: ['mkt.hoi_dap_bot'] },
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
      if (s.tasks.includes(String(r.task))) bump(key, String(r.created_at), String(r.status), String(r.detail?.error || r.detail?.msg || '').slice(0, 100));
    }
  }
  for (const r of (videoRes.data || []) as any[]) { bump('video', String(r.created_at), 'ok'); bump('voice', String(r.created_at), 'ok'); }
  for (const r of (internalRes.data || []) as any[]) bump('data1', String(r.created_at), 'ok');
  return out;
}
