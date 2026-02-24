import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  R2_ENDPOINT,
  NEXT_PUBLIC_R2_PUBLIC_BASE_URL,
} = process.env;

function isPlaceholder(value) {
  if (!value) return true;
  const normalized = value.trim().toUpperCase();
  return (
    normalized.startsWith("TU_") ||
    normalized.startsWith("YOUR_") ||
    normalized.includes("ACCOUNT_ID") ||
    normalized.includes("ACCESS_KEY") ||
    normalized.includes("SECRET") ||
    normalized === "CHANGE_ME"
  );
}

function resolveR2Endpoint() {
  if (R2_ENDPOINT?.trim()) return R2_ENDPOINT.trim();
  if (!R2_ACCOUNT_ID) return null;
  if (R2_ACCOUNT_ID.startsWith("http://") || R2_ACCOUNT_ID.startsWith("https://")) {
    return R2_ACCOUNT_ID;
  }
  return `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

function assertR2Config() {
  const endpoint = resolveR2Endpoint();
  const hasInvalidConfig =
    !endpoint ||
    !R2_BUCKET ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    isPlaceholder(endpoint) ||
    isPlaceholder(R2_BUCKET) ||
    isPlaceholder(R2_ACCESS_KEY_ID) ||
    isPlaceholder(R2_SECRET_ACCESS_KEY);

  if (hasInvalidConfig) {
    throw new Error(
      "Configura R2 correctamente (R2_ACCOUNT_ID/R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)."
    );
  }

  return endpoint;
}

let r2Client = null;

export function createR2Client() {
  if (r2Client) {
    return r2Client;
  }

  const endpoint = assertR2Config();

  r2Client = new S3Client({
    region: "auto",
    endpoint,
    // R2 works reliably with path-style requests and avoids TLS hostname mismatch on some setups.
    forcePathStyle: true,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });

  return r2Client;
}

export async function getSignedUploadUrl(key, contentType = "audio/mpeg") {
  assertR2Config();
  const client = createR2Client();

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(client, command, { expiresIn: 60 * 10 });
}

export async function putObjectToR2(key, body, contentType = "audio/mpeg") {
  assertR2Config();
  const client = createR2Client();

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  await client.send(command);
  return {
    key,
    publicUrl: getPublicAssetUrl(key),
  };
}

export async function getSignedDownloadUrl(key) {
  assertR2Config();
  const client = createR2Client();

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
  });

  return getSignedUrl(client, command, { expiresIn: 60 * 10 });
}

export function getPublicAssetUrl(key) {
  if (!NEXT_PUBLIC_R2_PUBLIC_BASE_URL) {
    return null;
  }

  const normalizedBase = NEXT_PUBLIC_R2_PUBLIC_BASE_URL.replace(/\/$/, "");
  return `${normalizedBase}/${key}`;
}
