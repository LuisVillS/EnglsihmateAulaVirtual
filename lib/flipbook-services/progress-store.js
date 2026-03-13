import { getFlipbookUserState, upsertFlipbookUserState } from "./repository.js";

export async function loadFlipbookProgress(options = {}) {
  return getFlipbookUserState(options);
}

export async function saveFlipbookProgress(options = {}) {
  return upsertFlipbookUserState(options);
}
