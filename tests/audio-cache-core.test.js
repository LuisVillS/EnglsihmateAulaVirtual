import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAudioCacheKeyCore,
  isCachedAudioReusable,
  normalizeSpeechTextCore,
} from "../lib/duolingo/audio-cache-core.js";

test("normalizeSpeechTextCore normalizes case and spaces", () => {
  assert.equal(normalizeSpeechTextCore("  How   ARE you? "), "how are you?");
});

test("buildAudioCacheKeyCore is deterministic for same input", () => {
  const one = buildAudioCacheKeyCore({
    language: "en",
    voiceId: "voice-1",
    modelId: "model-a",
    text: "How are you?",
  });
  const two = buildAudioCacheKeyCore({
    language: "en",
    voiceId: "voice-1",
    modelId: "model-a",
    text: "How are you?",
  });

  assert.equal(one, two);
});

test("buildAudioCacheKeyCore changes when voice changes", () => {
  const one = buildAudioCacheKeyCore({
    language: "en",
    voiceId: "voice-1",
    modelId: "model-a",
    text: "How are you?",
  });
  const two = buildAudioCacheKeyCore({
    language: "en",
    voiceId: "voice-2",
    modelId: "model-a",
    text: "How are you?",
  });

  assert.notEqual(one, two);
});

test("isCachedAudioReusable detects reusable cache row", () => {
  assert.equal(isCachedAudioReusable({ audio_url: "https://cdn.example.com/a.mp3" }), true);
  assert.equal(isCachedAudioReusable({ r2_key: "tts/a.mp3" }), true);
  assert.equal(isCachedAudioReusable({}), false);
});

