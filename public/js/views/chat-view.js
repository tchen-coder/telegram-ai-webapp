import { resolveMessageImageUrl, resolveRoleAvatarImage } from "../image-cache.js";
import { formatAssistantHtml, sanitizeDisplayText } from "../utils.js";

export function createChatView(dom) {
  let lastRoleKey = "";
  let lastMessageKeys = [];

  function resolveRoleImage(role) {
    return resolveRoleAvatarImage(role);
  }

  function resolveRoleName(role) {
    if (!role) {
      return "角色";
    }
    const baseName = sanitizeDisplayText(role.name || role.role_name || "").trim() || "角色";
    const relationshipLabel = sanitizeDisplayText(role.relationship_label || "").trim();
    if (!relationshipLabel) {
      return baseName;
    }
    return baseName + "（" + relationshipLabel + "）";
  }

  function getRoleKey(role) {
    if (!role) {
      return "";
    }
    return [
      role.id || "",
      role.name || "",
      role.raw_avatar_url || role.avatar_url || "",
      role.raw_opening_image_url || role.opening_image_url || ""
    ].join("|");
  }

  function getMessageKey(message, index) {
    return [
      message && message.id ? "id:" + message.id : "idx:" + index,
      message && message.message_type ? message.message_type : "",
      message && (message.raw_image_url || message.image_url || "")
    ].join("|");
  }

  function createImageElement(url, altText) {
    const image = document.createElement("img");
    image.alt = altText;
    image.decoding = "async";
    image.loading = "eager";
    image.draggable = false;
    if (url) {
      image.src = url;
    }
    return image;
  }

  function syncImage(container, url, altText) {
    if (!container) {
      return;
    }

    let image = container.querySelector("img");
    if (!url) {
      if (image) {
        image.remove();
      }
      return;
    }

    if (!image) {
      image = createImageElement(url, altText);
      container.appendChild(image);
      return;
    }

    if (image.getAttribute("src") !== url) {
      image.src = url;
    }
    if (image.alt !== altText) {
      image.alt = altText;
    }
  }

  function ensureAssistantShell(bubble, roleName, roleImage) {
    let avatar = bubble.querySelector(".message-avatar");
    if (!avatar) {
      avatar = document.createElement("div");
      avatar.className = "message-avatar";
      bubble.appendChild(avatar);
    }

    let main = bubble.querySelector(".message-main");
    if (!main) {
      main = document.createElement("div");
      main.className = "message-main";
      bubble.appendChild(main);
    }

    let label = main.querySelector(".message-label");
    if (!label) {
      label = document.createElement("div");
      label.className = "message-label";
      main.insertBefore(label, main.firstChild);
    }

    label.textContent = roleName || "角色";
    syncImage(avatar, roleImage, roleName || "角色");

    return {
      avatar,
      main,
      label
    };
  }

  function ensureUserShell(bubble) {
    let main = bubble.querySelector(".message-main");
    if (!main) {
      main = document.createElement("div");
      main.className = "message-main";
      bubble.appendChild(main);
    }

    let label = main.querySelector(".message-label");
    if (!label) {
      label = document.createElement("div");
      label.className = "message-label";
      main.appendChild(label);
    }

    let content = main.querySelector(".message-content");
    if (!content) {
      content = document.createElement("div");
      content.className = "message-content";
      main.appendChild(content);
    }

    label.textContent = "我";
    return {
      main,
      label,
      content
    };
  }

  function syncAssistantText(main, html) {
    let content = main.querySelector(".message-content");
    if (!content) {
      content = document.createElement("div");
      content.className = "message-content";
      main.appendChild(content);
    }
    if (content.innerHTML !== html) {
      content.innerHTML = html;
    }
    return content;
  }

  function removeSelector(main, selector) {
    const node = main.querySelector(selector);
    if (node) {
      node.remove();
    }
  }

  function ensureTyping(main) {
    removeSelector(main, ".message-content");
    removeSelector(main, ".message-photo");

    let indicator = main.querySelector(".typing-indicator");
    if (!indicator) {
      indicator = document.createElement("div");
      indicator.className = "typing-indicator";
      indicator.setAttribute("aria-label", "正在输入");
      indicator.innerHTML = "<span></span><span></span><span></span>";
      main.appendChild(indicator);
    }
  }

  function ensureAssistantImage(main, imageUrl, roleName, content) {
    removeSelector(main, ".typing-indicator");

    let photo = main.querySelector(".message-photo");
    if (!photo) {
      photo = document.createElement("div");
      photo.className = "message-photo";
      main.appendChild(photo);
    }
    syncImage(photo, imageUrl, roleName || "角色");

    const normalizedContent = String(content || "").trim();
    if (normalizedContent) {
      syncAssistantText(main, formatAssistantHtml(normalizedContent));
      return;
    }
    removeSelector(main, ".message-content");
  }

  function ensureAssistantMessage(main, content) {
    removeSelector(main, ".typing-indicator");
    removeSelector(main, ".message-photo");
    syncAssistantText(main, formatAssistantHtml(content || ""));
  }

  function createMessageBubble(message, roleName, roleImage) {
    const bubble = document.createElement("article");
    patchMessageBubble(bubble, message, roleName, roleImage);
    return bubble;
  }

  function patchMessageBubble(bubble, message, roleName, roleImage) {
    const type = message && message.message_type ? message.message_type : "";
    const isUser = type === "user";
    const isTyping = type === "assistant_typing";
    const isAssistantImage = type === "assistant_image";

    bubble.dataset.messageType = type;
    bubble.className = "message-bubble " + (isUser ? "user" : "assistant");
    bubble.classList.toggle("typing", isTyping);

    if (isUser) {
      const userShell = ensureUserShell(bubble);
      userShell.content.textContent = message.content || "";
      return true;
    }

    const assistantShell = ensureAssistantShell(bubble, roleName, roleImage);
    if (isTyping) {
      ensureTyping(assistantShell.main);
      return true;
    }

    if (isAssistantImage) {
      ensureAssistantImage(
        assistantShell.main,
        resolveMessageImageUrl(message, roleImage),
        roleName,
        message.content || ""
      );
      return true;
    }

    ensureAssistantMessage(assistantShell.main, message.content || "");
    return true;
  }

  function canPatch(roleKey, messageKeys) {
    if (!dom.chatMessages) {
      return false;
    }
    if (roleKey !== lastRoleKey) {
      return false;
    }
    if (messageKeys.length !== lastMessageKeys.length) {
      return false;
    }
    for (let i = 0; i < messageKeys.length; i += 1) {
      if (messageKeys[i] !== lastMessageKeys[i]) {
        return false;
      }
    }
    return dom.chatMessages.children.length === messageKeys.length;
  }

  function syncScroll(settings, isPatched) {
    requestAnimationFrame(function () {
      if (settings.scrollMode === "top") {
        dom.chatMessages.scrollTop = 0;
        window.scrollTo({
          top: 0,
          behavior: "auto"
        });
        return;
      }

      const lastMessage = dom.chatMessages.lastElementChild;
      if (lastMessage && typeof lastMessage.scrollIntoView === "function") {
        lastMessage.scrollIntoView({
          block: "end",
          behavior: isPatched ? "auto" : "smooth"
        });
      }
      dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: isPatched ? "auto" : "smooth"
      });
    });
  }

  function updateRole(role) {
    dom.chatRoleName.textContent = role ? resolveRoleName(role) : "请选择角色";
    dom.chatRoleDescription.textContent = role
      ? sanitizeDisplayText(role.description || "暂无描述")
      : "进入聊天页后会显示角色简介和历史消息。";
  }

  function renderMessages(messages, role, options) {
    const settings = Object.assign(
      {
        scrollMode: "latest"
      },
      options || {}
    );
    const roleName = resolveRoleName(role);
    const roleImage = resolveRoleImage(role);
    const roleKey = getRoleKey(role);
    const messageList = Array.isArray(messages) ? messages : [];
    const messageKeys = messageList.map(getMessageKey);
    updateRole(role);

    let patched = false;
    if (canPatch(roleKey, messageKeys)) {
      patched = messageList.every(function (message, index) {
        return patchMessageBubble(dom.chatMessages.children[index], message, roleName, roleImage);
      });
    }

    if (!patched) {
      const fragment = document.createDocumentFragment();
      messageList.forEach(function (message) {
        fragment.appendChild(createMessageBubble(message, roleName, roleImage));
      });
      dom.chatMessages.replaceChildren(fragment);
    }

    lastRoleKey = roleKey;
    lastMessageKeys = messageKeys;
    syncScroll(settings, patched);
  }

  return {
    setUserName() {},
    updateRole,
    renderMessages
  };
}
