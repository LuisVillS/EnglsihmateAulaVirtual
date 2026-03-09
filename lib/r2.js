import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  LIBRARY_R2_BUCKET,
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

function resolveBucketName(bucketOverride = "") {
  return (bucketOverride || R2_BUCKET || "").trim();
}

function assertR2Config(bucketOverride = "") {
  const endpoint = resolveR2Endpoint();
  const bucket = resolveBucketName(bucketOverride);
  const hasInvalidConfig =
    !endpoint ||
    !bucket ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    isPlaceholder(endpoint) ||
    isPlaceholder(bucket) ||
    isPlaceholder(R2_ACCESS_KEY_ID) ||
    isPlaceholder(R2_SECRET_ACCESS_KEY);

  if (hasInvalidConfig) {
    throw new Error(
      "Configura R2 correctamente (R2_ACCOUNT_ID/R2_ENDPOINT, R2_BUCKET o bucket especifico, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)."
    );
  }

  return {
    endpoint,
    bucket,
  };
}

let r2Client = null;
let r2WritableCheckPromise = null;

export function createR2Client() {
  if (r2Client) {
    return r2Client;
  }

  const { endpoint } = assertR2Config();

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

export async function getSignedUploadUrl(key, contentType = "audio/mpeg", bucketOverride = "") {
  const { bucket } = assertR2Config(bucketOverride);
  const client = createR2Client();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(client, command, { expiresIn: 60 * 10 });
}

export async function putObjectToR2(key, body, contentType = "audio/mpeg", bucketOverride = "") {
  const { bucket } = assertR2Config(bucketOverride);
  const client = createR2Client();

  const command = new PutObjectCommand({
    Bucket: bucket,
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

export async function deleteObjectFromR2(key, bucketOverride = "") {
  const { bucket } = assertR2Config(bucketOverride);
  const client = createR2Client();

  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  await client.send(command);
}

export async function getSignedDownloadUrl(key, bucketOverride = "") {
  const { bucket } = assertR2Config(bucketOverride);
  const client = createR2Client();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return getSignedUrl(client, command, { expiresIn: 60 * 10 });
}

export async function getObjectFromR2(key, bucketOverride = "") {
  const { bucket } = assertR2Config(bucketOverride);
  const client = createR2Client();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const response = await client.send(command);
  const bytes = response?.Body ? await response.Body.transformToByteArray() : new Uint8Array();

  return {
    bytes,
    contentType: response?.ContentType || "audio/mpeg",
  };
}

export function getLibraryR2Bucket() {
  return resolveBucketName(LIBRARY_R2_BUCKET);
}

export async function assertR2Writable(bucketOverride = "") {
  if (r2WritableCheckPromise && !bucketOverride) {
    return r2WritableCheckPromise;
  }

  const targetBucket = resolveBucketName(bucketOverride);
  const checkPromise = (async () => {
    const key = `_healthchecks/r2-write-check-${Date.now()}.txt`;
    try {
      await putObjectToR2(key, Buffer.from("ok"), "text/plain", targetBucket);
      await deleteObjectFromR2(key, targetBucket);
      return true;
    } catch (error) {
      if (!bucketOverride) {
        r2WritableCheckPromise = null;
      }
      throw new Error(
        `R2 no permite escritura en el bucket configurado (${targetBucket || R2_BUCKET}). Verifica bucket, endpoint y permisos Object Write del token. Detalle: ${error?.message || "Access denied"}`
      );
    }
  })();

  if (!bucketOverride) {
    r2WritableCheckPromise = checkPromise;
  }

  return checkPromise;
}

export function getPublicAssetUrl(key) {
  if (!NEXT_PUBLIC_R2_PUBLIC_BASE_URL) {
    return null;
  }

  const normalizedBase = NEXT_PUBLIC_R2_PUBLIC_BASE_URL.replace(/\/$/, "");
  return `${normalizedBase}/${key}`;
}
