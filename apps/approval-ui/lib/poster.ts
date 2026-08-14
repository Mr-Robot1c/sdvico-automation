// Sinh poster tuyển dụng (JPG) bằng satori + sharp. Chữ tiếng Việt render chuẩn nhờ
// font Be Vietnam Pro nhúng sẵn (satori chuyển chữ thành vector nên không phụ thuộc font hệ thống).
// Layout theo mẫu duyệt: dải ảnh ngành ở trên, Yêu cầu/Quyền lợi to ở giữa, footer liên hệ.
// Màu sắc, tagline, liên hệ lấy từ brand config (chỉnh được trong Cài đặt).

import satori from 'satori';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export type PosterTheme = {
  navy?: string;   // nền chính + footer chữ
  red?: string;    // banner TUYỂN DỤNG, tick, footer
  accent?: string; // tiêu đề cột (vàng)
};

export type PosterInput = {
  title: string;
  location?: string | null;
  requirements: string[];
  benefits: string[];
  brandName?: string;
  tagline?: string;
  website?: string;
  hotline?: string;
  photoUrl?: string | null;
  theme?: PosterTheme;
};

const DEFAULT_THEME = { navy: '#06264d', red: '#e4322b', accent: '#ffd24a' };

let FONTS: Array<{ name: string; data: Buffer; weight: number; style: string }> | null = null;
function loadFonts() {
  if (FONTS) return FONTS;
  const dir = path.join(process.cwd(), 'assets', 'fonts');
  FONTS = [
    { name: 'Be Vietnam Pro', data: readFileSync(path.join(dir, 'BeVietnamPro-Regular.ttf')), weight: 400, style: 'normal' },
    { name: 'Be Vietnam Pro', data: readFileSync(path.join(dir, 'BeVietnamPro-Bold.ttf')), weight: 700, style: 'normal' },
  ];
  return FONTS;
}

// Tách một đoạn text thành các gạch đầu dòng ngắn (theo xuống dòng, chấm phẩy, dấu chấm).
export function toBullets(text: string | null | undefined, max = 4): string[] {
  const s = String(text || '').trim();
  if (!s) return [];
  return s
    .split(/\r?\n|;|·|•|•/)
    .map((x) => x.replace(/^[-*+\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, max);
}

async function photoDataUri(url: string, w: number, h: number): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const jpg = await sharp(buf).resize(w, h, { fit: 'cover' }).jpeg({ quality: 82 }).toBuffer();
    return `data:image/jpeg;base64,${jpg.toString('base64')}`;
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const div = (style: any, children: any): any => ({ type: 'div', props: { style, children } });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const txt = (style: any, s: string): any => ({ type: 'div', props: { style: { display: 'flex', ...style }, children: s } });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const imgEl = (src: string, style: any): any => ({ type: 'img', props: { src, style } });

function icon(pathD: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'><path d='${pathD}'/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
const CHECK = 'M9 16.2l-3.5-3.5L4 14.2 9 19l11-11-1.5-1.5z';
const PIN = 'M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z';
const PHONE = 'M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.4 0 .7-.2 1l-2.3 2.2z';

export async function buildRecruitmentPoster(input: PosterInput): Promise<Buffer | null> {
  try {
    const t = { ...DEFAULT_THEME, ...(input.theme || {}) };
    const brandName = input.brandName || 'SDVICO';
    const website = input.website || 'sdvico.vn';
    const hotline = input.hotline || '1900 23 23 49';
    const reqs = input.requirements.length ? input.requirements : ['Xem chi tiết trong bài đăng'];
    const bens = input.benefits.length ? input.benefits : ['Xem chi tiết trong bài đăng'];

    const photo = input.photoUrl ? await photoDataUri(input.photoUrl, 1080, 560) : null;

    const bullet = (text: string) =>
      div({ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }, [
        div({ display: 'flex', width: 40, height: 40, borderRadius: 20, background: t.red, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
          [imgEl(icon(CHECK), { width: 24, height: 24 })]),
        txt({ color: '#fff', fontSize: 30, lineHeight: 1.2 }, text),
      ]);

    const column = (title: string, items: string[]) =>
      div({ display: 'flex', flexDirection: 'column', flex: 1 }, [
        txt({ color: t.accent, fontSize: 34, fontWeight: 700, marginBottom: 22, letterSpacing: 1 }, title),
        ...items.map(bullet),
      ]);

    // Header overlay (trên dải ảnh)
    const header = div(
      { display: 'flex', flexDirection: 'column', flexGrow: 1, padding: '34px 44px',
        backgroundImage: `linear-gradient(to bottom, rgba(6,38,77,0.92) 0%, rgba(6,38,77,0.35) 45%, rgba(6,38,77,0.7) 100%)` },
      [
        div({ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, [
          txt({ color: '#fff', fontSize: 40, fontWeight: 700, letterSpacing: 2 }, brandName),
          txt({ color: '#cfe0f5', fontSize: 20 }, website),
        ]),
        div({ display: 'flex', flexGrow: 1 }, []),
        txt({ color: '#fff', background: t.red, alignSelf: 'flex-start', padding: '6px 24px', borderRadius: 10, fontSize: 46, fontWeight: 700, letterSpacing: 2 }, 'TUYỂN DỤNG'),
        div({ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', borderRadius: 14, padding: '12px 22px', alignSelf: 'flex-start', marginTop: 10, maxWidth: 980 }, [
          div({ display: 'flex', width: 36, height: 36, borderRadius: 8, background: t.red, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, [imgEl(icon(CHECK), { width: 22, height: 22 })]),
          txt({ color: t.navy, fontSize: 34, fontWeight: 700 }, input.title.toUpperCase()),
        ]),
        ...(input.location ? [div({ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }, [
          imgEl(icon(PIN), { width: 26, height: 26 }),
          txt({ color: '#fff', fontSize: 26, fontWeight: 700 }, `Làm việc tại ${input.location}`),
        ])] : []),
      ]
    );

    const topBand = div({ display: 'flex', flexDirection: 'column', height: 560, position: 'relative' },
      [...(photo ? [imgEl(photo, { position: 'absolute', top: 0, left: 0, width: 1080, height: 560, objectFit: 'cover' })] : []), header]);

    const body = div({ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', padding: '40px 50px' }, [
      div({ display: 'flex', gap: 40 }, [column('YÊU CẦU', reqs), column('QUYỀN LỢI', bens)]),
    ]);

    const footer = div({ display: 'flex', alignItems: 'center', gap: 14, background: t.red, padding: '22px 50px' }, [
      imgEl(icon(PHONE), { width: 32, height: 32 }),
      txt({ color: '#fff', fontSize: 26, fontWeight: 700 }, 'LIÊN HỆ:'),
      txt({ color: '#fff', fontSize: 38, fontWeight: 700 }, hotline),
    ]);

    const tree = div(
      { width: 1080, height: 1350, display: 'flex', flexDirection: 'column', background: t.navy, fontFamily: 'Be Vietnam Pro' },
      [topBand, body, footer]
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svg = await satori(tree as any, { width: 1080, height: 1350, fonts: loadFonts() as any });
    return await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
  } catch {
    return null;
  }
}
