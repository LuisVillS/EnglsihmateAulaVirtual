export function resolveSinglePage(pages = [], currentPageIndex = 0) {
  return pages.find((page) => page.pageIndex === currentPageIndex) || null;
}
