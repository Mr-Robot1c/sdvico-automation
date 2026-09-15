// lib/web-search.ts — TÌM WEB cho bot hỏi đáp (15/9, sếp: "bot chưa cung cấp được thông tin như trên Google").
// Gốc: Gemini grounding (googleSearch) trên key free bị 429 ngay, nên bot thực tế KHÔNG tìm được gì.
// Nay nối API tìm kiếm trả phí, key nào có thì dùng: TAVILY_API_KEY (ưu tiên, trả sẵn nội dung) hoặc
// SERPER_API_KEY (Google kết quả thô). Không có key -> trả [] và bot chạy như cũ.
export type WebHit = { title: string; url: string; snippet: string };

export function webSearchProvider(): 'tavily' | 'serper' | null {
  if ((process.env.TAVILY_API_KEY || '').trim()) return 'tavily';
  if ((process.env.SERPER_API_KEY || '').trim()) return 'serper';
  return null;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`tìm web quá ${ms}ms`)), ms))]);
}

export async function webSearch(query: string, n = 5, timeoutMs = 7000): Promise<WebHit[]> {
  const q = String(query || '').trim().slice(0, 300);
  if (!q) return [];
  const provider = webSearchProvider();
  if (!provider) return [];
  try {
    if (provider === 'tavily') {
      const r = await withTimeout(fetch('https://api.tavily.com/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query: q, max_results: n, search_depth: 'basic', include_answer: false }),
        cache: 'no-store',
      }), timeoutMs);
      const j: any = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`Tavily ${r.status}: ${String(j.detail?.error || j.error || '').slice(0, 120)}`);
      return (j.results || []).slice(0, n).map((x: any) => ({ title: String(x.title || '').slice(0, 140), url: String(x.url || ''), snippet: String(x.content || '').replace(/\s+/g, ' ').slice(0, 500) })).filter((x: WebHit) => x.url);
    }
    const r = await withTimeout(fetch('https://google.serper.dev/search', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-KEY': String(process.env.SERPER_API_KEY) },
      body: JSON.stringify({ q, gl: 'vn', hl: 'vi', num: n }),
      cache: 'no-store',
    }), timeoutMs);
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Serper ${r.status}: ${String(j.message || '').slice(0, 120)}`);
    const hits: WebHit[] = [];
    if (j.answerBox?.answer || j.answerBox?.snippet) hits.push({ title: String(j.answerBox.title || 'Google trả lời nhanh'), url: String(j.answerBox.link || ''), snippet: String(j.answerBox.answer || j.answerBox.snippet || '').slice(0, 500) });
    for (const x of j.organic || []) hits.push({ title: String(x.title || '').slice(0, 140), url: String(x.link || ''), snippet: String(x.snippet || '').slice(0, 500) });
    return hits.filter((x) => x.url || x.snippet).slice(0, n);
  } catch (e: any) {
    console.error('[web-search]', e?.message || e);
    return [];
  }
}

export function formatHitsForPrompt(hits: WebHit[]): string {
  if (!hits.length) return '';
  return ['===== KẾT QUẢ TÌM WEB (nguồn ngoài, ghi rõ "theo nguồn ngoài" khi dùng; KHÔNG gán số liệu này cho SDVICO) =====',
    ...hits.map((h, i) => `[W${i + 1}] ${h.title}\n${h.url}\n${h.snippet}`), '===== HẾT KẾT QUẢ TÌM WEB ====='].join('\n');
}
