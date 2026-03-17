import { cardTheme, escapeHtml, sanitizeDisplayText, truncateText } from "../utils.js";

export function createRoleListView(dom, handlers) {
  const previewLimit = Math.max(10, Number(handlers.previewLimit) || 20);
  const preferLatestReply = Boolean(handlers.preferLatestReply);
  const emptyText = handlers.emptyText || "";

  function resolveRoleImage(role) {
    if (role.opening_image_url) {
      return role.opening_image_url;
    }
    if (role.avatar_url) {
      return role.avatar_url;
    }
    if (role.name === "梦瑶") {
      return "/assets/mengyao.jpg";
    }
    return "";
  }

  return {
    render(roles, switchingRoleId) {
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
        article.className = "character-card interactive " + cardTheme(index);
        article.tabIndex = 0;
        article.setAttribute("role", "button");
        article.setAttribute("aria-label", "进入角色 " + role.name);

        const previewText = preferLatestReply
          ? (role.latest_reply || role.description || "暂无内容")
          : (role.description || role.latest_reply || "暂无描述");
        const description = truncateText(sanitizeDisplayText(previewText), previewLimit);
        const imageUrl = resolveRoleImage(role);
        const tags = Array.isArray(role.tags) ? role.tags.filter(Boolean).slice(0, 4) : [];
        const tagsHtml = tags.length
          ? '<div class="role-tags">' + tags.map(function (tag) {
              return '<span class="role-tag">' + escapeHtml(tag) + "</span>";
            }).join("") + "</div>"
          : "";
        article.innerHTML =
          '<div class="card-media">' +
          (imageUrl
            ? '<img src="' + escapeHtml(imageUrl) + '" alt="' + escapeHtml(role.name) + '" loading="lazy" />'
            : '<div class="card-media-fallback"></div>') +
          '<div class="card-media-overlay"></div>' +
          "</div>" +
          '<div class="card-body">' +
          "<h2>" + escapeHtml(role.name) + "</h2>" +
          tagsHtml +
          '<p class="role-short-desc">' + escapeHtml(description) + "</p>" +
          "</div>";

        const onEnter = function () {
          if (switchingRoleId === role.id) {
            return;
          }
          handlers.onEnterRole(role);
        };

        article.addEventListener("click", onEnter);
        article.addEventListener("keydown", function (event) {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onEnter();
          }
        });

        dom.roleGrid.appendChild(article);
      });
    }
  };
}
