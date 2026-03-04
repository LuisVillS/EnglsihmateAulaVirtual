"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { extractYouTubeVideoId, parseListeningTimeValue } from "@/lib/listening-exercise";

const YT_PLAYER_STATES = {
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
};

function clampPlayCount(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, parsed);
}

function loadYouTubeApi(callback) {
  if (typeof window === "undefined") {
    return () => {};
  }

  if (window.YT?.Player) {
    callback();
    return () => {};
  }

  window.__listeningYoutubeCallbacks = window.__listeningYoutubeCallbacks || [];
  window.__listeningYoutubeCallbacks.push(callback);

  if (!window.__listeningYoutubeApiRequested) {
    window.__listeningYoutubeApiRequested = true;
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    document.body.appendChild(script);

    const previousHandler = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousHandler === "function") previousHandler();
      const callbacks = Array.isArray(window.__listeningYoutubeCallbacks)
        ? [...window.__listeningYoutubeCallbacks]
        : [];
      window.__listeningYoutubeCallbacks = [];
      callbacks.forEach((fn) => {
        if (typeof fn === "function") fn();
      });
    };
  }

  return () => {
    window.__listeningYoutubeCallbacks = (window.__listeningYoutubeCallbacks || []).filter(
      (fn) => fn !== callback
    );
  };
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-10 w-10">
      <path
        d="M5 9h4l5-4v14l-5-4H5z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M17 9.5a3.5 3.5 0 0 1 0 5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M18.8 7a7 7 0 0 1 0 10"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

const LISTENING_RING_BLUE = "#3b82f6";
const LISTENING_RING_TRACK = "rgba(59,130,246,0.22)";

