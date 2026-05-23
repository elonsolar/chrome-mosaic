/**
 * 团队管理器
 * 管理团队的CRUD操作
 */
class TeamManager {
  constructor() {
    this.storageKey = 'teams';
  }

  /**
   * 获取所有团队
   */
  async getTeams() {
    const result = await chrome.storage.local.get(this.storageKey);
    return result[this.storageKey] || [];
  }

  /**
   * 获取单个团队
   */
  async getTeam(teamId) {
    const teams = await this.getTeams();
    return teams.find(team => team.id === teamId) || null;
  }

  /**
   * 创建团队
   */
  async createTeam(teamData) {
    const teams = await this.getTeams();

    // 验证成员ID是否有效
    if (teamData.memberIds && teamData.memberIds.length > 0) {
      const isValid = await this.validateTeamMembers(teamData.memberIds);
      if (!isValid) {
        throw new Error('包含无效的成员ID');
      }
    }

    const newTeam = {
      id: 'team-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      name: teamData.name || '未命名团队',
      description: teamData.description || '',
      memberIds: teamData.memberIds || [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    teams.push(newTeam);
    await this.saveTeams(teams);

    return newTeam;
  }

  /**
   * 更新团队
   */
  async updateTeam(teamId, updates) {
    const teams = await this.getTeams();
    const index = teams.findIndex(team => team.id === teamId);

    if (index === -1) {
      throw new Error('团队不存在');
    }

    // 验证成员ID
    if (updates.memberIds && updates.memberIds.length > 0) {
      const isValid = await this.validateTeamMembers(updates.memberIds);
      if (!isValid) {
        throw new Error('包含无效的成员ID');
      }
    }

    teams[index] = {
      ...teams[index],
      ...updates,
      id: teamId, // 确保ID不被修改
      createdAt: teams[index].createdAt, // 保持创建时间
      updatedAt: Date.now()
    };

    await this.saveTeams(teams);

    return teams[index];
  }

  /**
   * 删除团队
   * 策略：保留会话，清除teamId，保留memberIds
   */
  async deleteTeam(teamId) {
    const teams = await this.getTeams();
    const filteredTeams = teams.filter(team => team.id !== teamId);

    if (filteredTeams.length === teams.length) {
      throw new Error('团队不存在');
    }

    await this.saveTeams(filteredTeams);

    // 清除关联会话的teamId
    await this.clearTeamFromConversations(teamId);

    return { success: true };
  }

  /**
   * 验证团队成员是否有效
   */
  async validateTeamMembers(memberIds) {
    try {
      const result = await chrome.storage.local.get('models');
      const models = result.models || [];
      const validIds = new Set(models.map(m => m.id));
      return memberIds.every(id => validIds.has(id));
    } catch (error) {
      console.error('[TeamManager] 验证成员失败:', error);
      return false;
    }
  }

  /**
   * 保存团队列表
   */
  async saveTeams(teams) {
    await chrome.storage.local.set({ [this.storageKey]: teams });
  }

  /**
   * 清除会话中的团队引用
   * 保留会话，但清除teamId和memberIds（让用户重新选择）
   */
  async clearTeamFromConversations(teamId) {
    try {
      const result = await chrome.storage.local.get('conversations');
      const conversations = result.conversations || [];

      let updated = false;
      const updatedConversations = conversations.map(conv => {
        if (conv.teamId === teamId) {
          updated = true;
          // 清除teamId，但保留memberIds（快照）
          const { teamId, ...rest } = conv;
          return rest;
        }
        return conv;
      });

      if (updated) {
        await chrome.storage.local.set({ conversations: updatedConversations });
      }
    } catch (error) {
      console.error('[TeamManager] 清除会话团队引用失败:', error);
    }
  }

  /**
   * 获取团队的详细信息（包含成员数据）
   */
  async getTeamWithMembers(teamId) {
    const team = await this.getTeam(teamId);
    if (!team) {
      return null;
    }

    try {
      const result = await chrome.storage.local.get('models');
      const models = result.models || [];
      const members = models.filter(m => team.memberIds.includes(m.id));

      return {
        ...team,
        members
      };
    } catch (error) {
      console.error('[TeamManager] 获取团队成员失败:', error);
      return {
        ...team,
        members: []
      };
    }
  }

  /**
   * 搜索团队
   */
  async searchTeams(keyword) {
    const teams = await this.getTeams();
    if (!keyword) {
      return teams;
    }

    const lowerKeyword = keyword.toLowerCase();
    return teams.filter(team =>
      team.name.toLowerCase().includes(lowerKeyword) ||
      (team.description && team.description.toLowerCase().includes(lowerKeyword))
    );
  }
}

// 如果在background环境中，创建单例实例
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TeamManager;
}
