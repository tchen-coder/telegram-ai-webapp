import { resolveMessageImageUrl, resolveRoleAvatarImage } from "../image-cache.js";
import { formatAssistantHtml, sanitizeDisplayText } from "../utils.js";

export function createChatView(dom) {
  const TOP_SENTINEL_ID = "chatHistoryTopSentinel";
  const LOAD_MORE_BUTTON_ID = "chatHistoryLoadMoreButton";

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
      main
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
      return bubble;
    }

    const assistantShell = ensureAssistantShell(bubble, roleName, roleImage);
    if (isTyping) {
      ensureTyping(assistantShell.main);
      return bubble;
    }

    if (isAssistantImage) {
      ensureAssistantImage(
        assistantShell.main,
        resolveMessageImageUrl(message, roleImage),
        roleName,
        message.content || ""
      );
      return bubble;
    }

    ensureAssistantMessage(assistantShell.main, message.content || "");
    return bubble;
  }

  function buildTurns(messages) {
    const turns = [];
    const groupedTurns = new Map();
    let pendingTurn = null;

    (Array.isArray(messages) ? messages : []).forEach(function (message, index) {
      const hasGroupSeq = message && message.group_seq != null;
      if (hasGroupSeq) {
        pendingTurn = null;
        const turnKey = "group:" + String(message.group_seq);
        let turn = groupedTurns.get(turnKey);
        if (!turn) {
          turn = {
            key: turnKey,
            groupSeq: message.group_seq,
            messages: []
          };
          groupedTurns.set(turnKey, turn);
          turns.push(turn);
        }
        turn.messages.push(message);
        return;
      }

      if (!pendingTurn) {
        pendingTurn = {
          key: "pending:" + String(index),
          groupSeq: null,
          messages: []
        };
        turns.push(pendingTurn);
      }
      pendingTurn.messages.push(message);
    });

    return turns;
  }

  function syncScroll(settings) {
    requestAnimationFrame(function () {
      if (!dom.chatMessages) {
        return;
      }

      if (settings.scrollMode === "top") {
        dom.chatMessages.scrollTop = 0;
        return;
      }

      if (settings.scrollMode === "preserve") {
        const previousHeight = Number(settings.previousScrollHeight) || 0;
        const previousTop = Number(settings.previousScrollTop) || 0;
        const heightDelta = dom.chatMessages.scrollHeight - previousHeight;
        dom.chatMessages.scrollTop = previousTop + heightDelta;
        return;
      }

      const lastMessage = dom.chatMessages.lastElementChild;
      if (lastMessage && typeof lastMessage.scrollIntoView === "function") {
        lastMessage.scrollIntoView({
          block: "end",
          behavior: "smooth"
        });
      }
      dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
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
        scrollMode: "latest",
        previousScrollHeight: 0,
        previousScrollTop: 0
      },
      options || {}
    );
    const roleName = resolveRoleName(role);
    const roleImage = resolveRoleImage(role);
    const turns = buildTurns(messages);
    updateRole(role);

    const fragment = document.createDocumentFragment();
    const loadMoreButton = document.createElement("button");
    loadMoreButton.id = LOAD_MORE_BUTTON_ID;
    loadMoreButton.className = "chat-history-load-more";
    loadMoreButton.type = "button";
    loadMoreButton.textContent = "加载更早消息";
    fragment.appendChild(loadMoreButton);

    const topSentinel = document.createElement("div");
    topSentinel.id = TOP_SENTINEL_ID;
    topSentinel.className = "chat-history-top-sentinel";
    fragment.appendChild(topSentinel);

    turns.forEach(function (turn) {
      const turnGroup = document.createElement("section");
      turnGroup.className = "turn-group";
      if (turn.groupSeq != null) {
        turnGroup.dataset.groupSeq = String(turn.groupSeq);
      }

      const stack = document.createElement("div");
      stack.className = "turn-stack";
      turn.messages.forEach(function (message) {
        stack.appendChild(createMessageBubble(message, roleName, roleImage));
      });
      turnGroup.appendChild(stack);
      fragment.appendChild(turnGroup);
    });

    dom.chatMessages.replaceChildren(fragment);
    syncScroll(settings);
  }

  return {
    loadMoreButtonId: LOAD_MORE_BUTTON_ID,
    topSentinelId: TOP_SENTINEL_ID,
    setUserName() {},
    updateRole,
    renderMessages
  };
}