export default function ListeningPlaybackControl({
  youtubeUrl = "",
  audioUrl = "",
  maxPlays = 1,
  startTime = 0,
  endTime = null,
  onStatusChange,
}) {
  const normalizedMaxPlays = clampPlayCount(maxPlays);
  const normalizedStartTime = Math.max(0, parseListeningTimeValue(startTime, 0) ?? 0);
  const parsedEndTime = parseListeningTimeValue(endTime, null);
  const normalizedEndTime =
    parsedEndTime != null && parsedEndTime > normalizedStartTime
      ? parsedEndTime
      : null;
  const videoId = extractYouTubeVideoId(youtubeUrl);
  const hasYouTubeSource = Boolean(videoId);
  const hasAudioSource = !hasYouTubeSource && Boolean(String(audioUrl || "").trim());
  const hasSource = hasYouTubeSource || hasAudioSource;

  const [playsUsed, setPlaysUsed] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(() => hasAudioSource);
  const [helperText, setHelperText] = useState("");
  const [playbackCurrentTime, setPlaybackCurrentTime] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);

  const audioRef = useRef(null);
  const youtubeHostRef = useRef(null);
  const youtubePlayerRef = useRef(null);
  const isPlayingRef = useRef(false);
  const stopTimerRef = useRef(null);
  const progressTimerRef = useRef(null);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => () => {
    if (stopTimerRef.current) {
      window.clearInterval(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!hasYouTubeSource || !youtubeHostRef.current) {
      if (youtubePlayerRef.current?.destroy) {
        youtubePlayerRef.current.destroy();
      }
      youtubePlayerRef.current = null;
      return undefined;
    }

    const cleanupLoader = loadYouTubeApi(() => {
      if (!youtubeHostRef.current || !window.YT?.Player) return;
      if (youtubePlayerRef.current?.destroy) {
        youtubePlayerRef.current.destroy();
      }

      youtubePlayerRef.current = new window.YT.Player(youtubeHostRef.current, {
        width: "1",
        height: "1",
        videoId,
        playerVars: {
          controls: 0,
          disablekb: 1,
          start: normalizedStartTime || undefined,
          end: normalizedEndTime || undefined,
          fs: 0,
          rel: 0,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            setIsPlayerReady(true);
            const totalDuration = Number(youtubePlayerRef.current?.getDuration?.() ?? 0);
            if (Number.isFinite(totalDuration) && totalDuration > 0) {
              setPlaybackDuration(totalDuration);
            }
          },
          onStateChange: (event) => {
            if (event.data === YT_PLAYER_STATES.PLAYING) {
              setIsPlaying(true);
              setHelperText("");
              return;
            }
            if (event.data === YT_PLAYER_STATES.ENDED) {
              setIsPlaying(false);
              const totalDuration = Number(event.target?.getDuration?.() ?? 0);
              const endValue = normalizedEndTime != null ? normalizedEndTime : totalDuration;
              if (Number.isFinite(endValue) && endValue > 0) {
                setPlaybackCurrentTime(endValue);
              }
              return;
            }
            if (event.data === YT_PLAYER_STATES.PAUSED && isPlayingRef.current) {
              event.target?.playVideo?.();
            }
          },
        },
      });
    });

    return () => {
      cleanupLoader();
      if (stopTimerRef.current) {
        window.clearInterval(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      if (youtubePlayerRef.current?.destroy) {
        youtubePlayerRef.current.destroy();
      }
      youtubePlayerRef.current = null;
    };
  }, [hasYouTubeSource, videoId, normalizedEndTime, normalizedStartTime]);

  useEffect(() => {
    if (!hasYouTubeSource || !isPlaying || !youtubePlayerRef.current) {
      if (stopTimerRef.current) {
        window.clearInterval(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      return undefined;
    }

    progressTimerRef.current = window.setInterval(() => {
      const player = youtubePlayerRef.current;
      if (!player) return;
      const currentTime = Number(player.getCurrentTime?.() ?? 0);
      const totalDuration = Number(player.getDuration?.() ?? 0);
      if (Number.isFinite(currentTime)) {
        setPlaybackCurrentTime(currentTime);
      }
      if (Number.isFinite(totalDuration) && totalDuration > 0) {
        setPlaybackDuration(totalDuration);
      }
    }, 140);

    if (normalizedEndTime != null) {
      stopTimerRef.current = window.setInterval(() => {
        const currentTime = Number(youtubePlayerRef.current?.getCurrentTime?.() ?? 0);
        if (Number.isFinite(currentTime) && currentTime >= normalizedEndTime) {
          youtubePlayerRef.current?.stopVideo?.();
          setIsPlaying(false);
          setPlaybackCurrentTime(normalizedEndTime);
        }
      }, 200);
    }

    return () => {
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      if (stopTimerRef.current) {
        window.clearInterval(stopTimerRef.current);
        stopTimerRef.current = null;
      }
    };
  }, [hasYouTubeSource, isPlaying, normalizedEndTime]);

  useEffect(() => {
    if (typeof onStatusChange !== "function") return;
    onStatusChange({
      isPlaying,
      playsUsed,
      remainingPlays: Math.max(0, normalizedMaxPlays - playsUsed),
      canPlay: hasSource && !isPlaying && playsUsed < normalizedMaxPlays,
    });
  }, [hasSource, isPlaying, normalizedMaxPlays, onStatusChange, playsUsed]);

  async function handlePlay() {
    if (!hasSource || isPlaying || playsUsed >= normalizedMaxPlays) return;

    setHelperText("");

    if (hasAudioSource) {
      const node = audioRef.current;
      if (!node) return;
      try {
        const duration = Number.isFinite(node.duration) ? node.duration : null;
        node.currentTime = duration != null ? Math.min(normalizedStartTime, duration) : normalizedStartTime;
        await node.play();
        setPlaysUsed((current) => current + 1);
        setIsPlaying(true);
        setPlaybackCurrentTime(normalizedStartTime);
      } catch {
        setHelperText("No se pudo reproducir el audio.");
      }
      return;
    }

    if (!youtubePlayerRef.current || !isPlayerReady) {
      setHelperText("El audio de YouTube aun se esta cargando.");
      return;
    }

    setPlaysUsed((current) => current + 1);
    setIsPlaying(true);
    youtubePlayerRef.current.seekTo?.(normalizedStartTime, true);
    youtubePlayerRef.current.playVideo?.();
    setPlaybackCurrentTime(normalizedStartTime);
  }

  const remainingPlays = Math.max(0, normalizedMaxPlays - playsUsed);
  const canPlay = hasSource && !isPlaying && remainingPlays > 0;
  const effectiveEndTime = normalizedEndTime != null
    ? normalizedEndTime
    : (Number.isFinite(playbackDuration) && playbackDuration > 0 ? playbackDuration : 0);
  const effectiveDuration = Math.max(0, effectiveEndTime - normalizedStartTime);
  const elapsed = Math.max(0, playbackCurrentTime - normalizedStartTime);
  const progressRatio = useMemo(() => {
    if (!Number.isFinite(effectiveDuration) || effectiveDuration <= 0) return 0;
    return Math.min(1, Math.max(0, elapsed / effectiveDuration));
  }, [elapsed, effectiveDuration]);
  const ringRadius = 47;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashOffset = ringCircumference * (1 - progressRatio);

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-surface-2 p-4">
      {hasAudioSource ? (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          className="hidden"
          onLoadedMetadata={(event) => {
            const node = event.currentTarget;
            if (Number.isFinite(node.duration) && node.duration > 0) {
              setPlaybackDuration(node.duration);
            }
          }}
          onTimeUpdate={(event) => {
            setPlaybackCurrentTime(event.currentTarget.currentTime || 0);
            if (normalizedEndTime == null) return;
            const node = event.currentTarget;
            if (node.currentTime >= normalizedEndTime) {
              node.pause();
              node.currentTime = normalizedEndTime;
              setIsPlaying(false);
              setPlaybackCurrentTime(normalizedEndTime);
            }
          }}
          onEnded={(event) => {
            setIsPlaying(false);
            const node = event.currentTarget;
            const endValue =
              normalizedEndTime != null
                ? normalizedEndTime
                : (Number.isFinite(node.duration) ? node.duration : 0);
            setPlaybackCurrentTime(endValue);
          }}
        />
      ) : null}

      {hasYouTubeSource ? (
        <div className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden">
          <div ref={youtubeHostRef} />
        </div>
      ) : null}

      <div className="flex flex-col items-center justify-center gap-3 text-center">
        <div className="relative h-28 w-28 sm:h-32 sm:w-32">
          <svg
            viewBox="0 0 100 100"
            className="pointer-events-none absolute -inset-1 z-0 h-[calc(100%+0.5rem)] w-[calc(100%+0.5rem)] -rotate-90"
            aria-hidden="true"
          >
            <circle
              cx="50"
              cy="50"
              r={ringRadius}
              fill="none"
              stroke={LISTENING_RING_TRACK}
              strokeWidth="4"
            />
            <circle
              cx="50"
              cy="50"
              r={ringRadius}
              fill="none"
              stroke={LISTENING_RING_BLUE}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${ringCircumference} ${ringCircumference}`}
              strokeDashoffset={ringDashOffset}
            />
          </svg>
          <button
            type="button"
            onClick={handlePlay}
            disabled={!canPlay}
            className={`relative z-10 inline-flex h-full w-full items-center justify-center rounded-full border-2 transition ${
              canPlay
                ? "border-primary bg-primary text-primary-foreground hover:bg-primary-2"
                : "border-border bg-surface text-muted"
            }`}
            aria-label="Reproducir audio"
          >
            <span className="relative z-10">
              <SpeakerIcon />
            </span>
          </button>
        </div>

        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">
            {isPlaying ? "Reproduciendo..." : remainingPlays > 0 ? "Toca para reproducir" : "Sin reproducciones"}
          </p>
          <p className="text-xs text-muted">
            Usadas: {playsUsed}/{normalizedMaxPlays}
          </p>
          {normalizedStartTime > 0 || normalizedEndTime != null ? (
            <p className="text-xs text-muted">
              Fragmento: desde {normalizedStartTime}s{normalizedEndTime != null ? ` hasta ${normalizedEndTime}s` : " hasta el final"}
            </p>
          ) : null}
          {helperText ? <p className="text-xs font-semibold text-danger">{helperText}</p> : null}
          {!hasSource ? (
            <p className="text-xs text-muted">Agrega un link de YouTube o un audio valido para habilitar la reproduccion.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
