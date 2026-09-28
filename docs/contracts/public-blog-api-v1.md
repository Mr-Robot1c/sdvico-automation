# Public Blog API v1

Owner: `apps/approval-ui`

Consumer: `sdvico/sdvico-home-page`, especially `scripts/blog-seo.mjs`, `scripts/content-fingerprint.mjs` and the public-site deployment workflow.

Endpoint: `GET https://sdvico-mktit.vercel.app/api/public/posts?limit=200`

The API is the source of truth for currently public articles. Build events carry only diagnostic metadata; the public site always fetches a fresh snapshot from this endpoint.

## Response contract

```json
{
  "posts": [
    {
      "contentId": "uuid",
      "slug": "stable-title-1234abcd",
      "title": "string",
      "excerpt": "string",
      "paragraphs": ["string"],
      "publishedAt": "ISO-8601 or null",
      "tag": "string",
      "imageUrl": "public URL or null",
      "sourceUrl": "diagnostic source URL"
    }
  ],
  "total": 1
}
```

Rules:

- Only live `mkt_posts.status = published` rows whose `mkt_content.deleted_at` is null are returned.
- `slug` ends in the first eight hexadecimal characters of `contentId` and is the stable canonical identity.
- `total` may exceed the returned array if the caller requests too small a limit. The build must fail rather than silently omit pages.
- New optional fields are backward compatible. Renaming, removing or changing the meaning of a listed field requires a contract version change coordinated with the consumer.
- `sourceUrl` is diagnostic. The consumer owns the canonical host `https://sdvico.vn`.
- No internal brief, approval data, credentials or unpublished content may be returned.

Fingerprint fields are `contentId`, `slug`, `title`, `excerpt`, `paragraphs`, `publishedAt`, `modifiedAt` when later provided, `imageUrl`, `seoTitle` and `seoDescription`. Sorting is by slug and excludes fetch time, request IDs and current time.
