const GUEST_USER_ID_KEY = "telegram-ai-webapp.guest-user-id";
const GUEST_PROFILE_KEY = "telegram-ai-webapp.guest-profile";

function readTelegramUser(tg) {
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
    return rawUser ? JSON.parse(rawUser) : null;
  } catch (_) {
    return null;
  }
}

function createGuestId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return "web-" + window.crypto.randomUUID();
  }
  return "web-" + String(Date.now()) + "-" + String(Math.random()).slice(2, 10);
}

function resolvePlatform(tg) {
  if (tg) {
    return "telegram";
  }

  const isCoarsePointer = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  const narrowViewport = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
  return isCoarsePointer || narrowViewport ? "mobile-web" : "desktop-web";
}

function getPlatformLabel(platform) {
  if (platform === "telegram") {
    return "Telegram Mini App";
  }
  if (platform === "mobile-web") {
    return "移动网页";
  }
  return "桌面网页";
}

function resolveThemeParams(tg) {
  const theme = (tg && tg.themeParams) || {};
  return {
    bg: theme.bg_color || "#07111e",
    secondaryBg: theme.secondary_bg_color || "#13304b",
    text: theme.text_color || "#f4f7fb",
    hint: theme.hint_color || "#a8bad0",
    button: theme.button_color || "#1fc6a6",
    buttonText: theme.button_text_color || "#07111e"
  };
}

function applyRootAttributes(platform, theme) {
  document.documentElement.dataset.platform = platform;
  document.documentElement.style.setProperty("--tg-bg", theme.bg);
  document.documentElement.style.setProperty("--tg-secondary-bg", theme.secondaryBg);
  document.documentElement.style.setProperty("--tg-text", theme.text);
  document.documentElement.style.setProperty("--tg-hint", theme.hint);
  document.documentElement.style.setProperty("--tg-button", theme.button);
  document.documentElement.style.setProperty("--tg-button-text", theme.buttonText);
}

function buildGuestProfile(existingId, existingProfile, fallbackName) {
  const guestId = existingId || createGuestId();
  const shortId = guestId.replace(/^web-/, "").slice(0, 8);
  return {
    id: guestId,
    username: "",
    firstName: fallbackName || "访客",
    lastName: "",
    displayName: fallbackName || "网页访客 " + shortId,
    isGuest: true,
    source: "guest",
    sourceLabel: "网页访客",
    storedProfile: existingProfile || null
  };
}

function readStoredGuestProfile() {
  try {
    const existingId = window.localStorage.getItem(GUEST_USER_ID_KEY);
    const rawProfile = window.localStorage.getItem(GUEST_PROFILE_KEY);
    const existingProfile = rawProfile ? JSON.parse(rawProfile) : null;

    if (existingId && existingProfile && existingProfile.id === existingId) {
      return Object.assign(
        {},
        buildGuestProfile(existingId, existingProfile, existingProfile.displayName || existingProfile.firstName),
        existingProfile
      );
    }

    return buildGuestProfile(existingId, existingProfile, "");
  } catch (_) {
    return buildGuestProfile("", null, "");
  }
}

function persistGuestProfile(profile) {
  try {
    window.localStorage.setItem(GUEST_USER_ID_KEY, profile.id);
    window.localStorage.setItem(GUEST_PROFILE_KEY, JSON.stringify(profile));
  } catch (_) {
    return;
  }
}

function buildTelegramProfile(user) {
  if (!user) {
    return null;
  }

  const firstName = user.first_name || user.firstName || "";
  const lastName = user.last_name || user.lastName || "";
  const displayName = [firstName, lastName].filter(Boolean).join(" ").trim();

  return {
    id: user.id ? String(user.id) : "",
    username: user.username || "",
    firstName,
    lastName,
    displayName: displayName || firstName || user.username || "Telegram 用户",
    isGuest: false,
    source: "telegram",
    sourceLabel: "Telegram 用户"
  };
}

function buildPreviewProfile(previewUserId, previewUserName) {
  if (!previewUserId) {
    return null;
  }

  return {
    id: String(previewUserId),
    username: "",
    firstName: previewUserName || "预览用户",
    lastName: "",
    displayName: previewUserName || "预览用户 " + String(previewUserId),
    isGuest: false,
    source: "preview",
    sourceLabel: "预览身份"
  };
}

function finalizeProfile(profile, platform, supportsTelegramPush) {
  return Object.assign({}, profile, {
    platform,
    platformLabel: getPlatformLabel(platform),
    supportsTelegramPush
  });
}

export function createRuntime(options) {
  const settings = options || {};
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  const platform = resolvePlatform(tg);
  const theme = resolveThemeParams(tg);
  const telegramProfile = buildTelegramProfile(readTelegramUser(tg));
  let mutableProfile = finalizeProfile(
    telegramProfile
      || buildPreviewProfile(settings.previewUserId, settings.previewUserName)
      || readStoredGuestProfile(),
    platform,
    Boolean(tg)
  );

  function setup() {
    applyRootAttributes(platform, theme);

    if (!tg) {
      return;
    }

    tg.ready();
    tg.expand();
    if (typeof tg.setHeaderColor === "function") {
      tg.setHeaderColor(theme.secondaryBg);
    }
    if (typeof tg.setBackgroundColor === "function") {
      tg.setBackgroundColor(theme.bg);
    }
  }

  function updateGuestProfile(nextDisplayName) {
    if (mutableProfile.source === "telegram") {
      return mutableProfile;
    }

    const normalizedName = String(nextDisplayName || "").trim();
    if (!normalizedName) {
      return mutableProfile;
    }

    mutableProfile = finalizeProfile(
      Object.assign({}, mutableProfile, {
        firstName: normalizedName,
        displayName: normalizedName,
        isGuest: mutableProfile.source !== "preview"
      }),
      platform,
      false
    );

    if (mutableProfile.source === "guest") {
      persistGuestProfile(mutableProfile);
    }
    return mutableProfile;
  }

  function resetGuestProfile() {
    if (mutableProfile.source !== "guest") {
      return mutableProfile;
    }

    try {
      window.localStorage.removeItem(GUEST_USER_ID_KEY);
      window.localStorage.removeItem(GUEST_PROFILE_KEY);
    } catch (_) {
      return mutableProfile;
    }

    mutableProfile = finalizeProfile(readStoredGuestProfile(), platform, false);
    persistGuestProfile(mutableProfile);
    return mutableProfile;
  }

  return {
    tg,
    platform,
    theme,
    isTelegram: platform === "telegram",
    isMobileWeb: platform === "mobile-web",
    isDesktopWeb: platform === "desktop-web",
    supportsTelegramPush: Boolean(tg),
    getUserProfile() {
      return Object.assign({}, mutableProfile);
    },
    setup,
    updateGuestProfile,
    resetGuestProfile,
    close() {
      if (tg && typeof tg.close === "function") {
        tg.close();
      }
    },
    openShareLink() {
      if (tg && typeof tg.openTelegramLink === "function") {
        tg.openTelegramLink("https://t.me/share/url?url=https://t.me/");
        return true;
      }
      return false;
    }
  };
}
