import { resolveFlipbookTheme } from "@/lib/flipbook-core/themes";

export function buildFlipbookStageStyle(themeId = "paper-cream") {
  const theme = resolveFlipbookTheme(themeId);
  return {
    backgroundColor: theme.stageBackground,
    backgroundImage: theme.stageSurface,
    "--flipbook-stage-bg": theme.stageBackground,
    "--flipbook-stage-surface": theme.stageSurface,
    "--flipbook-stage-glow": theme.stageGlow,
    "--flipbook-page-bg": theme.pageBackground,
    "--flipbook-page-text": theme.pageText,
    "--flipbook-page-muted": theme.pageMuted,
    "--flipbook-page-border": theme.pageBorder,
    "--flipbook-page-chrome-text": theme.pageChromeText,
    "--flipbook-page-chrome-line": theme.pageChromeLine,
    "--flipbook-toolbar-bg": theme.toolbarBackground,
    "--flipbook-toolbar-border": theme.toolbarBorder,
    "--flipbook-toolbar-text": theme.toolbarText,
    "--flipbook-stage-header-bg": theme.stageHeaderBackground,
    "--flipbook-stage-header-border": theme.stageHeaderBorder,
    "--flipbook-stage-header-text": theme.stageHeaderText,
  };
}
