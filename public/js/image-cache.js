const RESOLVED_URL_CACHE_LIMIT = 24;
const PRELOAD_URL_CACHE_LIMIT = 48;
const CACHE_TTL_MS = 10 * 60 * 1000;

const resolvedUrlCache = new Map();
const preloadedUrlCache = new Map();

function normalizeUrl(value) {
  return String(value || "").trim();
}

function touchEntry(store, key, value, limit) {
  if (!key) {
    return;
  }
  if (store.has(key)) {
    store.delete(key);
  }
  store.set(key, value);
  while (store.size > limit) {
    const oldestKey = store.keys().next().value;
    store.delete(oldestKey);
  }
}

function schedulePreload(url) {
  const target = normalizeUrl(url);
  if (!target || typeof Image === "undefined") {
    return;
  }

  const now = Date.now();
  const existing = preloadedUrlCache.get(target);
  if (existing && existing > now - CACHE_TTL_MS) {
    touchEntry(preloadedUrlCache, target, existing, PRELOAD_URL_CACHE_LIMIT);
    return;
  }

  touchEntry(preloadedUrlCache, target, now, PRELOAD_URL_CACHE_LIMIT);

  const probe = new Image();
  probe.decoding = "async";
  probe.loading = "eager";
  probe.referrerPolicy = "no-referrer";
  probe.onload = function () {
    probe.onload = null;
    probe.onerror = null;
  };
  probe.onerror = function () {
    probe.onload = null;
    probe.onerror = null;
  };
  probe.src = target;
}

export function resolveCachedImageUrl(primaryUrl, rawUrl, fallbackUrl) {
  const primary = normalizeUrl(primaryUrl);
  const fallback = normalizeUrl(fallbackUrl);
  const key = normalizeUrl(rawUrl) || primary || fallback;
  const candidate = primary || fallback;

  if (!candidate) {
    return "";
  }

  const now = Date.now();
  const cached = key ? resolvedUrlCache.get(key) : null;
  if (cached && cached.expiresAt > now) {
    touchEntry(resolvedUrlCache, key, cached, RESOLVED_URL_CACHE_LIMIT);
    schedulePreload(cached.url);
    return cached.url;
  }

  const entry = {
    url: candidate,
    expiresAt: now + CACHE_TTL_MS
  };
  touchEntry(resolvedUrlCache, key, entry, RESOLVED_URL_CACHE_LIMIT);
  schedulePreload(candidate);
  return candidate;
}

function fallbackRoleImage(role) {
  return role && role.name === "梦瑶" ? "/assets/mengyao.jpg" : "";
}

export function resolveRoleCardImage(role) {
  if (!role) {
    return "";
  }
  return resolveCachedImageUrl(
    role.opening_image_url || role.avatar_url,
    role.raw_opening_image_url || role.raw_avatar_url,
    fallbackRoleImage(role)
  );
}

export function resolveRoleAvatarImage(role) {
  if (!role) {
    return "";
  }
  return resolveCachedImageUrl(
    role.avatar_url || role.opening_image_url,
    role.raw_avatar_url || role.raw_opening_image_url,
    fallbackRoleImage(role)
  );
}

export function resolveMessageImageUrl(message, fallbackUrl) {
  if (!message) {
    return normalizeUrl(fallbackUrl);
  }
  return resolveCachedImageUrl(
    message.image_url,
    message.raw_image_url,
    fallbackUrl
  );
}
