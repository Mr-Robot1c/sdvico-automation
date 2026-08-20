// Trang chi tiết tin tuyển dụng (public, không đăng nhập).
// URL: /tuyen-dung/[slug]. Được Jooble link vào từ feed.xml, và Google Jobs index qua JSON-LD.
// Điều cấm 6: KHÔNG hiển thị bất kỳ dữ liệu ứng viên nào. Chỉ tin tuyển do HR viết.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { getServerClient } from '../../../lib/supabase-server';
import { buildJobDetailSection } from '../../../lib/job-detail';
import { jobsPublicEnabled } from '../../../lib/jobs-public';

export const dynamic = 'force-dynamic';

const COMPANY_NAME = 'Công ty TNHH Hiệp Lực Phát Triển Việt';
const COMPANY_SHORT = 'SDVICO';
const HOTLINE = '1900 23 23 49';
const COMPANY_ADDRESS = '283 Nguyễn Hữu Cảnh, Phường Rạch Dừa, TP. Hồ Chí Minh';

type Job = {
  id: string;
  slug: string;
  title: string;
  department: string | null;
  location: string | null;
  short_desc: string | null;
  requirements: string | null;
  benefits: string | null;
  jd_versions: Record<string, unknown> | null;
  salary_display: string | null;
  employment_type: string | null;
  status: string;
  published_at: string | null;
  updated_at: string | null;
  expire_at: string | null;
  created_at: string;
};

async function fetchJob(slug: string): Promise<Job | null> {
  try {
    const supa = getServerClient();
    const { data } = await supa
      .from('hr_jobs')
      .select(
        'id, slug, title, department, location, short_desc, requirements, benefits, jd_versions, salary_display, employment_type, status, published_at, updated_at, expire_at, created_at'
      )
      .eq('slug', slug)
      .eq('status', 'open')
      .maybeSingle();
    if (!data) return null;
    const j = data as Job;
    if (j.expire_at && new Date(j.expire_at) < new Date()) return null;
    return j;
  } catch {
    return null;
  }
}

function siteUrl(): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (env) return env.replace(/\/+$/, '');
  const h = headers();
  const host = h.get('host');
  if (host) {
    const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https';
    return `${proto}://${host}`;
  }
  return 'https://sdvico.vn';
}

function fmtVN(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function descriptionHtml(job: Job): string {
  const jbv = job.jd_versions as Record<string, unknown> | null;
  const jb = jbv && typeof jbv['job_board'] === 'string' ? String(jbv['job_board']).trim() : '';
  if (jb) {
    return jb
      .split(/\n{2,}/)
      .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
      .join('');
  }
  const text = buildJobDetailSection({
    short_desc: job.short_desc,
    requirements: job.requirements,
    benefits: job.benefits,
  }).trim();
  if (!text) return `<p>${escapeHtml(job.title)}</p>`;
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const job = await fetchJob(params.slug);
  if (!job) {
    return { title: 'Không tìm thấy tin tuyển dụng · SDVICO' };
  }
  const desc = (job.short_desc || '').slice(0, 200) || `Cơ hội việc làm tại ${COMPANY_SHORT}: ${job.title}`;
  const url = `${siteUrl()}/tuyen-dung/${encodeURIComponent(job.slug)}`;
  return {
    title: `${job.title} · Tuyển dụng ${COMPANY_SHORT}`,
    description: desc,
    alternates: { canonical: url },
    openGraph: {
      title: `${job.title} · Tuyển dụng ${COMPANY_SHORT}`,
      description: desc,
      url,
      siteName: COMPANY_SHORT,
      locale: 'vi_VN',
      type: 'article',
    },
    robots: { index: true, follow: true },
  };
}

function buildJobPostingLd(job: Job, contactEmail: string): Record<string, unknown> {
  const url = `${siteUrl()}/tuyen-dung/${encodeURIComponent(job.slug)}`;
  const employmentTypeMap: Record<string, string> = {
    'full-time': 'FULL_TIME',
    'part-time': 'PART_TIME',
    contract: 'CONTRACTOR',
    internship: 'INTERN',
    temporary: 'TEMPORARY',
  };
  const et = employmentTypeMap[(job.employment_type || 'full-time').toLowerCase()] || 'FULL_TIME';

  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: job.title,
    description: descriptionHtml(job),
    identifier: {
      '@type': 'PropertyValue',
      name: COMPANY_SHORT,
      value: job.id,
    },
    datePosted: (job.published_at || job.created_at).slice(0, 10),
    validThrough: job.expire_at || undefined,
    employmentType: et,
    hiringOrganization: {
      '@type': 'Organization',
      name: COMPANY_NAME,
      sameAs: 'https://sdvico.vn',
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: job.location || 'Vũng Tàu',
        addressCountry: 'VN',
      },
    },
    applicantLocationRequirements: {
      '@type': 'Country',
      name: 'Vietnam',
    },
    directApply: false,
    url,
    applicationContact: {
      '@type': 'ContactPoint',
      email: contactEmail,
      telephone: HOTLINE,
    },
  };
  return ld;
}

