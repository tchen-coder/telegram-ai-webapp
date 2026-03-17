function resolveTelegramUser(tg) {
  if (!tg) {
    return null;
  }

  if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
    return tg.initDataUnsafe.user;
  }

  if (!tg.initData) {
    return null;
  }

  try {
    const params = new URLSearchParams(tg.initData);
    const rawUser = params.get("user");
    if (!rawUser) {
      return null;
    }
    return JSON.parse(rawUser);
  } catch (_) {
    return null;
  }
}

export function resolveUserId(tg, previewUserId) {
  const user = resolveTelegramUser(tg);
  if (user && user.id) {
    return String(user.id);
  }
  return previewUserId;
}

export function resolveUserProfile(tg) {
  const user = resolveTelegramUser(tg);
  if (user) {
    const firstName = user.first_name || user.firstName || "";
    const lastName = user.last_name || user.lastName || "";
    const displayName = [firstName, lastName].filter(Boolean).join(" ").trim();

    return {
      id: user.id || "",
      username: user.username || "",
      firstName,
      lastName,
      displayName: displayName || firstName || user.username || ""
    };
  }
  return null;
}

export function setupTelegram(tg) {
  if (!tg) {
    return;
  }

  tg.ready();
  tg.expand();
  tg.setHeaderColor("#10182d");
  tg.setBackgroundColor("#07111e");
}

export function closeTelegram(tg) {
  if (tg) {
    tg.close();
  }
}

export function openShareLink(tg) {
  if (tg && typeof tg.openTelegramLink === "function") {
    tg.openTelegramLink("https://t.me/share/url?url=https://t.me/");
    return true;
  }
  return false;
}
