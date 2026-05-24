// 防懒加载配置文件
// 所有平台共用的配置参数

const AntiLazyLoadConfig = {
  // 是否启用调试日志（生产环境应设为 false）
  debug: false,

  // 鼠标移动配置
  mouseMovement: {
    enabled: true,
    // 最小间隔（毫秒）
    minInterval: 1000,
    // 最大间隔（毫秒）
    maxInterval: 8000,
    // 是否启用平滑移动（贝塞尔曲线）
    smoothMovement: true,
    // 鼠标移动的坐标范围（相对于视口）
    coordinateRange: {
      minX: 50,
      maxX: window.innerWidth - 50,
      minY: 50,
      maxY: window.innerHeight - 50
    },
    // 停顿概率（模拟人类停顿）
    pauseProbability: 0.2,
    // 停顿时长范围（毫秒）
    pauseDuration: {
      min: 500,
      max: 2000
    }
  },

  // 用户活动模拟配置
  userActivity: {
    enabled: true,
    // 模拟的事件类型
    eventTypes: ['mousemove', 'mousedown', 'mouseup', 'keydown', 'scroll'],
    // 活动间隔范围（毫秒）
    interval: {
      min: 2000,
      max: 10000
    },
    // 是否启用移动端触摸模拟
    enableTouch: false
  },

  // WebSocket 保活配置
  websocket: {
    enabled: false,
    // ping 间隔（毫秒）
    pingInterval: 30000,
    // ping 消息格式
    pingMessage: { type: 'ping' }
  },

  // API 覆盖配置
  apiOverrides: {
    // 是否覆盖 Visibility API
    visibility: true,
    // 是否覆盖 IntersectionObserver
    intersectionObserver: true,
    // 是否覆盖 requestIdleCallback
    requestIdleCallback: true,
    // 是否覆盖 Focus API
    focus: true,
    // 是否覆盖 Page Lifecycle API
    pageLifecycle: true,
    // 是否覆盖 Network Information API
    networkInfo: true,
    // 是否覆盖 performance.now
    performanceNow: false
  }
};

// 根据平台特性调整配置
const PlatformConfigs = {
  deepseek: {
    mouseMovement: {
      minInterval: 3000,
      maxInterval: 7000
    },
    userActivity: {
      eventTypes: ['mousemove']
    }
  },

  doubao: {
    mouseMovement: {
      minInterval: 2000,
      maxInterval: 5000,
      smoothMovement: true
    },
    userActivity: {
      eventTypes: ['mousemove', 'mousedown', 'mouseup'],
      interval: {
        min: 2000,
        max: 4000
      }
    },
    apiOverrides: {
      requestIdleCallback: true
    }
  },

  qianwen: {
    mouseMovement: {
      minInterval: 1000,
      maxInterval: 4000
    },
    userActivity: {
      eventTypes: ['mousemove', 'keydown', 'scroll'],
      interval: {
        min: 1500,
        maxInterval: 3500
      },
      enableTouch: true
    },
    websocket: {
      enabled: true,
      pingInterval: 15000
    },
    apiOverrides: {
      pageLifecycle: true,
      networkInfo: true,
      performanceNow: true
    }
  }
};

// 获取平台配置
function getPlatformConfig(platform) {
  if (!platform || !PlatformConfigs[platform]) {
    return AntiLazyLoadConfig;
  }

  // 深度合并配置
  return deepMerge(AntiLazyLoadConfig, PlatformConfigs[platform]);
}

// 深度合并对象
function deepMerge(target, source) {
  const result = { ...target };

  for (const key in source) {
    if (source[key] instanceof Object && key in target) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }

  return result;
}

// 调试日志函数
function debugLog(platform, ...args) {
  if (AntiLazyLoadConfig.debug) {
    console.log(`[Anti-Lazy-Load${platform ? '-' + platform : ''}]`, ...args);
  }
}
