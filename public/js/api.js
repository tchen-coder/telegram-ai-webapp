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
    async listRoles(userId, options) {
      const query = new URLSearchParams({
        user_id: userId,
        page: String((options && options.page) || 1),
        page_size: String((options && options.pageSize) || 10)
      });
      return apiFetch("/api/roles?" + query.toString());
    },

    async listMyRoles(userId, options) {
      const query = new URLSearchParams({
        user_id: userId,
        page: String((options && options.page) || 1),
        page_size: String((options && options.pageSize) || 10)
      });
      return apiFetch("/api/myroles?" + query.toString());
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

    async getConversation(userId, roleId, options) {
      const query = new URLSearchParams({
        user_id: userId,
        role_id: String(roleId),
        limit: String((options && options.limit) || 10)
      });
      if (options && options.beforeGroupSeq != null) {
        query.set("before_group_seq", String(options.beforeGroupSeq));
      }
      return apiFetch("/api/conversations?" + query.toString());
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
