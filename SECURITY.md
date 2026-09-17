# Security Policy

## Production Security Measures

This document outlines the security measures implemented in the Four Corners Metadata application.

## 🔒 Authentication & Authorization

### API Endpoints

- **All AI endpoints require authentication** (`/api/ai/analyze-image`, `/api/ai/generate`, `/api/ai/transcribe`)
- **All project CRUD operations require authentication** (`/api/projects`, `/api/projects/[id]`, `/api/projects/[id]/duplicate`)
- **File upload requires authentication** (`/api/storage/upload`, `/api/storage/sign`)
- **Admin endpoints require admin authentication** (`/api/admin/auth`, `/api/admin/stats`, `/api/admin/palettes`, `/api/admin/palettes/[slug]`)
- **OAuth endpoints** (`/api/oauth/decision`)
- **Public endpoints** (no auth required): `/api/palettes`, `/api/palettes/[slug]`, `/api/link-preview`, `/api/vitals`
- **Dev-only**: `/api/dev-auth` (development authentication, should be disabled in production)
- User isolation enforced at database and storage level

### Supabase Row-Level Security (RLS)

Ensure RLS policies are enabled on all tables:

- `projects`: Users can only read their own projects or published projects
- `context_items`: Users can only access items from their own projects
- `links`: Users can only access links from their own projects

## 🛡️ Input Validation

### File Uploads

- **Size limit**: 50MB maximum
- **Allowed types**: Images (JPEG, PNG, GIF, WebP, HEIC) and Videos (MP4, QuickTime, WebM)
- **Path sanitization**: Directory traversal prevention
- **User isolation**: Files stored under user-specific paths

### AI Requests

- **Image size**: 10MB maximum for vision analysis
- **Prompt length**: 10,000 characters maximum
- **System prompt**: 5,000 characters maximum
- **Format validation**: Data URLs validated for correct format

### Project Data

- **Context items**: Maximum 50 per project
- **Links**: Maximum 100 per project
- **Slug format**: Lowercase alphanumeric and hyphens only
- **Metadata validation**: Type checking on all inputs

## 🚦 Rate Limiting

### Implementation

Rate limiting is enforced via Next.js middleware (`proxy.ts`) backed by a Supabase `rate_limit_log` table with atomic RPC checks. All API routes are classified into tiers with different limits.

### Tiers

| Tier | Routes | Limit | Window | Identifier |
|------|--------|-------|--------|------------|
| `ai` | `/api/ai/*` | 10 req | 60s | User ID (hashed) |
| `write` | `/api/projects` POST/PUT/DELETE, `/api/storage/*`, `/api/dev-auth`, `/api/oauth/*` | 30 req | 60s | User ID (hashed) |
| `read` | `/api/projects` GET, `/api/palettes/*`, `/api/link-preview` | 100 req | 60s | IP (hashed) |
| `admin` | `/api/admin/*` | 30 req | 60s | Session (hashed) |

**Exempt:** `/api/vitals` (monitoring endpoint)

### Headers

All API responses include:
- **X-RateLimit-Limit**: Maximum requests per window
- **X-RateLimit-Remaining**: Requests remaining in current window
- **X-RateLimit-Reset**: ISO 8601 timestamp when the window resets

### 429 Response

When rate-limited, returns:
- **Status**: 429 Too Many Requests
- **Retry-After**: Seconds until the window resets
- **Body**: `{ "error": "Too many requests. Please try again later." }`

### Design

- **Fail-open**: If the Supabase RPC check fails, requests are allowed through (prevents rate-limit infrastructure failures from causing outages)
- **Privacy**: All identifiers are SHA-256 hashed before storage (first 16 hex chars)
- **Sliding window**: Uses Postgres `now()` — no client clock dependency
- **Atomic**: Single RPC call counts + inserts in one transaction
- **Cleanup**: `cleanup_rate_limit_log(72)` removes entries older than 72 hours
- **Admin dashboard**: `/admin/rate-limits` shows request volumes, block rates, and violations

### Key Files

- `proxy.ts` — route matching and enforcement
- `lib/rate-limit.ts` — tier config, route classification, identifier extraction, RPC check
- `supabase/migrations/020_rate_limit_log.sql` — table, indexes, RPC functions
- `app/admin/rate-limits/page.tsx` — admin dashboard
- `app/api/admin/rate-limits/route.ts` — dashboard data API

### Production Safety

- `/api/dev-auth` is blocked at the middleware level in production (returns 404), in addition to the existing double-gate in `lib/dev-auth.ts`

## 🔐 Security Headers

### Configured Headers

- **X-Frame-Options**: DENY (prevents clickjacking)
- **X-Content-Type-Options**: nosniff (prevents MIME sniffing)
- **X-XSS-Protection**: 1; mode=block
- **Referrer-Policy**: strict-origin-when-cross-origin
- **Permissions-Policy**: Restricts camera, microphone, geolocation
- **Cache-Control**: no-store on API responses

### Missing (Recommended for Future)

- **Content-Security-Policy**: Add strict CSP headers
- **Strict-Transport-Security**: HSTS (handled by Vercel)

## 🔑 Environment Variables

### Required Variables

```
AI_GATEWAY_KEY - Vercel AI Gateway key
OPENAI_API_KEY - OpenAI API key
NEXT_PUBLIC_SUPABASE_URL - Supabase project URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY - Supabase publishable key (public, sb_publishable_…)
SUPABASE_SECRET_KEY - Supabase secret key (KEEP SECRET! sb_secret_…)
```

