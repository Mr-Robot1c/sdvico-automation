import { NextResponse } from 'next/server';
import { getServerClient } from '../../../../lib/supabase-server';

// Soi vi sao webhook Facebook chua bat duoc lead (user 25/8: da subscribe page thanh cong
// nhung comment/inbox khong hien o /khach-hang). 3 kha nang:
//  1. Facebook KHONG goi webhook (subscribe fail o cap app hoac page)
//  2. Facebook goi webhook NHUNG comment bi loc keyword (khong match INTENT_KEYWORDS)
//  3. Facebook goi webhook OK, insert leads OK — chi la UI chua refresh
//
// Endpoint doc 3 nguon de biet dang o buoc nao:
//  A. 20 log mkt.facebook_webhook gan nhat (captured, errors)
//  B. 10 lead moi nhat trong DB (verify insert thanh cong)
//  C. Suggest tin nhan test kem keyword nen dung
//
// Dung: /api/facebook/webhook-diag?secret=<CRON_SECRET>
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const given = url.searchParams.get('secret') || '';
  if (secret && given !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const client = getServerClient();

  const [{ data: webhookLogs }, { data: leadRows }, { count: totalLeads }] = await Promise.all([
    client
      .from('run_log')
      .select('status, detail, created_at')
      .eq('task', 'mkt.facebook_webhook')
      .order('created_at', { ascending: false })
      .limit(20),
    client
      .from('mkt_leads')
      .select('id, source, fb_user_name, message, status, created_at, raw_payload')
      .order('created_at', { ascending: false })
      .limit(10),
    client
      .from('mkt_leads')
      .select('id', { count: 'exact', head: true }),
  ]);

  const webhookCalls = (webhookLogs || []).map((r: any) => ({
    at: r.created_at,
    status: r.status,
    captured: r.detail?.captured ?? null,
    errors: r.detail?.errors || [],
  }));

  // Dien giai ket qua cho user:
  let diagnosis = '';
  const nowMinus5Min = Date.now() - 5 * 60 * 1000;
  const recentCalls = webhookCalls.filter((c) => new Date(c.at).getTime() > nowMinus5Min);
  if (webhookCalls.length === 0) {
    diagnosis = 'CHUA CO log webhook nao trong DB. Facebook chua goi toi /api/facebook/webhook. Nguyen nhan co the: (a) chua bam subscribe field feed/messages tren Facebook Dashboard, hoac (b) subscribe field nhung app chua Live cho non-admin — nhung ban la admin nen nay khong ap dung.';
  } else if (recentCalls.length === 0) {
    diagnosis = `Co ${webhookCalls.length} log webhook nhung KHONG co log nao trong 5 phut qua. Nghia la Facebook KHONG goi webhook cho comment/tin nhan ban vua test. Xem lai: (a) ban comment o bai cua page 1266212619906410 khong? (page da subscribe), (b) khong tick "Only me" khi comment (Facebook loc), (c) app cho phep account ban comment/nhan tin — thu comment/tin nhan ngay bay gio LAI, sau 30 giay chay lai endpoint nay.`;
  } else {
    const totalCaptured = recentCalls.reduce((s, c) => s + (Number(c.captured) || 0), 0);
    if (totalCaptured === 0) {
      diagnosis = `Facebook DA GOI webhook ${recentCalls.length} lan trong 5 phut qua NHUNG captured=0. Nghia la comment/tin nhan tap toi nhung KHONG match INTENT_KEYWORDS hoac khong phai comment/message event. Xem chi tiet raw_payload o cot recentWebhookCalls duoi de biet payload la gi. Neu la comment, thu kem 1 tu khoa: gia, bao nhieu, mua, lap, sdt, ib, alo, can, muon, o dau.`;
    } else {
      diagnosis = `Da bat duoc ${totalCaptured} lead trong 5 phut qua. Neu /khach-hang van khong hien thi la UI cache — F5 lai. Xem cot recentLeads duoi de verify.`;
    }
  }

  return NextResponse.json({
    ok: true,
    diagnosis,
    stats: { totalLeadsInDb: totalLeads || 0, webhookCallsInDb: webhookCalls.length },
    recentWebhookCalls: webhookCalls,
    recentLeads: (leadRows || []).map((l: any) => ({
      id: l.id,
      at: l.created_at,
      source: l.source,
      name: l.fb_user_name,
      message: l.message,
      status: l.status,
      // Chi trich 1 phan raw_payload de user thay Facebook gui du lieu gi
      raw_snippet: JSON.stringify(l.raw_payload || {}).slice(0, 300),
    })),
    intent_keywords: ['gia', 'bao nhieu', 'bn', 'mua', 'lap', 'dat', 'tu van', 'lien he', 'ib', 'inbox', 'sdt', 'alo', 'goi', 'can', 'muon', 'o dau'],
  });
}
