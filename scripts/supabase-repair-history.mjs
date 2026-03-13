import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const cwd = process.cwd();
const migrationsDir = path.join(cwd, "supabase", "migrations");
const args = new Set(process.argv.slice(2));

function readMigrationVersions() {
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name.match(/^(\d+)_/))
    .filter(Boolean)
    .map((match) => match[1])
    .sort();
}

function readFlagValue(flagName, envName = "") {
  const prefix = `${flagName}=`;
  const cliValue = process.argv.slice(2).find((value) => value.startsWith(prefix));
  if (cliValue) {
    return cliValue.slice(prefix.length).trim();
  }
  if (envName) {
    return String(process.env[envName] || "").trim();
  }
  return "";
}

function run(commandArgs, envOverrides = {}) {
  const result = spawnSync("npx", commandArgs, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...envOverrides },
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

const versions = readMigrationVersions();

if (!versions.length) {
  console.error("No se encontraron migraciones en supabase/migrations.");
  process.exit(1);
}

const projectRef =
  readFlagValue("--project-ref", "SUPABASE_PROJECT_REF") ||
  readFlagValue("--project", "SUPABASE_PROJECT_REF");
const password = readFlagValue("--password", "SUPABASE_DB_PASSWORD");
const execute = args.has("--execute");

const repairArgs = ["supabase", "migration", "repair", ...versions, "--status", "applied"];

if (!execute) {
  console.log("Project ref:", projectRef || "<pendiente>");
  console.log("Migraciones locales:", versions.join(", "));
  console.log("");
  console.log("Comando sugerido:");
  console.log(`npx ${repairArgs.join(" ")}`);
  console.log("");
  console.log("Para ejecutarlo automaticamente:");
  console.log(
    "node scripts/supabase-repair-history.mjs --execute --project-ref=<project-ref> --password=<db-password>"
  );
  process.exit(0);
}

if (!projectRef) {
  console.error("Falta --project-ref o SUPABASE_PROJECT_REF.");
  process.exit(1);
}

if (!password) {
  console.error("Falta --password o SUPABASE_DB_PASSWORD.");
  process.exit(1);
}

console.log(`Linkeando proyecto ${projectRef}...`);
run(["supabase", "link", "--project-ref", projectRef, "--password", password]);

console.log("Marcando migraciones como applied en remoto...");
run(repairArgs, { SUPABASE_DB_PASSWORD: password });

console.log("Listando historial local/remoto...");
run(["supabase", "migration", "list", "--password", password], { SUPABASE_DB_PASSWORD: password });
