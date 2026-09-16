// lib/cached.ts — LỚP CACHE NGẮN cho việc tốn thời gian mà không cần mới từng giây (16/9, Thanh:
// "web vẫn còn rất chậm, load còn lâu"). Mỗi lần mở trang, app đang gọi lại API NGOÀI (Facebook Graph,
// YouTube Data, TikTok) và tính lại báo cáo tuần / hoạt động 11 AI từ hàng nghìn dòng run_log. Vercel
// Hobby + supabase-server ép no-store nên KHÔNG có lớp nào giữ kết quả — mỗi request trả giá đủ.
//
// Ở đây bọc unstable_cache của Next (tầng dữ liệu, dùng chung mọi request, tồn tại qua các lần gọi
// function). Số liệu chậm tối đa TTL bên dưới; thao tác thay đổi dữ liệu gọi revalidateTag để làm mới ngay.
// Không cache: hàng đợi duyệt, bảng bài viết, khách hàng (phải mới từng giây).
import { unstable_cache, revalidateTag } from 'next/cache';
import { getServerClient } from './supabase-server';

export const TAG = {
  status: 'platform-status',   // trạng thái token FB/YT/TikTok/Zalo (API ngoài)
  metrics: 'metrics',          // số liệu mkt_metrics (báo cáo tuần, kênh)
  runlog: 'run-log',           // hoạt động AI
  shares: 'group-shares',      // lượt chia sẻ group
  plan: 'posting-plan',        // lịch đăng, kế hoạch tuần
  content: 'content',          // bài viết / hàng đợi
} as const;

// Trạng thái nền tảng: 3 API ngoài, mỗi cái 0,5 tới 3 giây. Giữ 5 phút.
export const cachedPlatformStatus = unstable_cache(
  async () => {
    const [{ fbStatus, tiktokStatus }, { getYouTubeChannelInfo }] = await Promise.all([import('./platform-status'), import('./youtube-publish')]);
    const [fb, tt, yt] = await Promise.all([fbStatus(), tiktokStatus(), getYouTubeChannelInfo()]);
    return { fb, tt, yt, at: new Date().toISOString() };
  },
  ['platform-status-v1'],
  { revalidate: 300, tags: [TAG.status] }
);

// Danh sách id video còn trên kênh TikTok (Display API, phân trang): giữ 10 phút.
export const cachedTikTokVideoIds = unstable_cache(
  async (): Promise<string[] | null> => {
    const { getTikTokVideoIds } = await import('./tiktok');
    const ids = await getTikTokVideoIds(getServerClient());
    return ids ? [...ids] : null;
  },
  ['tiktok-video-ids-v1'],
  { revalidate: 600, tags: [TAG.status, TAG.metrics] }
);
export async function tiktokIdsCached(): Promise<Set<string> | null> {
  const arr = await cachedTikTokVideoIds();
  return arr ? new Set(arr) : null;
}

// Báo cáo tuần (6 truy vấn, mkt_metrics 3.000 dòng): giữ 2 phút; kéo số liệu xong thì làm mới.
export const cachedWeekReport = unstable_cache(
  async (offset: number) => {
    const { buildWeekReport } = await import('./week-report');
    return buildWeekReport(getServerClient(), offset);
  },
  ['week-report-v1'],
  { revalidate: 120, tags: [TAG.metrics, TAG.content] }
);

// Hoạt động 7 ngày của 11 AI (run_log 800 dòng + 2 bảng): giữ 2 phút.
export const cachedAgentActivity = unstable_cache(
  async () => {
    const { loadAgentActivity } = await import('./agent-schedule');
    return loadAgentActivity(getServerClient());
  },
  ['agent-activity-v1'],
  { revalidate: 120, tags: [TAG.runlog] }
);

// Định nghĩa + trạng thái lần chạy cuối của 11 AI (12 truy vấn nhỏ song song): giữ 2 phút.
// 16/9 (Thanh: "trang Nguồn học dữ liệu vẫn chậm và lag"): trước chạy lại trên MỌI tab + mọi request.
export const cachedAgentDefs = unstable_cache(
  async () => {
    const { loadAgentDefs } = await import('./agent-defs');
    return loadAgentDefs(getServerClient());
  },
  ['agent-defs-v1'],
  { revalidate: 120, tags: [TAG.runlog] }
);

// Tổng hợp token Gemini + Claude Code (2 bảng nặng 3.000 + 10.000 dòng, cộng dồn xong chỉ còn
// vài chục số): giữ 5 phút. Chỉ tab Quản trị token đọc.
export const cachedTokenStats = unstable_cache(
  async () => {
    const { loadTokenStats } = await import('./token-stats');
    return loadTokenStats(getServerClient());
  },
  ['token-stats-v1'],
  { revalidate: 300, tags: [TAG.runlog] }
);

// Gọi ở server action / route sau khi ghi dữ liệu để trang thấy ngay.
export function bustCache(...tags: string[]) {
  for (const t of tags) { try { revalidateTag(t); } catch { /* ngoài request context thì bỏ qua */ } }
}