// Style inline gọn, không phụ thuộc globals.css để trang cho ứng viên trông sạch.
const shell = { maxWidth: 780, margin: '0 auto', padding: '32px 20px 60px' } as const;
const card = {
  background: 'var(--surface, #ffffff)',
  border: '1px solid var(--line, #dbe5f1)',
  borderRadius: 16,
  padding: '28px 28px 32px',
  boxShadow: '0 1px 2px rgba(15, 20, 30, 0.03)',
} as const;
const chip = {
  display: 'inline-block',
  padding: '4px 10px',
  background: 'var(--chip, #eef1f6)',
  color: 'var(--ink-2, #5b6879)',
  borderRadius: 999,
  fontSize: 13,
  marginRight: 8,
  marginBottom: 6,
} as const;

export default async function JobPage({ params }: { params: { slug: string } }) {
  // Kill switch: JOBS_PUBLIC_ENABLED=false → toàn bộ trang tuyển public tắt.
  if (!jobsPublicEnabled()) notFound();

  const job = await fetchJob(params.slug);
  if (!job) notFound();

  const contactEmail =
    process.env.HR_CONTACT_EMAIL?.trim() || 'sdvicotuyendung@gmail.com';
  const ld = buildJobPostingLd(job, contactEmail);
  const mailSubject = encodeURIComponent(`Ứng tuyển: ${job.title}`);
  const mailBody = encodeURIComponent(
    `Kính gửi Phòng Nhân sự ${COMPANY_SHORT},\n\nTôi quan tâm vị trí "${job.title}" và gửi kèm CV để ứng tuyển.\n\nHọ tên: \nSố điện thoại: \nĐịa chỉ hiện tại: \n\nCảm ơn.`
  );
  const mailto = `mailto:${contactEmail}?subject=${mailSubject}&body=${mailBody}`;

  return (
    <main style={shell}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />

      <div style={{ marginBottom: 16 }}>
        <Link
          href="/tuyen-dung"
          style={{ color: 'var(--ink-2, #5b6879)', textDecoration: 'none', fontSize: 14 }}
        >
          ← Tất cả tin tuyển dụng
        </Link>
      </div>

      <div style={card}>
        <div style={{ marginBottom: 8, fontSize: 14, color: 'var(--ink-2, #5b6879)' }}>
          {COMPANY_SHORT} · Tuyển dụng
        </div>
        <h1
          style={{
            margin: '0 0 12px',
            fontSize: 28,
            lineHeight: 1.25,
            color: 'var(--ink, #1a2230)',
          }}
        >
          {job.title}
        </h1>

        <div style={{ marginBottom: 16 }}>
          {job.department ? <span style={chip}>{job.department}</span> : null}
          {job.location ? <span style={chip}>📍 {job.location}</span> : null}
          {job.employment_type ? <span style={chip}>{job.employment_type}</span> : null}
          {job.salary_display ? (
            <span style={{ ...chip, background: 'var(--ok-bg, #e7f4ec)', color: 'var(--ok, #1c7a4d)' }}>
              💰 {job.salary_display}
            </span>
          ) : null}
        </div>

        {job.expire_at ? (
          <div style={{ marginBottom: 20, fontSize: 14, color: 'var(--ink-2, #5b6879)' }}>
            Hạn nộp hồ sơ: <b>{fmtVN(job.expire_at)}</b>
          </div>
        ) : null}

        <div
          style={{ lineHeight: 1.65, color: 'var(--ink, #1a2230)' }}
          dangerouslySetInnerHTML={{ __html: descriptionHtml(job) }}
        />

        <div
          style={{
            marginTop: 28,
            paddingTop: 20,
            borderTop: '1px solid var(--line, #dbe5f1)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <a
            href={mailto}
            style={{
              display: 'inline-block',
              padding: '12px 22px',
              background: 'var(--accent, #1f4e79)',
              color: '#fff',
              borderRadius: 10,
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Gửi CV ứng tuyển
          </a>
          <span style={{ fontSize: 14, color: 'var(--ink-2, #5b6879)' }}>
            hoặc gửi email trực tiếp: <b>{contactEmail}</b>
          </span>
        </div>
      </div>

      <footer
        style={{
          marginTop: 24,
          fontSize: 13,
          color: 'var(--ink-2, #5b6879)',
          textAlign: 'center',
          lineHeight: 1.7,
        }}
      >
        <div>
          <b>{COMPANY_NAME}</b>
        </div>
        <div>{COMPANY_ADDRESS}</div>
        <div>
          Hotline: {HOTLINE} · Website:{' '}
          <a href="https://sdvico.vn" style={{ color: 'var(--accent, #1f4e79)' }}>
            sdvico.vn
          </a>
        </div>
      </footer>
    </main>
  );
}
