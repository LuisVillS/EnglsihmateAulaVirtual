export function getDiscordIdentity(user) {
  const discordIdentity = (user?.identities || []).find((identity) => identity?.provider === "discord");
  if (!discordIdentity) return null;

  const identityData = discordIdentity.identity_data || {};
  const discordUserId = identityData.sub || discordIdentity.provider_id || discordIdentity.id || null;
  if (!discordUserId) return null;

  const discordUsername =
    identityData.username ||
    identityData.preferred_username ||
    identityData.global_name ||
    null;

  return {
    id: discordUserId,
    username: discordUsername,
  };
}
