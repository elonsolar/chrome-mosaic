/**
 * 平台管理标签页
 * 集成到 Dashboard 的 models 页面
 */
class ModelsTab {
  constructor(dashboard) {
    this.dashboard = dashboard;
    this.platforms = [];
    this.currentPlatform = null;
    this.elements = {};
  }

  async init() {
    console.log('[ModelsTab] 初始化');

    this.render();

    await this.loadPlatforms();

    console.log('[ModelsTab] 初始化完成');
  }

  render() {
    const container = document.getElementById('modelsTabContainer');
    if (!container) {
      console.error('[ModelsTab] 找不到容器元素，无法渲染');
      return;
    }

    console.log('[ModelsTab] 开始渲染平台管理页面');

    container.innerHTML = `
      <div class="platforms-page">
        <div class="page-toolbar">
          <div class="page-toolbar-left">
            <div class="search-box">
              <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input type="text" id="platformSearchInput" placeholder="搜索平台...">
              <button class="clear-btn" id="clearPlatformSearch" style="display: none;">&times;</button>
            </div>
          </div>
          <div class="page-toolbar-right">
            <button class="btn btn-primary" id="createPlatformBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span>新增平台</span>
            </button>
          </div>
        </div>

        <div class="platforms-layout">
          <div class="platforms-list-section">
            <div class="platforms-list" id="platformsList">
            </div>
          </div>

          <div class="platforms-detail-section">
            <div class="platforms-detail-content" id="platformsDetail">
              <div class="empty-state">
                <p>请从左侧选择一个平台查看详情</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    console.log('[ModelsTab] HTML 已插入到容器');

    this.initElements();
    this.bindEvents();
  }

  initElements() {
    const container = document.querySelector('.platforms-page');
    if (!container) {
      console.error('[ModelsTab] 找不到 .platforms-page 容器');
      return;
    }

    console.log('[ModelsTab] 初始化 DOM 元素引用');

    this.elements = {
      platformsList: container.querySelector('#platformsList'),
      platformsDetail: container.querySelector('#platformsDetail'),
      searchInput: container.querySelector('#platformSearchInput'),
      clearSearchBtn: container.querySelector('#clearPlatformSearch'),
      createPlatformBtn: container.querySelector('#createPlatformBtn')
    };

    console.log('[ModelsTab] DOM 元素引用初始化完成:', {
      hasPlatformsList: !!this.elements.platformsList,
      hasPlatformsDetail: !!this.elements.platformsDetail,
      hasSearchInput: !!this.elements.searchInput,
      hasCreatePlatformBtn: !!this.elements.createPlatformBtn
    });
  }

  bindEvents() {
    // 搜索输入
    if (this.elements.searchInput) {
      this.elements.searchInput.addEventListener('input', (e) => {
        const keyword = e.target.value.trim();
        this.elements.clearSearchBtn.style.display = keyword ? 'block' : 'none';
        this.filterPlatforms(keyword);
      });
    }

    // 清除搜索
    if (this.elements.clearSearchBtn) {
      this.elements.clearSearchBtn.addEventListener('click', () => {
        this.elements.searchInput.value = '';
        this.elements.clearSearchBtn.style.display = 'none';
        this.filterPlatforms('');
      });
    }

    // 新增平台按钮
    if (this.elements.createPlatformBtn) {
      this.elements.createPlatformBtn.addEventListener('click', () => {
        this.showCreatePlatformModal();
      });
    }

    // 平台列表点击事件
    if (this.elements.platformsList) {
      this.elements.platformsList.addEventListener('click', (e) => {
        const platformItem = e.target.closest('.platform-item');
        if (platformItem) {
          const platformId = platformItem.dataset.platformId;
          this.selectPlatform(platformId);
        }
      });
    }

    // API 配置事件
    const detailContainer = this.elements.platformsDetail;
    if (detailContainer) {
      detailContainer.addEventListener('input', async (e) => {
        const { id } = e.target;
        if (id === 'apiBaseUrl' || id === 'apiKey') {
          await this.updatePlatformConfig();
        }
      });

      detailContainer.addEventListener('click', async (e) => {
        if (e.target.closest('.add-api-model-btn')) {
          await this.showAddModelDialog();
        } else if (e.target.closest('.delete-model-btn')) {
          const modelItem = e.target.closest('.api-model-item');
          const modelId = modelItem.dataset.modelId;
          if (modelId) {
            await this.deleteModel(modelId);
          }
        } else if (e.target.closest('.toggle-model-switch')) {
          const modelItem = e.target.closest('.api-model-item');
          const modelId = modelItem.dataset.modelId;
          if (modelId) {
            const enabled = e.target.closest('.toggle-model-switch').querySelector('input').checked;
            await this.toggleModel(modelId, enabled);
          }
        }
      });
    }
  }

  filterPlatforms(keyword) {
    this.searchKeyword = keyword;
    this.renderPlatformsList();
  }

  async loadPlatforms() {
    try {
      console.log('[ModelsTab] 开始加载平台数据');
      const response = await chrome.runtime.sendMessage({
        action: 'getPlatforms'
      });

      console.log('[ModelsTab] 收到响应:', response);

      if (response && response.success && response.data) {
        this.platforms = response.data;
        console.log('[ModelsTab] 平台数据已加载:', this.platforms);
        this.updateStats();
        this.renderPlatformsList();

        // 尝试选择上次选择的平台或默认选择网页平台
        this.selectInitialPlatform();
      } else {
        console.error('[ModelsTab] 加载平台失败:', response);
        this.platforms = [];
        this.updateStats();
        this.renderPlatformsList();
      }
    } catch (error) {
      console.error('[ModelsTab] 加载平台时出错:', error);
      this.platforms = [];
      this.updateStats();
      this.renderPlatformsList();
    }
  }

  selectInitialPlatform() {
    // 尝试从localStorage获取上次选择的平台
    const lastSelectedPlatformId = localStorage.getItem('lastSelectedPlatformId');

    if (lastSelectedPlatformId) {
      const platform = this.platforms.find(p => p.id === lastSelectedPlatformId);
      if (platform) {
        this.selectPlatform(lastSelectedPlatformId);
        return;
      }
    }

    // 默认选择网页平台
    const webPlatform = this.platforms.find(p => p.isBuiltin);
    if (webPlatform) {
      this.selectPlatform(webPlatform.id);
    }
  }

  refreshCurrentPlatform() {
    if (this.currentPlatform) {
      const updated = this.platforms.find(p => p.id === this.currentPlatform.id);
      if (updated) this.currentPlatform = updated;
    }
  }

  renderPlatformsList() {
    if (!this.elements.platformsList) return;

    let platforms = this.platforms || [];

    // 搜索过滤
    if (this.searchKeyword) {
      const keyword = this.searchKeyword.toLowerCase();
      platforms = platforms.filter(p => 
        p.platformName.toLowerCase().includes(keyword) ||
        (p.models && p.models.some(m => m.name.toLowerCase().includes(keyword)))
      );
    }

    this.elements.platformsList.innerHTML = platforms.map(platform => {
      const enabledCount = platform.models ? platform.models.filter(m => m.enabled).length : 0;

      return `
        <div class="platform-item"
             data-platform-id="${platform.id}">
          <div class="platform-item-header">
            <div class="platform-item-name">${this.escapeHtml(platform.platformName)}</div>
            <div class="platform-item-count">${enabledCount}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  getModelColor(code) {
    const colors = ['#6366F1','#8B5CF6','#EC4899','#F43F5E','#F97316','#EAB308','#22C55E','#14B8A6','#06B6D4','#3B82F6'];
    let hash = 0;
    for (let i = 0; i < code.length; i++) {
      hash = code.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  getModelInitial(code) {
    const name = code.replace(/[_-].*$/, '').trim();
    return name.charAt(0).toUpperCase();
  }

  async selectPlatform(platformId) {
    this.currentPlatform = this.platforms.find(p => p.id === platformId);

    if (!this.currentPlatform) {
      console.error('[ModelsTab] 平台不存在:', platformId);
      return;
    }

    // 保存选择到localStorage
    localStorage.setItem('lastSelectedPlatformId', platformId);

    // 更新列表选中状态
    const items = this.elements.platformsList.querySelectorAll('.platform-item');
    items.forEach(item => {
      item.classList.toggle('selected', item.dataset.platformId === platformId);
    });

    // 渲染详情
    this.renderPlatformDetail();
  }

  renderPlatformDetail() {
    if (!this.currentPlatform || !this.elements.platformsDetail) return;

    const { platformName, isWeb, baseUrl, apiKey, models } = this.currentPlatform;

    if (isWeb) {
      this.elements.platformsDetail.innerHTML = `
        <div class="platform-detail-section">
          <div class="api-config-form">
            <div class="config-form-header">
              <h5 class="config-form-title">使用提示</h5>
            </div>
            <div class="usage-tips">
              <p><strong>重要提示：</strong></p>
              <ul>
                <li>使用前请先在浏览器中登录对应的 AI 网站</li>
                <li>插件会在后台打开 AI 网站标签页进行操作</li>
                <li>请勿关闭 AI 网站标签页，否则无法发送消息</li>
              </ul>
            </div>
          </div>
        </div>

        <div class="platform-detail-section">
          <h4>模型</h4>
          <div class="api-models-list">
            ${models && models.length > 0 ? models.map(model => `
              <div class="api-model-item" data-model-id="${model.id}">
                <div class="api-model-info">
                  <div class="api-model-avatar" style="background:${this.getModelColor(model.code)}">${this.getModelInitial(model.code)}</div>
                  <div class="api-model-name">${this.escapeHtml(model.code)}</div>
                </div>
                <div class="api-model-actions">
                  <label class="switch toggle-model-switch">
                    <input type="checkbox"
                           ${model.enabled ? 'checked' : ''}
                           data-model-id="${model.id}"
                           ${platformName === '网页' ? 'disabled' : ''}>
                    <span class="slider"></span>
                  </label>
                </div>
              </div>
            `).join('') : '<p class="text-muted">暂无模型</p>'}
          </div>
        </div>
      `;
    } else {
      this.elements.platformsDetail.innerHTML = `
        <div class="platform-detail-section">
          <div class="api-config-form">
            <div class="config-form-header">
              <h5 class="config-form-title">基础配置</h5>
            </div>
            <div class="form-group">
              <label for="apiBaseUrl">Base URL</label>
              <input type="text" id="apiBaseUrl" class="form-input"
                     value="${this.escapeHtml(baseUrl || '')}"
                     placeholder="https://api.openai.com/v1">
            </div>
            <div class="form-group">
              <label for="apiKey">API Key</label>
              <input type="password" id="apiKey" class="form-input"
                     value="${this.escapeHtml(apiKey || '')}"
                     placeholder="sk-...">
              <p class="form-help">API Key 仅在本地存储，请放心使用。可在平台控制台获取。</p>
            </div>
          </div>
        </div>

        <div class="platform-detail-section">
          <div class="section-header">
            <h4>模型</h4>
            <button class="btn btn-primary add-api-model-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              添加模型
            </button>
          </div>

          <div class="api-models-list">
            ${models && models.length > 0 ? models.map(model => `
              <div class="api-model-item" data-model-id="${model.id}">
                <div class="api-model-info">
                  <div class="api-model-avatar" style="background:${this.getModelColor(model.code)}">${this.getModelInitial(model.code)}</div>
                  <div class="api-model-name">${this.escapeHtml(model.code)}</div>
                </div>
                <div class="api-model-actions">
                  <label class="switch toggle-model-switch">
                    <input type="checkbox"
                           ${model.enabled ? 'checked' : ''}
                           data-model-id="${model.id}">
                    <span class="slider"></span>
                  </label>
                  <button class="btn-icon delete-model-btn" title="删除" data-model-id="${model.id}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>
                </div>
              </div>
            `).join('') : '<p class="text-muted">暂无模型</p>'}
          </div>
        </div>
      `;
    }
  }

  async updatePlatformConfig() {
    if (!this.currentPlatform || this.currentPlatform.isWeb) return;

    const baseUrl = document.getElementById('apiBaseUrl').value.trim();
    const apiKey = document.getElementById('apiKey').value.trim();

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'updatePlatform',
        platformId: this.currentPlatform.id,
        data: { baseUrl, apiKey }
      });

      if (response && response.success) {
        this.currentPlatform.baseUrl = baseUrl;
        this.currentPlatform.apiKey = apiKey;
      }
    } catch (error) {
      console.error('[ModelsTab] 更新平台配置失败:', error);
    }
  }

