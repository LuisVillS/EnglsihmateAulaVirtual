import { cleanText } from "../library/normalization.js";

export const FLIPBOOK_THEME_OPTIONS = [
  {
    id: "paper-cream",
    label: "Paper Cream",
    stageBackground: "#19130d",
    stageSurface:
      "radial-gradient(circle at top, rgba(208, 180, 120, 0.18), transparent 28%), linear-gradient(180deg, #302519 0%, #19130d 100%)",
    stageGlow: "rgba(214, 173, 97, 0.34)",
    pageBackground: "#f3e8d4",
    pageText: "#2d2318",
    pageMuted: "#7b6a56",
    pageBorder: "rgba(94, 71, 44, 0.24)",
    pageChromeText: "rgba(44, 33, 21, 0.64)",
    pageChromeLine: "rgba(82, 61, 35, 0.14)",
    toolbarBackground: "rgba(12, 13, 16, 0.94)",
    toolbarBorder: "rgba(255,255,255,0.10)",
    toolbarText: "#f7f2e8",
    stageHeaderBackground: "rgba(0, 0, 0, 0.24)",
    stageHeaderBorder: "rgba(255,255,255,0.10)",
    stageHeaderText: "rgba(255,255,255,0.88)",
  },
  {
    id: "soft-white",
    label: "Soft White",
    stageBackground: "#0f151c",
    stageSurface:
      "radial-gradient(circle at top, rgba(132, 165, 210, 0.16), transparent 32%), linear-gradient(180deg, #1a2430 0%, #0f151c 100%)",
    stageGlow: "rgba(145, 190, 255, 0.28)",
    pageBackground: "#f7f6f1",
    pageText: "#1c2229",
    pageMuted: "#68737e",
    pageBorder: "rgba(82, 101, 122, 0.18)",
    pageChromeText: "rgba(37, 49, 60, 0.58)",
    pageChromeLine: "rgba(82, 101, 122, 0.14)",
    toolbarBackground: "rgba(13, 18, 24, 0.94)",
    toolbarBorder: "rgba(255,255,255,0.10)",
    toolbarText: "#edf2f7",
    stageHeaderBackground: "rgba(0, 0, 0, 0.24)",
    stageHeaderBorder: "rgba(255,255,255,0.10)",
    stageHeaderText: "rgba(255,255,255,0.88)",
  },
  {
    id: "warm-gray",
    label: "Warm Gray",
    stageBackground: "#141414",
    stageSurface:
      "radial-gradient(circle at top, rgba(198, 198, 182, 0.14), transparent 30%), linear-gradient(180deg, #24231f 0%, #151412 100%)",
    stageGlow: "rgba(217, 207, 178, 0.22)",
    pageBackground: "#efede7",
    pageText: "#24211d",
    pageMuted: "#6d665d",
    pageBorder: "rgba(104, 95, 84, 0.18)",
    pageChromeText: "rgba(56, 50, 44, 0.58)",
    pageChromeLine: "rgba(104, 95, 84, 0.14)",
    toolbarBackground: "rgba(18, 18, 18, 0.94)",
    toolbarBorder: "rgba(255,255,255,0.10)",
    toolbarText: "#f1efe8",
    stageHeaderBackground: "rgba(0, 0, 0, 0.24)",
    stageHeaderBorder: "rgba(255,255,255,0.10)",
    stageHeaderText: "rgba(255,255,255,0.88)",
  },
  {
    id: "dark-sepia",
    label: "Dark Sepia",
    stageBackground: "#110d0b",
    stageSurface:
      "radial-gradient(circle at top, rgba(176, 129, 79, 0.16), transparent 28%), linear-gradient(180deg, #241913 0%, #110d0b 100%)",
    stageGlow: "rgba(191, 144, 88, 0.24)",
    pageBackground: "#d9c3a5",
    pageText: "#281b12",
    pageMuted: "#6c5541",
    pageBorder: "rgba(88, 60, 34, 0.24)",
    pageChromeText: "rgba(44, 29, 19, 0.62)",
    pageChromeLine: "rgba(88, 60, 34, 0.15)",
    toolbarBackground: "rgba(17, 13, 10, 0.94)",
    toolbarBorder: "rgba(255,255,255,0.10)",
    toolbarText: "#f6efe5",
    stageHeaderBackground: "rgba(0, 0, 0, 0.24)",
    stageHeaderBorder: "rgba(255,255,255,0.10)",
    stageHeaderText: "rgba(255,255,255,0.88)",
  },
];

const THEME_MAP = new Map(FLIPBOOK_THEME_OPTIONS.map((theme) => [theme.id, theme]));

export function resolveFlipbookTheme(themeId = "") {
  return THEME_MAP.get(cleanText(themeId).toLowerCase()) || FLIPBOOK_THEME_OPTIONS[0];
}
