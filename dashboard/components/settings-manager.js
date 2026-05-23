class SettingsManager {
  constructor() {
    this.state = {
      settings: {
        wsUrl: 'ws://localhost:8080',
        wsEnabled: false,
        floatWindow: true,
        helperModel: ''
      },
      models: []
    };

    this.elements = {};
    this.debounceTimer = null;
  }

  async init() {
    console.log('[SettingsManager] 初始化');

    this.initElements();
    this.bindEvents();
    await this.loadData();
    this.loadSettingsToUI();
    this.loadHelperModels();

    console.log('[SettingsManager] 初始化完成');
  }

  initElements() {
    this.elements = {
      wsUrlInput: document.getElementById('wsUrlInput'),
      wsEnabledCheckbox: document.getElementById('wsEnabledCheckbox'),
      wsStatusBadge: document.getElementById('wsStatusBadge'),
      wsStatusDot: document.getElementById('wsStatusDot'),
      wsStatusLabel: document.getElementById('wsStatusLabel'),
      floatWindowCheck: document.getElementById('floatWindowCheck'),
      helperModelSelect: document.getElementById('helperModelSelect')
    };
  }

  async loadData() {
    try {
      const [settings, models] = await Promise.all([
        this.sendMessage({ action: 'getSettings' }),
        this.sendMessage({ action: 'getModels' })
      ]);

      this.state.settings = settings || this.state.settings;
      this.state.models = models || [];

      console.log('[SettingsManager] 数据加载完成', { settings: this.state.settings, models: this.state.models.length });
    } catch (error) {
      console.error('[SettingsManager] 加载数据失败:', error);
    }
  }

  loadSettingsToUI() {
    const { settings } = this.state;

    if (this.elements.wsUrlInput) {
      this.elements.wsUrlInput.value = settings.wsUrl || 'ws://localhost:8080';
    }

    if (this.elements.wsEnabledCheckbox) {
      this.elements.wsEnabledCheckbox.checked = settings.wsEnabled || false;
    }

    if (this.elements.floatWindowCheck) {
      this.elements.floatWindowCheck.checked = settings.floatWindow !== false;
    }

    if (this.elements.helperModelSelect && settings.helperModel) {
      this.elements.helperModelSelect.value = settings.helperModel;
    }

    this.updateWebSocketStatus();
  }

  loadHelperModels() {
    if (!this.elements.helperModelSelect) return;

    const enabledModels = this.state.models.filter(model => model.enabled !== false);
    const currentValue = this.elements.helperModelSelect.value;

    // Show loading state
    this.elements.helperModelSelect.innerHTML = '<option value="" disabled selected>正在加载模型...</option>';
    this.elements.helperModelSelect.disabled = true;

    // Use setTimeout to allow UI to update
    setTimeout(() => {
      this.elements.helperModelSelect.innerHTML = '<option value="">请选择模型</option>';

      if (enabledModels.length === 0) {
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = '暂无可用模型';
        emptyOption.disabled = true;
        this.elements.helperModelSelect.appendChild(emptyOption);
      } else {
        enabledModels.forEach(model => {
          const option = document.createElement('option');
          option.value = model.id;
          option.textContent = model.name || model.model;
          this.elements.helperModelSelect.appendChild(option);
        });
      }

      if (currentValue) {
        this.elements.helperModelSelect.value = currentValue;
      }

      this.elements.helperModelSelect.disabled = false;

      console.log('[SettingsManager] 辅助模型列表加载完成', { count: enabledModels.length });
    }, 100);
  }

  bindEvents() {
    if (this.elements.wsUrlInput) {
      this.elements.wsUrlInput.addEventListener('input', (e) => {
        this.validateWsUrl(e.target.value);
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          this.updateSetting('wsUrl', e.target.value.trim());
          this.showToast('WebSocket 地址已保存');
        }, 1000);
      });
    }

    if (this.elements.wsEnabledCheckbox) {
      this.elements.wsEnabledCheckbox.addEventListener('change', () => {
        this.updateSetting('wsEnabled', this.elements.wsEnabledCheckbox.checked);
        this.showToast(this.elements.wsEnabledCheckbox.checked ? 'WebSocket 已启用' : 'WebSocket 已禁用');
      });
    }

    if (this.elements.floatWindowCheck) {
      this.elements.floatWindowCheck.addEventListener('change', () => {
        this.updateSetting('floatWindow', this.elements.floatWindowCheck.checked);
        this.showToast(this.elements.floatWindowCheck.checked ? '浮动窗口已启用' : '浮动窗口已禁用');
      });
    }

    if (this.elements.helperModelSelect) {
      this.elements.helperModelSelect.addEventListener('change', () => {
        this.updateSetting('helperModel', this.elements.helperModelSelect.value);
        this.showToast('辅助模型已更新');
      });
    }

    console.log('[SettingsManager] 事件绑定完成');
  }

  async updateSetting(key, value) {
    this.state.settings[key] = value;

    try {
      await this.sendMessage({
        action: 'updateSettings',
        settings: this.state.settings
      });

      console.log(`[SettingsManager] 设置已更新: ${key} = ${value}`);

      if (key === 'wsEnabled') {
        this.updateWebSocketStatus();
      }
    } catch (error) {
      console.error('[SettingsManager] 更新设置失败:', error);
      this.showToast('保存失败，请重试', 'warning');
    }
  }

  validateWsUrl(value) {
    const input = this.elements.wsUrlInput;
    const wsRegex = /^wss?:\/\/([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(:\d+)?(\/.*)?$/;

    // Remove previous validation state
    input.classList.remove('input-error', 'input-valid');

    if (!value) {
      // Empty value is allowed
      input.setCustomValidity('');
      return;
    }

    if (!wsRegex.test(value)) {
      input.classList.add('input-error');
      input.setCustomValidity('请输入有效的WebSocket地址');
      this.showValidationError(input, '地址格式不正确，例如：ws://localhost:8080');
    } else {
      input.classList.add('input-valid');
      input.setCustomValidity('');
      this.hideValidationError(input);
    }
  }

  showValidationError(input, message) {
    // Remove existing error message
    const existingError = input.parentNode.querySelector('.validation-error');
    if (existingError) existingError.remove();

    // Add error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'validation-error';
    errorDiv.textContent = message;
    errorDiv.style.cssText = `
      font-size: 12px;
      color: var(--danger-color, #EF4444);
      margin-top: 4px;
      display: block;
    `;
    input.parentNode.appendChild(errorDiv);
  }

  hideValidationError(input) {
    const existingError = input.parentNode.querySelector('.validation-error');
    if (existingError) existingError.remove();
  }

  updateWebSocketStatus() {
    if (!this.elements.wsStatusBadge || !this.elements.wsStatusDot || !this.elements.wsStatusLabel) return;

    const { wsEnabled } = this.state.settings;
    const badge = this.elements.wsStatusBadge;
    const dot = this.elements.wsStatusDot;
    const label = this.elements.wsStatusLabel;

    badge.classList.remove('connected', 'connecting', 'error');
    dot.classList.remove('pulse');

    if (wsEnabled) {
      badge.classList.add('connected');
      label.textContent = '已连接';
    } else {
      label.textContent = '未连接';
    }
  }

  showToast(message, type = 'success') {
    const existing = document.querySelector('.settings-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `settings-toast settings-toast--${type}`;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    // Use SVG icons for better visual quality
    const icons = {
      success: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
      warning: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 1V11M8 15V15.01M1 15H15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`
    };

    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.success}</span>
      <span>${this.escapeHtml(message)}</span>
    `;

    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async sendMessage(message) {
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
}

window.SettingsManager = SettingsManager;
