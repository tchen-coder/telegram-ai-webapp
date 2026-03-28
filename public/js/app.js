import { createApiClient } from "./api.js";
import { createConfig } from "./config.js";
import { getDomRefs } from "./dom.js";
import { createRuntime } from "./runtime.js";
import { createState } from "./state.js";
import { createChatView } from "./views/chat-view.js";
import { createLayoutView } from "./views/layout.js";
import { createRoleListView } from "./views/role-list.js";
import { resolveRoleCardImage } from "./image-cache.js";
import { escapeHtml, sleep, splitForStreaming } from "./utils.js";

const ROLE_PAGE_SIZE = 10;
const MY_ROLE_PAGE_SIZE = 10;
const INITIAL_CONVERSATION_MESSAGE_LIMIT = 4;
const HISTORY_CONVERSATION_MESSAGE_LIMIT = 10;

const config = createConfig();
const runtime = createRuntime({
  previewUserId: config.previewUserId,
  previewUserName: config.previewUserName
});
const dom = getDomRefs();
const state = createState();
const api = createApiClient(config.apiBase);
const layoutView = createLayoutView(dom);
const chatView = createChatView(dom);
let chatHistoryObserver = null;

const roleListView = createRoleListView(dom, {
  onEnterRole: openRoleDetail,
  previewLimit: 20
});
const chatRoleListView = createRoleListView(
  { roleGrid: dom.chatRoleGrid },
  {
    onEnterRole: function (role) {
      openRoleDetail(role, "chat");
    },
    onDeleteRole: deleteRoleConversation,
    previewLimit: 30,
    preferLatestReply: true,
    emptyText: "还没有聊过的角色。先去主页选一个开始聊天。"
  }
);

