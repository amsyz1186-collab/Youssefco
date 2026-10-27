DROP FUNCTION IF EXISTS public.complete_elevenlabs_dubbing(uuid, uuid, text, integer, text);
DROP FUNCTION IF EXISTS public.create_elevenlabs_dubbing_job(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.fail_elevenlabs_dubbing_job(uuid, uuid);
DROP FUNCTION IF EXISTS public.set_elevenlabs_dubbing_external_id(uuid, uuid, text);

DROP FUNCTION IF EXISTS public.claim_free_trial(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.claim_free_trial(text);

DROP TABLE IF EXISTS public.provider_jobs;
DROP TABLE IF EXISTS public.free_trial_device_claims;
DROP TABLE IF EXISTS public.free_trial_uses;
