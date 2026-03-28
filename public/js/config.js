export function createConfig() {
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
    apiBase,
    telegramEntryUrl: params.get("tgUrl") || params.get("telegram_url") || runtimeConfig.telegramEntryUrl || "",
    previewUserId: params.get("user_id"),
    previewUserName: params.get("user_name") || params.get("username") || "",
    splitLevel: 2  // 1=不切分 2=按句号切分 3=表情单独切分(TODO)
  };
}
