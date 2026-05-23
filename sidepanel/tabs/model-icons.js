/**
 * AI 品牌图标组件
 * 使用 SVG 渐变和图标替代 three.js 3D 渲染
 */

const ModelIcons = {
  // DeepSeek 鲸鱼图标
  deepseek: `
    <svg viewBox="0 0 120 120" class="model-svg-icon">
      <defs>
        <linearGradient id="ds-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#4f46e5;stop-opacity:0.15"/>
          <stop offset="100%" style="stop-color:#7c3aed;stop-opacity:0.08"/>
        </linearGradient>
        <linearGradient id="ds-whale" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#818cf8"/>
          <stop offset="100%" style="stop-color:#6366f1"/>
        </linearGradient>
        <filter id="ds-glow">
          <feGaussianBlur stdDeviation="2" result="blur"/>
          <feComposite in="SourceGraphic" in2="blur" operator="over"/>
        </filter>
      </defs>
      <circle cx="60" cy="60" r="55" fill="url(#ds-bg)"/>
      <!-- 鲸鱼身体 -->
      <path d="M30 65 Q30 45 50 40 Q65 36 75 42 Q85 48 82 60 Q80 70 70 72 Q60 74 50 72 Q35 70 30 65Z" 
            fill="url(#ds-whale)" filter="url(#ds-glow)" opacity="0.9"/>
      <!-- 鲸鱼尾巴 -->
      <path d="M28 58 Q20 52 18 45 Q16 38 22 42 Q28 46 30 55Z" fill="#818cf8" opacity="0.8"/>
      <!-- 鲸鱼眼睛 -->
      <circle cx="68" cy="52" r="3.5" fill="white"/>
      <circle cx="69" cy="51.5" r="1.8" fill="#312e81"/>
      <!-- 水波纹 -->
      <path d="M35 78 Q45 74 55 78 Q65 82 75 78" stroke="#a5b4fc" stroke-width="1.5" fill="none" opacity="0.5"/>
      <path d="M30 84 Q42 80 54 84 Q66 88 78 84" stroke="#a5b4fc" stroke-width="1.2" fill="none" opacity="0.3"/>
      <!-- 光点 -->
      <circle cx="75" cy="40" r="2" fill="#c7d2fe" opacity="0.8"/>
      <circle cx="45" cy="35" r="1.5" fill="#e0e7ff" opacity="0.6"/>
    </svg>
  `,

  // 豆包 - 可爱的豆子图标
  doubao: `
    <svg viewBox="0 0 120 120" class="model-svg-icon">
      <defs>
        <linearGradient id="db-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#0891b2;stop-opacity:0.15"/>
          <stop offset="100%" style="stop-color:#06b6d4;stop-opacity:0.08"/>
        </linearGradient>
        <linearGradient id="db-bean" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#22d3ee"/>
          <stop offset="100%" style="stop-color:#06b6d4"/>
        </linearGradient>
        <linearGradient id="db-face" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#67e8f9"/>
          <stop offset="100%" style="stop-color:#a5f3fc"/>
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="55" fill="url(#db-bg)"/>
      <!-- 豆子身体 -->
      <ellipse cx="60" cy="58" rx="28" ry="32" fill="url(#db-bean)" transform="rotate(-10 60 58)"/>
      <!-- 豆子光泽 -->
      <ellipse cx="52" cy="48" rx="12" ry="16" fill="url(#db-face)" opacity="0.5" transform="rotate(-10 52 48)"/>
      <!-- 可爱的脸 -->
      <!-- 眼睛 -->
      <ellipse cx="50" cy="55" rx="4.5" ry="5" fill="white"/>
      <ellipse cx="70" cy="53" rx="4.5" ry="5" fill="white"/>
      <circle cx="51" cy="54" r="2.5" fill="#164e63"/>
      <circle cx="71" cy="52" r="2.5" fill="#164e63"/>
      <!-- 眼睛高光 -->
      <circle cx="52.5" cy="53" r="1" fill="white"/>
      <circle cx="72.5" cy="51" r="1" fill="white"/>
      <!-- 腮红 -->
      <ellipse cx="43" cy="62" rx="5" ry="3" fill="#fda4af" opacity="0.5"/>
      <ellipse cx="77" cy="60" rx="5" ry="3" fill="#fda4af" opacity="0.5"/>
      <!-- 嘴巴 -->
      <path d="M54 66 Q60 72 66 65" stroke="#164e63" stroke-width="2" fill="none" stroke-linecap="round"/>
      <!-- 小叶子 -->
      <path d="M60 26 Q65 20 70 24 Q68 28 62 30Z" fill="#10b981" opacity="0.8"/>
      <path d="M60 26 Q55 20 50 24 Q52 28 58 30Z" fill="#34d399" opacity="0.6"/>
    </svg>
  `,

  // 千问 - 通义千问风格图标
  qianwen: `
    <svg viewBox="0 0 120 120" class="model-svg-icon">
      <defs>
        <linearGradient id="qw-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#7c3aed;stop-opacity:0.15"/>
          <stop offset="100%" style="stop-color:#a855f7;stop-opacity:0.08"/>
        </linearGradient>
        <linearGradient id="qw-main" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#c084fc"/>
          <stop offset="100%" style="stop-color:#a855f7"/>
        </linearGradient>
        <linearGradient id="qw-accent" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#e9d5ff"/>
          <stop offset="100%" style="stop-color:#d8b4fe"/>
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="55" fill="url(#qw-bg)"/>
      <!-- 主体圆形 -->
      <circle cx="60" cy="55" r="25" fill="url(#qw-main)"/>
      <!-- 内部装饰 -->
      <circle cx="60" cy="55" r="18" fill="url(#qw-accent)" opacity="0.4"/>
      <!-- 问号设计 -->
      <path d="M52 48 Q52 40 60 38 Q68 36 68 44 Q68 50 62 52 L62 56" 
            stroke="white" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <circle cx="62" cy="62" r="2" fill="white"/>
      <!-- 光芒效果 -->
      <line x1="60" y1="25" x2="60" y2="30" stroke="#d8b4fe" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
      <line x1="85" y1="45" x2="80" y2="48" stroke="#d8b4fe" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
      <line x1="35" y1="45" x2="40" y2="48" stroke="#d8b4fe" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
      <line x1="85" y1="65" x2="80" y2="62" stroke="#d8b4fe" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
      <line x1="35" y1="65" x2="40" y2="62" stroke="#d8b4fe" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
      <!-- 装饰点 -->
      <circle cx="45" cy="35" r="2" fill="#e9d5ff" opacity="0.6"/>
      <circle cx="75" cy="35" r="1.5" fill="#e9d5ff" opacity="0.5"/>
      <circle cx="40" cy="75" r="1.8" fill="#e9d5ff" opacity="0.4"/>
      <circle cx="80" cy="75" r="2" fill="#e9d5ff" opacity="0.5"/>
      <!-- 底部装饰弧线 -->
      <path d="M40 85 Q50 78 60 82 Q70 86 80 80" stroke="#c084fc" stroke-width="1.5" fill="none" opacity="0.4"/>
    </svg>
  `,

  // Kimi - 月亮和星星主题
  kimi: `
    <svg viewBox="0 0 120 120" class="model-svg-icon">
      <defs>
        <linearGradient id="km-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#6366f1;stop-opacity:0.15"/>
          <stop offset="100%" style="stop-color:#818cf8;stop-opacity:0.08"/>
        </linearGradient>
        <linearGradient id="km-moon" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#a5b4fc"/>
          <stop offset="100%" style="stop-color:#818cf8"/>
        </linearGradient>
        <linearGradient id="km-star" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#e0e7ff"/>
          <stop offset="100%" style="stop-color:#c7d2fe"/>
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="55" fill="url(#km-bg)"/>
      <!-- 月亮 -->
      <path d="M70 30 Q55 30 48 45 Q42 58 48 70 Q54 82 68 78 Q58 72 54 60 Q50 48 58 38 Q62 32 70 30Z" 
            fill="url(#km-moon)" opacity="0.9"/>
      <!-- 月亮光晕 -->
      <path d="M68 32 Q58 35 52 48 Q46 60 52 70" stroke="#e0e7ff" stroke-width="1" fill="none" opacity="0.3"/>
      <!-- 星星 -->
      <g transform="translate(75, 42)">
        <path d="M0 -8 L2 -2 L8 0 L2 2 L0 8 L-2 2 L-8 0 L-2 -2Z" fill="url(#km-star)"/>
      </g>
      <g transform="translate(85, 58) scale(0.7)">
        <path d="M0 -8 L2 -2 L8 0 L2 2 L0 8 L-2 2 L-8 0 L-2 -2Z" fill="url(#km-star)" opacity="0.8"/>
      </g>
      <g transform="translate(68, 72) scale(0.5)">
        <path d="M0 -8 L2 -2 L8 0 L2 2 L0 8 L-2 2 L-8 0 L-2 -2Z" fill="url(#km-star)" opacity="0.6"/>
      </g>
      <!-- 小星星装饰 -->
      <circle cx="80" cy="35" r="1.5" fill="#e0e7ff" opacity="0.7"/>
      <circle cx="90" cy="50" r="1" fill="#e0e7ff" opacity="0.5"/>
      <circle cx="72" cy="65" r="1.2" fill="#e0e7ff" opacity="0.6"/>
      <circle cx="88" cy="68" r="1.5" fill="#e0e7ff" opacity="0.4"/>
      <!-- 云朵装饰 -->
      <ellipse cx="45" cy="85" rx="12" ry="6" fill="#c7d2fe" opacity="0.3"/>
      <ellipse cx="55" cy="82" rx="8" ry="5" fill="#c7d2fe" opacity="0.25"/>
    </svg>
  `,

  // OpenAI - 花朵/螺旋主题
  openai: `
    <svg viewBox="0 0 120 120" class="model-svg-icon">
      <defs>
        <linearGradient id="oai-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#10a37f;stop-opacity:0.15"/>
          <stop offset="100%" style="stop-color:#34d399;stop-opacity:0.08"/>
        </linearGradient>
        <linearGradient id="oai-main" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#6ee7b7"/>
          <stop offset="100%" style="stop-color:#10b981"/>
        </linearGradient>
        <linearGradient id="oai-petal" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#a7f3d0"/>
          <stop offset="100%" style="stop-color:#6ee7b7"/>
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="55" fill="url(#oai-bg)"/>
      <!-- 花朵主体 -->
      <g transform="translate(60, 55)">
        <!-- 花瓣 -->
        <ellipse cx="0" cy="-18" rx="8" ry="18" fill="url(#oai-petal)" opacity="0.9" transform="rotate(0)"/>
        <ellipse cx="0" cy="-18" rx="8" ry="18" fill="url(#oai-petal)" opacity="0.85" transform="rotate(60)"/>
        <ellipse cx="0" cy="-18" rx="8" ry="18" fill="url(#oai-petal)" opacity="0.8" transform="rotate(120)"/>
        <ellipse cx="0" cy="-18" rx="8" ry="18" fill="url(#oai-petal)" opacity="0.85" transform="rotate(180)"/>
        <ellipse cx="0" cy="-18" rx="8" ry="18" fill="url(#oai-petal)" opacity="0.8" transform="rotate(240)"/>
        <ellipse cx="0" cy="-18" rx="8" ry="18" fill="url(#oai-petal)" opacity="0.75" transform="rotate(300)"/>
        <!-- 中心圆 -->
        <circle cx="0" cy="0" r="12" fill="url(#oai-main)"/>
        <circle cx="0" cy="0" r="7" fill="#ecfdf5" opacity="0.6"/>
      </g>
      <!-- 光晕效果 -->
      <circle cx="60" cy="55" r="30" stroke="#6ee7b7" stroke-width="0.5" fill="none" opacity="0.3"/>
      <!-- 装饰光点 -->
      <circle cx="35" cy="35" r="2" fill="#a7f3d0" opacity="0.6"/>
      <circle cx="85" cy="35" r="1.5" fill="#a7f3d0" opacity="0.5"/>
      <circle cx="30" cy="75" r="1.8" fill="#a7f3d0" opacity="0.4"/>
      <circle cx="90" cy="70" r="2" fill="#a7f3d0" opacity="0.5"/>
      <circle cx="60" cy="90" r="1.5" fill="#a7f3d0" opacity="0.3"/>
      <!-- 底部装饰 -->
      <path d="M40 88 Q50 82 60 86 Q70 90 80 84" stroke="#6ee7b7" stroke-width="1.2" fill="none" opacity="0.3"/>
    </svg>
  `,

  // Anthropic (Claude) - 大脑/神经网络主题
  anthropic: `
    <svg viewBox="0 0 120 120" class="model-svg-icon">
      <defs>
        <linearGradient id="ant-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#d97706;stop-opacity:0.15"/>
          <stop offset="100%" style="stop-color:#f59e0b;stop-opacity:0.08"/>
        </linearGradient>
        <linearGradient id="ant-brain" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#fbbf24"/>
          <stop offset="100%" style="stop-color:#d97706"/>
        </linearGradient>
        <linearGradient id="ant-node" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#fef3c7"/>
          <stop offset="100%" style="stop-color:#fde68a"/>
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="55" fill="url(#ant-bg)"/>
      <!-- 大脑/神经网络 -->
      <g transform="translate(60, 55)">
        <!-- 连接线 -->
        <line x1="-20" y1="-15" x2="20" y2="-15" stroke="#fbbf24" stroke-width="1.5" opacity="0.4"/>
        <line x1="-20" y1="-15" x2="0" y2="15" stroke="#fbbf24" stroke-width="1.5" opacity="0.4"/>
        <line x1="20" y1="-15" x2="0" y2="15" stroke="#fbbf24" stroke-width="1.5" opacity="0.4"/>
        <line x1="-15" y1="0" x2="15" y2="0" stroke="#fbbf24" stroke-width="1.5" opacity="0.3"/>
        <line x1="-20" y1="-15" x2="-15" y2="0" stroke="#fbbf24" stroke-width="1.5" opacity="0.3"/>
        <line x1="20" y1="-15" x2="15" y2="0" stroke="#fbbf24" stroke-width="1.5" opacity="0.3"/>
        <line x1="-15" y1="0" x2="0" y2="15" stroke="#fbbf24" stroke-width="1.5" opacity="0.3"/>
        <line x1="15" y1="0" x2="0" y2="15" stroke="#fbbf24" stroke-width="1.5" opacity="0.3"/>
        <!-- 节点 -->
        <circle cx="-20" cy="-15" r="6" fill="url(#ant-node)" stroke="#d97706" stroke-width="1"/>
        <circle cx="20" cy="-15" r="6" fill="url(#ant-node)" stroke="#d97706" stroke-width="1"/>
        <circle cx="0" cy="15" r="6" fill="url(#ant-node)" stroke="#d97706" stroke-width="1"/>
        <circle cx="-15" cy="0" r="5" fill="url(#ant-node)" stroke="#d97706" stroke-width="1"/>
        <circle cx="15" cy="0" r="5" fill="url(#ant-node)" stroke="#d97706" stroke-width="1"/>
        <!-- 中心节点 -->
        <circle cx="0" cy="-5" r="8" fill="url(#ant-brain)"/>
        <circle cx="0" cy="-5" r="4" fill="#fef3c7" opacity="0.7"/>
      </g>
      <!-- 光晕 -->
      <circle cx="60" cy="50" r="35" stroke="#fbbf24" stroke-width="0.5" fill="none" opacity="0.2"/>
      <!-- 装饰点 -->
      <circle cx="30" cy="30" r="2" fill="#fde68a" opacity="0.5"/>
      <circle cx="90" cy="30" r="1.5" fill="#fde68a" opacity="0.4"/>
      <circle cx="25" cy="80" r="1.8" fill="#fde68a" opacity="0.3"/>
      <circle cx="95" cy="75" r="2" fill="#fde68a" opacity="0.4"/>
      <!-- 底部装饰 -->
      <path d="M35 90 Q48 84 60 88 Q72 92 85 86" stroke="#fbbf24" stroke-width="1.2" fill="none" opacity="0.3"/>
    </svg>
  `,

  // 智谱 (Zhipu/GLM) - 智慧大脑主题
  zhipu: `
    <svg viewBox="0 0 120 120" class="model-svg-icon">
      <defs>
        <linearGradient id="zp-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#2563eb;stop-opacity:0.15"/>
          <stop offset="100%" style="stop-color:#3b82f6;stop-opacity:0.08"/>
        </linearGradient>
        <linearGradient id="zp-brain" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#60a5fa"/>
          <stop offset="100%" style="stop-color:#2563eb"/>
        </linearGradient>
        <linearGradient id="zp-glow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#bfdbfe"/>
          <stop offset="100%" style="stop-color:#93c5fd"/>
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="55" fill="url(#zp-bg)"/>
      <!-- 大脑主体 -->
      <path d="M60 25 Q40 25 35 45 Q30 55 35 65 Q40 75 50 78 Q55 80 60 78 Q65 80 70 78 Q80 75 85 65 Q90 55 85 45 Q80 25 60 25Z" 
            fill="url(#zp-brain)" opacity="0.9"/>
      <!-- 大脑纹理 -->
      <path d="M60 30 Q50 35 48 45 Q46 55 50 62" stroke="#bfdbfe" stroke-width="1.5" fill="none" opacity="0.5"/>
      <path d="M60 30 Q70 35 72 45 Q74 55 70 62" stroke="#bfdbfe" stroke-width="1.5" fill="none" opacity="0.5"/>
      <path d="M55 35 Q60 40 65 35" stroke="#bfdbfe" stroke-width="1.2" fill="none" opacity="0.4"/>
      <path d="M50 50 Q60 45 70 50" stroke="#bfdbfe" stroke-width="1.2" fill="none" opacity="0.4"/>
      <!-- 智慧光芒 -->
      <line x1="60" y1="18" x2="60" y2="25" stroke="#93c5fd" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
      <line x1="40" y1="22" x2="45" y2="28" stroke="#93c5fd" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
      <line x1="80" y1="22" x2="75" y2="28" stroke="#93c5fd" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
      <line x1="30" y1="40" x2="36" y2="43" stroke="#93c5fd" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
      <line x1="90" y1="40" x2="84" y2="43" stroke="#93c5fd" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
      <!-- 光点装饰 -->
      <circle cx="60" cy="15" r="3" fill="url(#zp-glow)" opacity="0.8"/>
      <circle cx="38" cy="20" r="2" fill="url(#zp-glow)" opacity="0.6"/>
      <circle cx="82" cy="20" r="2" fill="url(#zp-glow)" opacity="0.6"/>
      <!-- 底部文字装饰 -->
      <text x="60" y="98" text-anchor="middle" font-size="10" font-weight="600" fill="#60a5fa" opacity="0.6">GLM</text>
      <!-- 装饰点 -->
      <circle cx="30" cy="70" r="2" fill="#93c5fd" opacity="0.4"/>
      <circle cx="90" cy="70" r="1.5" fill="#93c5fd" opacity="0.3"/>
      <circle cx="45" cy="85" r="1.8" fill="#93c5fd" opacity="0.3"/>
      <circle cx="75" cy="85" r="2" fill="#93c5fd" opacity="0.4"/>
    </svg>
  `,

  // 默认图标
  _default: `
    <svg viewBox="0 0 120 120" class="model-svg-icon">
      <defs>
        <linearGradient id="def-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:0.15"/>
          <stop offset="100%" style="stop-color:#60a5fa;stop-opacity:0.08"/>
        </linearGradient>
        <linearGradient id="def-robot" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#60a5fa"/>
          <stop offset="100%" style="stop-color:#3b82f6"/>
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="55" fill="url(#def-bg)"/>
      <!-- 机器人头部 -->
      <rect x="42" y="32" width="36" height="30" rx="8" fill="url(#def-robot)"/>
      <!-- 天线 -->
      <line x1="60" y1="25" x2="60" y2="32" stroke="#93c5fd" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="60" cy="22" r="3.5" fill="#93c5fd"/>
      <!-- 眼睛 -->
      <circle cx="52" cy="46" r="4" fill="white"/>
      <circle cx="68" cy="46" r="4" fill="white"/>
      <circle cx="53" cy="45.5" r="2" fill="#1e3a8a"/>
      <circle cx="69" cy="45.5" r="2" fill="#1e3a8a"/>
      <!-- 眼睛高光 -->
      <circle cx="54.5" cy="44.5" r="0.8" fill="white"/>
      <circle cx="70.5" cy="44.5" r="0.8" fill="white"/>
      <!-- 嘴巴 -->
      <path d="M52 55 Q60 61 68 55" stroke="white" stroke-width="2" fill="none" stroke-linecap="round"/>
      <!-- 身体 -->
      <rect x="46" y="66" width="28" height="22" rx="6" fill="url(#def-robot)"/>
      <!-- 身体装饰 -->
      <circle cx="60" cy="77" r="4" fill="#93c5fd" opacity="0.6"/>
      <!-- 手臂 -->
      <rect x="34" y="68" width="10" height="16" rx="5" fill="url(#def-robot)" opacity="0.9"/>
      <rect x="76" y="68" width="10" height="16" rx="5" fill="url(#def-robot)" opacity="0.9"/>
      <!-- 装饰光点 -->
      <circle cx="38" cy="38" r="2" fill="#bfdbfe" opacity="0.5"/>
      <circle cx="82" cy="38" r="1.5" fill="#bfdbfe" opacity="0.4"/>
      <circle cx="35" cy="72" r="1.5" fill="#bfdbfe" opacity="0.3"/>
      <circle cx="85" cy="72" r="2" fill="#bfdbfe" opacity="0.4"/>
    </svg>
  `
};

// 获取提供商图标
function getModelIcon(providerKey) {
  return ModelIcons[providerKey] || ModelIcons._default;
}

// 导出
if (typeof window !== 'undefined') {
  window.ModelIcons = ModelIcons;
  window.getModelIcon = getModelIcon;
}
