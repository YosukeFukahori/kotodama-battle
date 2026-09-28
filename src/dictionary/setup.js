// ブラウザ用の組み立て。辞書データの場所と取得方法はここだけで決める。

import { CONFIG } from '../config.js';
import { OfficialDictionary, chunkFileName } from './officialDictionary.js';
import { ExtraDictionary } from './extraDictionary.js';
import { WordValidator } from './wordValidator.js';
import { PromptPool } from '../core/prompt.js';

const DATA_DIR = new URL('../../data/', import.meta.url);
const OFFICIAL_DIR = new URL('official/', DATA_DIR);

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json();
}

/** 正誤判定用の辞書（公式辞書 → 追加辞書）と判定器を作る。 */
export function createDictionaries({ loadJson = fetchJson } = {}) {
  const official = new OfficialDictionary({
    loadIndex: () => loadJson(new URL('index.json', OFFICIAL_DIR)),
    loadChunk: (first, last) => loadJson(new URL(chunkFileName(first, last), OFFICIAL_DIR)).then((d) => d.entries),
  });
  const extra = new ExtraDictionary({
    load: () => loadJson(new URL('extra-words.json', DATA_DIR)),
  });
  const validator = new WordValidator({
    sources: [
      { name: 'official', dictionary: official },
      { name: 'extra', dictionary: extra },
    ],
    minLength: CONFIG.word.minLength,
  });
  return { official, extra, validator };
}

/** 出題・CPU回答用のプールを読み込む。 */
export async function loadPromptPool({ loadJson = fetchJson } = {}) {
  const data = await loadJson(new URL('prompt-pool.json', DATA_DIR));
  return new PromptPool(data.entries, { minCandidates: CONFIG.prompt.minCandidates });
}

// 画面をまたいで辞書のキャッシュを使い回すための共有インスタンス
let shared = null;

export function getGameData() {
  if (!shared) {
    const dictionaries = createDictionaries();
    const promptPool = loadPromptPool();
    shared = { ...dictionaries, promptPool };
    // 読み込みに失敗したら次回やり直せるようにする
    promptPool.catch(() => { shared = null; });
  }
  return shared;
}
