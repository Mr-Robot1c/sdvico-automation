// section-tabs.tsx — hàng tab đầu trang cho các trang cùng một mục menu (23/10, đợt 2 sắp xếp lại,
// docs/app-map/design-spec-app-noi-bo.md: "cấp 2 hiện thành hàng tab đầu trang, không lồng tab").
// Không dùng hook nên dùng được cả trong server component (trang Kế hoạch) lẫn client (RootShell).

import Link from 'next/link';
import type { SectionTab } from '../lib/routes';

export default function SectionTabs({ tabs, active, label }: { tabs: SectionTab[]; active: string | null; label: string }) {
  return (
    <nav className="section-tabs" aria-label={label}>
      {tabs.map((t) => {
        const on = t.href === active;
        return (
          <Link key={t.href} href={t.href} className={`section-tab${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
