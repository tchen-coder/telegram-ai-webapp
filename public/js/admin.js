const runtimeConfig = window.APP_CONFIG || {};
const apiBase = (
  runtimeConfig.adminApiBase ||
  (window.location.protocol + "//" + window.location.hostname + ":8091")
).replace(/\/$/, "");

const defaultTagOptions = [
  "少妇",
  "熟女",
  "邻居",
  "反差",
  "纯爱",
  "禁忌",
  "校花",
  "人妻",
  "制服",
  "主动"
];

const dom = {
  status: document.getElementById("adminStatus"),
  tokenInput: document.getElementById("adminTokenInput"),
  saveTokenButton: document.getElementById("saveTokenButton"),
  roleList: document.getElementById("roleList"),
  roleForm: document.getElementById("roleForm"),
  roleIdInput: document.getElementById("roleIdInput"),
  roleNameInput: document.getElementById("roleNameInput"),
  roleAvatarInput: document.getElementById("roleAvatarInput"),
  roleTagPicker: document.getElementById("roleTagPicker"),
  roleTagCustomInput: document.getElementById("roleTagCustomInput"),
  roleScenarioInput: document.getElementById("roleScenarioInput"),
  roleGreetingInput: document.getElementById("roleGreetingInput"),
  rolePromptFriendInput: document.getElementById("rolePromptFriendInput"),
  rolePromptPartnerInput: document.getElementById("rolePromptPartnerInput"),
  rolePromptLoverInput: document.getElementById("rolePromptLoverInput"),
  roleActiveInput: document.getElementById("roleActiveInput"),
  newRoleButton: document.getElementById("newRoleButton"),
  roleImageList: document.getElementById("roleImageList"),
  roleImageForm: document.getElementById("roleImageForm"),
  roleImageIdInput: document.getElementById("roleImageIdInput"),
  roleImageUrlInput: document.getElementById("roleImageUrlInput"),
  roleImageTypeInput: document.getElementById("roleImageTypeInput"),
  roleImageStageInput: document.getElementById("roleImageStageInput"),
  roleImageTriggerInput: document.getElementById("roleImageTriggerInput"),
  roleImageSortInput: document.getElementById("roleImageSortInput"),
  roleImageActiveInput: document.getElementById("roleImageActiveInput"),
  newImageButton: document.getElementById("newImageButton")
};

const state = {
  roles: [],
  roleImages: [],
  selectedRoleId: null,
  selectedRoleImageId: null,
  selectedTags: [],
  tagOptions: defaultTagOptions.slice()
};

function getAdminToken() {
  return window.localStorage.getItem("admin_token") || "";
}

function setStatus(message, isError) {
  dom.status.textContent = message || "";
  dom.status.classList.toggle("hidden", !message);
  dom.status.classList.toggle("error", Boolean(isError));
  dom.status.classList.toggle("success", Boolean(message) && !isError);
}

async function request(path, options) {
  const response = await fetch(apiBase + path, {
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Token": getAdminToken()
    },
    ...options
  });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (_) {
    throw new Error("后台接口未返回 JSON，请检查 8091 端口是否可访问");
  }

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.message || "请求失败");
  }
  return payload;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncate(value, limit) {
  const text = String(value || "");
  if (text.length <= limit) {
    return text;
  }
  return text.slice(0, limit) + "…";
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }
  return tags.map(function (tag) {
    return String(tag || "").trim();
  }).filter(Boolean);
}

function parseTagInput(value) {
  return String(value || "")
    .split(/[\n,，]/)
    .map(function (tag) {
      return tag.trim();
    })
    .filter(Boolean);
}

function ensureTagOptions(tags) {
  normalizeTags(tags).forEach(function (tag) {
    if (state.tagOptions.indexOf(tag) === -1) {
      state.tagOptions.push(tag);
    }
  });
}

function getSelectedTags() {
  const customTags = parseTagInput(dom.roleTagCustomInput ? dom.roleTagCustomInput.value : "");
  const merged = state.selectedTags.concat(customTags);
  return merged.filter(function (tag, index) {
    return merged.indexOf(tag) === index;
  });
}

