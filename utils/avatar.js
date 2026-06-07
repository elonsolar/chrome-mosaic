const AVATAR_NAMES = [
  'Alice','Atlas','Bella','Bob','Charlie','Coco','David','Duke','Emma',
  'Felix','Grace','Henry','Ivy','Jack','Kate','Leo','Luna','Max','Mia',
  'Nina','Noah','Olivia','Oscar','Paul','Piper','Quinn','Rex','Ruby',
  'Sam','Stella','Teddy','Tina','Uma','Vera','Victor','Wendy','Wolf',
  'Xavier','Yuki','Zara','Zoe'
];

const _avatarCache = new Map();

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function getLocalAvatarUrl(name) {
  if (!name) name = 'default';
  if (_avatarCache.has(name)) return _avatarCache.get(name);

  const index = hashString(name) % AVATAR_NAMES.length;
  const avatarName = AVATAR_NAMES[index];

  let baseUrl;
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
    baseUrl = chrome.runtime.getURL('avatars');
  } else {
    const scripts = document.querySelectorAll('script[src]');
    for (const s of scripts) {
      const m = s.src.match(/^(.*\/)(?:chat|dashboard|content-script)\.js/);
      if (m) { baseUrl = m[1] + 'avatars'; break; }
    }
    if (!baseUrl) baseUrl = '../avatars';
  }

  const url = baseUrl + '/' + avatarName + '.svg';
  _avatarCache.set(name, url);
  return url;
}
