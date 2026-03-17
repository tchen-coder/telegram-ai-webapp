export function createState() {
  return {
    userId: null,
    roles: [],
    chatRoles: [],
    currentRoleId: null,
    activeRole: null,
    switchingRoleId: null,
    messages: [],
    isSending: false,
    userProfile: {
      firstName: "Telegram 用户",
      username: ""
    }
  };
}
