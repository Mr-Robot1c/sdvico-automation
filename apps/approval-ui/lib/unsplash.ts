// Lấy ảnh từ Unsplash để đính kèm bài đăng tuyển dụng.
// Cần biến môi trường UNSPLASH_ACCESS_KEY. Không có key thì trả null (bài đăng vẫn chạy, chỉ không có ảnh).
// Key lấy tại: https://unsplash.com/developers → tạo app → Access Key.
// Ảnh từ Unsplash miễn phí nếu hiển thị đúng attribution. Với bài Facebook là đủ điều kiện.

const UNSPLASH_ENDPOINT = 'https://api.unsplash.com/search/photos';

// Ánh xạ từ khóa vị trí → query tiếng Anh để lấy ảnh phù hợp ngữ cảnh ngành biển.
const QUERY_MAP: Array<{ match: RegExp; query: string }> = [
  { match: /định vị|hành trình|tracking|giám sát|s-tracking/i, query: 'fishing boat GPS navigation technology' },
  { match: /điện tử|điện lạnh|kỹ sư|electronics|engineer/i, query: 'electronics engineer maritime technology' },
  { match: /lọc nước|water|máy lọc/i, query: 'water purification boat marine' },
  { match: /dầu nhớt|oil|lubricant/i, query: 'marine engine diesel boat' },
  { match: /vệ tinh|satellite|thuraya/i, query: 'satellite communication maritime' },
  { match: /ngư dân|tàu cá|fishing|biển|thủy sản|seafood|aqua/i, query: 'fishing boat vietnam coastal sea' },
  { match: /kế toán|tài chính|accounting|finance/i, query: 'professional office work vietnam' },
  { match: /kinh doanh|bán hàng|sales|marketing/i, query: 'business professional coastal vietnam' },
  { match: /hành chính|nhân sự|hr|admin/i, query: 'modern office professional team' },
  { match: /kho|giao nhận|logistics|vận chuyển/i, query: 'warehouse logistics maritime port' },
];

function pickQuery(title: string, location?: string): string {
  for (const { match, query } of QUERY_MAP) {
    if (match.test(title)) return query;
  }
  // Mặc định: cảnh biển Việt Nam — phù hợp với bản sắc công ty SDVICO.
  return `${location?.includes('Vũng Tàu') ? 'vung tau' : 'vietnam'} coastal sea professional`;
}

export async function fetchUnsplashPhoto(title: string, location?: string): Promise<string | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;

  const query = pickQuery(title, location);
  try {
    const url = new URL(UNSPLASH_ENDPOINT);
    url.searchParams.set('query', query);
    url.searchParams.set('per_page', '3');
    url.searchParams.set('orientation', 'landscape');
    url.searchParams.set('content_filter', 'high');
    url.searchParams.set('client_id', key);

    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return null;

    const data = await res.json();
    const photos = data?.results as Array<{ urls: { regular: string } }> | undefined;
    if (!photos?.length) return null;

    // Lấy ảnh ngẫu nhiên trong 3 kết quả đầu để không lặp ảnh giống nhau mãi.
    const pick = photos[Math.floor(Math.random() * photos.length)];
    return pick?.urls?.regular || null;
  } catch {
    return null;
  }
}
