# Supabase Migrations

## Reihenfolge

| Datei | Beschreibung |
|---|---|
| `20260518_group_order_cart.sql` | Temporärer Warenkorb für Sammelbestellungen + Auto-Migration per pg_cron |

## Anleitung: Migration ausführen

1. Supabase Dashboard → **SQL Editor**
2. Inhalt der `.sql`-Datei einfügen und ausführen
3. Danach unter **Database → Extensions** prüfen ob `pg_cron` aktiviert ist
   - Falls nicht: Extension aktivieren, dann den `cron.schedule(...)`-Block erneut ausführen

## pg_cron prüfen

```sql
-- Zeigt alle registrierten Jobs
select * from cron.job;

-- Zeigt die letzten Ausführungen
select * from cron.job_run_details order by start_time desc limit 20;
```

## Funktion manuell auslösen (zum Testen)

```sql
select public.flush_expired_group_order_carts();
```
