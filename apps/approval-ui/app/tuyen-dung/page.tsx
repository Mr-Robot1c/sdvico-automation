// Trang chỉ mục tin tuyển dụng (public). URL: /tuyen-dung
// Liệt kê tin đang mở, link sang trang chi tiết /tuyen-dung/[slug].
// Điều cấm 6: chỉ hiển thị tin do HR viết, không đụng dữ liệu ứng viên.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerClient } from '../../lib/supabase-server';
import { jobsPublicEnabled } from '../../lib/jobs-public';

export const dynamic = 'force-dynamic';

const COMPANY_NAME = 'Công ty TNHH Hiệp Lực Phát Triển Việt';
const COMPANY_SHORT = 'SDVICO';

export const metadata: Metadata = {
  title: `Tuyển dụng · ${COMPANY_SHORT}`,
  description:
    'Cơ hội việc làm tại SDVICO — công nghệ số cho ngành biển và thủy sản. Cập nhật vị trí đang tuyển.',
  robots: { index: true, follow: true },
};

type JobRow = {
  slug: string | null;
  title: string;
  department: string | null;
  location: string | null;
  salary_display: string | null;
  employment_type: string | null;
  expire_at: string | null;
  published_at: string | null;
};

async function fetchJobs(): Promise<JobRow[]> {
  try {
    const supa = getServerClient();
    const nowIso = new Date().toISOString();
    const { data } = await supa
      .from('hr_jobs')
      .select('slug, title, department, location, salary_display, employment_type, expire_at, published_at')
      .eq('status', 'open')
      .gt('expire_at', nowIso)
      .order('published_at', { ascending: false })
      .limit(200);
    return ((data as JobRow[] | null) || []).filter((j) => j.slug);
  } catch {
    return [];
  }
}

function fmtVN(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

const shell = { maxWidth: 900, margin: '0 auto', padding: '32px 20px 60px' } as const;
const card = {
  background: 'var(--surface, #ffffff)',
  border: '1px solid var(--line, #dbe5f1)',
  borderRadius: 14,
  padding: '20px 22px',
  marginBottom: 12,
  display: 'block',
  textDecoration: 'none',
  color: 'inherit',
} as const;
const chip = {
  display: 'inline-block',
  padding: '3px 9px',
  background: 'var(--chip, #eef1f6)',
  color: 'var(--ink-2, #5b6879)',
  borderRadius: 999,
  fontSize: 12,
  marginRight: 6,
  marginTop: 6,
} as const;

export default async function Page() {
  // Kill switch: JOBS_PUBLIC_ENABLED=false → tắt cả trang chỉ mục lẫn trang chi tiết.
  if (!jobsPublicEnabled()) notFound();

  const jobs = await fetchJobs();

  return (
    <main style={shell}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, color: 'var(--ink-2, #5b6879)', marginBottom: 4 }}>
          {COMPANY_SHORT} · Công nghệ số cho ngành biển và thủy sản
        </div>
        <h1 style={{ margin: 0, fontSize: 30, color: 'var(--ink, #1a2230)' }}>
          Tuyển dụng
        </h1>
        <p style={{ marginTop: 8, color: 'var(--ink-2, #5b6879)' }}>
          Các vị trí đang tuyển tại {COMPANY_NAME}. Chọn vị trí để xem chi tiết và ứng tuyển.
        </p>
      </div>

      {jobs.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', color: 'var(--ink-2, #5b6879)' }}>
          Hiện chưa có vị trí đang tuyển. Vui lòng quay lại sau.
        </div>
      ) : (
        jobs.map((j) => (
          <Link key={j.slug} href={`/tuyen-dung/${encodeURIComponent(j.slug as string)}`} style={card}>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink, #1a2230)' }}>
              {j.title}
            </div>
            <div>
              {j.department ? <span style={chip}>{j.department}</span> : null}
              {j.location ? <span style={chip}>📍 {j.location}</span> : null}
              {j.employment_type ? <span style={chip}>{j.employment_type}</span> : null}
              {j.salary_display ? (
                <span
                  style={{
                    ...chip,
                    background: 'var(--ok-bg, #e7f4ec)',
                    color: 'var(--ok, #1c7a4d)',
                  }}
                >
                  💰 {j.salary_display}
                </span>
              ) : null}
            </div>
            {j.expire_at ? (
              <div style={{ marginTop: 8, fontSize: 13, color: 'var(--ink-2, #5b6879)' }}>
                Hạn nộp: {fmtVN(j.expire_at)}
              </div>
            ) : null}
          </Link>
        ))
      )}
    </main>
  );
}
