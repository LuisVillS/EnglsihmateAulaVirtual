# Supabase Migration Baseline

## Que significa el error

Si en los logs aparece esto:

```text
relation "supabase_migrations.schema_migrations" does not exist
application_name = supabase/dashboard
```

no suele venir de la app. Normalmente significa que el dashboard de Supabase intento leer el historial de migraciones, pero tu base remota no tiene inicializada la tabla `supabase_migrations.schema_migrations`.

En este repo ya existian migraciones SQL en `supabase/migrations`, pero faltaba inicializar el proyecto para Supabase CLI. Por eso ahora el repo ya incluye:

- `supabase/config.toml`
- `scripts/supabase-repair-history.mjs`
- nombres de migracion con prefijos unicos compatibles con Supabase CLI

## Por que no conviene hacer `db pull` primero

Este repo ya tiene migraciones locales versionadas. Si haces `db pull` como primer paso contra una base que ya refleja esos cambios, puedes terminar con:

- una migracion baseline nueva encima de las 28 ya existentes
- historial remoto desalineado con el historial local

Para este proyecto, el primer paso correcto es **marcar las migraciones locales existentes como `applied` en remoto**, no volver a generarlas.

## Project ref

Por los logs del host:

```text
db-nmhhmbensmiahfsglrvq
```

el `project-ref` esperado parece ser:

```text
nmhhmbensmiahfsglrvq
```

Verificalo en el dashboard antes de ejecutar cambios remotos.

## Flujo recomendado

1. Inicia sesion en Supabase CLI:

```powershell
npx supabase login
```

2. Verifica el comando que se va a usar para reparar historial:

```powershell
npm run supabase:repair-history
```

3. Ejecuta la reparacion remota usando el `project-ref` y la password de la base de datos:

```powershell
node scripts/supabase-repair-history.mjs --execute --project-ref=nmhhmbensmiahfsglrvq --password="<db-password>"
```

El script hace tres cosas:

- `supabase link`
- `supabase migration repair ... --status applied`
- `supabase migration list`

4. Verifica que el dashboard ya no intente leer una tabla inexistente.

## Si aun hay desajuste

Si `migration list` muestra diferencias entre local y remoto, revisa primero si:

- falta alguna migracion local en `supabase/migrations`
- alguna migracion remota fue aplicada manualmente desde SQL Editor

Solo despues de estabilizar el historial conviene usar:

```powershell
npx supabase db pull <nombre-de-migracion>
```

Eso ya seria para capturar cambios manuales no versionados, no para corregir el error del dashboard.
