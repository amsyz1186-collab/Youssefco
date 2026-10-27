# Tomorrow Interface Atlas

نفذ المشروع باحدث تقنيه متاحه و الشاشات و التنقل و الواجهه كله يبقي بشكل تقني مستوحي من 2030

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://tomorrow-interface-atlas.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/161ed7ae-a38a-4f91-bae3-d69b104b05f7).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Bun and Node.js.

```sh
bun install
bun run dev
```

## Supabase setup

Copy the Supabase URL and publishable key into `.env.local` as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The Vite and server-compatible aliases in the local example file should be kept in sync. Never put a service-role key in a `NEXT_PUBLIC_` or `VITE_` variable.

This app's customer-credit schema uses the existing `profiles`, `media_vault`, `payment_methods`, and `transactions` tables. Apply `supabase/migrations/20261024010000_customer_credits_schema.sql`, then `supabase/migrations/20261024020000_customer_profile_sync.sql`, in the Supabase SQL Editor. The first migration enables owner-only access, creates zero-balance profiles for existing/new auth users, and adds the atomic `consume_credit()` RPC. The second safely adds missing customer profile fields, synchronizes email/name changes from Supabase Auth, creates a profile on demand for an existing authenticated user, and enables realtime balance refreshes. It never resets an existing balance, plan, or spending total. Do not apply the older `initialize_youssefco_database` migration to this custom schema: it expects different profile columns and usage/role tables. The browser's publishable key cannot apply DDL; a project owner must run both migrations.

For persistent activity history, apply `supabase/migrations/20261024030000_activity_audit.sql` after the profile migrations. It records anonymous and signed-in page views, clicks, field changes (never field values), form submissions, transaction requests/decisions, and balance changes. The authenticated admin page displays the latest 100 events. Passwords, typed values, URL query strings, receipts, and uploaded file names are deliberately excluded. Anonymous activity uses an ephemeral per-tab session ID and is limited to 120 logged events per minute; authenticated events can only be submitted for the current user. This is an audit trail of observed application activity, not a payment processor: bank transfers still require confirmation and an authorized approval before credits are granted.

After the activity migration, apply `supabase/migrations/20261025010000_website_feedback.sql` to enable the public website review summary, signed-in customer reviews, and reports in the authenticated admin dashboard. Review text and display names are public; reports are visible only to their author and admins.

Email/password and Google sign-in use the linked Supabase Auth project. The sign-in screen requires explicit acceptance of the terms and privacy notice and records the accepted version and time in the user's auth metadata. Google sign-in requires the Google provider and OAuth client credentials in Supabase Auth. Add `https://youssefco.vercel.app/auth` to Supabase's allowed redirect URLs, and add Supabase's displayed Auth callback URL (typically `https://<project-ref>.supabase.co/auth/v1/callback`) to the Google OAuth client's authorized redirect URIs.

Before deploying the current studio code, apply these migrations in order in the Supabase SQL Editor:

1. `supabase/migrations/20261026090000_enable_instapay_manual_payments.sql`
2. `supabase/migrations/20261026110000_restore_missing_production_rpcs.sql`
3. `supabase/migrations/20261026120000_publish_user_websites.sql`
4. `supabase/migrations/20261026130000_studio_credit_costs.sql`
5. `supabase/migrations/20261026160000_restrict_has_role_visibility.sql`
6. `supabase/migrations/20261027100000_remove_paid_media_providers.sql`
7. `supabase/migrations/20261027110000_kling_video_quotas.sql`
8. `supabase/migrations/20261027120000_kling_paid_tier_only.sql`

The studio server uses the `consume_credits(integer)` RPC for paid plans. Basic-plan tools do not deduct user credits; provider free-tier quotas and abuse-prevention limits still apply, so unlimited availability is not guaranteed. Anonymous users cannot generate content.

The role-helper migration limits `has_role` execution to authenticated users and makes it evaluate only the caller's own role, so authenticated users cannot probe role membership for arbitrary user IDs.

Video storyboards and auto-edits use Gemini for planning and the browser's local FFmpeg renderer for uploaded footage. The animation studio first attempts a matching licensed local stock clip with Edge TTS; if stock retrieval or rendering fails, it tries bundled artwork animation with the same narration. Kling Tier 3 is only offered after both local MP4 attempts fail, requires an explicit user action, and is strictly restricted to paid plans. It requires Kling Open Platform credentials and remains disabled until configured. Free users can never reserve, poll, or attach a Kling task or incur a Kling charge, including through direct server-function or database RPC calls. Its Supabase quota is enforced atomically per authenticated user: Pro/Plus/VIP receive 5/10/20 requests per calendar month. Paid Kling requests also consume 2 credits at acceptance. A request accepted by the app consumes quota even if Kling later fails; repeated client submissions with the same idempotency key do not create or charge a second request. Free local tiers remain available without a Kling quota. Set `KLING_ACCESS_KEY` and `KLING_SECRET_KEY` as server-only Vercel secrets; never expose them in client-side environment variables. Apply `20261027120000_kling_paid_tier_only.sql` after `20261027110000_kling_video_quotas.sql`.

