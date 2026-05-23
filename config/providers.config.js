const PROVIDERS = {
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://chat.deepseek.com/',
    domain: 'deepseek.com',
    defaultModel: 'deepseek-chat',
    color: '#4f46e5'
  },
  doubao: {
    id: 'doubao',
    name: '豆包',
    baseUrl: 'https://www.doubao.com/chat/',
    domain: 'doubao.com',
    defaultModel: 'doubao-pro',
    color: '#0891b2'
  },
  qianwen: {
    id: 'qianwen',
    name: '千问',
    baseUrl: 'https://www.qianwen.com/',
    domain: 'qianwen.com',
    defaultModel: 'qwen-plus',
    color: '#7c3aed'
  },
  kimi: {
    id: 'kimi',
    name: 'Kimi',
    baseUrl: 'https://www.kimi.com/',
    domain: 'moonshot.cn',
    defaultModel: 'kimi-chat',
    color: '#6366f1'
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://chat.openai.com/',
    domain: 'openai.com',
    defaultModel: 'gpt-4',
    color: '#10a37f'
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://claude.ai/',
    domain: 'anthropic.com',
    defaultModel: 'claude-3-opus',
    color: '#d97706'
  },
  zhipu: {
    id: 'zhipu',
    name: '智谱',
    baseUrl: 'https://chatglm.cn/',
    domain: 'zhipu.ai',
    defaultModel: 'glm-4',
    color: '#2563eb'
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PROVIDERS;
}
