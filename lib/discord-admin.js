import fs from "node:fs";
import path from "node:path";

const COURSE_ROLE_PATTERN = /^(BASICO A1|BASICO A2|INTERMEDIO B1|INTERMEDIO B2|AVANZADO C1)\s+\d{4}(?:-\d{2})?$/i;
const ALUMNI_ROLE_NAME = "Alumni";

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = String(rawLine || "").trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    values[key.trim()] = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
  }
  return values;
}

function loadDiscordSettings() {
  const root = process.cwd();
  const candidates = [
    path.join(root, ".env.local"),
    path.join(root, ".env"),
    path.join(root, "bot", ".env.local"),
    path.join(root, "bot", ".env"),
  ];
  const fromFiles = {};
  for (const candidate of candidates) {
    Object.assign(fromFiles, parseEnvFile(candidate));
  }
  return {
    token: process.env.DISCORD_BOT_TOKEN || fromFiles.DISCORD_BOT_TOKEN || "",
    guildId: process.env.DISCORD_GUILD_ID || fromFiles.DISCORD_GUILD_ID || "",
  };
}

function getDiscordSettings() {
  const settings = loadDiscordSettings();
  if (!settings.token) {
    throw new Error("DISCORD_BOT_TOKEN is not configured.");
  }
  return settings;
}

async function discordRequest(pathname, { method = "GET", body } = {}) {
  const { token } = getDiscordSettings();
  const response = await fetch(`https://discord.com/api/v10${pathname}`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord API ${method} ${pathname} failed: ${response.status} ${text}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

export async function listDiscordGuilds() {
  const guilds = await discordRequest("/users/@me/guilds");
  return Array.isArray(guilds) ? guilds : [];
}

export async function resolveDiscordGuildId(preferredGuildId = "") {
  if (preferredGuildId) return preferredGuildId;
  const settings = getDiscordSettings();
  if (settings.guildId) return settings.guildId;
  const guilds = await listDiscordGuilds();
  return guilds[0]?.id || "";
}

export async function getDiscordGuildRoles(guildId) {
  if (!guildId) return [];
  const roles = await discordRequest(`/guilds/${guildId}/roles`);
  return Array.isArray(roles) ? roles : [];
}

export async function listDiscordGuildMembers(guildId) {
  if (!guildId) return [];
  const members = [];
  let after = "0";

  while (true) {
    const batch = await discordRequest(`/guilds/${guildId}/members?limit=1000&after=${after}`);
    const rows = Array.isArray(batch) ? batch : [];
    if (!rows.length) break;
    members.push(...rows);
    if (rows.length < 1000) break;
    after = rows[rows.length - 1]?.user?.id || after;
    if (!after) break;
  }

  return members;
}

export async function getDiscordGuildMember(guildId, discordUserId) {
  if (!guildId || !discordUserId) return null;
  try {
    return await discordRequest(`/guilds/${guildId}/members/${discordUserId}`);
  } catch (error) {
    if (String(error?.message || "").includes(" 404 ")) {
      return null;
    }
    throw error;
  }
}

export function getDiscordMemberUsername(member) {
  return (
    member?.user?.username ||
    member?.user?.global_name ||
    member?.nick ||
    member?.user?.id ||
    ""
  );
}

export function getDiscordMemberDisplayName(member) {
  return member?.nick || member?.user?.global_name || member?.user?.username || member?.user?.id || "Unknown";
}

function normalizeSpace(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function formatCourseLevel(courseLevel) {
  const normalized = normalizeSpace(courseLevel).toUpperCase();
  if (!normalized) return "";
  return normalized.split(" ").map((token) => (/^[A-Z]\d$/i.test(token) ? token.toUpperCase() : `${token[0]}${token.slice(1).toLowerCase()}`)).join(" ");
}

function extractYearMonth(value) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{1,2})/);
  if (!match) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}`;
}

function parseDateOnly(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isInactiveCommission(commission) {
  if (!commission?.id) return false;
  if (commission.is_active === false) return true;
  if (String(commission.status || "").toLowerCase() === "inactive") return true;
  if (String(commission.status || "").toLowerCase() === "archived") return true;
  const endDate = parseDateOnly(commission.end_date);
  if (!endDate) return false;
  const today = new Date();
  const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return endDate < utcToday;
}

export function resolveExpectedDiscordRole(student) {
  const commission = student?.commission || null;
  if (isInactiveCommission(commission)) {
    return ALUMNI_ROLE_NAME;
  }
  const courseLevel = commission?.course_level || student?.course_level || "";
  const period = extractYearMonth(
    commission?.start_date || commission?.start_month || student?.start_month || student?.enrollment_date || ""
  );
  const formattedCourse = formatCourseLevel(courseLevel);
  if (!formattedCourse || !period) return "";
  return `${formattedCourse} ${period}`;
}

export function isManagedDiscordRoleName(roleName) {
  const normalized = normalizeSpace(roleName);
  return normalized.localeCompare(ALUMNI_ROLE_NAME, undefined, { sensitivity: "accent" }) === 0 || COURSE_ROLE_PATTERN.test(normalized);
}

export function mapMemberRoleNames(member, rolesById) {
  return (member?.roles || [])
    .map((roleId) => rolesById.get(String(roleId))?.name || null)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}
