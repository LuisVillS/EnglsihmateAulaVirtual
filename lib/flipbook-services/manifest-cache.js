import { ensureFlipbookManifest } from "../flipbook-core/manifest-builder.js";

export async function getOrCreateFlipbookManifest(options = {}) {
  return ensureFlipbookManifest(options);
}
