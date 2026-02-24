# Aula Virtual

Next.js + Supabase + Cloudflare R2 para un aula virtual privada: login institucional, panel admin y vista alumno sin sobrecarga LMS.

## Flujo y rutas
- `/` - pantalla principal de login (flujo email-first privado). Si ya hay sesion: redirige a `/app` (student) o `/admin/panel` (admin).
- `/app` - dashboard del alumno con cursos y lecciones asignadas.
- `/app/practice` - Practice Lab (Duolingo-like): sesiones new/review + feedback + XP/streak.
- `/admin` - login exclusivo para administradores.
- `/admin/panel` - tablero admin para CRUD (cursos, unidades, lecciones, ejercicios con audio) y gestion de alumnos (roles, asignacion manual, import CSV rapido).
- `/admin/courses/templates/:id` - editor de plantilla por clase: materiales + ejercicios Duolingo-like (crear/asignar varios por clase).
- `/admin/teacher-dashboard` - mÃ©tricas docentes (accuracy, errores por lecciÃ³n/tipo/tema, hardest exercises).
- `/admin/students` - vista dedicada a alumnos: formulario, import masivo, tabla con codigo y estado.
- `/admin/seed` - crea contenido demo A1 (solo admins).
- `/auth/callback` - handler OAuth para Google; solo admite correos ya registrados.

## Modulo Duolingo-like
### Migracion SQL

- Ejecuta `supabase/migrations/20260222_duolingo_module.sql`.
- Ejecuta `supabase/migrations/20260222_template_session_exercises.sql` para enlazar ejercicios por clase (`exercise_id` en `template_session_items` y `session_items`).
- La migracion agrega/extiende:
  - `profiles.id_document`, `profiles.xp_total`, `profiles.current_streak`.
  - `lesson_subjects`, `vocabulary`, `exercise_vocabulary`, `user_progress`, `audio_cache`.
  - campos nuevos en `lessons` (`status`, `ordering`, `level`, `subject_id`) y `exercises` (`type`, `content_json`, `status`, `revision`, auditoria).
  - politicas para lectura solo `published` en student side.

### Endpoints del modulo
- Student:
  - `POST /api/auth/student`
  - `GET /api/session` (acepta `exercise_id` o `exercise_ids` para sesiones enfocadas por clase)
  - `POST /api/progress`
- Admin Editor:
  - `POST|PUT|DELETE /api/admin/vocabulary`
  - `POST|PUT|DELETE /api/admin/lessons`
  - `POST|PUT|DELETE /api/admin/exercises`
  - `POST /api/admin/exercises/validate`
  - `GET /api/admin/exercises/:id/preview`
- Teacher:
  - `GET /api/admin/teacher-dashboard`

### Audio ElevenLabs con cache
- El audio no se genera al presionar Play.
- Se genera al guardar/publicar (`generate_audio=true`) y se reutiliza por hash deterministico (`language + voice + model + text_normalized`).
- Variables requeridas:
  - `ELEVENLABS_API_KEY`
  - `ELEVENLABS_VOICE_ID`
  - `ELEVENLABS_MODEL_ID` (opcional, default `eleven_multilingual_v2`)

### Nota del curso (peso ejercicios)
- Los ejercicios asignados por clase en plantilla se copian a `session_items.exercise_id`.
- La nota visible al alumno usa ponderacion minima de 50% ejercicios asignados y 50% nota base del curso cuando ambas existen.

