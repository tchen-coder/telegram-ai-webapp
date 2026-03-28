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

function getUserDisplayName() {
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

function getRuntimeBannerCopy() {
  return "";
}

function getRuntimeBannerAction() {
  return null;
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
  dom.appShell.style.setProperty('--app-height', String(nextHeight) + 'px');
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

  dom.appShell.style.setProperty('--composer-space', String(composerHeight + 22) + 'px');
  dom.appShell.style.setProperty('--composer-bottom', String(composerBottom) + 'px');
  dom.appShell.classList.toggle('keyboard-open', keyboardLikelyOpen);
  dom.appShell.classList.toggle('chat-view-active', Boolean(state.activeRole));

  if (keyboardLikelyOpen && dom.chatMessages) {
    window.requestAnimationFrame(function () {
      dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
      dom.chatInput.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
  }) || null;
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

async function loadMyRoles() {
  if (!state.userId) {
    return;
  }
  const payload = await api.listMyRoles(state.userId);
  state.chatRoles = payload.data.roles || [];
  renderChatRoles();
}

function renderConversation(options) {
  chatView.setUserName(getUserDisplayName());
  chatView.renderMessages(
    state.messages,
    state.activeRole || null,
    options
  );
  if (dom.backButton) {
    dom.backButton.classList.toggle("hidden", !state.activeRole);
  }
  if (dom.appShell) {
    dom.appShell.classList.toggle('chat-view-active', Boolean(state.activeRole));
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

async function loadRoles() {
  if (!state.userId) {
    layoutView.setStatus("当前缺少用户身份。请从 Telegram 小程序打开，或在预览时追加 ?user_id=你的TelegramID。", true);
    return;
  }

  layoutView.setStatus("", false);
  const payload = await api.listRoles(state.userId);
  state.roles = payload.data.roles || [];
  state.currentRoleId = payload.data.current_role_id || null;
  renderRoles();
}

async function loadConversation(role) {
  try {
    const payload = await api.getConversation(state.userId, role.id);
    const nextRole = payload.data.role || role;
    state.activeRole = nextRole;
    state.previewRole = nextRole;
    layoutView.setView("chat");
    chatView.updateRole(nextRole);
    state.messages = payload.data.messages || [];
    renderConversation({ scrollMode: "latest" });
    layoutView.setChatStatus("", false);
  } catch (error) {
    layoutView.setChatStatus(error.message || "聊天记录加载失败", true);
  }
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
    renderConversation({ scrollMode: "latest" });
    loadMyRoles().catch(function () {
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
    await loadConversation(role);
    return;
  }

  state.switchingRoleId = role.id;
  renderRoles();
  renderChatRoles();

  try {
    const payload = await api.selectRole(state.userId, role.id, {
      pushToTelegram: runtime.supportsTelegramPush
    });
    await loadRoles();
    await loadMyRoles();
    const nextRole = getRoleById(role.id) || payload.data.role || role;
    await loadConversation(nextRole);
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
      layoutView.setView("chat");
      renderConversation({ scrollMode: "latest" });
    }
    await loadRoles();
    await loadMyRoles();
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
    chatView.updateRole(state.activeRole);
    const assistantMessages = Array.isArray(payload.data.assistant_messages) && payload.data.assistant_messages.length
      ? payload.data.assistant_messages
      : [payload.data.assistant_message];

    state.messages = state.messages.slice(0, -1);

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
          state.messages = state.messages.concat([{ message_type: "assistant_typing", content: "" }]);
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
    await loadMyRoles();
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

function bindEvents() {
  if (dom.shareButton) {
    dom.shareButton.addEventListener("click", function () {
      if (!runtime.openShareLink()) {
        window.alert("这里预留邀请入口。");
      }
    });
  }

  if (dom.backButton) {
    dom.backButton.addEventListener("click", function () {
      if (state.activeRole) {
        const currentRole = state.activeRole;
        state.activeRole = null;
        state.messages = [];
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

  if (dom.closeButton) {
    dom.closeButton.addEventListener("click", function () {
      runtime.close();
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
    });
  }

  if (dom.chatSearchInput) {
    dom.chatSearchInput.addEventListener("input", function () {
      state.chatSearch = dom.chatSearchInput.value || "";
      renderChatRoles();
    });
  }

  dom.navItems.forEach(function (item) {
    item.addEventListener("click", function () {
      const target = item.dataset.nav;
      if (target === "chat") {
        state.previewRole = null;
        state.previewSource = "home";
        layoutView.setView("chat");
        renderConversation();
        loadMyRoles().catch(function () {
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
    await loadRoles();
    await loadMyRoles();
  } catch (error) {
    layoutView.setStatus(error.message || "角色列表加载失败", true);
  }
}

init();
