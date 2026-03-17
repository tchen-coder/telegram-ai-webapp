import { createApiClient } from "./api.js";
import { createConfig } from "./config.js";
import { getDomRefs } from "./dom.js";
import { createState } from "./state.js";
import { closeTelegram, openShareLink, resolveUserId, resolveUserProfile, setupTelegram } from "./telegram.js";
import { createChatView } from "./views/chat-view.js";
import { createLayoutView } from "./views/layout.js";
import { createRoleListView } from "./views/role-list.js";
import { sleep, splitForStreaming } from "./utils.js";

const config = createConfig();
const dom = getDomRefs();
const state = createState();
const api = createApiClient(config.apiBase);
const layoutView = createLayoutView(dom);
const chatView = createChatView(dom);

const roleListView = createRoleListView(dom, {
  onEnterRole: enterRole,
  previewLimit: 20
});
const chatRoleListView = createRoleListView(
  { roleGrid: dom.chatRoleGrid },
  {
    onEnterRole: enterRole,
    previewLimit: 30,
    preferLatestReply: true,
    emptyText: "还没有聊过的角色。先去主页选一个开始聊天。"
  }
);

function getRoleById(roleId) {
  return state.roles.find(function (role) {
    return role.id === roleId;
  }) || null;
}

function renderRoles() {
  if (!state.roles.length) {
    layoutView.setStatus("当前没有可用角色。", true);
    if (dom.roleGrid) {
      dom.roleGrid.innerHTML = "";
    }
    return;
  }

  roleListView.render(state.roles, state.switchingRoleId);
  layoutView.setStatus("", false);
}

function renderChatRoles() {
  if (!dom.chatRoleGrid) {
    return;
  }
  chatRoleListView.render(state.chatRoles, state.switchingRoleId);
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
  chatView.renderMessages(
    state.messages,
    state.activeRole || null,
    options
  );
  layoutView.setBottomNavVisible(!state.activeRole);
  if (dom.chatRoleGrid) {
    dom.chatRoleGrid.classList.toggle("hidden", Boolean(state.activeRole));
  }
  if (dom.chatMessages) {
    dom.chatMessages.classList.toggle("hidden", !state.activeRole);
  }
  if (dom.chatRolePanel) {
    dom.chatRolePanel.classList.toggle("hidden", !state.activeRole);
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
}

function renderProfile() {
  if (dom.profileName) {
    dom.profileName.textContent = state.userProfile.username
      ? "@" + state.userProfile.username
      : state.userProfile.displayName || state.userProfile.firstName || "Telegram 用户";
  }
  if (dom.profileUsername) {
    dom.profileUsername.textContent = state.userProfile.displayName
      ? state.userProfile.displayName
      : (state.userProfile.username ? "@" + state.userProfile.username : "未设置用户名");
  }
}

async function loadRoles() {
  if (!state.userId) {
    layoutView.setStatus("当前拿不到 Telegram 用户身份。请从 Telegram WebApp 打开，或者在预览时追加 ?user_id=你的TelegramID", true);
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
    layoutView.setView("chat");
    chatView.updateRole(nextRole);
    state.messages = payload.data.messages || [];
    renderConversation({ scrollMode: "latest" });
    layoutView.setChatStatus("", false);
  } catch (error) {
    layoutView.setChatStatus(error.message || "聊天记录加载失败", true);
  }
}

async function enterRole(role) {
  if (state.switchingRoleId) {
    return;
  }

  if (role.is_current) {
    await loadConversation(role);
    return;
  }

  state.switchingRoleId = role.id;
  renderRoles();
  renderChatRoles();

  try {
    const payload = await api.selectRole(state.userId, role.id);
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
  layoutView.setChatStatus("消息发送中...", false);

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

  try {
    const payload = await api.sendMessage(
      state.userId,
      state.activeRole.id,
      content,
      state.userProfile.username || state.userProfile.firstName || ""
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
    layoutView.setChatStatus("", false);
    layoutView.setComposerNote("消息会直接通过 WebApp 调用后端生成回复。", false);
  } catch (error) {
    state.messages = state.messages.slice(0, -2);
    renderConversation({ scrollMode: "latest" });
    dom.chatInput.value = content;
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
      if (!openShareLink(config.tg)) {
        window.alert("这里预留邀请入口。");
      }
    });
  }

  if (dom.backButton) {
    dom.backButton.addEventListener("click", function () {
      if (state.activeRole) {
        state.activeRole = null;
        state.messages = [];
        layoutView.setView("chat");
        renderConversation({ scrollMode: "latest" });
        loadMyRoles().catch(function () {
          if (dom.chatRoleGrid) {
            dom.chatRoleGrid.innerHTML = "";
          }
        });
        return;
      }
      layoutView.setBottomNavVisible(true);
      layoutView.setView("home");
    });
  }

  if (dom.closeButton) {
    dom.closeButton.addEventListener("click", function () {
      closeTelegram(config.tg);
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
  }

  dom.navItems.forEach(function (item) {
    item.addEventListener("click", function () {
      const target = item.dataset.nav;
      if (target === "chat") {
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
        layoutView.setBottomNavVisible(true);
        layoutView.setView("profile");
        return;
      }
      layoutView.setBottomNavVisible(true);
      layoutView.setView("home");
    });
  });
}

async function init() {
  state.userId = resolveUserId(config.tg, config.previewUserId);
  state.userProfile = Object.assign({}, state.userProfile, resolveUserProfile(config.tg) || {});
  setupTelegram(config.tg);
  bindEvents();
  layoutView.setComposerNote("消息会直接通过 WebApp 调用后端生成回复。", false);
  renderProfile();
  renderConversation({ scrollMode: "latest" });

  try {
    await loadRoles();
    await loadMyRoles();
  } catch (error) {
    layoutView.setStatus(error.message || "角色列表加载失败", true);
  }
}

init();
