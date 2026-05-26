/**
 * 主题管理器
 * 负责管理应用的浅色/深色主题切换和状态持久化
 */
class ThemeManager {
  constructor() {
    this.storageKey = 'freeai-theme';
    this.currentTheme = this.loadTheme();
    this.init();
  }

  /**
   * 初始化主题管理器
   */
  init() {
    // 应用保存的主题
    this.applyTheme(this.currentTheme, false);

    // 监听系统主题变化
    if (window.matchMedia) {
      const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
      darkModeQuery.addEventListener('change', (e) => {
        // 只有当用户没有手动设置主题时，才跟随系统
        if (!this.getStoredTheme()) {
          const systemTheme = e.matches ? 'dark' : 'light';
          this.applyTheme(systemTheme, false);
        }
      });
    }

    // 监听跨页面的主题变化
    window.addEventListener('storage', (e) => {
      if (e.key === this.storageKey && e.newValue !== this.currentTheme) {
        this.currentTheme = e.newValue || 'light';
        this.applyTheme(this.currentTheme, false);
      }
    });
  }

  /**
   * 从 localStorage 加载主题
   */
  loadTheme() {
    const stored = this.getStoredTheme();
    if (stored) {
      return stored;
    }

    // 如果没有保存的主题，检测系统主题
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  /**
   * 从 localStorage 获取保存的主题
   */
  getStoredTheme() {
    try {
      return localStorage.getItem(this.storageKey);
    } catch (e) {
      console.warn('无法访问 localStorage:', e);
      return null;
    }
  }

  /**
   * 保存主题到 localStorage
   */
  saveTheme(theme) {
    try {
      localStorage.setItem(this.storageKey, theme);
    } catch (e) {
      console.warn('无法保存主题到 localStorage:', e);
    }
  }

  /**
   * 应用主题
   * @param {string} theme - 'light' 或 'dark'
   * @param {boolean} save - 是否保存到 localStorage
   */
  applyTheme(theme, save = true) {
    if (theme !== 'light' && theme !== 'dark') {
      theme = 'light';
    }

    this.currentTheme = theme;

    // 更新 body 的类名
    if (theme === 'dark') {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }

    // 更新主题切换按钮的图标
    this.updateToggleButton();

    // 保存到 localStorage
    if (save) {
      this.saveTheme(theme);
    }
  }

  /**
   * 切换主题
   */
  toggle() {
    const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
    this.applyTheme(newTheme, true);
  }

  /**
   * 获取当前主题
   */
  getCurrentTheme() {
    return this.currentTheme;
  }

  /**
   * 更新主题切换按钮的图标
   */
  updateToggleButton() {
    const sunIcon = document.querySelector('.theme-icon-sun');
    const moonIcon = document.querySelector('.theme-icon-moon');

    if (!sunIcon || !moonIcon) return;

    if (this.currentTheme === 'dark') {
      sunIcon.style.display = 'none';
      moonIcon.style.display = 'block';
    } else {
      sunIcon.style.display = 'block';
      moonIcon.style.display = 'none';
    }
  }
}

// 创建全局主题管理器实例
window.themeManager = new ThemeManager();