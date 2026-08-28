import { redirect } from 'next/navigation';

// 28/8 (user): "Du lieu AI hoc" GOP HAN vao trang Nguon hoc du lieu (/kho-tri-thuc):
// dashboard tat ca agent (AgentRoster) + block Hoat dong gan day nam o do. Route nay giu
// redirect cho link cu khong chet.
export const dynamic = 'force-dynamic';

export default function Page() {
  redirect('/kho-tri-thuc');
}
