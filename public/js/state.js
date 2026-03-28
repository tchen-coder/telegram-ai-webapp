export function createState() {
  return {
    userId: null,
    roles: [],
    rolesPagination: {
      page: 0,
      pageSize: 10,
      hasMore: true,
      isLoading: false
    },
    chatRoles: [],
    chatRolesPagination: {
      page: 0,
      pageSize: 10,
      hasMore: true,
      isLoading: false
    },
    currentRoleId: null,
    previewRole: null,
    previewSource: "home",
    activeRole: null,
    switchingRoleId: null,
    deletingRoleId: null,
    messages: [],
    conversationPagination: {
      hasMore: false,
      nextBeforeGroupSeq: null,
      isLoadingHistory: false,
      activeRoleId: null
    },
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