  async showAddModelDialog() {
    if (!this.currentPlatform) return;

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>添加模型</h3>
          <button class="close-btn modal-close">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group" style="margin-bottom:16px;">
            <label for="newModelId" style="display:block;margin-bottom:6px;font-weight:500;">模型编码</label>
            <input type="text" id="newModelId" class="form-input" placeholder="例如：deepseek-chat" style="width:100%;">
          </div>
          <button class="btn btn-primary" id="confirmAddModel" style="margin-top:8px;">添加</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('active'), 10);

    modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    modal.querySelector('#confirmAddModel').addEventListener('click', async () => {
      const code = modal.querySelector('#newModelId').value.trim();

      if (!code) {
        alert('请填写模型编码');
        return;
      }

      console.log('[ModelsTab] 准备添加模型, 模型编码:', code);

      try {
        const response = await chrome.runtime.sendMessage({
          action: 'addModel',
          platformId: this.currentPlatform.id,
          data: { code, enabled: true }
        });

        console.log('[ModelsTab] 添加模型响应:', response);

        if (response && response.success) {
          console.log('[ModelsTab] 模型添加成功, 重新加载平台数据');
          modal.remove();
          await this.loadPlatforms();
          this.renderPlatformDetail();
        } else {
          alert('添加模型失败：' + (response?.error || '未知错误'));
        }
      } catch (error) {
        console.error('[ModelsTab] 添加模型出错:', error);
        alert('添加模型出错：' + error.message);
      }
    });
  }

  async editApiModel(modelCode) {
    // 不再支持编辑（模型编码即唯一标识）
    console.log('[ModelsTab] 编辑 API 模型:', modelCode);
  }

  async deleteModel(modelId) {
    if (!confirm('确定要删除这个模型吗？')) return;

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'deleteModel',
        platformId: this.currentPlatform.id,
        modelId
      });

      if (response && response.success) {
        await this.loadPlatforms();
        this.renderPlatformDetail();
      }
    } catch (error) {
      console.error('[ModelsTab] 删除模型失败:', error);
    }
  }

  async toggleModel(modelId, enabled) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'toggleModelEnabled',
        platformId: this.currentPlatform.id,
        modelId
      });

      if (response && response.success) {
        const model = this.currentPlatform.models.find(m => m.id === modelId);
        if (model) {
          model.enabled = enabled;
        }
      }
    } catch (error) {
      console.error('[ModelsTab] 切换模型状态失败:', error);
    }
  }

  updateStats() {
    // 统计功能已移除（页头已删除）
    // 保留方法以备将来使用
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showCreatePlatformModal() {
    console.log('[ModelsTab] 显示添加平台对话框');

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'createPlatformModal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>添加平台</h3>
          <button class="close-btn" id="closeCreatePlatformModal">×</button>
        </div>
        <div class="modal-body">
          <p style="margin-bottom: 16px; color: #666;">选择要添加的平台：</p>
          <div class="platforms-grid" id="platformsGrid">
          </div>
          <div class="custom-platform-form" id="customPlatformForm" style="display:none; margin-top: 16px;">
            <hr style="margin-bottom: 16px;">
            <label for="customPlatformName" style="display:block; margin-bottom: 8px; font-weight: 500;">自定义平台名称：</label>
            <div style="display:flex; gap:8px;">
              <input type="text" id="customPlatformName" class="form-input" placeholder="例如：Google AI" style="flex:1;">
              <button class="btn btn-primary" id="confirmCustomPlatform">添加</button>
              <button class="btn" id="cancelCustomPlatform">取消</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const availablePlatforms = this.getAvailablePlatforms();
    const platformsGrid = modal.querySelector('#platformsGrid');
    platformsGrid.innerHTML = availablePlatforms.map(platform => {
      const isAdded = this.platforms.some(p => p.providerId === platform.id);
      return `
        <div class="platform-option ${isAdded ? 'disabled' : ''}" data-platform-id="${platform.id}">
          <div class="platform-option-icon" style="background-color: ${platform.color}20;">
            <span style="font-size: 24px;">${platform.id === 'custom' ? '➕' : '🤖'}</span>
          </div>
          <div class="platform-option-info">
            <div class="platform-option-name">${this.escapeHtml(platform.name)}</div>
            ${isAdded ? '<div class="platform-option-status">已添加</div>' : ''}
          </div>
        </div>
      `;
    }).join('');

    modal.querySelector('#closeCreatePlatformModal').addEventListener('click', () => {
      modal.remove();
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });

    platformsGrid.querySelectorAll('.platform-option').forEach(option => {
      if (!option.classList.contains('disabled')) {
        option.addEventListener('click', () => {
          const platformId = option.dataset.platformId;
          if (platformId === 'custom') {
            document.getElementById('customPlatformForm').style.display = 'block';
          } else {
            this.createPlatform(platformId);
            modal.remove();
          }
        });
      }
    });

    modal.querySelector('#confirmCustomPlatform').addEventListener('click', () => {
      const name = document.getElementById('customPlatformName').value.trim();
      if (!name) {
        alert('请输入平台名称');
        return;
      }
      this.createPlatform('custom', name);
      modal.remove();
    });

    modal.querySelector('#cancelCustomPlatform').addEventListener('click', () => {
      document.getElementById('customPlatformForm').style.display = 'none';
    });

    setTimeout(() => modal.classList.add('active'), 10);
  }

  getAvailablePlatforms() {
    return [
      { id: 'deepseek', name: 'DeepSeek', color: '#4f46e5' },
      { id: 'doubao', name: '豆包', color: '#0891b2' },
      { id: 'qianwen', name: '千问', color: '#7c3aed' },
      { id: 'kimi', name: 'Kimi', color: '#6366f1' },
      { id: 'openai', name: 'OpenAI', color: '#10a37f' },
      { id: 'anthropic', name: 'Anthropic', color: '#d97706' },
      { id: 'zhipu', name: '智谱', color: '#2563eb' },
      { id: 'custom', name: '自定义', color: '#6b7280' }
    ];
  }

  async createPlatform(providerId, customName) {
    const platformConfig = this.getAvailablePlatforms().find(p => p.id === providerId);
    if (!platformConfig && providerId !== 'custom') {
      console.error('[ModelsTab] 平台配置不存在:', providerId);
      return;
    }
    if (providerId === 'custom' && !customName) {
      console.error('[ModelsTab] 自定义平台名称不能为空');
      return;
    }

    console.log('[ModelsTab] 创建平台:', providerId, customName || '');

    try {
      const platformName = providerId === 'custom' ? customName : platformConfig.name;

      const response = await chrome.runtime.sendMessage({
        action: 'createPlatform',
        data: {
          providerId,
          platformName,
          baseUrl: '',
          apiKey: ''
        }
      });

      if (response && response.success) {
        console.log('[ModelsTab] 平台创建成功:', response.platform);
        await this.loadPlatforms();
      } else {
        console.error('[ModelsTab] 平台创建失败:', response?.error);
        alert('创建平台失败：' + (response?.error || '未知错误'));
      }
    } catch (error) {
      console.error('[ModelsTab] 创建平台出错:', error);
      alert('创建平台出错：' + error.message);
    }
  }
}

// 导出到全局
window.ModelsTab = ModelsTab;
