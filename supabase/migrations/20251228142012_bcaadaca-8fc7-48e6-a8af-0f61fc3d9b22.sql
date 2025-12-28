-- 1) Required for upsert(onConflict: 'audit_id,checklist_item_id') on audit_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'audit_items_audit_checklist_unique'
      AND conrelid = 'public.audit_items'::regclass
  ) THEN
    ALTER TABLE public.audit_items
      ADD CONSTRAINT audit_items_audit_checklist_unique
      UNIQUE (audit_id, checklist_item_id);
  END IF;
END $$;

-- 2) Required for upsert/on conflict on audit_summary (audit_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'audit_summary_audit_id_unique'
      AND conrelid = 'public.audit_summary'::regclass
  ) THEN
    ALTER TABLE public.audit_summary
      ADD CONSTRAINT audit_summary_audit_id_unique
      UNIQUE (audit_id);
  END IF;
END $$;

-- 3) Optional but recommended: prevent duplicate image rows per audit_item
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'audit_item_images_item_url_unique'
      AND conrelid = 'public.audit_item_images'::regclass
  ) THEN
    ALTER TABLE public.audit_item_images
      ADD CONSTRAINT audit_item_images_item_url_unique
      UNIQUE (audit_item_id, image_url);
  END IF;
END $$;

-- 4) Transactional save + finalize flow
--    - Creates or updates an audit
--    - Creates/fetches audit_locations by name for the current user (optional)
--    - Upserts audit_items
--    - When finalize=true: validates completion, generates audit_summary, and sets audits.status='completed'
CREATE OR REPLACE FUNCTION public.save_audit_transaction(
  p_audit_id uuid DEFAULT NULL,
  p_checklist_id uuid DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_finalize boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_audit_id uuid;
  v_user_id uuid;
  v_checklist_id uuid;
  v_location_id uuid;
  v_total_items integer;
  v_answered_items integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Create or load/update audit
  IF p_audit_id IS NULL THEN
    IF p_checklist_id IS NULL THEN
      RAISE EXCEPTION 'checklist_id_required';
    END IF;

    v_checklist_id := p_checklist_id;
    v_location_id := p_location_id;

    -- If no location_id provided but a name is, reuse/create a location for this user
    IF v_location_id IS NULL AND p_location IS NOT NULL AND length(trim(p_location)) > 0 THEN
      SELECT id
        INTO v_location_id
      FROM public.audit_locations
      WHERE user_id = v_user_id
        AND name = p_location
      LIMIT 1;

      IF v_location_id IS NULL THEN
        INSERT INTO public.audit_locations (user_id, name)
        VALUES (v_user_id, p_location)
        RETURNING id INTO v_location_id;
      END IF;
    END IF;

    INSERT INTO public.audits (user_id, checklist_id, location, location_id, status, started_at)
    VALUES (v_user_id, v_checklist_id, p_location, v_location_id, 'in_progress', now())
    RETURNING id INTO v_audit_id;
  ELSE
    SELECT id, checklist_id
      INTO v_audit_id, v_checklist_id
    FROM public.audits
    WHERE id = p_audit_id
      AND user_id = v_user_id
    LIMIT 1;

    IF v_audit_id IS NULL THEN
      RAISE EXCEPTION 'audit_not_found_or_forbidden';
    END IF;

    v_location_id := p_location_id;

    IF v_location_id IS NULL AND p_location IS NOT NULL AND length(trim(p_location)) > 0 THEN
      SELECT id
        INTO v_location_id
      FROM public.audit_locations
      WHERE user_id = v_user_id
        AND name = p_location
      LIMIT 1;

      IF v_location_id IS NULL THEN
        INSERT INTO public.audit_locations (user_id, name)
        VALUES (v_user_id, p_location)
        RETURNING id INTO v_location_id;
      END IF;
    END IF;

    UPDATE public.audits
    SET location = COALESCE(p_location, location),
        location_id = COALESCE(v_location_id, location_id)
    WHERE id = v_audit_id
      AND user_id = v_user_id;
  END IF;

  -- Upsert audit items (batch)
  IF jsonb_typeof(p_items) = 'array' AND jsonb_array_length(p_items) > 0 THEN
    INSERT INTO public.audit_items (audit_id, checklist_item_id, result, observation, updated_at)
    SELECT
      v_audit_id,
      (x.checklist_item_id)::uuid,
      NULLIF(x.result, ''),
      x.observation,
      now()
    FROM jsonb_to_recordset(p_items) AS x(
      checklist_item_id text,
      result text,
      observation text
    )
    ON CONFLICT (audit_id, checklist_item_id)
    DO UPDATE SET
      result = EXCLUDED.result,
      observation = EXCLUDED.observation,
      updated_at = now();
  END IF;

  -- Finalize (validate + summary + mark completed)
  IF p_finalize THEN
    SELECT count(*)
      INTO v_total_items
    FROM public.checklist_items ci
    JOIN public.checklist_sections cs ON cs.id = ci.section_id
    WHERE cs.checklist_id = v_checklist_id;

    SELECT count(*)
      INTO v_answered_items
    FROM public.audit_items ai
    WHERE ai.audit_id = v_audit_id
      AND ai.result IS NOT NULL;

    IF v_total_items > 0 AND v_answered_items < v_total_items THEN
      RAISE EXCEPTION 'checklist_incomplete:%/%', v_answered_items, v_total_items;
    END IF;

    INSERT INTO public.audit_summary (audit_id, conforme_count, nao_conforme_count, nao_aplicavel_count, last_updated)
    VALUES (
      v_audit_id,
      (SELECT count(*) FROM public.audit_items WHERE audit_id = v_audit_id AND result = 'conforme'),
      (SELECT count(*) FROM public.audit_items WHERE audit_id = v_audit_id AND result = 'nao_conforme'),
      (SELECT count(*) FROM public.audit_items WHERE audit_id = v_audit_id AND result = 'nao_aplicavel'),
      now()
    )
    ON CONFLICT (audit_id)
    DO UPDATE SET
      conforme_count = EXCLUDED.conforme_count,
      nao_conforme_count = EXCLUDED.nao_conforme_count,
      nao_aplicavel_count = EXCLUDED.nao_aplicavel_count,
      last_updated = now();

    UPDATE public.audits
    SET status = 'completed',
        finished_at = now()
    WHERE id = v_audit_id
      AND user_id = v_user_id;
  END IF;

  RETURN v_audit_id;
END;
$$;