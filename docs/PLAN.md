# 言霊バトル 開発計画（Ver.0.1）

仕様は [SPEC.md](SPEC.md) を参照。

## ファイル構成

```
kotodama-battle/
├── index.html
├── README.md / CLAUDE.md / THIRD_PARTY_LICENSES.md
├── docs/            SPEC.md, PLAN.md
├── tools/           build-dictionary.mjs     # 元辞書 → data/official/*.json（手元で実行）
├── data/
│   ├── official/                             # 最初の文字ごとの JSON（生成物）
│   ├── extra-words.json                      # ゲーム独自の追加辞書
│   └── prompt-pool.json                      # 出題・CPU回答用の一般語
├── src/
│   ├── main.js                               # 起動・画面切り替え
│   ├── config.js                             # 制限時間・HP・ダメージ係数など
│   ├── core/        kana.js, prompt.js, damage.js, battle.js
│   ├── dictionary/  officialDictionary.js, extraDictionary.js, wordValidator.js
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
| 3 | 仮辞書（数百語）＋判定レイヤー | 判定がロジック単体で動く | |
| 4 | 出題・ダメージ・バトル進行・CPU 1体 | 遊べる | |
| 5 | CPU戦績の保存（`storage.js`）・戦績画面・離脱時の敗北記録（`activeMatch`） | 勝敗が残る | |
| 6 | 本番の公式辞書を生成し、分割して読み込む | 実用的な辞書 | |
| 7 | CPU 3難易度・バランス調整・スマホ実機確認 | 仲間内テスト可 | |
| 8 | GitHub Pages 公開・README・ライセンス表記 | Ver.0.1 リリース | |

## ローカルでの確認方法

ES Modules は `file://` では読み込めないため、ローカルサーバー経由で開く。

```bash
python3 -m http.server 8000
```

→ http://localhost:8000/

## 確定事項（2026-09-28）

- 辞書にない言葉は無効（審議なし）
- 3問連続で両者とも時間切れ → 引き分け（`record.cpu.draws` +1）
- バトル開始後の「やめる」は敗北扱い
- リロード・途中離脱も敗北扱い。`activeMatch` の目印で将来の対人戦と同じ考え方に揃える（SPEC §3.5）
- CPU戦ではレーティングは一切変動しない
- 最初の文字として出題しない：ー・ん・を・ゔ・ゐ・ゑ・小書き文字
- 最後の文字として出題しない：を・ゔ・ゐ・ゑ・小書き文字（ん・ー は出題可）。出題制限と回答の有効性は分離する
- 長音は「ー」のみ有効。「〜」「－」「-」等は無効（再入力）

## 未確定事項

1. 出題・CPU回答を一般語プール（`prompt-pool.json`）に絞る（推奨）
2. 戦績・データのリセット機能を用意するか
3. 公式辞書の元データ（SudachiDict 想定）と固有名詞のカバー範囲