function fuzzyMatchRole(role, keyword) {
  const normalized = String(keyword || "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  const haystack = [
    role.name,
    role.description,
    role.latest_reply,
    ...(Array.isArray(role.tags) ? role.tags : [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(normalized);
}

function getOutboundSenderName() {
  if (state.userProfile.username) {
    return "@" + state.userProfile.username;
  }
  if (state.userProfile.displayName) {
    return state.userProfile.displayName;
  }
  if (state.userProfile.firstName) {
    return state.userProfile.firstName;
  }
  return "用户";
}

function resizeComposer() {
  if (!dom.chatInput) {
    return;
  }
  dom.chatInput.style.height = "0px";
  dom.chatInput.style.height = Math.min(dom.chatInput.scrollHeight, 96) + "px";
}

function syncViewportHeight() {
  if (!dom.appShell) {
    return;
  }
  const viewport = window.visualViewport;
  const nextHeight = Math.round(viewport ? viewport.height : window.innerHeight);
  dom.appShell.style.setProperty("--app-height", String(nextHeight) + "px");
}

function syncKeyboardInset() {
  if (!dom.appShell || !dom.chatComposer) {
    return;
  }

  syncViewportHeight();

  const viewport = window.visualViewport;
  const composerHeight = Math.ceil(dom.chatComposer.getBoundingClientRect().height || 64);
  const safeBottom = 10;
  let composerBottom = safeBottom;
  let keyboardLikelyOpen = false;

  if (viewport) {
    const keyboardHeight = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
    keyboardLikelyOpen = document.activeElement === dom.chatInput && keyboardHeight > 120;
    composerBottom = safeBottom + keyboardHeight;
  }

  dom.appShell.style.setProperty("--composer-space", String(composerHeight + 22) + "px");
  dom.appShell.style.setProperty("--composer-bottom", String(composerBottom) + "px");
  dom.appShell.classList.toggle("keyboard-open", keyboardLikelyOpen);
  dom.appShell.classList.toggle("chat-view-active", Boolean(state.activeRole));

  if (keyboardLikelyOpen && dom.chatMessages) {
    window.requestAnimationFrame(function () {
      dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
      dom.chatInput.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }
}

function syncChatRoleLatestReply(content) {
  if (!state.activeRole || !content) {
    return;
  }

  const nextReply = String(content).trim();
  if (!nextReply) {
    return;
  }

  state.chatRoles = (state.chatRoles || []).map(function (role) {
    if (role.id !== state.activeRole.id) {
      return role;
    }
    return Object.assign({}, role, { latest_reply: nextReply });
  });
  state.roles = (state.roles || []).map(function (role) {
    if (role.id !== state.activeRole.id) {
      return role;
    }
    return Object.assign({}, role, { latest_reply: nextReply });
  });
}

function getRoleById(roleId) {
  return state.roles.find(function (role) {
    return role.id === roleId;
  }) || state.chatRoles.find(function (role) {
    return role.id === roleId;
  }) || null;
}

function getMessageIdentity(message, index) {
  if (message && message.id != null) {
    return "id:" + String(message.id);
  }
  return [
    "idx:" + String(index),
    message && message.group_seq != null ? "group:" + String(message.group_seq) : "group:none",
    message && message.message_type ? String(message.message_type) : "",
    message && message.content ? String(message.content) : "",
    message && message.timestamp != null ? String(message.timestamp) : ""
  ].join("|");
}

function mergeMessages(messages) {
  const merged = [];
  const seen = new Set();
  (Array.isArray(messages) ? messages : []).forEach(function (message, index) {
    const key = getMessageIdentity(message, index);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    merged.push(message);
  });
  return merged;
}

function renderRoles() {
  const filteredRoles = state.roles.filter(function (role) {
    return fuzzyMatchRole(role, state.homeSearch);
  });

  if (!state.roles.length) {
    layoutView.setStatus("当前没有可用角色。", true);
    if (dom.roleGrid) {
      dom.roleGrid.innerHTML = "";
    }
    return;
  }

  roleListView.render(filteredRoles, state.switchingRoleId, state.deletingRoleId);
  if (!filteredRoles.length) {
    layoutView.setStatus("没有找到匹配的角色。", false);
    return;
  }

  layoutView.setStatus("", false);
}

function renderChatRoles() {
  if (!dom.chatRoleGrid) {
    return;
  }
  const filteredRoles = state.chatRoles.filter(function (role) {
    return fuzzyMatchRole(role, state.chatSearch);
  });
  chatRoleListView.render(filteredRoles, state.switchingRoleId, state.deletingRoleId);
}

function renderConversation(options) {
  chatView.renderMessages(state.messages, state.activeRole || null, options);

  if (dom.backButton) {
    dom.backButton.classList.toggle("hidden", !state.activeRole);
  }
  if (dom.appShell) {
    dom.appShell.classList.toggle("chat-view-active", Boolean(state.activeRole));
  }
  layoutView.setBottomNavVisible(!state.activeRole);
  if (dom.chatRoleGrid) {
    dom.chatRoleGrid.classList.toggle("hidden", Boolean(state.activeRole));
  }
  if (dom.chatSearchPanel) {
    dom.chatSearchPanel.classList.toggle("hidden", Boolean(state.activeRole));
  }
  if (dom.chatMessages) {
    dom.chatMessages.classList.toggle("hidden", !state.activeRole);
  }
  if (dom.chatRolePanel) {
    dom.chatRolePanel.classList.add("hidden");
  }
  if (dom.chatComposer) {
    dom.chatComposer.classList.toggle("hidden", !state.activeRole);
  }
  if (dom.chatInput) {
    dom.chatInput.disabled = !state.activeRole || Boolean(state.isSending);
  }
  if (dom.sendButton) {
    dom.sendButton.disabled = !state.activeRole || Boolean(state.isSending);
  }
  window.requestAnimationFrame(function () {
    observeChatHistoryTopSentinel();
    bindChatHistoryLoadMoreButton();
    syncChatHistoryLoadMoreButton();
    maybeAutoLoadOlderConversation();
  });
  syncKeyboardInset();
}

function renderRoleDetail() {
  const role = state.previewRole;
  if (!role) {
    return;
  }
  if (dom.roleDetailImage) {
    dom.roleDetailImage.src = resolveRoleCardImage(role) || "";
    dom.roleDetailImage.alt = role.name || "角色图片";
  }
  if (dom.roleDetailName) {
    dom.roleDetailName.textContent = role.name || role.role_name || "角色";
  }
  if (dom.roleDetailTags) {
    const tags = Array.isArray(role.tags) ? role.tags.filter(Boolean) : [];
    dom.roleDetailTags.innerHTML = tags.map(function (tag) {
      return '<span class="role-tag">' + escapeHtml(tag) + "</span>";
    }).join("");
    dom.roleDetailTags.classList.toggle("hidden", !tags.length);
  }
  if (dom.roleDetailDescription) {
    dom.roleDetailDescription.textContent = role.description || "暂无角色描述。";
  }
  if (dom.roleDetailOpening) {
    dom.roleDetailOpening.textContent = role.greeting_message || "点击进入聊天后开始互动。";
  }
}

function renderProfile() {
  if (dom.profileName) {
    dom.profileName.textContent = state.userProfile.displayName
      || state.userProfile.firstName
      || (state.userProfile.username ? "@" + state.userProfile.username : "用户");
  }
  if (dom.profileUsername) {
    dom.profileUsername.textContent = state.userProfile.username
      ? "@" + state.userProfile.username
      : "未设置用户名";
  }
}

function resetConversationPagination(roleId) {
  state.conversationPagination = {
    hasMore: false,
    nextBeforeGroupSeq: null,
    isLoadingHistory: false,
    activeRoleId: roleId || null
  };
}

async function loadRoles(options) {
  const settings = Object.assign({ append: false }, options || {});
  if (!state.userId) {
    layoutView.setStatus("当前缺少用户身份。请从 Telegram 小程序打开，或在预览时追加 ?user_id=你的TelegramID。", true);
    return;
  }
  if (state.rolesPagination.isLoading) {
    return;
  }
  if (settings.append && !state.rolesPagination.hasMore) {
    return;
  }

  state.rolesPagination.isLoading = true;
  const nextPage = settings.append ? state.rolesPagination.page + 1 : 1;

  try {
    layoutView.setStatus("", false);
    const payload = await api.listRoles(state.userId, {
      page: nextPage,
      pageSize: state.rolesPagination.pageSize || ROLE_PAGE_SIZE
    });
    const nextRoles = payload.data.roles || [];
    state.roles = settings.append ? state.roles.concat(nextRoles) : nextRoles;
    state.currentRoleId = payload.data.current_role_id || null;

    const pagination = payload.data.pagination || {};
    state.rolesPagination.page = Number(pagination.page) || nextPage;
    state.rolesPagination.pageSize = Number(pagination.page_size) || ROLE_PAGE_SIZE;
    state.rolesPagination.hasMore = Boolean(pagination.has_more);
    renderRoles();
  } finally {
    state.rolesPagination.isLoading = false;
  }
}

async function loadMyRoles(options) {
  const settings = Object.assign({ append: false }, options || {});
  if (!state.userId) {
    return;
  }
  if (state.chatRolesPagination.isLoading) {
    return;
  }
  if (settings.append && !state.chatRolesPagination.hasMore) {
    return;
  }

  state.chatRolesPagination.isLoading = true;
  const nextPage = settings.append ? state.chatRolesPagination.page + 1 : 1;

  try {
    const payload = await api.listMyRoles(state.userId, {
      page: nextPage,
      pageSize: state.chatRolesPagination.pageSize || MY_ROLE_PAGE_SIZE
    });
    const nextRoles = payload.data.roles || [];
    state.chatRoles = settings.append ? state.chatRoles.concat(nextRoles) : nextRoles;

    const pagination = payload.data.pagination || {};
    state.chatRolesPagination.page = Number(pagination.page) || nextPage;
    state.chatRolesPagination.pageSize = Number(pagination.page_size) || MY_ROLE_PAGE_SIZE;
    state.chatRolesPagination.hasMore = Boolean(pagination.has_more);
    renderChatRoles();
  } finally {
    state.chatRolesPagination.isLoading = false;
  }
}

async function loadConversation(role, options) {
  const settings = Object.assign(
    {
      append: false,
      beforeGroupSeq: null,
      limit: INITIAL_CONVERSATION_MESSAGE_LIMIT,
      preserveScrollTop: 0,
      preserveScrollHeight: 0
    },
    options || {}
  );

  try {
    const payload = await api.getConversation(state.userId, role.id, {
      beforeGroupSeq: settings.beforeGroupSeq,
      limit: settings.limit
    });
    const nextRole = payload.data.role || role;
    const incomingMessages = payload.data.messages || [];
    const pagination = payload.data.pagination || {};

    state.activeRole = nextRole;
    state.previewRole = nextRole;
    state.conversationPagination.activeRoleId = nextRole.id;
    state.conversationPagination.hasMore = Boolean(pagination.has_more);
    state.conversationPagination.nextBeforeGroupSeq = pagination.next_before_group_seq != null
      ? pagination.next_before_group_seq
      : null;

    if (settings.append) {
      state.messages = mergeMessages(incomingMessages.concat(state.messages));
    } else {
      state.messages = mergeMessages(incomingMessages);
    }

    layoutView.setView("chat");
    renderConversation(
      settings.append
        ? {
            scrollMode: "preserve",
            previousScrollTop: settings.preserveScrollTop,
            previousScrollHeight: settings.preserveScrollHeight
          }
        : { scrollMode: "latest" }
    );
    layoutView.setChatStatus("", false);
    window.setTimeout(maybeAutoLoadOlderConversation, 0);
  } catch (error) {
    layoutView.setChatStatus(error.message || "聊天记录加载失败", true);
  } finally {
    state.conversationPagination.isLoadingHistory = false;
  }
}

async function loadOlderConversation() {
  if (!state.activeRole) {
    return;
  }
  if (state.conversationPagination.isLoadingHistory || !state.conversationPagination.hasMore) {
    return;
  }
  if (state.conversationPagination.activeRoleId !== state.activeRole.id) {
    return;
  }

  state.conversationPagination.isLoadingHistory = true;
  syncChatHistoryLoadMoreButton();
  const previousScrollTop = dom.chatMessages ? dom.chatMessages.scrollTop : 0;
  const previousScrollHeight = dom.chatMessages ? dom.chatMessages.scrollHeight : 0;

  try {
    await loadConversation(state.activeRole, {
      append: true,
      beforeGroupSeq: state.conversationPagination.nextBeforeGroupSeq,
      limit: HISTORY_CONVERSATION_MESSAGE_LIMIT,
      preserveScrollTop: previousScrollTop,
      preserveScrollHeight: previousScrollHeight
    });
  } catch (error) {
    state.conversationPagination.isLoadingHistory = false;
    syncChatHistoryLoadMoreButton();
    throw error;
  }
}

function maybeAutoLoadOlderConversation() {
  if (!dom.chatMessages || !state.activeRole) {
    return;
  }
  if (state.conversationPagination.isLoadingHistory || !state.conversationPagination.hasMore) {
    return;
  }
  if (state.conversationPagination.activeRoleId !== state.activeRole.id) {
    return;
  }
  if (dom.chatMessages.scrollHeight > dom.chatMessages.clientHeight + 24) {
    return;
  }
  loadOlderConversation().catch(function () {});
}

function observeChatHistoryTopSentinel() {
  if (!dom.chatMessages || !chatView.topSentinelId) {
    return;
  }

  if (!("IntersectionObserver" in window)) {
    return;
  }

  if (!chatHistoryObserver) {
    chatHistoryObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) {
          return;
        }
        if (!state.activeRole || state.isSending) {
          return;
        }
        loadOlderConversation().catch(function () {});
      });
    }, {
      root: dom.chatMessages,
      rootMargin: "120px 0px 0px 0px",
      threshold: 0
    });
  }

  chatHistoryObserver.disconnect();
  const sentinel = document.getElementById(chatView.topSentinelId);
  if (sentinel) {
    chatHistoryObserver.observe(sentinel);
  }
}