## Acceso privado y roles
- No existe signup publico. Todo alumno se registra desde `/admin/students` (formulario o CSV). Cada registro crea/alinea un usuario en Supabase Auth, genera `student_code`, habilita el perfil (tabla `profiles`) y dispara el correo automatizado via Brevo. Los administradores viven en la tabla `admin_profiles` para no mezclarse con los alumnos.
- Login en `/` (alumnos):
  1. El usuario ingresa correo o su `student_code` (EYYYY####) -> el backend (via `SUPABASE_SERVICE_ROLE_KEY`) resuelve el perfil en `profiles`.
  2. Si no existe o `invited = false` -> mensaje **"Este correo no se encuentra registrado en el aula virtual"**.
  3. Si `password_set = false` -> se muestra el paso para crear la contrasena inicial.
  4. Si `password_set = true` -> se pide solo contrasena.
  5. Google OAuth: tras el callback se valida el email; si no estaba invitado se elimina el usuario de Auth y se muestra el mismo error.
- Login en `/admin` (admins): solo admite correos que existan en `admin_profiles`. Si un admin intenta entrar por `/` se le indica usar `/admin`.
- Se asegura un admin inicial (`luisvill99sa@gmail.com`) usando la service role; puedes cambiarlo con `DEFAULT_ADMIN_EMAIL`.
- Roles permitidos: `student` y `admin`. El panel permite promover un alumno a admin (lo mueve a `admin_profiles`), ver estado de contrasena/invitacion y asignar cursos.

## Supabase
1. Crea el proyecto y ejecuta `supabase/schema.sql` para definir tablas, funciones, trigger `handle_new_user` y datos base (incluido flag `invited`).
2. Variables imprescindibles en `.env.local`:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   DEFAULT_ADMIN_EMAIL=luisvill99sa@gmail.com # opcional si quieres otro correo
   SMTP_HOST=smtp.tudominio.com # o usa RESEND_API_KEY si prefieres Resend
   ```
3. La `service_role key` se usa en:
   - Validacion del login privado (lookups).
   - Creacion/actualizacion de usuarios desde `/admin/panel` (formularios y CSV).
   - Flujo de contrasenas iniciales y recuperacion.
4. Configura Brevo (Sendinblue) para los correos transaccionales: `BREVO_API_KEY`, `BREVO_SMTP_USER`, `BREVO_SMTP_PASSWORD`, `BREVO_SMTP_HOST`, `BREVO_SMTP_PORT`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `BREVO_TEMPLATE_RECOVERY_ID` (reset), `BREVO_TEMPLATE_ENROLLMENT_ID` (inscripcion, template 335) y, si lo usas, `BREVO_TEMPLATE_WELCOME_ID`. El schema ya incluye `password_recovery_codes` para almacenar los codigos.
5. Manten RLS habilitado (incluido en el schema) y no expongas la service role fuera del backend.

## Gestion de alumnos
- `/admin/students` centraliza el alta y edicion: formulario con campos academicos (dni, course_level, level_number, premium, fechas) y permite reusar el `student_code`.
- Cada alumno puede registrar un horario preferido (`preferred_hour`) entre las 06:00 y las 23:30 (intervalos de 30â€¯min). El formulario incluye un selector y el listado permite filtrar por curso, nivel, texto u hora disponible.
- El `student_code` se genera automaticamente (formato `EYYYY####`) al crear/importar, valida colisiones y queda con constraint `UNIQUE`.
- Cada alumno nuevo recibe automaticamente un correo de inscripcion (Brevo template 335) con su codigo, curso asignado, horario preferido y una contrasena temporal de 8 caracteres. Los alumnos existentes no reciben correos duplicados y se les sigue forzando el cambio de contrasena en el primer login.
- Import masivo: usa el mismo formulario o el CSV (descargable desde `/api/admin/students/template`). Columnas soportadas: `full_name,email,dni,course_level,level_number,is_premium,start_month,enrollment_date,preferred_hour`. Correos existentes se actualizan, nuevos generan codigo y usuario. Todos reciben correo automatico.
- La tabla soporta filtros por curso/nivel/horario, busqueda por nombre/email/DNI/codigo, muestra el estado de la contrasena y permite descargar la lista filtrada en CSV desde el boton `Descargar lista`.

## Cloudflare R2
1. Crea un bucket para audios (publicos o privados).
2. Genera Access/Secret Keys y un endpoint publico (CDN) para `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` si sirves audios estaticos.

## Recuperacion de contrasena
- `POST /api/auth/recover`: recibe `email`, valida que exista en `profiles` (alumnos) o `admin_profiles` (admins), aplica rate limit por correo, genera un codigo de 6 digitos (10 minutos de vigencia) y envia el template Brevo (ID 334) con los parametros `name` y `code`. Responde `Te enviamos un codigo a tu correo`.
- `POST /api/auth/verify-recovery-code`: recibe `email`, `code` y `newPassword`. Verifica que el codigo siga activo, marca todos los codigos previos del mismo correo como usados, actualiza la contrasena via Supabase Admin API y responde `Contrasena actualizada correctamente` (actualiza la tabla correspondiente: `profiles` o `admin_profiles`).
- Los formularios de `/` y `/admin` usan estos endpoints via server actions; los mensajes de error visibles son `Este correo no se encuentra registrado en el aula virtual` y `Codigo invalido o expirado`.

## Variables de entorno completas (`.env.local`)
```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
DEFAULT_ADMIN_EMAIL=luisvill99sa@gmail.com
BREVO_API_KEY=tu_api_key
BREVO_SMTP_USER=tu_usuario_smtp
BREVO_SMTP_PASSWORD=tu_password_smtp
BREVO_SMTP_HOST=smtp-relay.brevo.com
BREVO_SMTP_PORT=587
BREVO_SENDER_EMAIL="no-reply@tudominio.com"
BREVO_SENDER_NAME="Englishmate Aula Virtual"
BREVO_TEMPLATE_RECOVERY_ID=334
BREVO_TEMPLATE_WELCOME_ID=335
BREVO_TEMPLATE_ENROLLMENT_ID=335
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=...
NEXT_PUBLIC_R2_PUBLIC_BASE_URL=https://cdn.tu-dominio.com # opcional
```

## Scripts
```bash
npm install
npm run dev
npm run build && npm start
```

## Uso diario
1. Arranca `npm run dev`. Los alumnos entran por `/`, los administradores por `/admin` (tras login se redirige a `/admin/panel`).
2. En `/admin/students` registra alumnos manualmente o por CSV; el sistema les asigna codigo, los habilita y envia el correo de bienvenida sin pasos extra.
3. Verifica estados: `No autorizado`, `Contrasena pendiente` o `Activo`. Ajusta roles/asignaciones desde `/admin/panel` y consulta/filtra/exporta el padron en `/admin/students`.
4. Comparte con cada alumno su correo institucional. Entran por `/`, validan correo, crean contrasena si aplica o usan Google (solo si el correo ya esta invitado). Si olvidan la contrasena, pueden usar el enlace "?Olvidaste tu contrasena?" (envia un codigo al correo) disponible tanto en `/` como en `/admin` para restablecerla.
5. Los alumnos solo pueden ver `/app`. Los admins mantienen cursos/audio en `/admin/panel` y pueden rellenar `/admin/seed` para datos demo.

Respeta las claves privadas, manten las politicas RLS activas y usa `/admin/panel` para gestionar todo el aula.


