-- RLS policies, trigger, and validation helpers for public.leads
-- Model: Mixed (anon SELECT; authenticated owners write; admin bypass via JWT claim role=admin)

-- 1) Ensure owner_id column and supporting index exist (safe to re-run)
ALTER TABLE IF EXISTS public.leads
  ADD COLUMN IF NOT EXISTS owner_id UUID;
CREATE INDEX IF NOT EXISTS idx_leads_owner_id ON public.leads(owner_id);

-- 2) Enable Row Level Security
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- 3) Policies
-- Public read for dashboard
CREATE POLICY IF NOT EXISTS leads_public_select
  ON public.leads FOR SELECT
  TO anon
  USING (true);

-- Owners can insert rows (owner_id must match auth.uid())
CREATE POLICY IF NOT EXISTS leads_owner_insert
  ON public.leads FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- Owners or admins can update rows
CREATE POLICY IF NOT EXISTS leads_owner_update
  ON public.leads FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid() OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (owner_id = auth.uid() OR (auth.jwt() ->> 'role') = 'admin');

-- Owners or admins can delete rows
CREATE POLICY IF NOT EXISTS leads_owner_delete
  ON public.leads FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid() OR (auth.jwt() ->> 'role') = 'admin');

-- 4) Trigger to auto-set owner_id on INSERT when NULL
CREATE OR REPLACE FUNCTION public.set_lead_owner_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN
    NEW.owner_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_lead_owner_id ON public.leads;
CREATE TRIGGER set_lead_owner_id
BEFORE INSERT ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.set_lead_owner_id();

-- 5) Optional sanitized public view (adjust columns to your needs)
-- Keeps anon reads limited to non-sensitive fields.
-- If enabled, you may later remove anon SELECT on the base table and point clients to the view.
CREATE OR REPLACE VIEW public.leads_public_view AS
SELECT
  id,
  business_name,
  address_city,
  address_state,
  website,
  google_rating,
  google_review_count,
  lead_category,
  status,
  created_at
FROM public.leads;

-- 6) Validation helpers (run in SQL editor)
-- Simulate anon: expect SELECT success
-- SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
-- SELECT count(*) FROM public.leads;

-- Simulate authenticated owner: expect INSERT/UPDATE/DELETE on own rows
-- SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000001"}', true);
-- INSERT INTO public.leads (business_name) VALUES ('Owner Insert Test');
-- UPDATE public.leads SET status='updated' WHERE owner_id = '00000000-0000-0000-0000-000000000001';

-- Simulate authenticated non-owner: expect UPDATE/DELETE denied on others' rows
-- SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000002"}', true);
-- UPDATE public.leads SET status='bad' WHERE owner_id = '00000000-0000-0000-0000-000000000001';

-- Simulate admin bypass: expect UPDATE/DELETE allowed
-- SELECT set_config('request.jwt.claims', '{"role":"admin","sub":"00000000-0000-0000-0000-000000000003","admin":"true"}', true);
-- UPDATE public.leads SET status='admin-updated' WHERE owner_id = '00000000-0000-0000-0000-000000000001';
