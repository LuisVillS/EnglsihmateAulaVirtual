import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { resolveLibraryTtsVoice, sanitizeLibraryTtsText } from "./tts.js";

function getPiperExecutable() {
  return process.env.PIPER_EXECUTABLE || process.env.PIPER_PATH || "piper";
}

function getPiperModelsDirectory() {
  return process.env.PIPER_MODELS_DIR || process.env.PIPER_MODEL_DIR || "";
}

function quoteWindowsArgument(value = "") {
  const stringValue = String(value ?? "");
  if (!stringValue) return '""';
  if (!/[\s"]/u.test(stringValue)) return stringValue;
  return `"${stringValue.replace(/"/g, '\\"')}"`;
}

function resolvePiperSpawnConfig(executable = "", args = []) {
  const extension = path.extname(String(executable || "")).toLowerCase();
  const isWindowsScript =
    process.platform === "win32" && [".cmd", ".bat"].includes(extension);

  if (!isWindowsScript) {
    return {
      command: executable,
      args,
      usesInputRedirection: false,
      stdio: ["pipe", "pipe", "pipe"],
    };
  }

  const commandLine = [quoteWindowsArgument(executable), ...args.map(quoteWindowsArgument)].join(" ");
  return {
    command: process.env.ComSpec || "cmd.exe",
    args: ["/d", "/s", "/c", `chcp 65001>nul & ${commandLine}`],
    usesInputRedirection: false,
    stdio: ["pipe", "pipe", "pipe"],
  };
}

function buildPiperSpawnEnv() {
  return {
    ...process.env,
    PYTHONIOENCODING: "utf-8",
    PYTHONUTF8: "1",
  };
}

function isPiperUnicodeFailure(error = "") {
  const message = String(error || "");
  return /surrogates not allowed|UnicodeEncodeError|utf-8.+surrogates/i.test(message);
}

function buildPiperAsciiFallbackText(text = "") {
  let normalized = sanitizeLibraryTtsText(text);
  try {
    normalized = normalized.normalize("NFKD");
  } catch {
    // Keep the already sanitized text as-is.
  }

  return normalized
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolvePiperVoiceModelPath(voice = {}) {
  const specificPathMap = {
    ALBA: process.env.PIPER_MODEL_ALBA || "",
    JENNY: process.env.PIPER_MODEL_JENNY || "",
    JHON: process.env.PIPER_MODEL_JHON || "",
  };

  const specificPath = specificPathMap[String(voice.envKey || "").toUpperCase()] || "";
  if (specificPath) return specificPath;

  const modelsDirectory = getPiperModelsDirectory();
  if (!modelsDirectory) return "";
  return path.join(modelsDirectory, `${voice.modelId}.onnx`);
}

async function fileExists(targetPath = "") {
  if (!targetPath) return false;
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function validateLibraryPiperVoice(voiceId = "") {
  const voice = resolveLibraryTtsVoice(voiceId);
  const modelPath = resolvePiperVoiceModelPath(voice);
  const modelExists = await fileExists(modelPath);
  return {
    voice,
    modelPath,
    modelExists,
    executable: getPiperExecutable(),
  };
}

export async function generateLibraryPiperSpeech({
  voiceId = "",
  text = "",
} = {}) {
  const normalizedText = sanitizeLibraryTtsText(text);
  const stdinText = Buffer.from(normalizedText, "utf8").toString("utf8");

  if (!stdinText) {
    throw new Error("No readable text was provided for TTS.");
  }

  if (stdinText.length > 1600) {
    throw new Error("The selected text is too long for a single TTS request.");
  }

  const { voice, modelPath, modelExists, executable } = await validateLibraryPiperVoice(voiceId);

  if (!modelPath || !modelExists) {
    throw new Error(`Piper voice model for ${voice.label} is not configured.`);
  }

  const outputPath = path.join(os.tmpdir(), `library-tts-${randomUUID()}.wav`);

  async function synthesizeWithText(inputText) {
    const args = ["--model", modelPath, "--output_file", outputPath];
    if (voice.speakerId != null) {
      args.push("--speaker", String(voice.speakerId));
    }
    const spawnConfig = resolvePiperSpawnConfig(executable, args);

    return new Promise((resolve, reject) => {
      const child = spawn(spawnConfig.command, spawnConfig.args, {
        stdio: spawnConfig.stdio,
        windowsHide: true,
        env: buildPiperSpawnEnv(),
      });

      let stderr = "";

      child.stdout.on("data", () => {
        // Piper writes audio to file; ignore stdout chatter.
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        reject(new Error(error?.message || "Piper could not be started."));
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(
          new Error(
            stderr.trim() || `Piper exited with status ${code == null ? "unknown" : code}.`
          )
        );
      });

      if (!spawnConfig.usesInputRedirection) {
        child.stdin.write(Buffer.from(inputText, "utf8"));
        child.stdin.end();
      }
    });
  }

  try {
    await synthesizeWithText(stdinText);
  } catch (error) {
    if (!isPiperUnicodeFailure(error?.message)) {
      throw error;
    }

    const fallbackText = buildPiperAsciiFallbackText(stdinText);
    if (!fallbackText || fallbackText === stdinText) {
      throw error;
    }

    await synthesizeWithText(fallbackText);
  }

  try {
    const outputBuffer = await fs.readFile(outputPath);
    if (!outputBuffer?.length) {
      throw new Error("Piper returned an empty audio file.");
    }
    return outputBuffer;
  } finally {
    await fs.unlink(outputPath).catch(() => null);
  }
}
