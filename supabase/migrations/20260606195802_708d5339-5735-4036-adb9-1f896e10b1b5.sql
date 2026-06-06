CREATE TYPE public.company_tier AS ENUM ('god', 't1', 't2', 't3', 'excluded');

CREATE TABLE public.companies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  website text,
  careers_url text,
  tier public.company_tier NOT NULL DEFAULT 't3',
  notes text,
  brand_score smallint NOT NULL DEFAULT 1 CHECK (brand_score BETWEEN 1 AND 5),
  ai_score smallint NOT NULL DEFAULT 1 CHECK (ai_score BETWEEN 1 AND 5),
  shot_score smallint NOT NULL DEFAULT 1 CHECK (shot_score BETWEEN 1 AND 5),
  comp_score smallint NOT NULL DEFAULT 1 CHECK (comp_score BETWEEN 1 AND 5),
  location_score smallint NOT NULL DEFAULT 1 CHECK (location_score BETWEEN 1 AND 5),
  tags text[] NOT NULL DEFAULT '{}',
  excluded_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO anon, authenticated;
GRANT ALL ON public.companies TO service_role;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read companies" ON public.companies FOR SELECT USING (true);
CREATE POLICY "Public insert companies" ON public.companies FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update companies" ON public.companies FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete companies" ON public.companies FOR DELETE USING (true);

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER companies_set_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();