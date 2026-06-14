CREATE TABLE public.commercial_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.commercial_overrides TO authenticated;
GRANT ALL ON public.commercial_overrides TO service_role;

ALTER TABLE public.commercial_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read commercial_overrides" ON public.commercial_overrides FOR SELECT USING (true);
CREATE POLICY "Public insert commercial_overrides" ON public.commercial_overrides FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update commercial_overrides" ON public.commercial_overrides FOR UPDATE USING (true) WITH CHECK (true);

CREATE UNIQUE INDEX idx_commercial_overrides_keyword_lower ON public.commercial_overrides (LOWER(keyword));