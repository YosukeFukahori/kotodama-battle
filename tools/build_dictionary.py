"""公式辞書の生成スクリプト（docs/SPEC.md §8・docs/PLAN.md 実装順序6）。

SudachiDict（Apache-2.0）の元データ（CSV）から、正誤判定用の公式辞書を生成する。

    python3 tools/build_dictionary.py --download   # 元データを .cache/sudachi/ に取得してから生成
    python3 tools/build_dictionary.py              # 取得済みの元データから生成

出力：
    data/official/index.json            目次（出典・版・語数・お題ごとの語数）
    data/official/<XXXX>-<YYYY>.json    「最初の文字 × 最後の文字」ごとの単語
                                        （XXXX / YYYY は各文字のコードポイント16進）
    判定ではお題の条件チェックを通った読みしか辞書を引かないので、1問につき1ファイルだけ読めばよい。

収録ルール：
    - 名詞：普通名詞・固有名詞（地名・組織名・一般）、代名詞
      - 人名は「姓＋名」のフルネームのみ（姓だけ・名だけ・分割情報のない人名は除外）
      - 住所のように地名が連なったもの（「千葉県成田市北羽鳥」等）は除外
        （A単位分割に地名が3つ以上、または2つで「・」でつながっていないもの）
      - 数詞・助動詞語幹は除外
    - 動詞・形容詞：基本形（終止形）の見出しのみ。活用形・文語形は除外
    - 表記が英字・数字・記号だけの語（「SEAPCENTRE」等の略語・欧文）は除外
      （読みがアルファベットの羅列になり、不自然に長い言葉で大ダメージを出せてしまうため）
    - 読みは kana.js の normalizeReading と同じ規則でひらがなに正規化する（「ー」は保持）
    - 正規化後の読みが「ひらがなと ー のみ」「2文字以上」「130文字未満」のものだけ
      （130文字以上は法律名・標語などのノイズで、制限時間内の入力は実用上不可能なため。最大129文字まで収録）
    - 同じ読みが複数あれば、次の優先順で代表の表記を1つ選ぶ（判定は読みだけで行うので表示用）
        1. 英字を含まない表記（「Instagram」より「インスタグラム」）
        2. Sudachi の正規形の見出し（NormalizedForm が空。「珈琲」より「コーヒー」）
        3. small（UniDic 由来の基本語彙）を core より優先（「波子」より「橋」）
        4. 読みをそのままカタカナにしただけの表記は後回し（「キュウシュウ」より「九州」）
        5. コストが小さいもの
      ただし出題用プール（data/prompt-pool.json）にある読みは、プールの表記（手で整えたもの）を使う
"""

import argparse
import csv
import json
import re
import sys
import unicodedata
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "sudachi"
OUT = ROOT / "data" / "official"
POOL = ROOT / "data" / "prompt-pool.json"

SUDACHI_VERSION = "20260723"
SUDACHI_BASE = f"http://sudachi.s3-website-ap-northeast-1.amazonaws.com/sudachidict-raw/v1/{SUDACHI_VERSION}"
SOURCES = ["small_lex", "core_lex"]  # small + core（notcore は収録しない）

MIN_LENGTH = 2  # src/config.js の word.minLength と揃える
MAX_READING_LENGTH = 130  # 読みがこの文字数以上の語は収録しない（最大 129 文字）

READING = re.compile(r"^[ぁ-ゖー]+$")
ESCAPE = re.compile(r"\\u([0-9a-fA-F]{4})")
ASCII_LETTER = re.compile(r"[A-Za-z]")
# かな・漢字を1文字でも含むか（含まない表記＝英字・数字・記号だけの語は収録しない）
JAPANESE = re.compile(r"[\u3041-\u3096\u30A1-\u30FA\u30FC\u3005\u4E00-\u9FFF\uF900-\uFAFF\uFF66-\uFF9F]")


def unescape(text):
    """Sudachi の CSV は区切り文字などを \\uXXXX でエスケープしている。"""
    return ESCAPE.sub(lambda m: chr(int(m.group(1), 16)), text)


def normalize_reading(text):
    """kana.js の normalizeReading と同じ：NFKC → カタカナをひらがなに（ー は保持）。"""
    text = unicodedata.normalize("NFKC", text.strip())
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in text)


def is_full_name(split_a):
    """SplitA（A単位分割）に「姓」と「名」の両方を含む人名だけをフルネームとみなす。"""
    if not split_a:
        return False
    parts = [p.split(",") for p in split_a.split("/")]
    kinds = {p[4] for p in parts if len(p) > 4 and p[3] == "人名"}
    return "姓" in kinds and "名" in kinds


def is_address_like(row):
    """住所のように地名が連なった地名か。"""
    split_a = row["SplitA"]
    if not split_a:
        return False
    parts = [p.split(",") for p in split_a.split("/")]
    places = sum(1 for p in parts if len(p) > 3 and p[3] == "地名")
    surface = row["Headword"] or row["IndexForm"]
    return places >= 3 or (places == 2 and "・" not in surface)


