"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import { getDiscordGuildMember, getDiscordMemberUsername, listDiscordGuildMembers, resolveDiscordGuildId } from "@/lib/discord-admin";

async function requireAdmin() {
  const supabase = await createSupabaseServerClient({ allowCookieSetter: true });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("No autenticado");
  }

  const { data: adminRecord } = await supabase
    .from("admin_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!adminRecord?.id) {
    throw new Error("Solo admins");
  }

  return { user };
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function cleanDiscordId(value) {
  return String(value || "").trim();
}

export async function refreshDiscordUsernamesAction() {
  await requireAdmin();
  if (!hasServiceRoleClient()) {
    redirect("/admin/discord?error=Configura%20SUPABASE_SERVICE_ROLE_KEY");
  }

  const guildId = await resolveDiscordGuildId();
  if (!guildId) {
    redirect("/admin/discord?error=No%20se%20encontro%20el%20servidor%20de%20Discord");
  }

  const [members, service] = await Promise.all([
    listDiscordGuildMembers(guildId),
    Promise.resolve(getServiceSupabaseClient()),
  ]);

  const usernameByDiscordId = new Map();
  for (const member of members) {
    const discordId = String(member?.user?.id || "").trim();
    if (!discordId) continue;
    const username = getDiscordMemberUsername(member);
    if (username) {
      usernameByDiscordId.set(discordId, username);
    }
  }

  const { data: profiles, error } = await service
    .from("profiles")
    .select("id, discord_user_id, discord_username")
    .not("discord_user_id", "is", null);

  if (error) {
    redirect(`/admin/discord?error=${encodeURIComponent(error.message || "No se pudieron cargar perfiles")}`);
  }

  let updated = 0;
  for (const profile of profiles || []) {
    const discordId = cleanDiscordId(profile.discord_user_id);
    if (!discordId) continue;
    const username = usernameByDiscordId.get(discordId) || null;
    if ((profile.discord_username || null) === username || !username) continue;
    const { error: updateError } = await service
      .from("profiles")
      .update({ discord_username: username })
      .eq("id", profile.id);
    if (!updateError) {
      updated += 1;
    }
  }

  revalidatePath("/admin/discord");
  redirect(`/admin/discord?updated=${updated}`);
}

export async function saveDiscordRosterLinkAction(formData) {
  await requireAdmin();
  if (!hasServiceRoleClient()) {
    redirect("/admin/discord?error=Configura%20SUPABASE_SERVICE_ROLE_KEY");
  }

  const email = normalizeEmail(formData.get("email"));
  const discordUserId = cleanDiscordId(formData.get("discordUserId"));
  if (!email || !discordUserId) {
    redirect("/admin/discord?error=Correo%20y%20Discord%20ID%20son%20obligatorios");
  }

  const guildId = await resolveDiscordGuildId();
  if (!guildId) {
    redirect("/admin/discord?error=No%20se%20encontro%20el%20servidor%20de%20Discord");
  }

  const [service, discordMember] = await Promise.all([
    Promise.resolve(getServiceSupabaseClient()),
    getDiscordGuildMember(guildId, discordUserId),
  ]);

  if (!discordMember?.user?.id) {
    redirect("/admin/discord?error=Ese%20Discord%20ID%20no%20esta%20dentro%20del%20servidor");
  }

  const { data: student } = await service
    .from("profiles")
    .select("id, email, full_name, role, discord_user_id")
    .eq("email", email)
    .maybeSingle();

  if (!student?.id || student.role !== "student") {
    redirect("/admin/discord?error=No%20se%20encontro%20ningun%20estudiante%20con%20ese%20correo");
  }

  const { data: existingDiscordOwner } = await service
    .from("profiles")
    .select("id, email, full_name")
    .eq("discord_user_id", discordUserId)
    .maybeSingle();

  if (existingDiscordOwner?.id && existingDiscordOwner.id !== student.id) {
    redirect("/admin/discord?error=Ese%20Discord%20ya%20esta%20vinculado%20a%20otro%20estudiante");
  }

  const linkedDiscordId = cleanDiscordId(student.discord_user_id);
  const username = getDiscordMemberUsername(discordMember) || null;
  const { error: updateError } = await service
    .from("profiles")
    .update({
      discord_user_id: discordUserId,
      discord_username: username,
      discord_connected_at: new Date().toISOString(),
    })
    .eq("id", student.id);

  if (updateError) {
    redirect(`/admin/discord?error=${encodeURIComponent(updateError.message || "No se pudo actualizar la vinculacion")}`);
  }

  revalidatePath("/admin/discord");
  const message = linkedDiscordId && linkedDiscordId !== discordUserId
    ? "Vinculacion movida correctamente"
    : "Vinculacion actualizada correctamente";
  redirect(`/admin/discord?success=${encodeURIComponent(message)}`);
}
