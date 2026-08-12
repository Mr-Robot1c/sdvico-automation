// Lấy ảnh từ Unsplash để đính kèm bài đăng tuyển dụng.
// Cần biến môi trường UNSPLASH_ACCESS_KEY. Không có key thì trả null (bài đăng vẫn chạy, chỉ không có ảnh).
// Key lấy tại: https://unsplash.com/developers → tạo app → Access Key.
// Ảnh từ Unsplash miễn phí nếu hiển thị đúng attribution. Với bài Facebook là đủ điều kiện.

const UNSPLASH_ENDPOINT = 'https://api.unsplash.com/search/photos';

// Ánh xạ từ khóa vị trí → query tiếng Anh để lấy ảnh phù hợp ngữ cảnh ngành biển.
// Nếu người dùng đặt image_hint thì dùng hint đó thay vì bảng này.
const QUERY_MAP: Array<{ match: RegExp; query: string }> = [
  { match: /định vị|hành trình|tracking|giám sát|s-tracking/i, query: 'fishing vessel GPS navigation maritime monitoring' },
  { match: /điện tử|điện lạnh|kỹ sư điện|electronics|electrical engineer/i, query: 'marine electronics engineer boat equipment' },
  { match: /cơ khí|mechanical|máy móc/i, query: 'marine mechanic ship engine repair boat' },
  { match: /lọc nước|water|máy lọc/i, query: 'water purification system boat marine vessel' },
  { match: /dầu nhớt|oil|lubricant|nhiên liệu|diesel/i, query: 'marine diesel engine oil ship maintenance' },
  { match: /vệ tinh|satellite|thuraya|liên lạc|communication/i, query: 'satellite maritime communication vessel ocean' },
  { match: /ngư dân|tàu cá|fishing|thuyền trưởng|captain/i, query: 'vietnamese fishing boat ocean sea crew' },
  { match: /thủy sản|seafood|aqua|tôm|cá|hải sản/i, query: 'seafood fishing industry boat ocean harvest' },
  { match: /kế toán|tài chính|accounting|finance/i, query: 'professional office work business finance' },
  { match: /kinh doanh|bán hàng|sales|marketing/i, query: 'business team professional coastal maritime' },
  { match: /hành chính|nhân sự|hr|admin/i, query: 'modern office professional team work' },
  { match: /kho|giao nhận|logistics|vận chuyển|cảng|port/i, query: 'maritime port logistics warehouse cargo ship' },
  { match: /lái xe|xe|driver|vận tải/i, query: 'truck driver logistics transportation coastal' },
  { match: /it|công nghệ|software|lập trình|developer/i, query: 'technology developer maritime digital innovation' },
];

function pickQuery(title: string, location?: string): string {
  for (const { match, query } of QUERY_MAP) {
    if (match.test(title)) return query;
  }
  // Mặc định: cảnh biển Việt Nam — phù hợp với bản sắc công ty SDVICO ngành thủy sản.
  const isVungTau = location?.toLowerCase().includes('vũng tàu') || location?.toLowerCase().includes('vung tau');
  return isVungTau ? 'vung tau fishing boat sea coastal vietnam' : 'vietnam coastal sea fishing maritime professional';
}

// imageHint: từ khóa người dùng tự đặt cho vị trí này (lưu trong hr_jobs.image_hint).
// Có hint thì dùng hint; không có thì tự đoán theo tên vị trí.
export async function fetchUnsplashPhoto(title: string, location?: string, imageHint?: string | null): Promise<string | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;

  const query = imageHint?.trim() || pickQuery(title, location);
  try {
    const url = new URL(UNSPLASH_ENDPOINT);
    url.searchParams.set('query', query);
    url.searchParams.set('per_page', '5');
    url.searchParams.set('orientation', 'landscape');
    url.searchParams.set('content_filter', 'high');
    url.searchParams.set('client_id', key);

    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return null;

    const data = await res.json();
    const photos = data?.results as Array<{ urls: { regular: string } }> | undefined;
    if (!photos?.length) return null;

    // Lấy ngẫu nhiên trong 5 ảnh đầu để không lặp mãi cùng một ảnh.
    const pick = photos[Math.floor(Math.random() * Math.min(photos.length, 5))];
    return pick?.urls?.regular || null;
  } catch {
    return null;
  }
}
