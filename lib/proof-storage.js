import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";

const DEFAULT_BUCKET = "payment-proofs";
const ensuredBuckets = new Set();

export function getPaymentProofBucket() {
  return process.env.SUPABASE_PAYMENT_PROOFS_BUCKET || DEFAULT_BUCKET;
}

function isBucketMissingError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    (message.includes("bucket") && message.includes("not")) ||
    message.includes("does not exist") ||
    message.includes("not found") ||
    message.includes("resource not found")
  );
}

function isBucketAlreadyExistsError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("already exists") || message.includes("duplicate");
}

function normalizeStorageError(error) {
  if (isBucketMissingError(error)) {
    return `No existe el bucket de Supabase Storage "${getPaymentProofBucket()}". Crealo en Storage.`;
  }
  return error?.message || "No se pudo acceder a Supabase Storage.";
}

function ensureServiceClient() {
  if (!hasServiceRoleClient()) {
    throw new Error("Configura SUPABASE_SERVICE_ROLE_KEY para gestionar comprobantes.");
  }
  return getServiceSupabaseClient();
}

async function ensurePaymentProofBucket(service, bucket) {
  if (ensuredBuckets.has(bucket)) return;

  const { error: getBucketError } = await service.storage.getBucket(bucket);
  if (!getBucketError) {
    ensuredBuckets.add(bucket);
    return;
  }

  if (!isBucketMissingError(getBucketError)) {
    throw new Error(normalizeStorageError(getBucketError));
  }

  const { error: createBucketError } = await service.storage.createBucket(bucket, {
    public: false,
  });

  if (createBucketError && !isBucketAlreadyExistsError(createBucketError)) {
    throw new Error(normalizeStorageError(createBucketError));
  }

  ensuredBuckets.add(bucket);
}

export function isSupabaseStorageKey(value) {
  if (!value) return false;
  const normalized = value.toString().trim();
  if (!normalized) return false;
  return !/^https?:\/\//i.test(normalized);
}

export async function uploadPaymentProof({ key, buffer, contentType }) {
  const service = ensureServiceClient();
  const bucket = getPaymentProofBucket();
  await ensurePaymentProofBucket(service, bucket);
  const { error } = await service.storage
    .from(bucket)
    .upload(key, buffer, { contentType: contentType || "application/octet-stream", upsert: false });
  if (error) {
    throw new Error(normalizeStorageError(error));
  }
  return { bucket, key };
}

export async function getSignedPaymentProofUrl(key, expiresIn = 600) {
  const service = ensureServiceClient();
  const bucket = getPaymentProofBucket();
  const { data, error } = await service.storage.from(bucket).createSignedUrl(key, expiresIn);
  if (error || !data?.signedUrl) {
    throw new Error(normalizeStorageError(error));
  }
  return data.signedUrl;
}

export async function deletePaymentProof(key) {
  if (!isSupabaseStorageKey(key)) return;
  const service = ensureServiceClient();
  const bucket = getPaymentProofBucket();
  const { error } = await service.storage.from(bucket).remove([key]);
  if (error && !String(error.message || "").toLowerCase().includes("not found")) {
    throw new Error(normalizeStorageError(error));
  }
}
