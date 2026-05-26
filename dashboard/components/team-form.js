/**
 * 团队表单组件
 * 负责创建和编辑团队的表单
 */

class TeamForm {
  constructor() {
    this.currentTeam = null; // null = 创建模式, 有值 = 编辑模式
    this.models = [];
    this.flows = [];
    this.tempMembers = []; // 临时存储正在创建的团队成员
    this.elements = {};
  }

  async init() {
    console.log('[TeamForm] 初始化');

    this.initElements();
    this.bindEvents();
    await this.loadModels();
    await this.loadFlows();

    console.log('[TeamForm] 初始化完成');
  }

  initElements() {
    // 模态框
    this.elements.teamModal = document.getElementById('teamModal');

    // 表单元素
    this.elements.teamModalTitle = document.getElementById('teamModalTitle');
    this.elements.teamName = document.getElementById('teamName');
    this.elements.teamDescription = document.getElementById('teamDescription');
    this.elements.teamMembersList = document.getElementById('teamMembersList');
    this.elements.inlineMemberForm = document.getElementById('inlineMemberForm');

    // 内联成员表单元素
    this.elements.inlineMemberName = document.getElementById('inlineMemberName');
    this.elements.inlineMemberModel = document.getElementById('inlineMemberModel');
    this.elements.inlineMemberFlow = document.getElementById('inlineMemberFlow');
    this.elements.addTeamMemberBtn = document.getElementById('addTeamMemberBtn');
    this.elements.cancelInlineMemberBtn = document.getElementById('cancelInlineMemberBtn');
    this.elements.saveInlineMemberBtn = document.getElementById('saveInlineMemberBtn');

    // 按钮
    this.elements.saveTeamBtn = document.getElementById('saveTeamBtn');
    this.elements.cancelTeamBtn = document.getElementById('cancelTeamBtn');
    this.elements.closeBtns = this.elements.teamModal?.querySelectorAll('.close-btn');
  }

