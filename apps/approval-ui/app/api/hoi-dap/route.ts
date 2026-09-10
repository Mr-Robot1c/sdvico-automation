import { NextResponse } from 'next/server';
import { getServerClient } from '../../../lib/supabase-server';
import { isAuthorizedApiRequest } from '../../../lib/session-auth';
import { askBot, loadQa, type BotTurn } from '../../../lib/hoi-dap-bot';

// /api/hoi-dap — bot hỏi đáp nội bộ (9/9/2026, lệnh sếp Long: kho kiến thức từng sản phẩm).
//   POST { question, history? } -> { answer, found, scope, sources, web_sources, model, searched }
//   (10/9: bot trả lời cả câu hỏi ngoài, có tìm Google; số liệu SDVICO chỉ từ kho)
//   GET  ?export=1              -> toàn bộ kho dạng JSON (đầu vào Bot Live Stream phase 2)
// Cả hai đều cần đăng nhập (cookie sdvico_auth) hoặc Bearer CRON_SECRET; middleware không gác /api.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!(await isAuthorizedApiRequest(req))) {
    return NextResponse.json({ error: 'Cần đăng nhập để hỏi bot.' }, { status: 401 });
  }
  let body: any = {};
  try { body = await req.json(); } catch { /* body rỗng */ }
  const question = String(body?.question || '').trim();
  if (!question) return NextResponse.json({ error: 'Chưa có câu hỏi.' }, { status: 400 });
  const history: BotTurn[] = Array.isArray(body?.history)
    ? body.history.filter((t: any) => t && (t.role === 'user' || t.role === 'bot') && typeof t.text === 'string').slice(-8)
    : [];
  try {
    const client = getServerClient();
    const result = await askBot(client, question, history);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e).slice(0, 300) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  if (!(await isAuthorizedApiRequest(req))) {
    return NextResponse.json({ error: 'Cần đăng nhập.' }, { status: 401 });
  }
  const url = new URL(req.url);
  const client = getServerClient();
  const rows = await loadQa(client, url.searchParams.get('group') || undefined);
  const payload = {
    exported_at: new Date().toISOString(),
    count: rows.length,
    items: rows.map((r) => ({
      id: r.id, product_group: r.product_group, question: r.question, answer: r.answer,
      source: r.source, confirmed_by: r.confirmed_by, verified: r.verified, used_count: r.used_count,
    })),
  };
  const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' };
  if (url.searchParams.get('export')) headers['Content-Disposition'] = 'attachment; filename="sdvico-hoi-dap.json"';
  return new NextResponse(JSON.stringify(payload, null, 2), { headers });
}
