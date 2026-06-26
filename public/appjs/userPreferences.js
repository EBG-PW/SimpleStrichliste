const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];
const DEFAULT_PAGE_SIZE = 20;

function normalizePageSize(value, fallback = DEFAULT_PAGE_SIZE) {
  const pageSize = Number.parseInt(value, 10);
  return PAGE_SIZE_OPTIONS.includes(pageSize) ? pageSize : fallback;
}

function cachePreferredPageSize(value) {
  localStorage.setItem("pageSize", String(normalizePageSize(value)));
}

async function getPreferredPageSize(fallback = DEFAULT_PAGE_SIZE) {
  if (window.sessionCheckPromise) {
    try {
      await window.sessionCheckPromise;
    } catch (error) {
      console.error("Failed to refresh session before reading preferred page size:", error);
    }
  }
  return normalizePageSize(localStorage.getItem("pageSize"), fallback);
}
