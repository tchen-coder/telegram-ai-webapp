export function getDomRefs() {
  return {
    appShell: document.querySelector(".app-shell"),
    homeView: document.getElementById("homeView"),
    chatView: document.getElementById("chatView"),
    profileView: document.getElementById("profileView"),
    shareButton: document.getElementById("shareButton"),
    backButton: document.getElementById("backButton"),
    closeButton: document.getElementById("closeButton"),
    roleGrid: document.getElementById("roleGrid"),
    statusPanel: document.getElementById("statusPanel"),
    chatStatus: document.getElementById("chatStatus"),
    chatRoleGrid: document.getElementById("chatRoleGrid"),
    chatMessages: document.getElementById("chatMessages"),
    chatRolePanel: document.getElementById("chatRolePanel"),
    chatComposer: document.querySelector(".chat-composer"),
    chatRoleName: document.getElementById("chatRoleName"),
    chatRoleDescription: document.getElementById("chatRoleDescription"),
    chatInput: document.getElementById("chatInput"),
    sendButton: document.getElementById("sendButton"),
    composerNote: document.getElementById("composerNote"),
    profileAvatar: document.getElementById("profileAvatar"),
    profileName: document.getElementById("profileName"),
    profileUsername: document.getElementById("profileUsername"),
    bottomNav: document.getElementById("bottomNav"),
    navItems: document.querySelectorAll(".nav-item[data-nav]")
  };
}