  bindEvents() {
    console.log('[TeamForm] 绑定事件');

    // 新增成员按钮
    if (this.elements.addTeamMemberBtn) {
      this.elements.addTeamMemberBtn.addEventListener('click', () => {
        this.showInlineMemberForm();
      });
    }

    // 取消内联成员表单
    if (this.elements.cancelInlineMemberBtn) {
      this.elements.cancelInlineMemberBtn.addEventListener('click', () => {
        this.hideInlineMemberForm();
      });
    }

    // 保存内联成员
    if (this.elements.saveInlineMemberBtn) {
      this.elements.saveInlineMemberBtn.addEventListener('click', () => {
        this.saveInlineMember();
      });
    }

    // 取消按钮
    if (this.elements.cancelTeamBtn) {
      this.elements.cancelTeamBtn.addEventListener('click', () => {
        this.hideForm();
      });
      console.log('[TeamForm] 取消按钮已绑定');
    }

    // 关闭按钮
    if (this.elements.closeBtns) {
      this.elements.closeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          this.hideForm();
        });
      });
      console.log('[TeamForm] 关闭按钮已绑定');
    }

    // 点击模态框外部关闭
    if (this.elements.teamModal) {
      this.elements.teamModal.addEventListener('click', (e) => {
        if (e.target === this.elements.teamModal) {
          this.hideForm();
        }
      });
    }

    // ESC键关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.elements.teamModal?.classList.contains('active')) {
        this.hideForm();
      }
    });

    // 保存按钮 - 使用事件委托确保始终绑定
    const saveBtn = document.getElementById('saveTeamBtn');
    if (saveBtn) {
      // 移除旧的监听器（如果有）
      saveBtn.removeEventListener('click', this._saveHandler);
      // 创建新的监听器
      this._saveHandler = () => this.saveTeam();
      saveBtn.addEventListener('click', this._saveHandler);
      console.log('[TeamForm] 保存按钮已绑定');
    } else {
      console.error('[TeamForm] 找不到保存按钮！');
    }
  }

  showInlineMemberForm() {
    if (this.elements.inlineMemberForm) {
      this.elements.inlineMemberForm.style.display = 'block';
      this.elements.addTeamMemberBtn.style.display = 'none';

      // 聚焦到第一个选择框（角色）
      if (this.elements.inlineMemberFlow) {
        this.elements.inlineMemberFlow.focus();
      }
    }
  }

  hideInlineMemberForm() {
    if (this.elements.inlineMemberForm) {
      this.elements.inlineMemberForm.style.display = 'none';
      this.elements.addTeamMemberBtn.style.display = 'inline-block';

      // 重置表单
      this.resetInlineMemberForm();
    }
  }

  resetInlineMemberForm() {
    if (this.elements.inlineMemberFlow) this.elements.inlineMemberFlow.value = '';
    if (this.elements.inlineMemberModel) this.elements.inlineMemberModel.value = '';
    if (this.elements.inlineMemberName) this.elements.inlineMemberName.value = '';
  }

  async saveInlineMember() {
    const flowId = this.elements.inlineMemberFlow?.value;
    const modelId = this.elements.inlineMemberModel?.value;
    let nickname = this.elements.inlineMemberName?.value?.trim();

    // 验证
    if (!flowId) {
      alert('请选择角色');
      if (this.elements.inlineMemberFlow) this.elements.inlineMemberFlow.focus();
      return;
    }

    if (!modelId) {
      alert('请选择模型');
      if (this.elements.inlineMemberModel) this.elements.inlineMemberModel.focus();
      return;
    }

    // 如果昵称为空，使用角色名称
    if (!nickname) {
      const flow = this.flows.find(f => f.id === flowId);
      nickname = flow?.name || '未命名';
    }

    // 添加到临时成员列表
    this.tempMembers.push({
      id: `temp_${Date.now()}`,
      name: nickname,
      modelId,
      flowId
    });

    // 重新渲染成员列表
    this.renderMembersList(this.tempMembers);

    // 隐藏表单并重置
    this.hideInlineMemberForm();
  }

  async loadModels() {
    try {
      const result = await chrome.runtime.sendMessage({ action: 'getModels' });
      this.models = result || [];
      console.log('[TeamForm] 加载模型:', this.models.length);

      // 填充模型选择器
      this.populateModelSelector();
    } catch (error) {
      console.error('[TeamForm] 加载模型失败:', error);
      this.models = [];
    }
  }

  async loadFlows() {
    try {
      const result = await chrome.runtime.sendMessage({ action: 'getFlows' });
      this.flows = result || [];
      console.log('[TeamForm] 加载流程:', this.flows.length);

      // 填充流程选择器
      this.populateFlowSelector();
    } catch (error) {
      console.error('[TeamForm] 加载流程失败:', error);
      this.flows = [];
    }
  }

  populateModelSelector() {
    if (!this.elements.inlineMemberModel) return;

    this.elements.inlineMemberModel.innerHTML = `
      <option value="">请选择模型</option>
      ${this.models.map(model => {
        const platformName = model.platformName || '未知平台';
        return `<option value="${model.id}">${this.escapeHtml(platformName)} - ${this.escapeHtml(model.code || model.id)}</option>`;
      }).join('')}
    `;
  }

  populateFlowSelector() {
    if (!this.elements.inlineMemberFlow) return;

    this.elements.inlineMemberFlow.innerHTML = `
      <option value="">请选择角色</option>
      ${this.flows.map(flow => `
        <option value="${flow.id}">${this.escapeHtml(flow.name)}</option>
      `).join('')}
    `;
  }

  renderMembersList(members = []) {
    console.log('[TeamForm] 渲染成员列表, 数量:', members.length);

    if (!this.elements.teamMembersList) return;

    if (members.length === 0) {
      this.elements.teamMembersList.innerHTML = `
        <div class="empty-state" style="padding: 24px; text-align: center; color: #86868b;">
          <div style="font-size: 32px; margin-bottom: 8px;">👥</div>
          <p style="margin: 0; font-size: 13px;">暂无成员，点击上方按钮添加</p>
        </div>
      `;
      return;
    }

    this.elements.teamMembersList.innerHTML = members.map((member, index) => {
      const flow = this.flows.find(f => f.id === member.flowId);
      const model = this.models.find(m => m.id === member.modelId);
      const providerName = model?.platformName || model?.code || '未知';
      const modelName = model?.code || '未知';
      const displayName = member.name || (flow?.name || '未命名');

      return `
        <div class="team-member-item" style="background: #fff; border: 2px solid #e8e8ed; border-radius: 10px; padding: 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s ease;">
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 600; color: #1d1d1f; font-size: 14px; margin-bottom: 4px;">
              ${this.escapeHtml(displayName)}
            </div>
            <div style="font-size: 12px; color: #86868b; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span>🎭 ${this.escapeHtml(flow?.name || '无角色')}</span>
              <span>🤖 ${this.escapeHtml(providerName)} - ${this.escapeHtml(modelName)}</span>
            </div>
          </div>
          <button type="button" class="remove-team-member-btn" data-index="${index}" style="padding: 6px 8px; background: #ffe5e5; color: #ff3b30; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; transition: all 0.2s ease;">
            删除
          </button>
        </div>
      `;
    }).join('');

    // 绑定删除按钮事件
    this.elements.teamMembersList.querySelectorAll('.remove-team-member-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.removeTempMember(index);
      });
    });
  }

  removeTempMember(index) {
    this.tempMembers.splice(index, 1);
    this.renderMembersList(this.tempMembers);
  }

  showCreateForm() {
    this.currentTeam = null;
    this.resetForm();
    this.tempMembers = []; // 清空临时成员
    this.renderMembersList(this.tempMembers);
    this.hideInlineMemberForm();

    if (this.elements.teamModalTitle) {
      this.elements.teamModalTitle.textContent = '新建团队';
    }

    this.showModal();
  }

  async showEditForm(team) {
    this.currentTeam = team;
    this.resetForm();

    // 填充表单
    if (this.elements.teamName) {
      this.elements.teamName.value = team.name || '';
    }
    if (this.elements.teamDescription) {
      this.elements.teamDescription.value = team.description || '';
    }

    // 加载团队成员信息
    // 这里需要将团队成员的memberIds转换为完整的成员信息
    this.tempMembers = [];
    if (team.memberIds && team.memberIds.length > 0) {
      // TODO: 从存储中获取成员信息
      // 暂时使用简化的方式，假设memberIds包含模型ID和流程ID
      // 实际应该从团队成员存储中获取完整信息
      console.log('[TeamForm] 加载团队成员:', team.memberIds);
    }

    this.renderMembersList(this.tempMembers);
    this.hideInlineMemberForm();

    if (this.elements.teamModalTitle) {
      this.elements.teamModalTitle.textContent = '编辑团队';
    }

    this.showModal();
  }

  showModal() {
    if (this.elements.teamModal) {
      this.elements.teamModal.classList.add('active');

      // 聚焦到第一个输入框
      setTimeout(() => {
        if (this.elements.teamName) {
          this.elements.teamName.focus();
        }
      }, 100);
    }
  }

  hideForm() {
    if (this.elements.teamModal) {
      this.elements.teamModal.classList.remove('active');
    }

    // 延迟重置表单，等待动画完成
    setTimeout(() => {
      this.resetForm();
      this.currentTeam = null;
      this.tempMembers = [];
      this.hideInlineMemberForm();
    }, 200);
  }

  resetForm() {
    if (this.elements.teamName) {
      this.elements.teamName.value = '';
    }
    if (this.elements.teamDescription) {
      this.elements.teamDescription.value = '';
    }
    this.resetInlineMemberForm();
  }

  async saveTeam() {
    console.log('[TeamForm] 开始保存团队');

    // 验证表单
    const name = this.elements.teamName?.value.trim();
    const description = this.elements.teamDescription?.value.trim();

    if (!name) {
      alert('请输入团队名称');
      if (this.elements.teamName) {
        this.elements.teamName.focus();
      }
      return;
    }

    if (this.tempMembers.length === 0) {
      alert('请至少添加一个成员');
      return;
    }

    console.log('[TeamForm] 表单验证通过:', { name, memberCount: this.tempMembers.length });

    // 禁用保存按钮
    if (this.elements.saveTeamBtn) {
      this.elements.saveTeamBtn.disabled = true;
      this.elements.saveTeamBtn.innerHTML = '<span class="loading-spinner"></span> 保存中...';
    }

    try {
      // 创建所有临时成员
      const memberIds = [];
      for (const tempMember of this.tempMembers) {
        try {
          const model = this.models.find(m => m.id === tempMember.modelId);
          if (!model) {
            console.error('[TeamForm] 模型不存在:', tempMember.modelId);
            continue;
          }

          // 获取流程内容
          let systemPrompt = '';
          if (tempMember.flowId) {
            const flow = this.flows.find(f => f.id === tempMember.flowId);
            if (flow) {
              systemPrompt = flow.content || '';
            }
          }

          // 创建成员
          const newMember = await chrome.runtime.sendMessage({
            action: 'createMember',
            name: tempMember.name,
            provider: model.provider,
            model: model.model,
            systemPrompt: systemPrompt
          });

          if (newMember && newMember.id) {
            memberIds.push(newMember.id);
            console.log('[TeamForm] 成员已创建:', newMember);
          }
        } catch (error) {
          console.error('[TeamForm] 创建成员失败:', tempMember, error);
        }
      }

      if (memberIds.length === 0) {
        alert('创建成员失败，请重试');
        return;
      }

      let result;

      if (this.currentTeam) {
        // 编辑模式
        console.log('[TeamForm] 编辑模式, teamId:', this.currentTeam.id);
        result = await chrome.runtime.sendMessage({
          action: 'updateTeam',
          teamId: this.currentTeam.id,
          data: {
            name,
            description,
            memberIds
          }
        });

        // 更新本地列表
        const index = window.teamManager?.teams.findIndex(t => t.id === this.currentTeam.id);
        if (index !== undefined && index !== -1) {
          window.teamManager.teams[index] = result;
        }

        console.log('[TeamForm] 团队已更新:', result);
      } else {
        // 创建模式
        console.log('[TeamForm] 创建模式');
        result = await chrome.runtime.sendMessage({
          action: 'createTeam',
          data: {
            name,
            description,
            memberIds
          }
        });

        // 添加到本地列表
        if (window.teamManager) {
          window.teamManager.teams.push(result);
        }

        console.log('[TeamForm] 团队已创建:', result);
      }

      // 刷新团队列表
      if (window.teamManager) {
        await window.teamManager.loadTeams();
        window.teamManager.render();
      }

      // 刷新dashboard统计数据
      if (window.dashboard) {
        await window.dashboard.refresh();
      }

      // 关闭表单
      this.hideForm();

    } catch (error) {
      console.error('[TeamForm] 保存团队失败:', error);
      alert('保存失败：' + (error.message || error));
    } finally {
      // 恢复保存按钮
      if (this.elements.saveTeamBtn) {
        this.elements.saveTeamBtn.disabled = false;
        this.elements.saveTeamBtn.innerHTML = '<span>✓</span> 保存';
      }
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// 初始化TeamForm
let teamForm;

// 由于script在body底部，DOM应该已经加载完成
// 直接初始化，并添加错误处理
try {
  teamForm = new TeamForm();
  teamForm.init().then(() => {
    console.log('[TeamForm] 初始化成功');
    window.teamForm = teamForm;
  }).catch(error => {
    console.error('[TeamForm] 初始化失败:', error);
  });
} catch (error) {
  console.error('[TeamForm] 创建实例失败:', error);
}
