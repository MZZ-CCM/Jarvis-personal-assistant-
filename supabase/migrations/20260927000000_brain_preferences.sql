-- Your AI brain choice follows your account to every device.
-- (The brain itself is ~1–2 GB and is downloaded once per device, free, from the
-- public model host — it is deliberately NOT stored in Supabase, which would
-- exceed the free plan's storage and bandwidth.)

alter table public.profiles
  add column ai_engine         text not null default 'local' check (ai_engine in ('local', 'ollama', 'off')),
  add column ai_model_computer text check (ai_model_computer in ('light', 'balanced', 'smart')),
  add column ai_model_phone    text check (ai_model_phone in ('light', 'balanced', 'smart')),
  add column ollama_model      text not null default '' check (char_length(ollama_model) <= 100);
