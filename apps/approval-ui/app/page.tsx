import { redirect } from 'next/navigation';

// 27/8 redesign: mo app la thay Tong quan MOI (/tong-quan — dashboard 5 tab theo file
// "redesign web.docx" cua sep). Bang bai viet chi tiet van o /noi-dung.
export const dynamic = 'force-dynamic';

export default function Page() {
  redirect('/tong-quan');
}
