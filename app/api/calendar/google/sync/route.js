import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import {
  computeTokenExpiry,
  googleCalendarRequest,
  hasGoogleCalendarOAuthConfig,
  refreshGoogleAccessToken,
} from "@/lib/google-calendar-oauth";
import { getStudentCalendarAccess } from "@/lib/student-calendar-access";

const LIMA_TIME_ZONE = "America/Lima";

function getSessionTimes(session) {
  const startDate = session?.starts_at ? new Date(session.starts_at) : new Date(`${session.session_date}T00:00:00-05:00`);
  if (Number.isNaN(startDate.getTime())) return null;
  const endDate = session?.ends_at ? new Date(session.ends_at) : new Date(startDate.getTime() + 60 * 60 * 1000);
  if (Number.isNaN(endDate.getTime())) return null;
  return {
    startIso: startDate.toISOString(),
    endIso: endDate.toISOString(),
  };
}

function buildEventPayload({ session, commission, userId }) {
  const times = getSessionTimes(session);
  if (!times) return null;

  const summary = `${commission.course_level} - ${session.day_label || "Clase"}`;
  const details = [
    `Comision #${commission.commission_number}`,
    session?.live_link ? `Zoom/Live: ${session.live_link}` : null,
    session?.recording_link ? `Grabacion: ${session.recording_link}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    summary,
    description: details,
    start: {
      dateTime: times.startIso,
      timeZone: LIMA_TIME_ZONE,
    },
    end: {
      dateTime: times.endIso,
      timeZone: LIMA_TIME_ZONE,
    },
    extendedProperties: {
      private: {
        englishmate_source: "aula_virtual",
        englishmate_user_id: String(userId),
        englishmate_session_id: String(session.id),
      },
    },
  };
}

export async function POST() {
  if (!hasGoogleCalendarOAuthConfig()) {
    return Response.json({ error: "Google Calendar OAuth no esta configurado." }, { status: 500 });
  }
  if (!hasServiceRoleClient()) {
    return Response.json({ error: "Configura SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }

  const service = getServiceSupabaseClient();
  const { data: connection } = await service
    .from("google_calendar_connections")
    .select("user_id, calendar_id, access_token, refresh_token, expires_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!connection?.refresh_token) {
    return Response.json({ error: "Cuenta de Google Calendar no conectada." }, { status: 409 });
  }

  let activeConnection = { ...connection };

  async function refreshAndPersistToken() {
    const refreshed = await refreshGoogleAccessToken({ refreshToken: activeConnection.refresh_token });
    activeConnection = {
      ...activeConnection,
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token || activeConnection.refresh_token,
      expires_at: computeTokenExpiry(refreshed.expires_in),
    };
    const { error } = await service
      .from("google_calendar_connections")
      .update({
        access_token: activeConnection.access_token,
        refresh_token: activeConnection.refresh_token,
        token_type: refreshed.token_type || "Bearer",
        scope: refreshed.scope || null,
        expires_at: activeConnection.expires_at,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);
    if (error) throw new Error(error.message || "No se pudo actualizar token.");
  }

  try {
    const expiresAtMs = activeConnection.expires_at ? new Date(activeConnection.expires_at).getTime() : 0;
    if (!expiresAtMs || expiresAtMs <= Date.now() + 60 * 1000) {
      await refreshAndPersistToken();
    }
  } catch (error) {
    return Response.json({ error: String(error?.message || "No se pudo refrescar token.") }, { status: 500 });
  }

  const calendarData = await getStudentCalendarAccess({
    supabase: service,
    userId: user.id,
    upcomingOnly: true,
  });

  if (!calendarData.ok) {
    return Response.json({ error: "No tienes una comision activa para sincronizar." }, { status: 400 });
  }

  const commission = calendarData.commission;
  const targetSessions = calendarData.unlockedSessions || [];
  const targetSessionIds = new Set(targetSessions.map((session) => String(session.id)));
  const calendarId = activeConnection.calendar_id || "primary";

  async function requestWithRefreshRetry(params) {
    let result = await googleCalendarRequest({ accessToken: activeConnection.access_token, ...params });
    if (result.status === 401) {
      await refreshAndPersistToken();
      result = await googleCalendarRequest({ accessToken: activeConnection.access_token, ...params });
    }
    return result;
  }

  try {
    const existingEvents = [];
    let pageToken = null;
    do {
      const listResult = await requestWithRefreshRetry({
        path: `/calendars/${encodeURIComponent(calendarId)}/events`,
        query: {
          singleEvents: "true",
          showDeleted: "false",
          maxResults: "2500",
          timeMin: new Date().toISOString(),
          privateExtendedProperty: `englishmate_user_id=${user.id}`,
          pageToken: pageToken || undefined,
        },
      });
      if (!listResult.ok) {
        throw new Error(listResult.error || "No se pudieron listar eventos en Google Calendar.");
      }
      existingEvents.push(...(listResult.data?.items || []));
      pageToken = listResult.data?.nextPageToken || null;
    } while (pageToken);

    const eventBySessionId = new Map();
    for (const event of existingEvents) {
      const sessionId = event?.extendedProperties?.private?.englishmate_session_id;
      if (sessionId) eventBySessionId.set(String(sessionId), event);
    }

    let createdCount = 0;
    let updatedCount = 0;
    let deletedCount = 0;
    const errors = [];

    for (const session of targetSessions) {
      const payload = buildEventPayload({ session, commission, userId: user.id });
      if (!payload) continue;

      const existing = eventBySessionId.get(String(session.id));
      if (existing?.id) {
        const patchResult = await requestWithRefreshRetry({
          method: "PATCH",
          path: `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existing.id)}`,
          body: payload,
        });
        if (patchResult.ok) updatedCount += 1;
        else errors.push(patchResult.error || `No se pudo actualizar ${session.id}`);
      } else {
        const createResult = await requestWithRefreshRetry({
          method: "POST",
          path: `/calendars/${encodeURIComponent(calendarId)}/events`,
          body: payload,
        });
        if (createResult.ok) createdCount += 1;
        else errors.push(createResult.error || `No se pudo crear ${session.id}`);
      }
    }

    for (const event of existingEvents) {
      const sessionId = String(event?.extendedProperties?.private?.englishmate_session_id || "");
      if (!sessionId || targetSessionIds.has(sessionId) || !event?.id) continue;
      const deleteResult = await requestWithRefreshRetry({
        method: "DELETE",
        path: `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(event.id)}`,
      });
      if (deleteResult.ok) deletedCount += 1;
      else errors.push(deleteResult.error || `No se pudo eliminar evento ${event.id}`);
    }

    const lastSyncAt = new Date().toISOString();
    const hasErrors = errors.length > 0;
    await service
      .from("google_calendar_connections")
      .update({
        last_sync_at: lastSyncAt,
        last_sync_status: hasErrors ? "error" : "ok",
        last_sync_error: hasErrors ? errors.slice(0, 3).join(" | ") : null,
        updated_at: lastSyncAt,
      })
      .eq("user_id", user.id);

    return Response.json(
      {
        success: !hasErrors,
        created: createdCount,
        updated: updatedCount,
        deleted: deletedCount,
        total: targetSessions.length,
        warning: hasErrors ? errors[0] : null,
      },
      { status: hasErrors ? 207 : 200 }
    );
  } catch (error) {
    const message = String(error?.message || "No se pudo sincronizar con Google Calendar.");
    await service
      .from("google_calendar_connections")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: "error",
        last_sync_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);
    return Response.json({ error: message }, { status: 500 });
  }
}
