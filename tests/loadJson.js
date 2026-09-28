// リポジトリ直下からの相対パスで JSON を読む。ブラウザと Node の両方で動く。

export async function loadJson(pathFromRoot) {
  const url = new URL(`../${pathFromRoot}`, import.meta.url);
  if (typeof window !== 'undefined') {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
    return res.json();
  }
  const { readFile } = await import('node:fs/promises');
  return JSON.parse(await readFile(url, 'utf8'));
}