The current credit policy adds 13 points for Pro, 22 for Plus, and 30 for VIP; other paid-plan runs deduct the displayed studio cost (2 credits for auto-edit, animation, voice, image, and templates; 4 for the app engine; 1 for translation voice-over). The basic plan does not deduct user credits. Vodafone Cash and InstaPay requests are stored as pending transactions and must be verified manually by an administrator before credits are granted. The interface tells customers that requests are pending manual review for up to 24 hours; receipt images are not proof that funds arrived. Do not approve a transaction until the transfer is confirmed in the receiving account. There is no automatic bank-transfer verification integration. Apply `supabase/migrations/20261026090000_enable_instapay_manual_payments.sql` to enable the configured manual InstaPay option. The database trigger validates the package price, points, payment method, and receipt ownership; the approval RPC rechecks the package values. Customer sessions can read only payment-method IDs, names, and active status, not instructions, provider numbers, or account-holder details. Fawry code generation stays unavailable until an official server-side checkout integration, merchant credentials, and payment-status callback are configured; the app never fabricates codes or displays Fawry receiver details.

The dashboard and studio illustrations are original SVG vector artwork bundled with the app. They do not require Supabase storage or an external image-generation service. First-time visitors see a welcome screen and continue with its start button; signed-in users skip it automatically. The light theme uses a blue technical background, and the header lets users switch between light and dark themes with the selection saved in their browser.

The public landing page uses the same studio artwork and descriptions as the signed-in dashboard.

## Free media pipeline

Text, image, storyboard, and translation generation use Gemini through `GEMINI_API_KEY`. Gemini free-tier quotas and availability are controlled by Google; free-tier status does not mean unlimited capacity or guaranteed uptime. The app does not deduct user credits on the basic plan, but provider quotas, service hosting costs, and abuse-prevention limits still apply. Keep all API credentials server-only.

### Edge TTS service

Voice-over MP3 generation uses the Python `edge-tts` package in `edge_tts_service`. Deploy this small FastAPI service on a Python host with HTTPS, then configure the same random bearer token in the service and in Vercel:

- Service environment: `EDGE_TTS_SERVICE_TOKEN`
- Vercel `EDGE_TTS_SERVICE_URL`: the service endpoint ending in `/v1/speech`
- Vercel `EDGE_TTS_SERVICE_TOKEN`: the identical token

Install `edge_tts_service/requirements.txt` and start the service with `uvicorn main:app --app-dir edge_tts_service --host 0.0.0.0 --port 8000`. The `/health` endpoint can be used for deployment checks. Do not expose the token to browser code or add it to a `VITE_`/`NEXT_PUBLIC_` variable. `edge-tts` uses Microsoft's online speech service through an unofficial interface; its voice list, limits, and availability can change, so continuous or unlimited operation cannot be guaranteed.

### Video fallback

The animation studio checks `public/video-stock/manifest.json` for a suitable local clip before showing a browser-animated original image. The manifest is currently empty because no licensed stock clips are bundled. Add only clips you have rights to use, with a duration from 5 to 10 seconds, under `public/video-stock/`, then add entries such as:

```json
{
  "videos": [
    { "src": "/video-stock/landscape.mp4", "tags": ["nature", "landscape"], "durationSeconds": 8 }
  ]
}
```

The local artwork fallback can be rendered to MP4 in the browser with the generated narration. Tier 3 is an optional paid Kling API task, guarded by the per-user quotas above and the existing credit balance for paid plans. It requires server-side Kling API credentials and consumes quota once the app accepts a request.

After applying the media-provider cleanup migration, the old ElevenLabs dubbing, provider-job, and one-time-trial database objects are removed. Paid plans retain their existing credit schedule; basic-plan studio runs do not deduct user credits. No ad timer or artificial reward is implemented: ad format, skip controls, and payouts must come from a supported ad provider and valid publisher account.

To enable the in-app payment-review page for the project owner, set the owner's existing profile to admin once in the SQL Editor (replace the email with the owner's sign-in email):

```sql
UPDATE public.profiles SET is_admin = true WHERE email = 'OWNER_EMAIL';
```

## Vercel

Import the repository into Vercel and deploy with the included `vercel.json`. Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `VITE_ADMIN_PHONE`, and `VITE_TURNSTILE_SITE_KEY` in the Vercel project environment. Add `GEMINI_API_KEY`, `EDGE_TTS_SERVICE_URL`, `EDGE_TTS_SERVICE_TOKEN`, `KLING_ACCESS_KEY`, and `KLING_SECRET_KEY` as server-only secrets. Remove obsolete `ELEVENLABS_*`, `HUGGINGFACE_API_KEY`, `LOVABLE_API_KEY`, and `FREE_TRIAL_IP_HASH_SECRET` values from Vercel after deployment. Configure the matching Turnstile secret in Supabase Auth. Never expose provider or service tokens through a `NEXT_PUBLIC_` or `VITE_` variable. Apply the custom-schema migrations above before enabling studio runs. Fawry merchant credentials must only be added as server-side secrets after the official integration and callback have been implemented.

Uploaded and generated media is kept in private Supabase Storage. Auto-video analysis sends three still frames to Gemini; voice generation sends text to the configured edge-tts service. The local video tiers do not send prompts or videos to an external video provider. Only an explicit Tier 3 Kling request sends the text prompt to Kling; no uploaded video is sent.