function renderTagPicker() {
  if (!dom.roleTagPicker) {
    return;
  }

  dom.roleTagPicker.innerHTML = state.tagOptions.map(function (tag) {
    const activeClass = state.selectedTags.indexOf(tag) >= 0 ? " active" : "";
    return (
      '<button class="admin-tag-chip' + activeClass + '" data-tag="' + escapeHtml(tag) + '" type="button">' +
      escapeHtml(tag) +
      "</button>"
    );
  }).join("");

  dom.roleTagPicker.querySelectorAll("[data-tag]").forEach(function (button) {
    button.addEventListener("click", function () {
      const tag = button.getAttribute("data-tag");
      if (!tag) {
        return;
      }
      if (state.selectedTags.indexOf(tag) >= 0) {
        state.selectedTags = state.selectedTags.filter(function (item) {
          return item !== tag;
        });
      } else {
        state.selectedTags = state.selectedTags.concat([tag]);
      }
      renderTagPicker();
    });
  });
}

function getRolePromptText(role, relationship) {
  if (!role) {
    return "";
  }

  const prompts = Array.isArray(role.relationship_prompts) ? role.relationship_prompts : [];
  const matched = prompts.find(function (item) {
    return Number(item.relationship) === Number(relationship);
  });
  if (matched && String(matched.prompt_text || "").trim()) {
    return String(matched.prompt_text || "").trim();
  }

  if (relationship === 1) {
    return role.system_prompt_friend || role.system_prompt || "";
  }
  if (relationship === 2) {
    return role.system_prompt_partner || "";
  }
  if (relationship === 3) {
    return role.system_prompt_lover || "";
  }
  return "";
}

function buildRelationshipPromptsPayload() {
  const items = [
    {
      relationship: 1,
      prompt_text: dom.rolePromptFriendInput.value.trim(),
      is_active: true
    },
    {
      relationship: 2,
      prompt_text: dom.rolePromptPartnerInput.value.trim(),
      is_active: true
    },
    {
      relationship: 3,
      prompt_text: dom.rolePromptLoverInput.value.trim(),
      is_active: true
    }
  ];

  return items.filter(function (item) {
    return item.relationship === 1 || item.prompt_text;
  });
}

function fillRoleForm(role) {
  const roleTags = role ? normalizeTags(role.tags) : [];
  ensureTagOptions(roleTags);
  state.selectedTags = roleTags.filter(function (tag) {
    return defaultTagOptions.indexOf(tag) >= 0 || state.tagOptions.indexOf(tag) >= 0;
  });
  dom.roleIdInput.value = role && role.id ? String(role.id) : "";
  dom.roleNameInput.value = role ? role.name || "" : "";
  dom.roleAvatarInput.value = role ? role.raw_avatar_url || role.avatar_url || "" : "";
  if (dom.roleTagCustomInput) {
    dom.roleTagCustomInput.value = roleTags.filter(function (tag) {
      return defaultTagOptions.indexOf(tag) === -1;
    }).join(", ");
  }
  dom.roleScenarioInput.value = role ? role.description || "" : "";
  dom.roleGreetingInput.value = role ? role.greeting_message || "" : "";
  dom.rolePromptFriendInput.value = getRolePromptText(role, 1);
  dom.rolePromptPartnerInput.value = getRolePromptText(role, 2);
  dom.rolePromptLoverInput.value = getRolePromptText(role, 3);
  dom.roleActiveInput.checked = role ? Boolean(role.is_active) : true;
  renderTagPicker();
}

function fillRoleImageForm(image) {
  state.selectedRoleImageId = image && image.id ? image.id : null;
  dom.roleImageIdInput.value = image && image.id ? String(image.id) : "";
  dom.roleImageUrlInput.value = image ? image.raw_image_url || image.image_url || "" : "";
  dom.roleImageTypeInput.value = image ? image.image_type || "opening" : "opening";
  dom.roleImageStageInput.value = image ? image.stage_key || "" : "";
  dom.roleImageTriggerInput.value = image ? image.trigger_type || "manual" : "manual";
  dom.roleImageSortInput.value = image ? String(image.sort_order || 0) : "0";
  dom.roleImageActiveInput.checked = image ? Boolean(image.is_active) : true;
}

