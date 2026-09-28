# Runbook: Marketing triggers the public website

After a website article is published, rewritten, unpublished, restored or permanently deleted, the server calls `requestPublicSiteRefresh`. The main database mutation is completed first. GitHub dispatch is a best-effort secondary operation and cannot roll the article back.

The result is written to `run_log` with task `mkt.public_site_refresh`. A failed or missing dispatch is recovered by the hourly reconciliation schedule in the public-site repository after deployment has been enabled.

## Server environment

| Name | Purpose |
|---|---|
| `PUBLIC_SITE_GITHUB_OWNER` | Repository owner, normally `sdvico` |
| `PUBLIC_SITE_GITHUB_REPO` | Repository name, normally `sdvico-home-page` |
| `PUBLIC_SITE_DEPLOY_WORKFLOW` | Workflow file, normally `deploy-public-site.yml` |
| `PUBLIC_SITE_DEPLOY_REF` | Trusted ref containing the workflow, normally `main` |
| `GITHUB_DEPLOY_TOKEN` | Preferred server-only token allowed to dispatch the public-site workflow |
| `GITHUB_TOKEN` | Existing server-only fallback token, retained for the video workflow |

The token must never use a `NEXT_PUBLIC_` name. Give it access only to the private public-site repository and only the Actions permission needed to dispatch workflows. Do not put token values in this repository or in logs.

Before enabling production, merge the public-site workflow into `main`, deploy this Marketing application with the environment variables above, and confirm one dry-run dispatch with `deploy=false` in GitHub Actions.
