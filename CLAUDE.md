# CLAUDE.md

言霊バトル：お題（最初の文字＋最後の文字）に合う言葉を、長く・速く答えて相手のHPを削るブラウザゲーム。
仲間内で遊ぶ試作版（Ver.0.1）。

## 仕様の扱い（最重要）

- **`docs/SPEC.md` を仕様の正とする。** コードやこのファイルと食い違う場合は SPEC が優先
- **仕様変更は SPEC へ反映してから実装する。** 実装だけ先に変えない
- **大きな仕様変更を勝手に行わない。** ルール・データ構造・画面構成に関わる変更は、提案してユーザーの確認を取ってから
- 開発の進捗と未確定事項は `docs/PLAN.md` で管理する

## 守るべきルール

- **CPU戦でレーティングを変動させない。** CPU戦は練習・操作確認・バランス確認用。戦績は `record.cpu` にのみ記録する
- **成長要素・自分辞書は実装しない。** 完全実力勝負（ステータスなし、両者同HP、ダメージは文字数と速さのみ）
- **辞書の役割を混ぜない**
  - 公式辞書（`data/official/`、SudachiDict から `tools/build_dictionary.py` で生成。手で編集しない）＋追加辞書（`data/extra-words.json`）＝ 正誤判定用
  - `data/prompt-pool.json` ＝ 出題と CPU 回答用
  - 辞書にない言葉は無効（審議機能なし）
- **将来のランダムマッチを壊さない構造にする**
  - `rating.ranked` と `record.ranked` は将来用。Ver.0.1 では触らない
  - 戦績・離脱処理はモード（`"cpu"` / `"ranked"`）で振り分ける
  - 単語判定は `WordValidator` に集約し、辞書は非同期インターフェイスにする
- **モバイルファースト。** スマホのブラウザで快適に遊べることを最優先。IME変換中のEnter、ソフトキーボード表示時のレイアウト、タップ領域（48px以上）、入力欄のフォントは16px以上に気を付ける

## 技術方針

- HTML / CSS / JavaScript（ES Modules）。ビルドなし・外部ライブラリなし
- 保存は localStorage（キー `kotodama.save`、`version` 付き）
- バランスや動作に関わる数値はすべて `src/config.js` に置く。ロジック側にマジックナンバーを書かない
- ロジック（`src/core/`, `src/dictionary/`, `src/cpu/cpuAI.js`）は DOM に依存させず、Node でテストできるようにする
- 画面は `src/ui/*Screen.js`。`render({ navigate, params })` で要素を返す
- 文字判定・文字数はすべて「読み」（正規化済みひらがな）で行い、表示には「表記」を使う。かなの処理は `src/core/kana.js` に集約する

## 開発手順

```bash
# ローカルで起動（ES Modules は file:// では動かない。キャッシュ無効の開発サーバー）
python3 tools/serve.py
# → http://localhost:8000/

# テスト（ブラウザ）：サーバー起動後に http://localhost:8000/tests/ を開く
# テスト（Node 14 以上）
node tests/run.js

# 操作テスト（ブラウザのみ）：http://localhost:8000/tests/e2e/ を開く（実際のアプリを動かして入力の制御を確認）
```

- テストは依存なしの自前ハーネス（`tests/harness.js`）。テストファイルを追加したら `tests/run.js` の import に追記する
- 実装順序は `docs/PLAN.md` に従う
- ロジックを追加・変更したらテストも追加・更新する
- UI を変えたらスマホ幅（375px 程度）で表示を確認する
- バトル画面の入力まわりを変えたら操作テスト（`/tests/e2e/`）も実行する
- バランス（ダメージ式・CPU設定・出題条件）を変えたら、シミュレーター（`/tools/sim/`）で勝率と平均問題数を確認する
