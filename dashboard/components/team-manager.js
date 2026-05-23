/**
 * 团队管理组件
 * 负责渲染团队列表和处理团队操作
 */

class TeamManager {
  constructor() {
    this.teams = [];
    this.models = [];
    this.members = [];
    this.flows = [];
    this.elements = {};
  }

  async init() {
    console.log('[TeamManager] 初始化');

    this.initElements();
    this.bindEvents();

    // 立即渲染（显示骨架屏或空状态）
    this.render();

    await this.loadTeams();
    await this.loadModels();
    await this.loadMembers();
    await this.loadFlows();

    // 数据加载完成后重新渲染
    this.render();

    console.log('[TeamManager] 初始化完成，团队数量:', this.teams.length);
  }

  initElements() {
    this.elements.teamsContainer = document.getElementById('teamsContainer');
  }

  bindEvents() {
    // 委托事件处理团队卡片操作
    if (this.elements.teamsContainer) {
      this.elements.teamsContainer.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.team-edit-btn');
        const deleteBtn = e.target.closest('.team-delete-btn');
        const teamCard = e.target.closest('.team-card');

        if (editBtn) {
          e.preventDefault();
          e.stopPropagation();
          const teamId = editBtn.dataset.teamId;
          this.editTeam(teamId);
        } else if (deleteBtn) {
          e.preventDefault();
          e.stopPropagation();
          const teamId = deleteBtn.dataset.teamId;
          this.deleteTeam(teamId);
        } else if (teamCard) {
          const teamId = teamCard.dataset.teamId;
          // 点击卡片可以查看详情（可选）
        }
      });
    }
  }

  async loadTeams() {
    try {
      const result = await chrome.runtime.sendMessage({ action: 'getTeams' });
      this.teams = result || [];
      console.log('[TeamManager] 加载团队:', this.teams.length);
    } catch (error) {
      console.error('[TeamManager] 加载团队失败:', error);
      this.teams = [];
    }
  }

  async loadModels() {
    try {
      const result = await chrome.runtime.sendMessage({ action: 'getModels' });
      this.models = result || [];
      console.log('[TeamManager] 加载模型:', this.models.length);
    } catch (error) {
      console.error('[TeamManager] 加载模型失败:', error);
      this.models = [];
    }
  }

  async loadMembers() {
    try {
      const result = await chrome.runtime.sendMessage({ action: 'getMembers' });
      this.members = result || [];
      console.log('[TeamManager] 加载成员:', this.members.length);
    } catch (error) {
      console.error('[TeamManager] 加载成员失败:', error);
      this.members = [];
    }
  }

  async loadFlows() {
    try {
      const result = await chrome.runtime.sendMessage({ action: 'getFlows' });
      this.flows = result || [];
      console.log('[TeamManager] 加载流程:', this.flows.length);
    } catch (error) {
      console.error('[TeamManager] 加载流程失败:', error);
      this.flows = [];
    }
  }

  render() {
    if (!this.elements.teamsContainer) return;

    // 移除骨架屏
    const skeleton = this.elements.teamsContainer.querySelector('.loading-skeleton-grid');
    if (skeleton) {
      skeleton.remove();
    }

    // 清除所有状态类
    this.elements.teamsContainer.classList.remove('has-teams', 'is-empty');

    if (this.teams.length === 0) {
      this.elements.teamsContainer.classList.add('is-empty');
      this.elements.teamsContainer.innerHTML = '<div class="empty-state-illustrated empty-state-centered"><div class="empty-background"><div class="floating-card card-1"></div><div class="floating-card card-2"></div><div class="floating-card card-3"></div></div><div class="empty-icon">👥</div><h3 class="empty-title">还没有团队</h3><p class="empty-description">团队可以帮助你快速组织多个成员<br>创建会话时一键选择整个团队</p><div class="empty-actions"><button class="btn btn-primary btn-lg" id="emptyCreateTeamBtn"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2v12M2 8h12"/></svg>创建第一个团队</button></div><div class="empty-tips"><p><strong>💡 提示：</strong></p><ul><li>将常用的成员组合保存为团队</li><li>创建会话时选择团队，自动加载所有成员</li><li>提高团队协作效率</li></ul></div></div>';

      // 绑定空状态中的创建按钮
      const emptyCreateBtn = document.getElementById('emptyCreateTeamBtn');
      if (emptyCreateBtn) {
        emptyCreateBtn.addEventListener('click', () => {
          if (window.teamForm) {
            window.teamForm.showCreateForm();
          }
        });
      }

      return;
    }

    this.elements.teamsContainer.classList.add('has-teams');
    this.elements.teamsContainer.innerHTML = `
      <div class="teams-grid">
        ${this.teams.map(team => {
          const members = this.models.filter(m => team.memberIds.includes(m.id));
          const memberCount = members.length;
          const firstChar = team.name.charAt(0).toUpperCase();
          const colors = ['#007AFF', '#5856D6', '#B794F4', '#FF2D55', '#FF9500', '#FFCC00', '#34C759', '#5AC8FA'];
          const colorIndex = team.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
          const teamColor = colors[colorIndex];
          const providerColors = {
            deepseek: '#4f46e5',
            doubao: '#0891b2',
            qianwen: '#7c3aed',
            kimi: '#6366f1'
          };

          return `
            <div class="team-card" data-team-id="${team.id}">
              <div class="team-card-banner" style="background: linear-gradient(135deg, ${teamColor}, ${teamColor}cc)">
                <div class="team-card-banner-pattern"></div>
                <div class="team-card-banner-icon">
                  ${firstChar}
                </div>
                <div class="team-card-banner-actions">
                  <button class="team-action-btn team-edit-btn" data-team-id="${team.id}" title="编辑团队">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
                      <path d="M11 2.5L13.5 5L5 13.5H2.5V11L11 2.5Z" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                  <button class="team-action-btn team-delete-btn delete" data-team-id="${team.id}" title="删除团队">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
                      <path d="M4 4L12 12M12 4L4 12" stroke-linecap="round"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div class="team-card-body">
                <div class="team-card-name">${this.escapeHtml(team.name)}</div>
                ${team.description ? `<div class="team-card-desc">${this.escapeHtml(team.description)}</div>` : '<div class="team-card-desc" style="opacity:0">&nbsp;</div>'}
                <div class="team-card-divider"></div>
                ${memberCount > 0 ? `
                  <div class="team-card-members">
                    ${members.slice(0, 4).map(m => {
                      const pColor = providerColors[m.provider] || '#007aff';
                      return `
                        <div class="team-member-chip" title="${this.escapeHtml(m.name)} · ${m.provider}">
                          <div class="team-member-chip-avatar" style="background: ${pColor}">
                            ${m.name.charAt(0)}
                          </div>
                          <span class="team-member-chip-name">${this.escapeHtml(m.name)}</span>
                        </div>
                      `;
                    }).join('')}
                    ${memberCount > 4 ? `
                      <div class="team-member-chip-more">+${memberCount - 4}</div>
                    ` : ''}
                  </div>
                ` : `
                  <div class="team-card-empty-members">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                      <circle cx="8" cy="5" r="3"/>
                      <path d="M2 15c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke-linecap="round"/>
                    </svg>
                    <span>暂无成员</span>
                  </div>
                `}
                <div class="team-card-footer">
                  <div class="team-card-stat">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                      <circle cx="8" cy="5" r="2.5"/>
                      <circle cx="3" cy="13" r="1.5"/>
                      <circle cx="13" cy="13" r="1.5"/>
                      <path d="M6.5 9.5c-1.5.5-3 1.5-3 3.5M9.5 9.5c1.5.5 3 1.5 3 3.5" stroke-linecap="round"/>
                    </svg>
                    <strong>${memberCount}</strong> 位成员
                  </div>
                  <div class="team-card-stat">
                    ${this.formatTimeAgo(team.updatedAt)}
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  async editTeam(teamId) {
    const team = this.teams.find(t => t.id === teamId);
    if (!team) {
      console.error('[TeamManager] 团队不存在:', teamId);
      return;
    }

    if (window.teamForm) {
      window.teamForm.showEditForm(team);
    }
  }

  async deleteTeam(teamId) {
    const team = this.teams.find(t => t.id === teamId);
    if (!team) {
      console.error('[TeamManager] 团队不存在:', teamId);
      return;
    }

    const confirmed = confirm(
      `确定要删除团队"${team.name}"吗？\n\n` +
      `删除后：\n` +
      `• 团队将被删除\n` +
      `• 已创建的会话将保留，但不再关联此团队`
    );

    if (!confirmed) return;

    try {
      await chrome.runtime.sendMessage({
        action: 'deleteTeam',
        teamId
      });

      // 从本地列表中移除
      this.teams = this.teams.filter(t => t.id !== teamId);

      // 重新渲染
      this.render();

      // 刷新dashboard统计数据
      if (window.dashboard) {
        await window.dashboard.refresh();
      }

      console.log('[TeamManager] 团队已删除:', teamId);
    } catch (error) {
      console.error('[TeamManager] 删除团队失败:', error);
      alert('删除失败：' + error.message);
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  formatTimeAgo(timestamp) {
    if (!timestamp) return '';
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}天前`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}个月前`;
    return `${Math.floor(months / 12)}年前`;
  }
}

// 初始化TeamManager
let teamManager;

try {
  teamManager = new TeamManager();
  teamManager.init().then(() => {
    console.log('[TeamManager] 初始化成功');
    window.teamManager = teamManager;
  }).catch(error => {
    console.error('[TeamManager] 初始化失败:', error);
  });
} catch (error) {
  console.error('[TeamManager] 创建实例失败:', error);
}