function renderRoleList() {
  if (!state.roles.length) {
    dom.roleList.innerHTML = '<div class="admin-empty">当前还没有角色</div>';
    return;
  }

  dom.roleList.innerHTML = state.roles.map(function (role) {
    const activeClass = role.id === state.selectedRoleId ? " active" : "";
    const tags = normalizeTags(role.tags);
    const tagsHtml = tags.length
      ? '<div class="admin-tags">' + tags.map(function (tag) {
          return '<span class="admin-tag">' + escapeHtml(tag) + "</span>";
        }).join("") + "</div>"
      : "";
    return (
      '<button class="admin-role-item' + activeClass + '" data-role-id="' + role.id + '" type="button">' +
      '<strong>' + escapeHtml(role.name) + "</strong>" +
      '<span>' + escapeHtml(truncate(role.description || "暂无简介", 42)) + "</span>" +
      tagsHtml +
      '<em>' + (role.is_active ? "已启用" : "已停用") + "</em>" +
      "</button>"
    );
  }).join("");

  dom.roleList.querySelectorAll("[data-role-id]").forEach(function (button) {
    button.addEventListener("click", function () {
      const roleId = Number(button.getAttribute("data-role-id"));
      state.selectedRoleId = roleId;
      const role = state.roles.find(function (item) {
        return item.id === roleId;
      }) || null;
      fillRoleForm(role);
      renderRoleList();
      loadRoleImages(roleId).catch(function (error) {
        setStatus(error.message || "图片资源加载失败", true);
      });
      setStatus("已载入角色：" + (role ? role.name : ""), false);
    });
  });
}

function renderRoleImages() {
  if (!state.selectedRoleId) {
    dom.roleImageList.innerHTML = '<div class="admin-empty">先保存或选择一个角色，再配置图片资源</div>';
    return;
  }

  if (!state.roleImages.length) {
    dom.roleImageList.innerHTML = '<div class="admin-empty">当前角色还没有图片资源</div>';
    return;
  }

  dom.roleImageList.innerHTML = state.roleImages.map(function (image) {
    const activeClass = image.id === state.selectedRoleImageId ? " active" : "";
    const stageText = image.stage_key ? (" · " + escapeHtml(image.stage_key)) : "";
    return (
      '<button class="admin-image-item' + activeClass + '" data-image-id="' + image.id + '" type="button">' +
      '<div class="admin-image-thumb"><img src="' + escapeHtml(image.image_url) + '" alt="' + escapeHtml(image.image_type) + '" /></div>' +
      '<div class="admin-image-meta">' +
      '<strong>' + escapeHtml(image.image_type) + stageText + "</strong>" +
      '<span>' + escapeHtml(image.trigger_type || "manual") + " · 排序 " + escapeHtml(String(image.sort_order || 0)) + "</span>" +
      '<em>' + (image.is_active ? "已启用" : "已停用") + "</em>" +
      "</div>" +
      "</button>"
    );
  }).join("");

  dom.roleImageList.querySelectorAll("[data-image-id]").forEach(function (button) {
    button.addEventListener("click", function () {
      const imageId = Number(button.getAttribute("data-image-id"));
      const image = state.roleImages.find(function (item) {
        return item.id === imageId;
      }) || null;
      fillRoleImageForm(image);
      renderRoleImages();
      setStatus("已载入图片资源。", false);
    });
  });
}

async function loadRoleImages(roleId) {
  if (!roleId) {
    state.roleImages = [];
    fillRoleImageForm(null);
    renderRoleImages();
    return;
  }
  const payload = await request("/api/admin/role-images?role_id=" + encodeURIComponent(roleId));
  state.roleImages = payload.data.images || [];
  fillRoleImageForm(state.roleImages[0] || null);
  renderRoleImages();
}

