export function createConfig() {
  const tg = window.Telegram && window.Telegram.WebApp;
  const params = new URLSearchParams(window.location.search);
  const runtimeConfig = window.APP_CONFIG || {};
  const defaultApiBase = window.location.origin;
  const apiBase = (
    params.get("apiBase") ||
    params.get("api_base") ||
    runtimeConfig.apiBase ||
    defaultApiBase
  ).replace(/\/$/, "");

  return {
    tg: tg || null,
    apiBase,
    previewUserId: params.get("user_id"),
    splitLevel: 2  // 1=不切分 2=按句号切分 3=表情单独切分(TODO)
  };
}