function bindChatHistoryLoadMoreButton() {
  if (!chatView.loadMoreButtonId) {
    return;
  }
  const button = document.getElementById(chatView.loadMoreButtonId);
  if (!button || button.dataset.bound === "1") {
    return;
  }
  button.dataset.bound = "1";
  button.addEventListener("click", function () {
    loadOlderConversation().catch(function () {});
  });
}

function syncChatHistoryLoadMoreButton() {
  if (!chatView.loadMoreButtonId) {
    return;
  }
  const button = document.getElementById(chatView.loadMoreButtonId);
  if (!button) {
    return;
  }
  const shouldShow = Boolean(state.activeRole && state.conversationPagination.hasMore);
  button.classList.toggle("hidden", !shouldShow);
  button.disabled = Boolean(state.conversationPagination.isLoadingHistory);
  button.textContent = state.conversationPagination.isLoadingHistory ? "加载中..." : "加载更早消息";
}

function openRoleDetail(role, source) {
  state.previewRole = role;
  state.previewSource = source || "home";
  renderRoleDetail();
  layoutView.setBottomNavVisible(false);
  layoutView.setView("roleDetail");
}

function returnFromRoleDetail() {
  const nextView = state.previewSource === "chat" ? "chat" : "home";
  state.previewRole = null;
  state.previewSource = "home";
  layoutView.setBottomNavVisible(true);
  layoutView.setView(nextView);

  if (nextView === "chat") {
    state.activeRole = null;
    state.messages = [];
    resetConversationPagination(null);
    renderConversation({ scrollMode: "latest" });
    loadMyRoles({ append: false }).catch(function () {
      if (dom.chatRoleGrid) {
        dom.chatRoleGrid.innerHTML = "";
      }
    });
  }
}

