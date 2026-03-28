export function createApiClient(apiBase) {
  async function apiFetch(path, options) {
    const response = await fetch(apiBase + path, options);
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || "请求失败");
    }
    return payload;
  }

  return {
    async listRoles(userId) {
      return apiFetch("/api/roles?user_id=" + encodeURIComponent(userId));
    },

    async listMyRoles(userId) {
      return apiFetch("/api/myroles?user_id=" + encodeURIComponent(userId));
    },

    async deleteMyRole(userId, roleId) {
      return apiFetch("/api/myroles/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          user_id: userId,
          role_id: roleId
        })
      });
    },

    async selectRole(userId, roleId, options) {
      const requestOptions = options || {};
      return apiFetch("/api/roles/select", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          user_id: userId,
          role_id: roleId,
          push_to_telegram: Boolean(requestOptions.pushToTelegram)
        })
      });
    },

    async getConversation(userId, roleId) {
      return apiFetch(
        "/api/conversations?user_id=" +
          encodeURIComponent(userId) +
          "&role_id=" +
          encodeURIComponent(roleId)
      );
    },

    async sendMessage(userId, roleId, content, userName) {
      return apiFetch("/api/chat/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          user_id: userId,
          role_id: roleId,
          content,
          user_name: userName
        })
      });
    }
  };
}
