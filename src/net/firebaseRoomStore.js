// Firebase Realtime Database 版の部屋データ（RoomStore の取り決めは roomStore.js 冒頭）。
// FriendSession などは取り決めだけを使うので、LocalRoomStore と差し替えて動く。

import { initFirebase } from './firebase.js';

/** Realtime Database は undefined を書けないので、JSON で表せる形に整える（undefined は消える） */
const plain = (value) => (value === undefined ? null : JSON.parse(JSON.stringify(value)));

export class FirebaseRoomStore {
  #db;
  #fb;
  #uid;
  #offset = 0;

  /** Firebase に接続し、サーバー時刻との差を受け取ってから使える状態にする */
  static async connect(config) {
    const { db, user, database } = await initFirebase(config);
    const store = new FirebaseRoomStore({ db, uid: user.uid, database });
    await store.#waitForOffset();
    return store;
  }

  constructor({ db, uid, database }) {
    this.#db = db;
    this.#uid = uid;
    this.#fb = database;
  }

  #ref(path) {
    return this.#fb.ref(this.#db, path);
  }

  #waitForOffset() {
    return new Promise((resolve) => {
      // .info/serverTimeOffset：サーバー時刻 − この端末の時刻（ミリ秒）。接続中は自動で更新される
      this.#fb.onValue(this.#ref('.info/serverTimeOffset'), (snap) => {
        this.#offset = snap.val() ?? 0;
        resolve();
      });
    });
  }

  /** プレイヤー識別（匿名認証の uid） */
  get clientId() {
    return this.#uid;
  }

  get isLocalOnly() {
    return false;
  }

  /** Realtime Database のサーバー時刻の推定値（両端末で同じ基準になる） */
  serverNow() {
    return Date.now() + this.#offset;
  }

  async get(path) {
    const snap = await this.#fb.get(this.#ref(path));
    return snap.exists() ? snap.val() : null;
  }

  async set(path, value) {
    await this.#fb.set(this.#ref(path), plain(value));
  }

  /** 複数パスを一括で書く（Realtime Database の multi-path update。途中状態は見えない） */
  async update(path, fields) {
    await this.#fb.update(this.#ref(path), plain(fields));
  }

  /** まだ無ければ作る（トランザクション）。部屋コードの重複を防ぐ */
  async createIfAbsent(path, value) {
    const data = plain(value);
    const result = await this.#fb.runTransaction(this.#ref(path), (current) => (current === null ? data : undefined));
    return result.committed;
  }

  subscribe(path, callback) {
    return this.#fb.onValue(this.#ref(path), (snap) => callback(snap.exists() ? snap.val() : null));
  }

  /**
   * 接続状態の管理：接続中は connected = true。切断されたら（タブを閉じた・通信が切れた）
   * サーバー側で connected = false、lastSeen = サーバー時刻 を書く（onDisconnect）。
   */
  trackPresence(playerPath) {
    const { onValue, onDisconnect, set, serverTimestamp } = this.#fb;
    const connectedRef = this.#ref(`${playerPath}/connected`);
    const lastSeenRef = this.#ref(`${playerPath}/lastSeen`);
    const off = onValue(this.#ref('.info/connected'), (snap) => {
      if (snap.val() !== true) return;
      onDisconnect(connectedRef).set(false);
      onDisconnect(lastSeenRef).set(serverTimestamp());
      set(connectedRef, true);
    });
    return off;
  }
}