def accept(row):
    """収録する品詞かどうか。"""
    pos1, pos2, pos3, pos6 = row["POS1"], row["POS2"], row["POS3"], row["POS6"]
    if pos1 == "名詞":
        if pos2 == "普通名詞":
            return True
        if pos2 == "固有名詞":
            if pos3 == "人名":
                return is_full_name(row["SplitA"])
            if pos3 == "地名":
                return not is_address_like(row)
            return True
        return False  # 数詞・助動詞語幹
    if pos1 == "代名詞":
        return True
    if pos1 in ("動詞", "形容詞"):
        # 基本形の見出しのみ（DictionaryForm が空＝自分自身が辞書形）。文語は除外
        return pos6 == "終止形-一般" and not row["DictionaryForm"] and not row["POS5"].startswith("文語")
    return False


def download():
    CACHE.mkdir(parents=True, exist_ok=True)
    for name in SOURCES:
        csv_path = CACHE / f"{name}.csv"
        if csv_path.exists():
            print(f"skip download: {csv_path.name} exists")
            continue
        zip_path = CACHE / f"{name}.zip"
        url = f"{SUDACHI_BASE}/{name}.zip"
        print(f"downloading {url}")
        urllib.request.urlretrieve(url, zip_path)
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(CACHE)
        zip_path.unlink()


def to_katakana(hiragana):
    return "".join(chr(ord(c) + 0x60) if "\u3041" <= c <= "\u3096" else c for c in hiragana)


def surface_priority(row, surface, reading, source_rank):
    """小さいほど代表の表記として優先する。"""
    try:
        cost = int(row["Cost"])
    except ValueError:
        cost = 1 << 30
    has_ascii = 1 if ASCII_LETTER.search(surface) else 0
    normalized = unescape(row["NormalizedForm"])
    not_canonical = 1 if normalized and normalized != surface else 0
    katakana_only = 1 if surface == to_katakana(reading) else 0
    return (has_ascii, not_canonical, source_rank, katakana_only, cost)


def build(src_dir):
    best = {}  # 読み → (優先度, surface)
    stats = {"rows": 0, "accepted": 0}
    for source_rank, name in enumerate(SOURCES):
        path = src_dir / f"{name}.csv"
        if not path.exists():
            sys.exit(f"{path} がありません。--download を付けて実行するか、--src で場所を指定してください")
        with path.open(encoding="utf-8", newline="") as f:
            for row in csv.DictReader(f):
                stats["rows"] += 1
                if not accept(row):
                    continue
                reading = normalize_reading(unescape(row["ReadingForm"]))
                if len(reading) < MIN_LENGTH or not READING.match(reading):
                    continue
                if len(reading) >= MAX_READING_LENGTH:
                    stats["too_long"] = stats.get("too_long", 0) + 1
                    continue
                surface = unescape(row["Headword"] or row["IndexForm"]).strip()
                if not JAPANESE.search(surface):
                    stats["latin_only"] = stats.get("latin_only", 0) + 1
                    continue
                priority = surface_priority(row, surface, reading, source_rank)
                stats["accepted"] += 1
                current = best.get(reading)
                if current is None or priority < current[0]:
                    best[reading] = (priority, surface)
    return best, stats


def chunk_filename(first, last):
    """src/dictionary/officialDictionary.js の chunkFileName と同じ規則。"""
    return f"{ord(first):04X}-{ord(last):04X}.json"


def apply_curated_surfaces(best):
    """出題用プールにある読みは、プールの表記を代表にする（同音異義語で珍しい表記が選ばれるのを防ぐ）。"""
    pool = json.loads(POOL.read_text(encoding="utf-8"))
    applied = 0
    for raw in pool["entries"]:
        reading, surface = raw[0], (raw[1] if len(raw) > 1 else raw[0])
        if reading in best and best[reading][1] != surface:
            best[reading] = (best[reading][0], surface)
            applied += 1
    print(f"curated surfaces applied: {applied}")


def write(best, stats):
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.json"):
        old.unlink()

    chunks = {}
    for reading in sorted(best):
        chunks.setdefault((reading[0], reading[-1]), []).append(reading)

    index = {
        "version": 1,
        "source": {
            "name": "SudachiDict",
            "version": SUDACHI_VERSION,
            "dictionaries": SOURCES,
            "license": "Apache-2.0",
            "url": "https://github.com/WorksApplications/SudachiDict",
        },
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "total": len(best),
        "maxReadingLength": max((len(r) for r in best), default=0),
        # 最初の文字 → 最後の文字 → 語数。ファイル名は chunk_filename() で決まる
        "counts": {},
    }
    for (first, last), readings in sorted(chunks.items()):
        entries = []
        for r in readings:
            surface = best[r][1]
            entries.append([r] if surface == r else [r, surface])
        body = json.dumps({"version": 1, "first": first, "last": last, "entries": entries}, ensure_ascii=False, separators=(",", ":"))
        (OUT / chunk_filename(first, last)).write_text(body + "\n", encoding="utf-8")
        index["counts"].setdefault(first, {})[last] = len(entries)

    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"rows: {stats['rows']:,} / accepted: {stats['accepted']:,} / latin-only skipped: {stats.get('latin_only', 0):,} / too long skipped: {stats.get('too_long', 0):,} / unique readings: {len(best):,} / chunks: {len(chunks)}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--download", action="store_true", help="元データを .cache/sudachi/ に取得する")
    parser.add_argument("--src", type=Path, default=CACHE, help="small_lex.csv / core_lex.csv のあるディレクトリ")
    args = parser.parse_args()
    if args.download:
        download()
    best, stats = build(args.src)
    apply_curated_surfaces(best)
    write(best, stats)


if __name__ == "__main__":
    main()