async function enterRole(role) {
  if (state.switchingRoleId) {
    return;
  }

  state.previewRole = null;
  state.previewSource = "home";

  if (role.is_current) {
    resetConversationPagination(role.id);
    await loadConversation(role, { limit: INITIAL_CONVERSATION_MESSAGE_LIMIT });
    return;
  }

  state.switchingRoleId = role.id;
  renderRoles();
  renderChatRoles();

  try {
    const payload = await api.selectRole(state.userId, role.id, {
      pushToTelegram: runtime.supportsTelegramPush
    });
    await loadRoles({ append: false });
    await loadMyRoles({ append: false });
    const nextRole = getRoleById(role.id) || payload.data.role || role;
    resetConversationPagination(nextRole.id);
    await loadConversation(nextRole, { limit: INITIAL_CONVERSATION_MESSAGE_LIMIT });
  } catch (error) {
    layoutView.setStatus(error.message || "角色切换失败", true);
  } finally {
    state.switchingRoleId = null;
    renderRoles();
    renderChatRoles();
  }
}

async function deleteRoleConversation(role) {
  if (!role || state.deletingRoleId) {
    return;
  }

  const confirmed = window.confirm("删除和这个角色的聊天记录后，下次会重新开始。确认删除吗？");
  if (!confirmed) {
    return;
  }

  state.deletingRoleId = role.id;
  renderChatRoles();

  try {
    await api.deleteMyRole(state.userId, role.id);
    if (state.activeRole && state.activeRole.id === role.id) {
      state.activeRole = null;
      state.messages = [];
      resetConversationPagination(null);
      layoutView.setView("chat");
      renderConversation({ scrollMode: "latest" });
    }
    await loadRoles({ append: false });
    await loadMyRoles({ append: false });
    layoutView.setStatus("角色聊天记录已删除。", false);
    layoutView.setChatStatus("", false);
  } catch (error) {
    layoutView.setChatStatus(error.message || "删除失败", true);
  } finally {
    state.deletingRoleId = null;
    renderChatRoles();
  }
}

