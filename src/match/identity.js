// この端末のプレイヤー識別（フレンド戦用）。
// URL の ?profile=xxx で「別の端末」として振る舞える（同じブラウザで2画面テストするため）。
// profile があると、戦績やプレイヤーIDの保存先キーも分かれる。

export function getProfile() {
  try {
    return new URLSearchParams(globalThis.location?.search ?? '').get('profile') ?? '';
  } catch {
    return '';
  }
}

/** profile ごとに分けた localStorage のキー */
export function profileKey(base) {
  const profile = getProfile();
  return profile ? `${base}.${profile}` : base;
}

function randomId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** この端末（profile）の ID。Firebase 導入後は匿名認証の uid に置き換える */
export function getClientId() {
  const key = profileKey('kotodama.clientId');
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = randomId();
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return randomId();
  }
}

/** 名前が空欄のときの既定名 */
export function defaultPlayerName(random = Math.random) {
  return `プレイヤー${1000 + Math.floor(random() * 9000)}`;
}

/** 参加中のフレンド戦（再読み込みからの復帰用） */
const CURRENT_KEY = 'kotodama.friend.current';

export function saveCurrentRoom(value) {
  try {
    if (value) localStorage.setItem(profileKey(CURRENT_KEY), JSON.stringify(value));
    else localStorage.removeItem(profileKey(CURRENT_KEY));
  } catch { /* 保存できない環境では復帰しない */ }
}

export function loadCurrentRoom() {
  try {
    return JSON.parse(localStorage.getItem(profileKey(CURRENT_KEY)) ?? 'null');
  } catch {
    return null;
  }
}
