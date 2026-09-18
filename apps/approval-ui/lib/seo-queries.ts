// lib/seo-queries.ts — đọc bảng mkt_seo_queries (việc B, plan-seo-vong-kin-tu-khoa-18-09.md):
// số THẬT Google Search Console theo TỪNG từ khóa, đổ bởi packages/marketing/src/gsc-keo-so.mjs
// (cron Thứ 2, chỉ chạy thật khi anh Thành thêm quyền Search Console). Bảng có thể CHƯA áp
// migration hoặc CHƯA có dòng nào — nuốt lỗi, trả available:false để /seo không vỡ trang.
import type { getServerClient } from './supabase-server';

type Client = ReturnType<typeof getServerClient>;

export type SeoQueryScored = { query: string; page: string; clicks: number; impressions: number; position: number; score: number };

export type SeoQueriesSummary = {
  available: boolean;
  windowEnd: string | null;
  top: SeoQueryScored[];
  missingFromKeywords: SeoQueryScored[];
};

const EMPTY: SeoQueriesSummary = { available: false, windowEnd: null, top: [], missingFromKeywords: [] };

// Điểm từ khóa (tính lúc render, không thêm bảng mới — plan mục 3): score = clicks*10 +
// impressions/10. keywords = danh sách mkt_keywords.keyword hiện có, để lọc ra câu Google đã
// thấy (impressions > 0) nhưng kho CHƯA có từ khóa khớp (so đúng, không phân biệt hoa thường).
export async function loadSeoQueriesSummary(client: Client, keywords: string[]): Promise<SeoQueriesSummary> {
  try {
    const { data: latestRow, error: latestErr } = await client
      .from('mkt_seo_queries')
      .select('window_end')
      .order('window_end', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestErr || !latestRow) return EMPTY;
    const windowEnd = String((latestRow as any).window_end || '');
    if (!windowEnd) return EMPTY;

    const { data, error } = await client
      .from('mkt_seo_queries')
      .select('query, page, clicks, impressions, position')
      .eq('window_end', windowEnd)
      .limit(5000);
    if (error || !data || !data.length) return EMPTY;

    const scored: SeoQueryScored[] = (data as any[]).map((r) => {
      const clicks = Number(r.clicks) || 0;
      const impressions = Number(r.impressions) || 0;
      return {
        query: String(r.query || ''),
        page: String(r.page || ''),
        clicks,
        impressions,
        position: Number(r.position) || 0,
        score: clicks * 10 + impressions / 10,
      };
    }).sort((a, b) => b.score - a.score);

    const normKw = new Set(keywords.map((k) => String(k || '').toLowerCase().trim()).filter(Boolean));
    const missingFromKeywords = scored
      .filter((r) => r.impressions > 0 && r.query && !normKw.has(r.query.toLowerCase().trim()))
      .slice(0, 10);

    return { available: true, windowEnd, top: scored.slice(0, 15), missingFromKeywords };
  } catch {
    // Bảng chưa tồn tại (migration chưa áp) hoặc lỗi mạng tạm — trang /seo vẫn phải render được.
    return EMPTY;
  }
}