async function handleSendMessage() {
  if (state.isSending || !state.activeRole) {
    return;
  }

  const content = dom.chatInput.value.trim();
  if (!content) {
    layoutView.setComposerNote("请输入消息内容。", true);
    return;
  }

  state.isSending = true;
  layoutView.setSending(true);
  layoutView.setComposerNote("正在生成回复...", false);
  layoutView.setChatStatus("", false);

  const pendingUserMessage = {
    message_type: "user",
    content
  };
  const pendingTypingMessage = {
    message_type: "assistant_typing",
    content: ""
  };
  state.messages = state.messages.concat([pendingUserMessage, pendingTypingMessage]);
  renderConversation({ scrollMode: "latest" });
  dom.chatInput.value = "";
  resizeComposer();

  try {
    const payload = await api.sendMessage(
      state.userId,
      state.activeRole.id,
      content,
      getOutboundSenderName()
    );
    state.activeRole = payload.data.role || state.activeRole;
    const confirmedUserMessage = payload.data.user_message || pendingUserMessage;
    const assistantMessages = Array.isArray(payload.data.assistant_messages) && payload.data.assistant_messages.length
      ? payload.data.assistant_messages
      : [payload.data.assistant_message].filter(Boolean);

    state.messages = state.messages.slice(0, -2).concat([confirmedUserMessage]);
    renderConversation({ scrollMode: "latest" });

    for (let i = 0; i < assistantMessages.length; i += 1) {
      const assistantMessage = assistantMessages[i];
      const splitLevel = config.splitLevel || 2;
      const segments = splitForStreaming(assistantMessage.content || "", 60, splitLevel);
      const renderedSegments = segments.length ? segments : [assistantMessage.content || ""];

      for (let j = 0; j < renderedSegments.length; j += 1) {
        const segment = renderedSegments[j];
        const streamingMessage = Object.assign({}, assistantMessage, {
          message_type: "assistant_streaming",
          content: ""
        });

        state.messages = state.messages.concat([streamingMessage]);
        renderConversation({ scrollMode: "latest" });

        for (const char of segment) {
          streamingMessage.content += char;
          state.messages = state.messages.slice(0, -1).concat([Object.assign({}, streamingMessage)]);
          renderConversation({ scrollMode: "latest" });
          await sleep(/[，。！？、；：,.!?;:]/.test(char) ? 120 : 36);
        }

        state.messages = state.messages.slice(0, -1).concat([
          Object.assign({}, assistantMessage, { content: segment })
        ]);
        renderConversation({ scrollMode: "latest" });

        if (j < renderedSegments.length - 1 || i < assistantMessages.length - 1) {
          state.messages = state.messages.concat([
            {
              message_type: "assistant_typing",
              content: "",
              group_seq: assistantMessage.group_seq
            }
          ]);
          renderConversation({ scrollMode: "latest" });
          await sleep(420);
          state.messages = state.messages.slice(0, -1);
        }
      }
    }

    const latestAssistantMessage = assistantMessages[assistantMessages.length - 1];
    syncChatRoleLatestReply(latestAssistantMessage && latestAssistantMessage.content);
    renderChatRoles();
    renderRoles();
    await loadMyRoles({ append: false });
    layoutView.setChatStatus("", false);
    layoutView.setComposerNote("消息会直接通过 WebApp 调用后端生成回复。", false);
  } catch (error) {
    state.messages = state.messages.slice(0, -2);
    renderConversation({ scrollMode: "latest" });
    dom.chatInput.value = content;
    resizeComposer();
    layoutView.setChatStatus(error.message || "消息发送失败", true);
    layoutView.setComposerNote(error.message || "消息发送失败", true);
  } finally {
    state.isSending = false;
    layoutView.setSending(false);
  }
}

