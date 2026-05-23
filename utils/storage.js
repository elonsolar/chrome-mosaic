// 简化的存储工具函数（可选，如果需要在content script中使用）

// 向background发送消息
function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}

// 获取所有会话
async function getConversations() {
  return sendMessage({ action: 'getConversations' });
}

// 获取单个会话
async function getConversation(conversationId) {
  const conversations = await getConversations();
  return conversations.find(c => c.id === conversationId);
}

// 创建会话
async function createConversation(name, memberIds) {
  return sendMessage({
    action: 'createConversation',
    name,
    memberIds
  });
}

// 删除会话
async function deleteConversation(conversationId) {
  return sendMessage({
    action: 'deleteConversation',
    conversationId
  });
}

// 添加消息
async function addMessage(conversationId, memberId, content, isUser) {
  return sendMessage({
    action: 'addMessage',
    conversationId,
    memberId,
    content,
    isUser
  });
}

// 获取所有成员
async function getMembers() {
  return sendMessage({ action: 'getMembers' });
}

// 创建成员
async function createMember(name, provider, model, systemPrompt) {
  return sendMessage({
    action: 'createMember',
    name,
    provider,
    model,
    systemPrompt
  });
}

// 更新成员
async function updateMember(memberId, updates) {
  return sendMessage({
    action: 'updateMember',
    memberId,
    updates
  });
}

// 删除成员
async function deleteMember(memberId) {
  return sendMessage({
    action: 'deleteMember',
    memberId
  });
}

// 获取所有成员
async function getMembers() {
  return sendMessage({ action: 'getMembers' });
}

// 获取设置
async function getSettings() {
  return sendMessage({ action: 'getSettings' });
}

// 更新设置
async function updateSettings(settings) {
  return sendMessage({
    action: 'updateSettings',
    settings
  });
}

// ========== 团队管理 API ==========

// 获取所有团队
async function getTeams() {
  return sendMessage({ action: 'getTeams' });
}

// 获取单个团队
async function getTeam(teamId) {
  return sendMessage({
    action: 'getTeam',
    teamId
  });
}

// 获取团队及其成员信息
async function getTeamWithMembers(teamId) {
  return sendMessage({
    action: 'getTeamWithMembers',
    teamId
  });
}

// 创建团队
async function createTeam(teamData) {
  return sendMessage({
    action: 'createTeam',
    data: teamData
  });
}

// 更新团队
async function updateTeam(teamId, updates) {
  return sendMessage({
    action: 'updateTeam',
    teamId,
    data: updates
  });
}

// 删除团队
async function deleteTeam(teamId) {
  return sendMessage({
    action: 'deleteTeam',
    teamId
  });
}

// 搜索团队
async function searchTeams(keyword) {
  return sendMessage({
    action: 'searchTeams',
    keyword
  });
}

// 导出函数
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    sendMessage,
    getConversations,
    getConversation,
    createConversation,
    deleteConversation,
    addMessage,
    getMembers,
    createMember,
    updateMember,
    deleteMember,
    getSettings,
    updateSettings,
    getTeams,
    getTeam,
    getTeamWithMembers,
    createTeam,
    updateTeam,
    deleteTeam,
    searchTeams
  };
}
