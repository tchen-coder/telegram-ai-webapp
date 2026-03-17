export function createLayoutView(dom) {
  function setPanelState(node, message, isError) {
    if (!node) {
      return;
    }
    const nextMessage = message || "";
    node.textContent = nextMessage;
    node.classList.toggle("error", Boolean(isError));
    node.classList.toggle("hidden", !nextMessage && !isError);
  }

  return {
    setStatus(message, isError) {
      setPanelState(dom.statusPanel, message, isError);
    },

    setChatStatus(message, isError) {
      setPanelState(dom.chatStatus, message, isError);
    },

    setView(viewName) {
      const isChatView = viewName === "chat";
      const isProfileView = viewName === "profile";
      const isHomeView = viewName === "home";

      dom.homeView.classList.toggle("is-active", isHomeView);
      dom.homeView.setAttribute("aria-hidden", String(!isHomeView));
      dom.chatView.classList.toggle("is-active", isChatView);
      dom.chatView.setAttribute("aria-hidden", String(!isChatView));
      if (dom.profileView) {
        dom.profileView.classList.toggle("is-active", isProfileView);
        dom.profileView.setAttribute("aria-hidden", String(!isProfileView));
      }

      dom.navItems.forEach(function (item) {
        item.classList.toggle("active", item.dataset.nav === viewName);
      });
    },

    setComposerNote(message, isError) {
      if (!dom.composerNote) {
        return;
      }
      const nextMessage = message || "";
      dom.composerNote.textContent = nextMessage;
      dom.composerNote.classList.toggle("error", Boolean(isError));
      dom.composerNote.classList.toggle("hidden", !isError || !nextMessage);
    },

    setSending(isSending) {
      if (dom.sendButton) {
        dom.sendButton.disabled = Boolean(isSending);
        dom.sendButton.textContent = isSending ? "发送中" : "➤";
        dom.sendButton.classList.toggle("is-sending", Boolean(isSending));
      }
      if (dom.chatInput) {
        dom.chatInput.disabled = Boolean(isSending);
      }
    },

    setBottomNavVisible(isVisible) {
      if (dom.appShell) {
        dom.appShell.classList.toggle("chat-mode", !isVisible);
      }
      if (!dom.bottomNav) {
        return;
      }
      dom.bottomNav.classList.toggle("hidden", !isVisible);
    }
  };
}
