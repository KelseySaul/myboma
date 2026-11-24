-- Public landing-page waitlist. Apply this migration before deploying the waitlist API.
CREATE TABLE IF NOT EXISTS public."waitlistSignups" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  source text NOT NULL DEFAULT 'landing-page',
  status text NOT NULL DEFAULT 'subscribed' CHECK (status IN ('subscribed', 'unsubscribed')),
  "unsubscribeToken" uuid NOT NULL DEFAULT gen_random_uuid(),
  "consentAt" timestamptz NOT NULL DEFAULT timezone('utc', now()),
  "unsubscribedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT timezone('utc', now()),
  "updatedAt" timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS waitlist_signups_status_idx
  ON public."waitlistSignups" (status, "createdAt" DESC);

ALTER TABLE public."waitlistSignups" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."waitlistSignups" FROM anon, authenticated;
GRANT ALL ON TABLE public."waitlistSignups" TO service_role;
