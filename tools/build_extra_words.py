"""追加辞書の生成スクリプト。

tools/extra-words/*.txt（カテゴリ別の元データ）から data/extra-words.json を生成する。

    python3 tools/build_extra_words.py           # 生成してカテゴリ別の語数を表示
    python3 tools/build_extra_words.py --check   # 書き込まずに、現在の data/extra-words.json と一致するか確認

手順：
    1. カテゴリ別の元データを読む（ファイル名の順）
    2. 公式辞書（data/official/）にある読みを除外する
    3. カテゴリ間で重複する読みを除外する（先に出たもの＝ファイル名の順で先のものを残す）
    4. 読みの順に並べて data/extra-words.json に書き出す

元データの形式（1行1語、# で始まる行と空行は無視）：
    表記,よみ       漢字などを含む語。よみはひらがな（カタカナも可）
    カタカナ表記    読みはカタカナをひらがなにして作る
    読みからは空白・「・」「＝」などの記号を取り除く。ひらがな・ー以外が残る行はエラー。
    読みは kana.js の normalizeReading と同じ規則でひらがなに正規化する（「ー」は保持）。

採用の方針（docs/SPEC.md §8・CLAUDE.md「辞書の役割を混ぜない」）：
    - 実際にプレイヤーが答えそうな自然な言葉だけ（固有名詞はフルネーム・正式名称・定着した通称）
    - 入れないもの：意味不明な文字列、極端にマイナーなIDや型番、URL、電話番号、住所の連結、
      英数字だけのコード、不自然な表記揺れ、明らかな誤字、文やフレーズ（「漫画を読む」等）
    - 出題と CPU 回答には使わない（それは data/prompt-pool.json の役割）
"""

import argparse
import glob
import json
import os
import re
import sys
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE_DIR = os.path.join(ROOT, "tools", "extra-words")
OFFICIAL_DIR = os.path.join(ROOT, "data", "official")
OUTPUT = os.path.join(ROOT, "data", "extra-words.json")
DESCRIPTION = "ゲーム独自の追加辞書。公式辞書（SudachiDict）にない言葉を開発側が追記する。形式: [読み, 表記?]"
MIN_LENGTH = 2  # src/config.js の word.minLength と同じ

READING = re.compile(r"^[ぁ-ゖー]+$")
# 読みから取り除く記号
STRIP = re.compile(r"[\s　・＝=･.!！?？、。&＆'’〜~-]")


def normalize(text):
    """kana.js の normalizeReading と同じ：NFKC → カタカナをひらがなに（ー は保持）。"""
    text = unicodedata.normalize("NFKC", text.strip())
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in text)


def load_official():
    readings = set()
    for path in glob.glob(os.path.join(OFFICIAL_DIR, "*-*.json")):
        with open(path, encoding="utf-8") as f:
            readings.update(entry[0] for entry in json.load(f)["entries"])
    return readings


def load_sources():
    """[(カテゴリ, 読み, 表記 or None)] と、エラーの一覧を返す。"""
    rows, errors = [], []
    for path in sorted(glob.glob(os.path.join(SOURCE_DIR, "*.txt"))):
        category = os.path.basename(path)[:-4]
        with open(path, encoding="utf-8") as f:
            for n, line in enumerate(f, 1):
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                surface, _, given = line.partition(",")
                surface = surface.strip()
                reading = STRIP.sub("", normalize(given if given else surface))
                if not READING.match(reading):
                    errors.append(f"{category}.txt:{n}: {line} → 読み「{reading}」にひらがな・ー以外がある")
                    continue
                if len(reading) < MIN_LENGTH:
                    continue
                rows.append((category, reading, None if surface == reading else surface))
    return rows, errors


def build():
    rows, errors = load_sources()
    if errors:
        print("\n".join(errors), file=sys.stderr)
        sys.exit(1)
    official = load_official()
    stats = {}
    adopted = {}  # 読み → (カテゴリ, 表記)
    for category, reading, surface in rows:
        s = stats.setdefault(category, {"candidates": 0, "official": 0, "duplicate": 0, "adopted": 0})
        s["candidates"] += 1
        if reading in official:
            s["official"] += 1
        elif reading in adopted:
            s["duplicate"] += 1
        else:
            adopted[reading] = (category, surface)
            s["adopted"] += 1
    entries = sorted(([r, s] if s else [r]) for r, (_, s) in adopted.items())
    return entries, stats, adopted


def render(entries):
    lines = ",\n".join("    " + json.dumps(e, ensure_ascii=False) for e in entries)
    return ('{\n  "version": 1,\n  "description": ' + json.dumps(DESCRIPTION, ensure_ascii=False)
            + ',\n  "entries": [\n' + lines + "\n  ]\n}\n")


def print_stats(stats, adopted):
    print(f"{'カテゴリ':<12}{'候補':>6}{'公式':>6}{'重複':>6}{'採用':>6}{'8字+':>6}{'12字+':>6}")
    for category in sorted(stats):
        s = stats[category]
        readings = [r for r, (c, _) in adopted.items() if c == category]
        print(f"{category:<12}{s['candidates']:>6}{s['official']:>6}{s['duplicate']:>6}{s['adopted']:>6}"
              f"{sum(len(r) >= 8 for r in readings):>6}{sum(len(r) >= 12 for r in readings):>6}")
    print(f"合計 {len(adopted)} 語（8文字以上 {sum(len(r) >= 8 for r in adopted)}、"
          f"12文字以上 {sum(len(r) >= 12 for r in adopted)}）")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="書き込まずに、現在のファイルと一致するか確認する")
    args = parser.parse_args()
    entries, stats, adopted = build()
    text = render(entries)
    print_stats(stats, adopted)
    if args.check:
        with open(OUTPUT, encoding="utf-8") as f:
            current = f.read()
        if current != text:
            print("data/extra-words.json が元データと一致しません（build_extra_words.py を実行してください）", file=sys.stderr)
            sys.exit(1)
        print("data/extra-words.json は元データと一致しています")
        return
    with open(OUTPUT, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"書き出し：{os.path.relpath(OUTPUT, ROOT)}")


if __name__ == "__main__":
    main()
