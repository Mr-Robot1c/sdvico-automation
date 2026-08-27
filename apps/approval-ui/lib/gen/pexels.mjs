// Pexels API — miễn phí, license CC0 (không cần credit, không giới hạn thương mại).
// Cần env PEXELS_API_KEY (đăng ký tại pexels.com/api/, key ra ngay, không cần verify).
// Rate limit: 200 req/hour hoặc 20.000 req/month cho free.
//
// Trả về URL ảnh/video có thể dùng trong content trend, an toàn bản quyền.

const API_KEY = process.env.PEXELS_API_KEY;

// Search ảnh — trả 1 ảnh landscape kích thước medium (~800x600) cho mỗi cảnh video.
export async function searchPexelsImage(keywordEn, perPage = 3) {
  if (!API_KEY) return { url: null, error: 'thieu PEXELS_API_KEY env' };
  if (!keywordEn) return { url: null, error: 'thieu keyword' };
  try {
    const q = encodeURIComponent(keywordEn.slice(0, 100));
    const r = await fetch(`https://api.pexels.com/v1/search?query=${q}&per_page=${perPage}&orientation=landscape`, {
      headers: { Authorization: API_KEY },
    });
    if (!r.ok) return { url: null, error: `HTTP ${r.status}` };
    const j = await r.json();
    const photos = Array.isArray(j?.photos) ? j.photos : [];
    if (!photos.length) return { url: null, error: 'khong tim thay' };
    // Chọn ngẫu nhiên 1 trong top N để đa dạng khi search cùng keyword.
    const pick = photos[Math.floor(Math.random() * Math.min(perPage, photos.length))];
    return {
      url: pick.src?.large || pick.src?.medium || pick.src?.original,
      photographer: pick.photographer || '',
      pexelsUrl: pick.url || '',
    };
  } catch (e) {
    return { url: null, error: String(e?.message || e).slice(0, 100) };
  }
}

// Search video — trả 1 video ngắn 5-15s dạng landscape cho lồng tiếng.
export async function searchPexelsVideo(keywordEn, perPage = 3) {
  if (!API_KEY) return { url: null, error: 'thieu PEXELS_API_KEY env' };
  if (!keywordEn) return { url: null, error: 'thieu keyword' };
  try {
    const q = encodeURIComponent(keywordEn.slice(0, 100));
    const r = await fetch(`https://api.pexels.com/videos/search?query=${q}&per_page=${perPage}&orientation=landscape`, {
      headers: { Authorization: API_KEY },
    });
    if (!r.ok) return { url: null, error: `HTTP ${r.status}` };
    const j = await r.json();
    const videos = Array.isArray(j?.videos) ? j.videos : [];
    if (!videos.length) return { url: null, error: 'khong tim thay' };
    // Chọn ngẫu nhiên + ưu tiên độ dài 5-20 giây (Pexels trả video 5-60s).
    const suitable = videos.filter((v) => v.duration >= 5 && v.duration <= 30);
    const pool = suitable.length ? suitable : videos;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    // Lấy file video HD nhỏ nhất (~720p) để nhẹ.
    const files = Array.isArray(pick.video_files) ? pick.video_files : [];
    const hd = files.find((f) => f.quality === 'hd') || files.find((f) => f.quality === 'sd') || files[0];
    return {
      url: hd?.link || null,
      duration: pick.duration || 0,
      photographer: pick.user?.name || '',
      pexelsUrl: pick.url || '',
      thumbnail: pick.image || null,
    };
  } catch (e) {
    return { url: null, error: String(e?.message || e).slice(0, 100) };
  }
}

// Search parallel cho nhiều keywords — dùng khi trend-post có N cảnh.
export async function searchPexelsForScenes(scenes) {
  if (!Array.isArray(scenes) || !scenes.length) return [];
  const results = await Promise.all(
    scenes.map(async (s) => {
      const kw = s.image_keyword_en || s.image_keyword_vi || '';
      const [img, vid] = await Promise.all([
        searchPexelsImage(kw, 3),
        searchPexelsVideo(kw, 3),
      ]);
      return {
        ...s,
        pexels_image_url: img.url,
        pexels_image_photographer: img.photographer,
        pexels_video_url: vid.url,
        pexels_video_duration: vid.duration,
        pexels_video_photographer: vid.photographer,
        pexels_errors: [img.error, vid.error].filter(Boolean),
      };
    })
  );
  return results;
}
