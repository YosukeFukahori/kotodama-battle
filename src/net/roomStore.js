// 部屋データの読み書き（docs/SPEC.md §10）。Firebase Realtime Database と同じ考え方の取り決め：
//   serverNow()                    サーバー時刻（ミリ秒）
//   get(path)                      → Promise<値 | null>（path 以下をまとめたオブジェクト）
//   set(path, value)               path 以下を value で置き換える（null で削除）
//   update(path, fields)           path 直下の複数の項目をまとめて書き換える
//   createIfAbsent(path, value)    → Promise<boolean>  まだ無ければ作る（部屋コードの重複防止）
//   subscribe(path, callback)      → 解除関数。path 以下が変わるたびに callback(値)
//
// ここでは通信なしの LocalRoomStore を用意する（Firebase 版は FirebaseRoomStore として後で追加）。
//   - localStorage 版：同じブラウザの別タブ・別 iframe と共有できる（2画面テスト・手元での2人プレイ用）
//   - Map 版：単体テスト用
// データは「パス → JSON」で保存し、読むときに組み立てる。
// あとから書いた深いパスの値が、先に書いた浅いパスのオブジェクトの中身より優先される。

const splitPath = (path) => path.split('/').filter(Boolean);
const joinPath = (parts) => parts.join('/');

function isUnder(key, path) {
  return key === path || key.startsWith(`${path}/`);
}

function assignAt(target, parts, value) {
  if (parts.length === 0) return value;
  const root = target && typeof target === 'object' ? target : {};
  let node = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!node[parts[i]] || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
    node = node[parts[i]];
  }
  const last = parts.at(-1);
  if (value === null) delete node[last];
  else node[last] = value;
  return root;
}

function drill(value, parts) {
  let node = value;
  for (const p of parts) {
    if (!node || typeof node !== 'object') return undefined;
    node = node[p];
  }
  return node;
}

/** 保存先の取り決め：{ getItem, setItem, removeItem, keys(), onChange(listener) } */
export function mapBackend(map = new Map()) {
  const listeners = new Set();
  const notify = (key) => { for (const l of listeners) l(key); };
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, v); notify(k); },
    removeItem: (k) => { map.delete(k); notify(k); },
    keys: () => [...map.keys()],
    onChange: (l) => { listeners.add(l); return () => listeners.delete(l); },
  };
}

/** localStorage を使う保存先。別タブ・別 iframe の変更は storage イベントで受け取る */
export function localStorageBackend(prefix = 'kotodama.room:', storage = globalThis.localStorage) {
  const listeners = new Set();
  const notify = (key) => { for (const l of listeners) l(key); };
  globalThis.addEventListener?.('storage', (e) => {
    if (e.key && e.key.startsWith(prefix)) notify(e.key.slice(prefix.length));
    else if (e.key === null) for (const k of keysOf()) notify(k); // clear()
  });
  function keysOf() {
    const out = [];
    for (let i = 0; i < storage.length; i += 1) {
      const k = storage.key(i);
      if (k && k.startsWith(prefix)) out.push(k.slice(prefix.length));
    }
    return out;
  }
  return {
    getItem: (k) => storage.getItem(prefix + k),
    setItem: (k, v) => { storage.setItem(prefix + k, v); notify(k); },
    removeItem: (k) => { storage.removeItem(prefix + k); notify(k); },
    keys: keysOf,
    onChange: (l) => { listeners.add(l); return () => listeners.delete(l); },
  };
}

export class LocalRoomStore {
  #backend;
  #clock;
  #subs = new Set();

  constructor({ backend = localStorageBackend(), clock = () => Date.now() } = {}) {
    this.#backend = backend;
    this.#clock = clock;
    backend.onChange((key) => this.#onChange(key));
  }

  serverNow() {
    return this.#clock();
  }

  #read(path) {
    const parts = splitPath(path);
    const keys = this.#backend.keys();
    let result;
    // 浅い順に重ねる：祖先のオブジェクトの中身 → path 自身 → 子孫
    const related = keys
      .filter((k) => isUnder(path, k) || isUnder(k, path))
      .sort((a, b) => splitPath(a).length - splitPath(b).length);
    for (const key of related) {
      const raw = this.#backend.getItem(key);
      if (raw == null) continue;
      const value = JSON.parse(raw);
      const keyParts = splitPath(key);
      if (keyParts.length <= parts.length) {
        const drilled = keyParts.length === parts.length ? value : drill(value, parts.slice(keyParts.length));
        if (drilled !== undefined) result = drilled === null ? undefined : structuredCloneSafe(drilled);
      } else {
        result = assignAt(result, keyParts.slice(parts.length), value);
      }
    }
    return result === undefined ? null : result;
  }

  async get(path) {
    return this.#read(path);
  }

  #setSync(path, value) {
    for (const key of this.#backend.keys()) {
      if (isUnder(key, path) && key !== path) this.#backend.removeItem(key);
    }
    // null は「削除」。祖先のオブジェクトに残った古い中身を隠すため、null を書いておく
    this.#backend.setItem(path, JSON.stringify(value ?? null));
  }

  async set(path, value) {
    this.#setSync(path, value);
  }

  /** 複数の項目を一括で書く。購読側には書き終わった状態だけが1回で通知される（Firebase の update と同じ） */
  async update(path, fields) {
    for (const [key, value] of Object.entries(fields)) {
      this.#setSync(joinPath([...splitPath(path), ...splitPath(key)]), value);
    }
  }

  async createIfAbsent(path, value) {
    if (this.#read(path) !== null) return false;
    this.#setSync(path, value);
    return true;
  }

  subscribe(path, callback) {
    const sub = { path, callback, pending: false };
    this.#subs.add(sub);
    this.#schedule(sub);
    return () => this.#subs.delete(sub);
  }

  #onChange(key) {
    for (const sub of this.#subs) {
      if (isUnder(key, sub.path) || isUnder(sub.path, key)) this.#schedule(sub);
    }
  }

  /** 同じタイミングの複数の変更は1回の通知にまとめる */
  #schedule(sub) {
    if (sub.pending) return;
    sub.pending = true;
    queueMicrotask(() => {
      sub.pending = false;
      if (this.#subs.has(sub)) sub.callback(this.#read(sub.path));
    });
  }
}

function structuredCloneSafe(value) {
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}
