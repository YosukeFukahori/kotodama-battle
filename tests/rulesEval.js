// テスト用：Firebase Realtime Database のセキュリティルールの簡易評価器。
// database.rules.json で使っている範囲（auth / data / newData / root / now / $変数 / child / val / exists / parent / matches）
// だけを、Realtime Database と同じ考え方で評価する：
//   - .read / .write：根元から対象パスまでの各階層を見て、どこか1つでも true なら許可（浅い階層の許可は深い階層で取り消せない）
//   - 対象パスより深い階層の .write は使われない（深い階層だけに許可があっても、浅いパスへの書き込みは拒否）
//   - .validate：書き込み後に値が存在する階層で、対象パスの祖先と、書き込んだ値の中身の各階層を評価（削除では評価しない）
//   - update（複数パス）は、各パスをそれぞれ評価し、すべて通れば許可
// ※ 公式エミュレーターの代わりの近似。本物の Firebase でも同じケースを確認すること。

const splitPath = (path) => path.split('/').filter(Boolean);

function getAt(tree, parts) {
  let node = tree;
  for (const p of parts) {
    if (node === null || typeof node !== 'object') return null;
    node = node[p] ?? null;
  }
  return node;
}

function setAt(tree, parts, value) {
  if (parts.length === 0) return value;
  const root = tree && typeof tree === 'object' ? { ...tree } : {};
  const [head, ...rest] = parts;
  const child = setAt(root[head] ?? null, rest, value);
  if (child === null || (typeof child === 'object' && Object.keys(child).length === 0)) delete root[head];
  else root[head] = child;
  return Object.keys(root).length ? root : null;
}

const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

class Snap {
  constructor(tree, parts) {
    this.tree = tree;
    this.parts = parts;
  }
  val() { return getAt(this.tree, this.parts); }
  exists() { return this.val() !== null; }
  child(path) { return new Snap(this.tree, [...this.parts, ...splitPath(path)]); }
  parent() { return new Snap(this.tree, this.parts.slice(0, -1)); }
  hasChild(path) { return this.child(path).exists(); }
}

// ルール式の `$code.matches(/.../)` 用（テスト環境だけで定義する）
if (!String.prototype.matches) {
  // eslint-disable-next-line no-extend-native
  Object.defineProperty(String.prototype, 'matches', { value(re) { return re.test(this); }, configurable: true });
}

const compiled = new Map();
function evaluate(expr, ctx) {
  if (typeof expr === 'boolean') return expr;
  if (!compiled.has(expr)) {
    const js = expr.replace(/\$(\w+)/g, 'vars.$1');
    // eslint-disable-next-line no-new-func
    compiled.set(expr, new Function('data', 'newData', 'root', 'auth', 'now', 'vars', `return (${js});`));
  }
  try {
    return compiled.get(expr)(ctx.data, ctx.newData, ctx.root, ctx.auth, ctx.now, ctx.vars) === true;
  } catch {
    return false; // ルール式の実行時エラーは「不許可」
  }
}

/** パスに沿ってルールの節点をたどる（$ワイルドカードは変数に入れる）。各階層の { node, parts, vars } を返す */
function walk(rules, parts) {
  const levels = [];
  let node = rules.rules;
  const vars = {};
  for (let i = 0; i <= parts.length; i += 1) {
    levels.push({ node, parts: parts.slice(0, i), vars: { ...vars } });
    if (i === parts.length || !node) break;
    const key = parts[i];
    if (node[key] !== undefined) node = node[key];
    else {
      const wildcard = Object.keys(node).find((k) => k.startsWith('$'));
      if (!wildcard) { node = null; continue; }
      vars[wildcard.slice(1)] = key;
      node = node[wildcard];
    }
  }
  return levels;
}

export class RulesEngine {
  constructor(rules, { now = () => Date.now() } = {}) {
    this.rules = rules;
    this.now = now;
  }

  canRead(db, auth, path) {
    const root = new Snap(db, []);
    return walk(this.rules, splitPath(path)).some(({ node, parts, vars }) => node?.['.read'] !== undefined
      && evaluate(node['.read'], { data: new Snap(db, parts), newData: new Snap(db, parts), root, auth, now: this.now(), vars }));
  }

  #writeAllowed(db, newDb, auth, path) {
    const root = new Snap(db, []);
    const levels = walk(this.rules, splitPath(path));
    const granted = levels.some(({ node, parts, vars }) => node?.['.write'] !== undefined
      && evaluate(node['.write'], { data: new Snap(db, parts), newData: new Snap(newDb, parts), root, auth, now: this.now(), vars }));
    if (!granted) return { ok: false, why: 'write' };
    // .validate：祖先（対象パスまで）
    for (const { node, parts, vars } of levels) {
      if (node?.['.validate'] === undefined) continue;
      const newData = new Snap(newDb, parts);
      if (!newData.exists()) continue;
      if (!evaluate(node['.validate'], { data: new Snap(db, parts), newData, root, auth, now: this.now(), vars })) return { ok: false, why: `validate ${parts.join('/')}` };
    }
    // .validate：書き込んだ値の中身
    const last = levels.at(-1);
    const bad = this.#validateTree(db, newDb, auth, last?.node, splitPath(path), last?.vars ?? {}, true);
    return bad ? { ok: false, why: `validate ${bad}` } : { ok: true };
  }

  #validateTree(db, newDb, auth, node, parts, vars, isTop) {
    const value = getAt(newDb, parts);
    if (value === null || !node) return null;
    if (!isTop && node['.validate'] !== undefined
      && !evaluate(node['.validate'], { data: new Snap(db, parts), newData: new Snap(newDb, parts), root: new Snap(db, []), auth, now: this.now(), vars })) {
      return parts.join('/');
    }
    if (typeof value !== 'object') return null;
    for (const key of Object.keys(value)) {
      let child = node[key];
      const childVars = { ...vars };
      if (child === undefined) {
        const wildcard = Object.keys(node).find((k) => k.startsWith('$'));
        if (wildcard) { child = node[wildcard]; childVars[wildcard.slice(1)] = key; }
      }
      const bad = this.#validateTree(db, newDb, auth, child, [...parts, key], childVars, false);
      if (bad) return bad;
    }
    return null;
  }

  /** set(path, value) を試す。許可されれば新しい DB を返す */
  set(db, auth, path, value) {
    const newDb = setAt(clone(db), splitPath(path), clone(value));
    const result = this.#writeAllowed(db, newDb, auth, path);
    return result.ok ? { ok: true, db: newDb } : result;
  }

  /** update(path, fields)：各パスをそれぞれ評価し、すべて通れば許可（Realtime Database の multi-path update と同じ） */
  update(db, auth, path, fields) {
    let newDb = clone(db);
    const targets = Object.entries(fields).map(([key, value]) => [[...splitPath(path), ...splitPath(key)].join('/'), value]);
    for (const [target, value] of targets) newDb = setAt(newDb, splitPath(target), clone(value));
    for (const [target] of targets) {
      const result = this.#writeAllowed(db, newDb, auth, target);
      if (!result.ok) return { ...result, path: target };
    }
    return { ok: true, db: newDb };
  }
}
