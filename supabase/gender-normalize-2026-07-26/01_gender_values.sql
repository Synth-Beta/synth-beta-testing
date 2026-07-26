-- =============================================================================
-- 01 — Gender: normalize values (NO schema change needed)
-- =============================================================================
-- The `public.users.gender` column already exists (nullable text) and is editable
-- in Settings on both web (OnboardingPreferencesSettings dropdown) and mobile
-- (profile-edit). So there's nothing to add schema-wise.
--
-- The only issue was CASE INCONSISTENCY: web + existing data store lowercase values
-- ('male','female','non-binary','prefer-not-to-say','other'), but the old mobile
-- onboarding saved Capitalized ('Male','Female'). The app is now standardized on the
-- lowercase values everywhere, so this just tidies any capitalized rows that slipped
-- in. Idempotent + safe (only rewrites known variants; never touches free-text/other).
--
-- We intentionally do NOT add a CHECK constraint on gender — it should stay flexible
-- (people may legitimately have values outside a fixed list), and a constraint could
-- reject valid data. Review, then apply yourself.
-- =============================================================================

-- DRY RUN — see what would change
SELECT gender, count(*) FROM public.users
WHERE gender IN ('Male','Female','Non-binary','Prefer not to say','Other',
                 'Transgender','Genderqueer','Agender','Prefer Not To Say')
GROUP BY gender ORDER BY 2 DESC;

-- APPLY — map any capitalized/legacy variants to the canonical lowercase value set
UPDATE public.users SET gender = 'female'            WHERE lower(gender) = 'female'            AND gender <> 'female';
UPDATE public.users SET gender = 'male'              WHERE lower(gender) = 'male'              AND gender <> 'male';
UPDATE public.users SET gender = 'non-binary'        WHERE lower(gender) IN ('non-binary','nonbinary','non binary') AND gender <> 'non-binary';
UPDATE public.users SET gender = 'transgender'       WHERE lower(gender) = 'transgender'       AND gender <> 'transgender';
UPDATE public.users SET gender = 'genderqueer'       WHERE lower(gender) = 'genderqueer'       AND gender <> 'genderqueer';
UPDATE public.users SET gender = 'agender'           WHERE lower(gender) = 'agender'           AND gender <> 'agender';
UPDATE public.users SET gender = 'prefer-not-to-say' WHERE lower(regexp_replace(gender,'[\s_]+','-','g')) = 'prefer-not-to-say' AND gender <> 'prefer-not-to-say';
UPDATE public.users SET gender = 'other'             WHERE lower(gender) = 'other'             AND gender <> 'other';

-- VERIFY — should now be lowercase canonical (plus any legitimate free-text)
SELECT gender, count(*) FROM public.users GROUP BY gender ORDER BY 2 DESC;

-- NOTE: gender is collected once at onboarding and editable only in Settings. If it's
-- ever shown on a PUBLIC profile view, hide it there (privacy) — it's meant to power
-- similar-user matching, not public display.
