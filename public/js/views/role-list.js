import { resolveRoleCardImage } from "../image-cache.js";
import { cardTheme, escapeHtml, sanitizeDisplayText, truncateText } from "../utils.js";

export function createRoleListView(dom, handlers) {
  const previewLimit = Math.max(10, Number(handlers.previewLimit) || 20);
  const preferLatestReply = Boolean(handlers.preferLatestReply);
  const emptyText = handlers.emptyText || "";
  const enableDelete = Boolean(handlers.onDeleteRole);
  const SWIPE_OPEN_OFFSET = 92;

  function bindSwipeCard(wrapper, role, deletingRoleId) {
    const swipeContent = wrapper.querySelector(".swipe-card-content");
    const deleteButton = wrapper.querySelector(".role-delete-swipe-btn");
    if (!swipeContent || !deleteButton) {
      return;
    }

    let startX = 0;
    let currentX = 0;
    let dragging = false;
    let opened = false;
    let touchMoved = false;
    let lastDeleteTriggerAt = 0;

    function setOffset(offset, withTransition) {
      swipeContent.style.transition = withTransition ? "transform 0.18s ease" : "none";
      swipeContent.style.transform = "translateX(" + offset + "px)";
    }

    function closeSwipe() {
      opened = false;
      wrapper.classList.remove("swipe-open");
      setOffset(0, true);
    }

    function openSwipe() {
      opened = true;
      wrapper.classList.add("swipe-open");
      setOffset(-SWIPE_OPEN_OFFSET, true);
    }

    wrapper.addEventListener("click", function (event) {
      if (!opened) {
        return;
      }
      if (deleteButton.contains(event.target)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      closeSwipe();
    });

    swipeContent.addEventListener("touchstart", function (event) {
      if (deletingRoleId === role.id) {
        return;
      }
      startX = event.touches[0].clientX;
      currentX = opened ? -SWIPE_OPEN_OFFSET : 0;
      dragging = true;
      touchMoved = false;
      swipeContent.style.transition = "none";
    }, { passive: true });

    swipeContent.addEventListener("touchmove", function (event) {
      if (!dragging) {
        return;
      }
      touchMoved = true;
      const deltaX = event.touches[0].clientX - startX;
      const nextOffset = Math.min(0, Math.max(-SWIPE_OPEN_OFFSET, currentX + deltaX));
      swipeContent.style.transform = "translateX(" + nextOffset + "px)";
    }, { passive: true });

    swipeContent.addEventListener("touchend", function (event) {
      if (!dragging) {
        return;
      }
      dragging = false;
      const deltaX = event.changedTouches[0].clientX - startX;
      if (deltaX < -28) {
        openSwipe();
        return;
      }
      if (deltaX > 28) {
        closeSwipe();
        return;
      }
      if (opened) {
        openSwipe();
        return;
      }
      closeSwipe();
    });

    deleteButton.disabled = deletingRoleId === role.id;
    if (deletingRoleId === role.id) {
      deleteButton.textContent = "删除中";
    }

    function triggerDelete(event) {
      event.preventDefault();
      event.stopPropagation();
      const now = Date.now();
      if (now - lastDeleteTriggerAt < 400) {
        return;
      }
      lastDeleteTriggerAt = now;
      handlers.onDeleteRole(role);
    }

    deleteButton.addEventListener("touchend", function (event) {
      if (touchMoved || deleteButton.disabled) {
        return;
      }
      triggerDelete(event);
    });

    deleteButton.addEventListener("click", function (event) {
      if (deleteButton.disabled) {
        return;
      }
      triggerDelete(event);
    });
  }

  return {
    render(roles, switchingRoleId, deletingRoleId) {
      if (!dom.roleGrid) {
        return;
      }

      dom.roleGrid.innerHTML = "";
      if (!roles || !roles.length) {
        if (emptyText) {
          dom.roleGrid.innerHTML = '<div class="empty-state">' + escapeHtml(emptyText) + "</div>";
        }
        return;
      }

      roles.forEach(function (role, index) {
        const article = document.createElement("article");
        article.className = enableDelete
          ? "swipe-role-card"
          : "character-card interactive " + cardTheme(index);
        if (!enableDelete) {
          article.tabIndex = 0;
          article.setAttribute("role", "button");
          article.setAttribute("aria-label", "进入角色 " + role.name);
        }

        const previewText = preferLatestReply
          ? (role.latest_reply || role.description || "暂无内容")
          : (role.description || role.latest_reply || "暂无描述");
        const description = truncateText(sanitizeDisplayText(previewText), previewLimit);
        const imageUrl = resolveRoleCardImage(role);
        const tags = Array.isArray(role.tags) ? role.tags.filter(Boolean).slice(0, 4) : [];
        const tagsHtml = tags.length
          ? '<div class="role-tags">' + tags.map(function (tag) {
              return '<span class="role-tag">' + escapeHtml(tag) + "</span>";
            }).join("") + "</div>"
          : "";
        const cardHtml =
          '<div class="card-media">' +
          (imageUrl
            ? '<img src="' + escapeHtml(imageUrl) + '" alt="' + escapeHtml(role.name) + '" loading="lazy" decoding="async" />'
            : '<div class="card-media-fallback"></div>') +
          '<div class="card-media-overlay"></div>' +
          "</div>" +
          '<div class="card-body">' +
          "<h2>" + escapeHtml(role.name) + "</h2>" +
          tagsHtml +
          '<p class="role-short-desc">' + escapeHtml(description) + "</p>" +
          "</div>";

        if (enableDelete) {
          article.innerHTML =
            '<div class="role-delete-swipe-slot">' +
            '<button class="role-delete-swipe-btn" type="button" aria-label="删除角色">删除</button>' +
            "</div>" +
            '<div class="swipe-card-content">' +
            '<div class="character-card interactive ' + cardTheme(index) + '" tabindex="0" role="button" aria-label="进入角色 ' + escapeHtml(role.name) + '">' +
            cardHtml +
            "</div>" +
            "</div>";
        } else {
          article.innerHTML = cardHtml;
        }

        const targetCard = enableDelete
          ? article.querySelector(".character-card")
          : article;

        const onEnter = function () {
          if (switchingRoleId === role.id) {
            return;
          }
          handlers.onEnterRole(role);
        };

        targetCard.addEventListener("click", onEnter);
        targetCard.addEventListener("keydown", function (event) {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onEnter();
          }
        });

        if (enableDelete) {
          bindSwipeCard(article, role, deletingRoleId);
        }

        dom.roleGrid.appendChild(article);
      });
    }
  };
}
