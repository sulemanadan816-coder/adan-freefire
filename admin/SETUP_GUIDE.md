# Moved

This was a stale, pre-hardening duplicate of the setup guide. It described
`schema.sql`'s signup trigger as auto-granting `role = 'owner'` to every new
account — that was the critical bug fixed by `migration_security_hardening.sql`.
Following these old steps on a fresh project would reintroduce it.

**Use the current guide instead:** [`../SETUP_GUIDE.md`](../SETUP_GUIDE.md)
