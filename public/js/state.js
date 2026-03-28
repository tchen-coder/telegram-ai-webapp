export function createState() {
  return {
    userId: null,
    roles: [],
    chatRoles: [],
    currentRoleId: null,
    previewRole: null,
    previewSource: "home",
    activeRole: null,
    switchingRoleId: null,
    deletingRoleId: null,
    messages: [],
    isSending: false,
    homeSearch: "",
    chatSearch: "",
    userProfile: {
      firstName: "访客",
      username: "",
      displayName: "网页访客",
      isGuest: true,
      source: "guest",
      sourceLabel: "网页访客",
      platformLabel: "网页",
      supportsTelegramPush: false
    }
  };
}
