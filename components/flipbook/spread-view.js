export function resolveSpreadPages(pages = [], currentPageIndex = 0) {
  const left = pages.find((page) => page.pageIndex === currentPageIndex) || null;
  const right = pages.find((page) => page.pageIndex === currentPageIndex + 1) || null;
  return {
    left,
    right,
  };
}
