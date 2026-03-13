export function buildFlipbookPageMarkup({ page }) {
  const hardPage = page?.flags?.isSyntheticCover || page?.pageIndex === 0;
  const chrome = page?.chrome || null;
  const runtimeMode =
    page?.runtimeMode ||
    (page?.flags?.isPlaceholder ? "placeholder" : "live");
  const chromeMarkup = chrome
    ? `
      <div class="flipbook-page-meta" aria-hidden="true">
        <div class="flipbook-page-meta-line top"></div>
        <div class="flipbook-page-meta-row top">
          <span class="truncate">${chrome.headerLeft || ""}</span>
          <span class="truncate">${chrome.headerRight || ""}</span>
        </div>
        <div class="flipbook-page-meta-line bottom"></div>
        <div class="flipbook-page-meta-row bottom">
          <span>${chrome.footerLeft || ""}</span>
          <span>${chrome.footerRight || ""}</span>
        </div>
      </div>
    `
    : "";
  const contentMarkup =
    runtimeMode === "skeleton"
      ? `
        <div class="flipbook-page-shell flipbook-page-shell-skeleton ${hardPage ? "is-cover-shell" : ""}" aria-hidden="true">
          ${
            hardPage
              ? `
                <div class="flipbook-cover-shell-surface">
                  <div class="flipbook-cover-shell-kicker"></div>
                  <div class="flipbook-cover-shell-title"></div>
                  <div class="flipbook-cover-shell-author"></div>
                </div>
              `
              : `
                <div class="flipbook-page-shell-line short"></div>
                <div class="flipbook-page-shell-line"></div>
                <div class="flipbook-page-shell-line"></div>
                <div class="flipbook-page-shell-line wide"></div>
                <div class="flipbook-page-shell-line"></div>
                <div class="flipbook-page-shell-line medium"></div>
              `
          }
        </div>
      `
      : runtimeMode === "placeholder"
      ? `
        <div class="flipbook-page-shell flipbook-page-shell-placeholder ${hardPage ? "is-cover-shell" : ""}" aria-hidden="true">
          <div class="flipbook-page-shell-loading">
            <span>${hardPage ? "Preparing cover" : "Loading page"}</span>
          </div>
        </div>
      `
      : page?.html || "";
  const sheetClasses = [
    "flipbook-page-sheet",
    chrome ? "has-editorial-chrome" : "",
    hardPage ? "is-cover-page" : "",
    `runtime-${runtimeMode}`,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    density: hardPage ? "hard" : "soft",
    html: `
      <div class="flipbook-runtime-page runtime-${runtimeMode}">
        <div class="${sheetClasses}">
          ${chromeMarkup}
          <div class="flipbook-page-content">${contentMarkup}</div>
        </div>
      </div>
    `,
  };
}
