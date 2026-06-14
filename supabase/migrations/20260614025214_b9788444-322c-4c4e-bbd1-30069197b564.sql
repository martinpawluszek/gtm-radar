CREATE TABLE public.pre_filter_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword text NOT NULL,
  filter_tier text NOT NULL CHECK (filter_tier IN ('hard', 'soft')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.pre_filter_rules TO authenticated;
GRANT ALL ON public.pre_filter_rules TO service_role;

ALTER TABLE public.pre_filter_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read pre_filter_rules" ON public.pre_filter_rules FOR SELECT USING (true);
CREATE POLICY "Public insert pre_filter_rules" ON public.pre_filter_rules FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update pre_filter_rules" ON public.pre_filter_rules FOR UPDATE USING (true) WITH CHECK (true);

CREATE UNIQUE INDEX idx_pre_filter_rules_keyword_lower ON public.pre_filter_rules (LOWER(keyword));