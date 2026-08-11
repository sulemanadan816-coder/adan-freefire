-- =========================================================================
-- MIGRATION: Easypaisa payment fields on registrations
-- Run this in Supabase → SQL Editor → New Query → paste → Run
-- Safe to re-run (IF NOT EXISTS guards).
-- =========================================================================

alter table registrations add column if not exists entry_fee_amount numeric default 0;
alter table registrations add column if not exists payment_transaction_id text;
alter table registrations add column if not exists payment_sender_number text;
alter table registrations add column if not exists payment_status text default 'unpaid'
  check (payment_status in ('unpaid','pending_verification','verified','rejected'));
alter table registrations add column if not exists payment_verified_by uuid references profiles(id);
alter table registrations add column if not exists payment_verified_at timestamptz;

-- done
