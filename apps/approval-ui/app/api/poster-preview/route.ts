// Render một poster MẪU từ tham số query để xem trước khi chỉnh Cài đặt.
// Nằm sau cổng Basic Auth (không thuộc /api/cron) nên chỉ người đăng nhập xem được.

import { NextRequest } from 'next/server';
import { buildRecruitmentPoster } from '../../../lib/poster';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const buf = await buildRecruitmentPoster({
    title: q.get('title') || 'Kỹ thuật viên điện tử viễn thông',
    location: q.get('location') || 'Vũng Tàu',
    requirements: ['Có kinh nghiệm liên quan', 'Có chứng chỉ nghề', 'Sức khỏe tốt, trách nhiệm'],
    benefits: ['Lương thỏa thuận, thưởng', 'BHXH, BHYT đầy đủ', 'Có xe đưa rước hàng ngày'],
    brandName: q.get('company_name') || 'SDVICO',
    tagline: q.get('tagline') || undefined,
    website: q.get('website') || 'sdvico.vn',
    hotline: q.get('hotline') || '1900 23 23 49',
    photoUrl: q.get('photo') || 'https://picsum.photos/seed/sdvico-preview/1080/560',
    logoUrl: q.get('logo') || undefined,
    theme: {
      navy: q.get('navy') || undefined,
      red: q.get('red') || undefined,
      accent: q.get('accent') || undefined,
    },
  });
  if (!buf) return new Response('Không tạo được poster', { status: 500 });
  return new Response(new Uint8Array(buf), {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' },
  });
}