Key access goes through `lib/supabase/public-key.ts` / `lib/supabase/secret-key.ts`.
The new-format keys are not JWTs: they rotate with zero downtime and multiple
secret keys may be active concurrently. The legacy JWT keys
(`NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`) were revoked in
Supabase and removed from Vercel during the 2026-06-11 rotation; their code
fallback has been removed.

### Security Best Practices

- ✅ Never commit `.env.local` to version control
- ✅ Use Vercel environment variables for production
- ✅ Rotate API keys regularly
- ✅ Use different keys for dev/staging/production
- ✅ Monitor API usage for anomalies

## 🗄️ Database Security

### Supabase Configuration

1. **Enable RLS on all tables**
2. **Create policies that enforce user ownership**
3. **Use anon key for client-side operations**
4. **Use service role key ONLY on server-side**
5. **Never expose service role key to client**

### Example RLS Policy

```sql
-- Projects table
CREATE POLICY "Users can read their own projects"
ON projects FOR SELECT
USING (auth.uid() = user_id OR published = true);

CREATE POLICY "Users can update their own projects"
ON projects FOR UPDATE
USING (auth.uid() = user_id);
```

### Known advisor findings — `spatial_ref_sys` (PostGIS)

The Supabase Security Advisor flags `rls_disabled_in_public` on `public.spatial_ref_sys`.
That table is a PostGIS system table **owned by `supabase_admin`**, so it **cannot be
hardened via the CLI / `supabase db push`** — that connects as the `postgres` role, which
is neither the owner nor a superuser, so `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and
`REVOKE` both fail (`42501 must be owner of table`).

Migration `20260630_spatial_ref_sys_rls_hardening.sql` carries the fix (enable RLS +
read-only `SELECT` policy for `anon`/`authenticated` + revoke their write grants) inside a
guarded `DO` block: it **self-applies** when run by a privileged role (local CI superuser,
or the Dashboard SQL Editor) and **no-ops with a `NOTICE`** under `postgres`. This
supersedes the stale item-#3 comment in `030_security_linter_fixes.sql`, which named
`spatial_ref_sys` but never touched it.

**To resolve on prod**, run those statements in the Supabase Dashboard → SQL Editor (it
runs privileged), or acknowledge the finding as a known PostGIS reference-table case:

```sql
ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
CREATE POLICY spatial_ref_sys_read_only ON public.spatial_ref_sys
  FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.spatial_ref_sys FROM anon, authenticated;
```

## 📦 Storage Security

### Supabase Storage

- Files stored under user-specific paths: `{user_id}/{filename}`
- Bucket access controlled via Supabase policies
- File type validation on upload
- Size limits enforced (50MB)

### Recommended Storage Policies

```sql
-- Allow users to upload to their own folder
CREATE POLICY "Users can upload to own folder"
ON storage.objects FOR INSERT
WITH CHECK (auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to read from their own folder
CREATE POLICY "Users can read own files"
ON storage.objects FOR SELECT
USING (auth.uid()::text = (storage.foldername(name))[1]);
```

## 🚨 Error Handling

### Information Leakage Prevention

- Generic error messages sent to client
- Detailed errors logged server-side only
- No stack traces in production responses
- API keys never included in error messages

### Example

```typescript
// ❌ Bad
return NextResponse.json({ error: error.message }, { status: 500 });

// ✅ Good
console.error("Detailed error:", error);
return NextResponse.json({ error: "Internal server error" }, { status: 500 });
```

## 🔍 Monitoring & Logging

### Recommended Setup

- **Vercel Analytics**: Monitor traffic and performance
- **Sentry**: Error tracking and alerting
- **Supabase Logs**: Database query monitoring
- **OpenAI Usage**: Track API costs and rate limits

### What to Monitor

- Failed authentication attempts
- Rate limit violations
- Unusual upload patterns
- API error rates
- Database query performance

## 📋 Security Checklist

### Pre-Deployment

- [ ] All API endpoints have authentication
- [ ] RLS policies enabled on all Supabase tables
- [ ] Environment variables set in Vercel
- [ ] `.env.example` contains no real secrets
- [ ] Rate limiting tested
- [ ] File upload validation tested
- [ ] Security headers verified

### Post-Deployment

- [ ] Monitor error logs daily
- [ ] Review API usage weekly
- [ ] Rotate API keys quarterly
- [ ] Update dependencies monthly
- [ ] Security audit quarterly

## 🆘 Incident Response

### If API Keys are Compromised

1. **Immediately rotate** affected keys in provider dashboard
2. **Update** Vercel environment variables
3. **Redeploy** application
4. **Review** access logs for suspicious activity
5. **Document** incident and lessons learned

### If Database is Compromised

1. **Contact** Supabase support immediately
2. **Rotate** all database credentials
3. **Review** RLS policies
4. **Audit** recent database changes
5. **Notify** affected users if data was accessed

## 📚 Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/auth/row-level-security)
- [Vercel Security](https://vercel.com/docs/security)
- [Next.js Security](https://nextjs.org/docs/security)

## 📝 Version History

- **v1.2** (2026-04-01): Rate limiting implementation
  - Supabase-backed sliding window rate limiting via middleware
  - Four tiers: ai (10/min), write (30/min), read (100/min), admin (30/min)
  - Admin dashboard at /admin/rate-limits
  - Production block on /api/dev-auth via middleware
- **v1.1** (2026-04-01): Documentation audit
  - Added complete API endpoint inventory (admin, palettes, oauth, link-preview, vitals, dev-auth)
- **v1.0** (2025-01-12): Initial security hardening
  - Added authentication to all API endpoints
  - Added input validation
  - Configured security headers
  - Sanitized .env.example