async function loadRoles() {
  const payload = await request("/api/admin/roles");
  state.roles = payload.data.roles || [];
  state.tagOptions = defaultTagOptions.slice();
  state.roles.forEach(function (role) {
    ensureTagOptions(role.tags);
  });
  if (!state.selectedRoleId && state.roles.length) {
    state.selectedRoleId = state.roles[0].id;
    fillRoleForm(state.roles[0]);
  } else if (state.selectedRoleId) {
    const selected = state.roles.find(function (role) {
      return role.id === state.selectedRoleId;
    }) || null;
    fillRoleForm(selected);
  } else {
    fillRoleForm(null);
  }
  renderRoleList();
  await loadRoleImages(state.selectedRoleId);
}

async function saveRole(event) {
  event.preventDefault();
  const payload = {
    role_id: dom.roleIdInput.value ? Number(dom.roleIdInput.value) : null,
    role_name: dom.roleNameInput.value.trim(),
    avatar_url: dom.roleAvatarInput.value.trim(),
    tags: getSelectedTags(),
    scenario: dom.roleScenarioInput.value.trim(),
    greeting_message: dom.roleGreetingInput.value.trim(),
    system_prompt: dom.rolePromptFriendInput.value.trim(),
    relationship_prompts: buildRelationshipPromptsPayload(),
    is_active: dom.roleActiveInput.checked
  };

  const path = payload.role_id ? "/api/admin/roles/update" : "/api/admin/roles";
  await request(path, {
    method: "POST",
    body: JSON.stringify(payload)
  });

  await loadRoles();
  if (payload.role_id) {
    state.selectedRoleId = payload.role_id;
  } else {
    const created = state.roles.find(function (role) {
      return role.name === payload.role_name;
    });
    state.selectedRoleId = created ? created.id : state.selectedRoleId;
  }
  const selected = state.roles.find(function (role) {
    return role.id === state.selectedRoleId;
  }) || null;
  fillRoleForm(selected);
  renderRoleList();
  await loadRoleImages(state.selectedRoleId);
  setStatus("角色信息已保存并重新加载成功。", false);
}

async function saveRoleImage(event) {
  event.preventDefault();
  if (!state.selectedRoleId) {
    throw new Error("请先保存角色，再配置图片资源");
  }
  const payload = {
    image_id: dom.roleImageIdInput.value ? Number(dom.roleImageIdInput.value) : null,
    role_id: state.selectedRoleId,
    image_url: dom.roleImageUrlInput.value.trim(),
    image_type: dom.roleImageTypeInput.value,
    stage_key: dom.roleImageStageInput.value.trim(),
    trigger_type: dom.roleImageTriggerInput.value,
    sort_order: dom.roleImageSortInput.value ? Number(dom.roleImageSortInput.value) : 0,
    is_active: dom.roleImageActiveInput.checked
  };
  const path = payload.image_id ? "/api/admin/role-images/update" : "/api/admin/role-images";
  await request(path, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  await loadRoleImages(state.selectedRoleId);
  setStatus("角色图片资源已保存并 reload 成功。", false);
}

function bindEvents() {
  dom.saveTokenButton.addEventListener("click", function () {
    window.localStorage.setItem("admin_token", dom.tokenInput.value.trim());
    setStatus("后台 Token 已保存到本地浏览器。", false);
  });

  dom.newRoleButton.addEventListener("click", function () {
    state.selectedRoleId = null;
    state.roleImages = [];
    fillRoleForm(null);
    fillRoleImageForm(null);
    renderRoleList();
    renderRoleImages();
    setStatus("已切换到新角色创建表单。", false);
  });

  dom.newImageButton.addEventListener("click", function () {
    fillRoleImageForm(null);
    renderRoleImages();
    setStatus("已切换到新图片资源创建表单。", false);
  });

  dom.roleForm.addEventListener("submit", function (event) {
    saveRole(event).catch(function (error) {
      setStatus(error.message || "角色保存失败", true);
    });
  });

  dom.roleImageForm.addEventListener("submit", function (event) {
    saveRoleImage(event).catch(function (error) {
      setStatus(error.message || "角色图片保存失败", true);
    });
  });
}

async function init() {
  dom.tokenInput.value = getAdminToken();
  bindEvents();
  try {
    await loadRoles();
    setStatus("角色列表 load 成功。", false);
  } catch (error) {
    setStatus(error.message || "后台初始化失败", true);
  }
}

init();
