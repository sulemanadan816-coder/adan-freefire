-- =========================================================================
-- ADAN FREE FIRE TOURNAMENT PLATFORM — DATABASE SCHEMA
-- Run this ONCE in Supabase: Dashboard → SQL Editor → New Query → paste all
-- → Run. Safe to re-run (uses IF NOT EXISTS / DROP POLICY IF EXISTS).
-- =========================================================================

-- -------------------------------------------------------------------------
-- EXTENSIONS
-- -------------------------------------------------------------------------
create extension if not exists "uuid-ossp";

-- -------------------------------------------------------------------------
-- PROFILES  (one row per auth user, holds the role)
-- -------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'owner' check (role in ('owner','admin','moderator','scorer')),
  created_at timestamptz not null default now()
);

-- auto-create a profile row whenever a new auth user signs up.
-- IMPORTANT: this grants the LEAST-privileged role by default. The anon
-- API key is public by design (it ships in the browser), so anyone can
-- call the Supabase Auth signup endpoint directly even with no signup
-- form in the UI — the database must never hand out 'owner' or 'admin'
-- automatically. After creating your account (see SETUP_GUIDE.md step 4),
-- promote it yourself with:
--   update profiles set role = 'owner' where email = 'your@email.com';
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'scorer');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- -------------------------------------------------------------------------
-- TOURNAMENTS
-- -------------------------------------------------------------------------
create table if not exists tournaments (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  game text default 'Free Fire',
  mode text default 'Squad (4 vs 4)',
  status text not null default 'upcoming' check (status in ('upcoming','live','completed','cancelled')),
  start_date timestamptz,
  end_date timestamptz,
  timezone text default 'Asia/Karachi',
  total_team_slots integer default 50,
  entry_fee numeric default 0,
  is_free_entry boolean default true,
  youtube_video_id text,
  youtube_channel_url text,
  is_active boolean default true,   -- the tournament currently shown on the public site
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- -------------------------------------------------------------------------
-- RECURRING SCHEDULE  (e.g. every Sat & Sun 8pm-12am)
-- -------------------------------------------------------------------------
create table if not exists tournament_schedules (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid references tournaments(id) on delete cascade,
  days_of_week int[] not null default '{6,0}', -- 0=Sun .. 6=Sat
  start_time time not null default '20:00',
  end_time time not null default '00:00',
  timezone text default 'Asia/Karachi',
  is_enabled boolean default true,
  updated_at timestamptz default now()
);

-- -------------------------------------------------------------------------
-- SPECIAL DATE OVERRIDES  (finals, rescheduled matches, etc.)
-- -------------------------------------------------------------------------
create table if not exists special_dates (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid references tournaments(id) on delete cascade,
  label text not null,             -- e.g. "Grand Final"
  event_date date not null,
  start_time time not null,
  end_time time not null,
  timezone text default 'Asia/Karachi',
  created_at timestamptz default now()
);

-- -------------------------------------------------------------------------
-- REGISTRATION SETTINGS
-- -------------------------------------------------------------------------
create table if not exists registration_settings (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid references tournaments(id) on delete cascade,
  status text not null default 'open' check (status in ('open','closed','paused')),
  opens_at timestamptz,
  closes_at timestamptz,
  updated_at timestamptz default now()
);

-- -------------------------------------------------------------------------
-- REGISTRATIONS  (public submits, private data)
-- -------------------------------------------------------------------------
create table if not exists registrations (
  id uuid primary key default uuid_generate_v4(),
  registration_code text unique not null, -- e.g. AFFT-XXXXXX, shown to public submitter
  tournament_id uuid references tournaments(id) on delete cascade,
  team_name text not null,
  captain_name text not null,
  captain_ign text not null,
  captain_uid text not null,
  whatsapp text not null,
  email text not null,
  city text,
  player_count integer default 4,
  players jsonb default '[]',       -- [{name, uid}]
  status text not null default 'pending' check (status in ('pending','approved','rejected','waiting','disqualified')),
  internal_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- -------------------------------------------------------------------------
-- TEAMS  (created once a registration is approved)
-- -------------------------------------------------------------------------
create table if not exists teams (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid references tournaments(id) on delete cascade,
  registration_id uuid references registrations(id) on delete set null,
  team_name text not null,
  captain_name text not null,
  status text not null default 'approved' check (status in ('approved','rejected','disqualified')),
  created_at timestamptz default now()
);

-- -------------------------------------------------------------------------
-- PLAYERS
-- -------------------------------------------------------------------------
create table if not exists players (
  id uuid primary key default uuid_generate_v4(),
  team_id uuid references teams(id) on delete cascade,
  name text not null,
  free_fire_uid text not null,
  created_at timestamptz default now()
);

-- -------------------------------------------------------------------------
-- MATCHES
-- -------------------------------------------------------------------------
create table if not exists matches (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid references tournaments(id) on delete cascade,
  match_number integer not null,
  label text not null,             -- "Match 01"
  map text,
  mode text default 'Squad',
  scheduled_time timestamptz,
  status text not null default 'upcoming' check (status in ('upcoming','checkin','room_open','live','completed','cancelled')),
  created_at timestamptz default now()
);

-- -------------------------------------------------------------------------
-- SCORES  (per team per match)
-- -------------------------------------------------------------------------
create table if not exists scores (
  id uuid primary key default uuid_generate_v4(),
  match_id uuid references matches(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  kills integer default 0,
  placement_points integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(match_id, team_id)
);

-- -------------------------------------------------------------------------
-- LEADERBOARD  (aggregated, publish-controlled)
-- -------------------------------------------------------------------------
create table if not exists leaderboard (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid references tournaments(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  matches_played integer default 0,
  kills integer default 0,
  placement_points integer default 0,
  total_points integer default 0,
  rank integer,
  is_published boolean default false,
  updated_at timestamptz default now(),
  unique(tournament_id, team_id)
);

-- -------------------------------------------------------------------------
-- ROOM DETAILS
-- -------------------------------------------------------------------------
create table if not exists room_details (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid references tournaments(id) on delete cascade,
  match_id uuid references matches(id) on delete set null,
  room_id text,
  room_password text,
  map text,
  is_published boolean default false,
  updated_at timestamptz default now()
);

-- -------------------------------------------------------------------------
-- ANNOUNCEMENTS
-- -------------------------------------------------------------------------
create table if not exists announcements (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid references tournaments(id) on delete cascade,
  title text not null,
  message text not null,
  priority text default 'normal' check (priority in ('normal','important','urgent')),
  is_published boolean default false,
  published_at timestamptz,
  created_at timestamptz default now()
);

-- -------------------------------------------------------------------------
-- TOURNAMENT RULES  (editable rulebook sections)
-- -------------------------------------------------------------------------
create table if not exists tournament_rules (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid references tournaments(id) on delete cascade,
  section_title text not null,
  items jsonb not null default '[]',  -- ["rule 1", "rule 2"]
  sort_order integer default 0
);

-- -------------------------------------------------------------------------
-- SOCIAL LINKS
-- -------------------------------------------------------------------------
create table if not exists social_links (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid references tournaments(id) on delete cascade,
  platform text not null,   -- youtube, whatsapp, discord, instagram, tiktok, facebook
  url text,
  updated_at timestamptz default now()
);

-- -------------------------------------------------------------------------
-- PRIZE POOL
-- -------------------------------------------------------------------------
create table if not exists prize_pools (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid references tournaments(id) on delete cascade,
  total_pool numeric default 0,
  currency text default 'PKR',
  updated_at timestamptz default now()
);

create table if not exists prize_distributions (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid references tournaments(id) on delete cascade,
  place_label text not null,   -- "1st Place", "Top Fragger", etc.
  amount numeric default 0,
  sort_order integer default 0
);

-- -------------------------------------------------------------------------
-- AUDIT LOGS
-- -------------------------------------------------------------------------
create table if not exists audit_logs (
  id uuid primary key default uuid_generate_v4(),
  admin_id uuid references profiles(id),
  action text not null,
  record_id text,
  details jsonb,
  created_at timestamptz default now()
);

-- =========================================================================
-- ROW LEVEL SECURITY
-- =========================================================================

alter table profiles enable row level security;
alter table tournaments enable row level security;
alter table tournament_schedules enable row level security;
alter table special_dates enable row level security;
alter table registration_settings enable row level security;
alter table registrations enable row level security;
alter table teams enable row level security;
alter table players enable row level security;
alter table matches enable row level security;
alter table scores enable row level security;
alter table leaderboard enable row level security;
alter table room_details enable row level security;
alter table announcements enable row level security;
alter table tournament_rules enable row level security;
alter table social_links enable row level security;
alter table prize_pools enable row level security;
alter table prize_distributions enable row level security;
alter table audit_logs enable row level security;

-- Helper: is the current request from an authenticated admin/owner?
create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('owner','admin')
  );
$$ language sql security definer stable set search_path = public;

-- PROFILES: users can read their own profile; only admins can read all
drop policy if exists "own profile" on profiles;
create policy "own profile" on profiles for select using (id = auth.uid() or is_admin());

-- TOURNAMENTS: public can read; only admin can write
drop policy if exists "public read tournaments" on tournaments;
create policy "public read tournaments" on tournaments for select using (true);
drop policy if exists "admin write tournaments" on tournaments;
create policy "admin write tournaments" on tournaments for all using (is_admin()) with check (is_admin());

-- SCHEDULES / SPECIAL DATES / SOCIAL / RULES / PRIZE POOL: public read, admin write
drop policy if exists "public read schedules" on tournament_schedules;
create policy "public read schedules" on tournament_schedules for select using (true);
drop policy if exists "admin write schedules" on tournament_schedules;
create policy "admin write schedules" on tournament_schedules for all using (is_admin()) with check (is_admin());

drop policy if exists "public read special_dates" on special_dates;
create policy "public read special_dates" on special_dates for select using (true);
drop policy if exists "admin write special_dates" on special_dates;
create policy "admin write special_dates" on special_dates for all using (is_admin()) with check (is_admin());

drop policy if exists "public read reg_settings" on registration_settings;
create policy "public read reg_settings" on registration_settings for select using (true);
drop policy if exists "admin write reg_settings" on registration_settings;
create policy "admin write reg_settings" on registration_settings for all using (is_admin()) with check (is_admin());

drop policy if exists "public read social" on social_links;
create policy "public read social" on social_links for select using (true);
drop policy if exists "admin write social" on social_links;
create policy "admin write social" on social_links for all using (is_admin()) with check (is_admin());

drop policy if exists "public read rules" on tournament_rules;
create policy "public read rules" on tournament_rules for select using (true);
drop policy if exists "admin write rules" on tournament_rules;
create policy "admin write rules" on tournament_rules for all using (is_admin()) with check (is_admin());

drop policy if exists "public read prize_pools" on prize_pools;
create policy "public read prize_pools" on prize_pools for select using (true);
drop policy if exists "admin write prize_pools" on prize_pools;
create policy "admin write prize_pools" on prize_pools for all using (is_admin()) with check (is_admin());

drop policy if exists "public read prize_dist" on prize_distributions;
create policy "public read prize_dist" on prize_distributions for select using (true);
drop policy if exists "admin write prize_dist" on prize_distributions;
create policy "admin write prize_dist" on prize_distributions for all using (is_admin()) with check (is_admin());

-- MATCHES: public read, admin write
drop policy if exists "public read matches" on matches;
create policy "public read matches" on matches for select using (true);
drop policy if exists "admin write matches" on matches;
create policy "admin write matches" on matches for all using (is_admin()) with check (is_admin());

-- TEAMS: public can read approved team names only (no captain contact info shown by app, but enforce at row level too)
drop policy if exists "public read approved teams" on teams;
create policy "public read approved teams" on teams for select using (status = 'approved' or is_admin());
drop policy if exists "admin write teams" on teams;
create policy "admin write teams" on teams for all using (is_admin()) with check (is_admin());

-- PLAYERS: private — admin only
drop policy if exists "admin only players" on players;
create policy "admin only players" on players for all using (is_admin()) with check (is_admin());

-- REGISTRATIONS: anyone can INSERT (submit a registration); only admin can SELECT/UPDATE/DELETE.
-- NOTE: this base "with check (true)" is intentionally replaced by the tighter
-- policy in migration_registration_guardrails.sql + migration_security_hardening.sql,
-- which also blocks a submitter from claiming their own payment is already verified.
-- Both migrations must be run — this file alone is not sufficient for production.
drop policy if exists "public insert registration" on registrations;
create policy "public insert registration" on registrations for insert with check (true);
drop policy if exists "admin read registrations" on registrations;
create policy "admin read registrations" on registrations for select using (is_admin());
drop policy if exists "admin update registrations" on registrations;
create policy "admin update registrations" on registrations for update using (is_admin()) with check (is_admin());
drop policy if exists "admin delete registrations" on registrations;
create policy "admin delete registrations" on registrations for delete using (is_admin());

-- SCORES: private admin data feeding the leaderboard
drop policy if exists "admin only scores" on scores;
create policy "admin only scores" on scores for all using (is_admin()) with check (is_admin());

-- LEADERBOARD: public can read PUBLISHED rows only; admin sees/writes all
drop policy if exists "public read published leaderboard" on leaderboard;
create policy "public read published leaderboard" on leaderboard for select using (is_published = true or is_admin());
drop policy if exists "admin write leaderboard" on leaderboard;
create policy "admin write leaderboard" on leaderboard for all using (is_admin()) with check (is_admin());

-- ROOM DETAILS: public can read PUBLISHED rows only
drop policy if exists "public read published room" on room_details;
create policy "public read published room" on room_details for select using (is_published = true or is_admin());
drop policy if exists "admin write room" on room_details;
create policy "admin write room" on room_details for all using (is_admin()) with check (is_admin());

-- ANNOUNCEMENTS: public can read PUBLISHED rows only
drop policy if exists "public read published announcements" on announcements;
create policy "public read published announcements" on announcements for select using (is_published = true or is_admin());
drop policy if exists "admin write announcements" on announcements;
create policy "admin write announcements" on announcements for all using (is_admin()) with check (is_admin());

-- AUDIT LOGS: admin only, insert allowed for any authenticated admin, no public access at all
drop policy if exists "admin read audit" on audit_logs;
create policy "admin read audit" on audit_logs for select using (is_admin());
drop policy if exists "admin insert audit" on audit_logs;
create policy "admin insert audit" on audit_logs for insert with check (is_admin());

-- =========================================================================
-- SEED: one default tournament row so the site has something to show
-- (Edit these values later from the Admin Dashboard — not by hand)
-- =========================================================================
insert into tournaments (name, description, start_date, timezone, total_team_slots, entry_fee, is_free_entry, is_active)
select 'Pakistan Elite Free Fire Tournament', 'Competitive Free Fire tournament organized by Adan.', '2026-08-09T20:00:00+05:00', 'Asia/Karachi', 50, 0, true, true
where not exists (select 1 from tournaments);

-- default recurring schedule: every Sat(6) & Sun(0), 8pm-12am PKT
insert into tournament_schedules (tournament_id, days_of_week, start_time, end_time, timezone, is_enabled)
select id, '{6,0}', '20:00', '00:00', 'Asia/Karachi', true from tournaments where is_active = true
and not exists (select 1 from tournament_schedules);

insert into registration_settings (tournament_id, status)
select id, 'open' from tournaments where is_active = true
and not exists (select 1 from registration_settings);

insert into prize_pools (tournament_id, total_pool, currency)
select id, 10000, 'PKR' from tournaments where is_active = true
and not exists (select 1 from prize_pools);

-- =========================================================================
-- DONE. Next: Authentication → Providers → make sure Email is enabled,
-- then Authentication → Users → Add User to create your Owner login.
-- =========================================================================