function maybeLoadMoreHomeRoles() {
  if (!dom.homeView || !dom.homeView.classList.contains("is-active")) {
    return;
  }
  if (state.rolesPagination.isLoading || !state.rolesPagination.hasMore) {
    return;
  }
  const threshold = 160;
  if (dom.homeView.scrollTop + dom.homeView.clientHeight + threshold < dom.homeView.scrollHeight) {
    return;
  }
  loadRoles({ append: true }).catch(function () {});
}

function maybeLoadMoreChatRoles() {
  if (!dom.chatRoleGrid || dom.chatRoleGrid.classList.contains("hidden")) {
    return;
  }
  if (state.chatRolesPagination.isLoading || !state.chatRolesPagination.hasMore) {
    return;
  }
  const threshold = 120;
  if (dom.chatRoleGrid.scrollTop + dom.chatRoleGrid.clientHeight + threshold < dom.chatRoleGrid.scrollHeight) {
    return;
  }
  loadMyRoles({ append: true }).catch(function () {});
}

function bindEvents() {
  if (dom.backButton) {
    dom.backButton.addEventListener("click", function () {
      if (state.activeRole) {
        const currentRole = state.activeRole;
        state.activeRole = null;
        state.messages = [];
        resetConversationPagination(null);
        openRoleDetail(currentRole, "chat");
        return;
      }
      if (state.previewRole) {
        returnFromRoleDetail();
        return;
      }
      layoutView.setBottomNavVisible(true);
      layoutView.setView("home");
    });
  }

  if (dom.roleDetailBackButton) {
    dom.roleDetailBackButton.addEventListener("click", function () {
      returnFromRoleDetail();
    });
  }

  if (dom.roleDetailEnterButton) {
    dom.roleDetailEnterButton.addEventListener("click", function () {
      if (!state.previewRole) {
        return;
      }
      enterRole(state.previewRole);
    });
  }

  if (dom.sendButton) {
    dom.sendButton.addEventListener("click", handleSendMessage);
  }

  if (dom.chatInput) {
    dom.chatInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSendMessage();
      }
    });
    dom.chatInput.addEventListener("input", function () {
      resizeComposer();
      syncKeyboardInset();
    });
    dom.chatInput.addEventListener("focus", function () {
      syncViewportHeight();
      syncKeyboardInset();
      window.setTimeout(syncKeyboardInset, 180);
      window.setTimeout(syncKeyboardInset, 360);
    });
    dom.chatInput.addEventListener("blur", function () {
      window.setTimeout(syncKeyboardInset, 80);
      window.setTimeout(syncViewportHeight, 120);
    });
  }

  if (dom.homeView) {
    dom.homeView.addEventListener("scroll", maybeLoadMoreHomeRoles, { passive: true });
  }

  if (dom.chatRoleGrid) {
    dom.chatRoleGrid.addEventListener("scroll", maybeLoadMoreChatRoles, { passive: true });
  }

  if (dom.chatMessages) {
    const tryLoadHistoryFromTop = function () {
      if (!state.activeRole || state.isSending) {
        return;
      }
      if (dom.chatMessages.scrollTop > 96) {
        return;
      }
      loadOlderConversation().catch(function () {});
    };

    dom.chatMessages.addEventListener("scroll", tryLoadHistoryFromTop, { passive: true });
    dom.chatMessages.addEventListener("touchend", tryLoadHistoryFromTop, { passive: true });
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", function () {
      syncViewportHeight();
      syncKeyboardInset();
    });
    window.visualViewport.addEventListener("scroll", function () {
      syncViewportHeight();
      syncKeyboardInset();
    });
  }

  window.addEventListener("resize", function () {
    syncViewportHeight();
    syncKeyboardInset();
  });

  if (dom.homeSearchInput) {
    dom.homeSearchInput.addEventListener("input", function () {
      state.homeSearch = dom.homeSearchInput.value || "";
      renderRoles();
      maybeLoadMoreHomeRoles();
    });
  }

  if (dom.chatSearchInput) {
    dom.chatSearchInput.addEventListener("input", function () {
      state.chatSearch = dom.chatSearchInput.value || "";
      renderChatRoles();
      maybeLoadMoreChatRoles();
    });
  }

  dom.navItems.forEach(function (item) {
    item.addEventListener("click", function () {
      const target = item.dataset.nav;
      if (target === "chat") {
        state.previewRole = null;
        state.previewSource = "home";
        layoutView.setView("chat");
        renderConversation({ scrollMode: "latest" });
        loadMyRoles({ append: false }).catch(function () {
          if (dom.chatRoleGrid) {
            dom.chatRoleGrid.innerHTML = "";
          }
        });
        return;
      }
      if (target === "profile") {
        state.previewRole = null;
        state.previewSource = "home";
        layoutView.setBottomNavVisible(true);
        layoutView.setView("profile");
        return;
      }
      state.previewRole = null;
      state.previewSource = "home";
      layoutView.setBottomNavVisible(true);
      layoutView.setView("home");
    });
  });
}

async function init() {
  state.rolesPagination.pageSize = ROLE_PAGE_SIZE;
  state.chatRolesPagination.pageSize = MY_ROLE_PAGE_SIZE;
  state.userProfile = Object.assign({}, state.userProfile, runtime.getUserProfile() || {});
  state.userId = state.userProfile.id;

  runtime.setup();
  bindEvents();
  syncViewportHeight();
  layoutView.setComposerNote("消息会直接通过 WebApp 调用后端生成回复。", false);
  renderProfile();
  resizeComposer();
  syncKeyboardInset();
  renderConversation({ scrollMode: "latest" });

  try {
    await loadRoles({ append: false });
    await loadMyRoles({ append: false });
  } catch (error) {
    layoutView.setStatus(error.message || "角色列表加载失败", true);
  }
}

init();
