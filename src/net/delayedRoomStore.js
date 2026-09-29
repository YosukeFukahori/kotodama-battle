// テスト用：どの RoomStore にも通信遅延を入れる包み（URL の ?latency=ミリ秒 で有効）。
// 書き込みと、購読の通知をそれぞれ latencyMs 遅らせる（順序は保つ）。

export class DelayedRoomStore {
  #inner;
  #latency;

  constructor(inner, { latencyMs }) {
    this.#inner = inner;
    this.#latency = latencyMs;
  }

  #delay() {
    return new Promise((r) => setTimeout(r, this.#latency));
  }

  get clientId() { return this.#inner.clientId; }
  get isLocalOnly() { return this.#inner.isLocalOnly; }
  serverNow() { return this.#inner.serverNow(); }
  trackPresence(path) { return this.#inner.trackPresence(path); }

  async get(path) { await this.#delay(); return this.#inner.get(path); }
  async set(path, value) { await this.#delay(); return this.#inner.set(path, value); }
  async update(path, fields) { await this.#delay(); return this.#inner.update(path, fields); }
  async createIfAbsent(path, value) { await this.#delay(); return this.#inner.createIfAbsent(path, value); }

  subscribe(path, callback) {
    let active = true;
    const off = this.#inner.subscribe(path, (value) => setTimeout(() => active && callback(value), this.#latency));
    return () => { active = false; off(); };
  }
}
