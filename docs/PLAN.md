# 言霊バトル 開発計画（Ver.0.1）

仕様は [SPEC.md](SPEC.md) を参照。

## ファイル構成

```
kotodama-battle/
├── index.html
├── README.md / CLAUDE.md / THIRD_PARTY_LICENSES.md
├── docs/            SPEC.md, PLAN.md
├── tools/
│   ├── serve.py                              # 開発用サーバー（キャッシュ無効）
│   └── build-dictionary.mjs                  # 元辞書 → data/official/*.json（手元で実行・実装順序6）
├── data/
│   ├── official-seed.json                    # 仮の公式辞書（手作り約400語。実装順序6で置き換え）
│   ├── official/                             # 最初の文字ごとの JSON（生成物・実装順序6）
│   ├── extra-words.json                      # ゲーム独自の追加辞書
│   └── prompt-pool.json                      # 出題・CPU回答用の一般語（仮データは公式仮辞書と同じ日常語）
├── src/
│   ├── main.js                               # 起動・画面切り替え
│   ├── config.js                             # 制限時間・HP・ダメージ係数など
│   ├── core/        kana.js, prompt.js, damage.js, battle.js
│   ├── dictionary/  wordEntry.js, officialDictionary.js, extraDictionary.js,
│   │                wordValidator.js, setup.js
│   ├── cpu/         enemies.js, cpuAI.js
│   ├── storage/     storage.js
│   ├── ui/          dom.js, titleScreen.js, selectScreen.js, battleScreen.js,
│   │                resultScreen.js, recordScreen.js
│   └── styles/      style.css
└── tests/                                    # 自前ハーネス（ブラウザ /tests/ または node tests/run.js）
```

## 実装順序

| # | 内容 | 到達点 | 状態 |
|---|---|---|---|
| 1 | 土台：5画面の骨組み・画面切り替え・モバイルファーストCSS | スマホでも画面遷移できる | 完了 |
| 2 | `kana.js` ＋テスト | 文字の扱いが確定 | 完了 |
| 3 | 仮辞書（数百語）＋判定レイヤー | 判定がロジック単体で動く | 完了 |
| 4 | 出題・ダメージ・判定タイム方式のバトル進行・CPU 3難易度 | 遊べる | 完了 |
| 5 | CPU戦績の保存（`storage.js`）・戦績画面・離脱時の敗北記録（`activeMatch`） | 勝敗が残る | |
| 6 | 本番の公式辞書を生成し、分割して読み込む | 実用的な辞書 | |
| 7 | CPU 3難易度・バランス調整・スマホ実機確認 | 仲間内テスト可 | |
| 8 | GitHub Pages 公開・README・ライセンス表記 | Ver.0.1 リリース | |

## ローカルでの確認方法

ES Modules は `file://` では読み込めないため、ローカルサーバー経由で開く。

```bash
python3 tools/serve.py
```

（キャッシュ無効の開発サーバー。`python3 -m http.server` だと ES Modules がキャッシュされ編集が反映されないことがある）

→ http://localhost:8000/

## 確定事項（2026-09-28）

- 辞書にない言葉は無効（審議なし）
- 1問ごとに両者の回答（確定 or 時間切れ）を待ち、判定タイムでまとめて判定してから攻撃する（SPEC §3.1〜3.2）
- 「回答する」を押したら回答はロック。無効でもその問題では再入力不可。IME変換中の誤送信は防止
- 判定タイムまで相手の回答・文字数・回答時間は非公開（回答済みかどうかだけ表示）
- 両者有効なら回答時間の短い側が先攻。完全に同じなら同時攻撃（両者HP0なら引き分け）
- 3問連続でどちらからも有効な攻撃がなければ引き分け（`record.cpu.draws` +1）
- バトル開始後の「やめる」は敗北扱い
- リロード・途中離脱も敗北扱い。`activeMatch` の目印で将来の対人戦と同じ考え方に揃える（SPEC §3.5）
- CPU戦ではレーティングは一切変動しない
- 最初の文字として出題しない：ー・ん・を・ゔ・ゐ・ゑ・小書き文字
- 最後の文字として出題しない：を・ゔ・ゐ・ゑ・小書き文字（ん・ー は出題可）。出題制限と回答の有効性は分離する
- 長音は「ー」のみ有効。「〜」「－」「-」等を使った回答は無効

## 未確定事項

1. 戦績・データのリセット機能を用意するか
2. 公式辞書の元データ（SudachiDict 想定）と固有名詞のカバー範囲
