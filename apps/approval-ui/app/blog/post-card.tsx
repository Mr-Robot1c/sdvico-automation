import Link from 'next/link';
import { displayProduct, fmtDateVN, optImg, type PublicPost } from '../../lib/seo';

// Thẻ bài viết dùng chung cho /blog, /blog/chu-de, bài liên quan ở /san-pham/[slug]
// (design-spec-trang-cong-khai: ô ảnh 16:10 LUÔN có để các thẻ đều chiều cao, tiêu đề tối đa
// 2 dòng, trích 3 dòng, meta = chip sản phẩm chỉ khi khớp danh mục + ngày).
export default function PostCard({ post, hideProduct = false }: { post: PublicPost; hideProduct?: boolean }) {
  // 30/8 (audit L6): mọi thẻ đều có nhãn danh mục cho đồng đều — bài không khớp danh mục
  // sản phẩm thì nhãn chung "Bài viết" (trước chỉ vài thẻ có chip, nhìn như lỗi).
  const product = hideProduct ? '' : (displayProduct(post.product) || 'Bài viết');
  const date = fmtDateVN(post.publishedAt);
  const href = `/blog/${post.slug}`;
  return (
    <article className="pub-card">
      <Link href={href} className="pub-card-media" aria-label={post.title} tabIndex={-1}>
        {post.imageUrl ? (
          <img src={optImg(post.imageUrl, 640) || undefined} alt={post.title} loading="lazy" />
        ) : (
          <span className="pub-card-ph" aria-hidden="true">
            <img src="/logo-sdvico.png" alt="" />
          </span>
        )}
      </Link>
      <div className="pub-card-body">
        {product || date ? (
          <div className="pub-card-meta">
            {product ? <span className="pub-chip">{product}</span> : null}
            {date ? <time dateTime={post.publishedAt || undefined}>{date}</time> : null}
          </div>
        ) : null}
        <h3 className="pub-card-title">
          <Link href={href}>{post.title}</Link>
        </h3>
        <p className="pub-card-excerpt">{post.excerpt}</p>
      </div>
    </article>
  );
}
