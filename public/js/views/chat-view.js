import { escapeHtml, formatAssistantHtml, sanitizeDisplayText } from "../utils.js";

export function createChatView(dom) {
  function resolveRoleImage(role) {
    if (!role) {
      return "";
    }
    if (role.avatar_url) {
      return role.avatar_url;
    }
    if (role.opening_image_url) {
      return role.opening_image_url;
    }
    if (role.name === "梦瑶") {
      return "/assets/mengyao.jpg";
    }
    return "";
  }

  function updateRole(role) {
    dom.chatRoleName.textContent = role ? role.name : "请选择角色";
    dom.chatRoleDescription.textContent = role
      ? sanitizeDisplayText(role.description || "暂无描述")
      : "进入聊天页后会显示角色简介和历史消息。";
  }

  function buildAssistantBubble(roleName, roleImage, contentHtml) {
    return (
      '<div class="message-avatar">' +
      (roleImage ? '<img src="' + escapeHtml(roleImage) + '" alt="' + escapeHtml(roleName || "角色") + '" />' : "") +
      "</div>" +
      '<div class="message-main">' +
      '<div class="message-label">' + escapeHtml(roleName || "角色") + "</div>" +
      contentHtml +
      "</div>"
    );
  }

  function renderMessages(messages, role, options) {
    const settings = Object.assign(
      {
        scrollMode: "latest"
      },
      options || {}
    );
    const roleName = role ? role.name : "";
    const roleImage = resolveRoleImage(role);
    dom.chatMessages.innerHTML = "";

    (messages || []).forEach(function (message) {
      const bubble = document.createElement("article");
      const isUser = message.message_type === "user";
      const isTyping = message.message_type === "assistant_typing";
      const isAssistantImage = message.message_type === "assistant_image";

      bubble.className = "message-bubble " + (isUser ? "user" : "assistant");

      if (isTyping) {
        bubble.classList.add("typing");
        bubble.innerHTML = buildAssistantBubble(
          roleName,
          roleImage,
          '<div class="typing-indicator" aria-label="正在输入"><span></span><span></span><span></span></div>'
        );
      } else if (isUser) {
        bubble.innerHTML =
          '<div class="message-main">' +
          '<div class="message-label">我</div>' +
          '<div class="message-content">' + escapeHtml(message.content || "") + "</div>" +
          "</div>";
      } else if (isAssistantImage) {
        const imageUrl = message.image_url || roleImage;
        bubble.innerHTML = buildAssistantBubble(
          roleName,
          roleImage,
          '<div class="message-photo">' +
          (imageUrl
            ? '<img src="' + escapeHtml(imageUrl) + '" alt="' + escapeHtml(roleName || "角色") + '" />'
            : "") +
          "</div>" +
          ((message.content || "").trim()
            ? '<div class="message-content">' + formatAssistantHtml(message.content || "") + "</div>"
            : "")
        );
      } else {
        bubble.innerHTML = buildAssistantBubble(
          roleName,
          roleImage,
          '<div class="message-content">' + formatAssistantHtml(message.content || "") + "</div>"
        );
      }

      dom.chatMessages.appendChild(bubble);
    });

    requestAnimationFrame(function () {
      if (settings.scrollMode === "top") {
        dom.chatMessages.scrollTop = 0;
        window.scrollTo({
          top: 0,
          behavior: "smooth"
        });
        return;
      }
      const lastMessage = dom.chatMessages.lastElementChild;
      if (lastMessage && typeof lastMessage.scrollIntoView === "function") {
        lastMessage.scrollIntoView({ block: "end", behavior: "smooth" });
      }
      dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: "smooth"
      });
    });
  }

  return {
    updateRole,
    renderMessages
  };
}
