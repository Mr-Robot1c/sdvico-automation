// GET /api/jobs/feed.xml
// XML feed cho Jooble (spec: jooble.org/files/xml_feed_specifications.pdf) và các aggregator
// khác chấp nhận cùng schema (Adzuna, Jora). Middleware sẽ skip auth cho path này.
//
// Nguyên tắc:
// - Đọc thẳng hr_jobs, không đi qua approval_queue vì Jooble crawl feed tổng, không đăng per-item.
// - Chỉ lộ tin đã status='open' và còn hạn (expire_at > now()). Tin draft không rò rỉ.
// - Không đụng dữ liệu ứng viên — điều cấm 6.
// - Log JoobleBot crawl vào run_log để biết bot có ghé thật hay không.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '../../../../lib/supabase-server';
import { buildJobDetailSection } from '../../../../lib/job-detail';
import { jobsPublicEnabled } from '../../../../lib/jobs-public';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const COMPANY_NAME = 'Công ty TNHH Hiệp Lực Phát Triển Việt';

function siteUrl(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (env) return env.replace(/\/+$/, '');
  const host = req.headers.get('host');
  if (host) {
    const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https';
    return `${proto}://${host}`;
  }
  return 'https://sdvico.vn';
}

function fmtDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yy = d.getUTCFullYear();
  return `${dd}.${mm}.${yy}`;
}

function cdata(v: unknown): string {
  const s = String(v ?? '').replace(/]]>/g, ']]]]><![CDATA[>');
  return `<![CDATA[${s}]]>`;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

type JobRow = {
  id: string;
  slug: string | null;
  title: string;
  location: string | null;
  short_desc: string | null;
  requirements: string | null;
  benefits: string | null;
  jd_versions: Record<string, unknown> | null;
  salary_display: string | null;
  employment_type: string | null;
  published_at: string | null;
  updated_at: string | null;
  expire_at: string | null;
  created_at: string;
};

function buildDescriptionHtml(job: JobRow): string {
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

async function readBrandLogo(supa: ReturnType<typeof getServerClient>): Promise<string | null> {
  try {
    const { data } = await supa
      .from('app_config')
      .select('value')
      .eq('key', 'brand')
      .maybeSingle();
    const value = (data as { value?: { logo_url?: string } } | null)?.value;
    const url = value?.logo_url?.trim();
    return url || null;
  } catch {
    return null;
  }
}

function xmlHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/xml; charset=utf-8',
    // Jooble crawl 1 lần/24h; 5 phút cho browser, 10 phút cho CDN là hợp lý cho aggregator khác.
    'Cache-Control': 'public, max-age=300, s-maxage=600',
    // Cho phép robot đọc bằng bất kỳ Origin nào (chỉ là feed công khai, không cookie).
    'Access-Control-Allow-Origin': '*',
  };
}

function emptyFeed(): NextResponse {
  return new NextResponse(
    `<?xml version="1.0" encoding="utf-8"?>\n<jobs>\n</jobs>\n`,
    { status: 200, headers: xmlHeaders() }
  );
}

function renderJob(
  j: JobRow,
  ctx: { site: string; contactEmail: string; logoUrl: string | null }
): string {
  const link = `${ctx.site}/tuyen-dung/${encodeURIComponent(j.slug as string)}`;
  const pubDate = j.published_at ? new Date(j.published_at) : new Date(j.created_at);
  const updDate = j.updated_at ? new Date(j.updated_at) : pubDate;
  const expDate = j.expire_at
    ? new Date(j.expire_at)
    : new Date(pubDate.getTime() + 45 * 86400_000);
  const jobtype = j.employment_type?.trim() || 'full-time';
  const region = j.location?.trim() || 'Việt Nam';

  const parts: string[] = [];
  parts.push(`  <job id="${escapeAttr(j.id)}">`);
  parts.push(`    <link>${cdata(link)}</link>`);
  parts.push(`    <name>${cdata(j.title)}</name>`);
  parts.push(`    <region>${cdata(region)}</region>`);
  parts.push(`    <description>${cdata(buildDescriptionHtml(j))}</description>`);
  parts.push(`    <company>${cdata(COMPANY_NAME)}</company>`);
  if (ctx.logoUrl) parts.push(`    <company_logo>${cdata(ctx.logoUrl)}</company_logo>`);
  parts.push(`    <pubdate>${fmtDate(pubDate)}</pubdate>`);
  parts.push(`    <updated>${fmtDate(updDate)}</updated>`);
  parts.push(`    <expire>${fmtDate(expDate)}</expire>`);
  parts.push(`    <jobtype>${cdata(jobtype)}</jobtype>`);
  if (j.salary_display?.trim()) {
    parts.push(`    <salary>${cdata(j.salary_display.trim())}</salary>`);
  }
  parts.push(`    <email>${cdata(ctx.contactEmail)}</email>`);
  parts.push(`  </job>`);
  return parts.join('\n');
}

export async function GET(req: NextRequest) {
  // Kill switch: JOBS_PUBLIC_ENABLED=false → không phục vụ feed nữa.
  // Trả 404 để JoobleBot ngừng crawl và tự dọn khỏi index sau ~24h.
  if (!jobsPublicEnabled()) {
    return new NextResponse('Not found', { status: 404 });
  }

  const site = siteUrl(req);
  const contactEmail =
    process.env.HR_CONTACT_EMAIL?.trim() || 'sdvicotuyendung@gmail.com';

  let supa;
  try {
    supa = getServerClient();
  } catch {
    return emptyFeed();
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supa
    .from('hr_jobs')
    .select(
      'id, slug, title, location, short_desc, requirements, benefits, jd_versions, salary_display, employment_type, published_at, updated_at, expire_at, created_at'
    )
    .eq('status', 'open')
    .gt('expire_at', nowIso)
    .order('published_at', { ascending: false })
    .limit(500);

  if (error) return emptyFeed();

  const logoUrl = await readBrandLogo(supa);
  const rows = ((data as JobRow[] | null) || []).filter((j) => j.slug);
  const jobs = rows.map((j) => renderJob(j, { site, contactEmail, logoUrl }));

  const xml =
    `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<jobs>\n${jobs.join('\n')}\n</jobs>\n`;

  const ua = req.headers.get('user-agent') || '';
  if (/JoobleBot/i.test(ua)) {
    try {
      await supa.from('run_log').insert({
        task: 'jooble_feed_crawl',
        actor: 'jooble-bot',
        status: 'ok',
        detail: {
          user_agent: ua,
          job_count: jobs.length,
          ip: req.headers.get('x-forwarded-for') || null,
        },
      });
    } catch {
      // Log thất bại không được cản request. Bot vẫn phải nhận feed.
    }
  }

  return new NextResponse(xml, { status: 200, headers: xmlHeaders() });
}
