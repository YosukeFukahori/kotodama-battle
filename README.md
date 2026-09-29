# 言霊バトル

「あ」から始まり「で」で終わる言葉は？——
お題に合う言葉を、**長く・速く**答えて相手のHPを削る、日本語の言葉バトルゲームです。

仲間内で遊ぶための試作版（Ver.0.1）。ブラウザだけで動き、スマホでも遊べます。

**▶ 遊ぶ：https://yosukefukahori.github.io/kotodama-battle/**

スマホで遊んで気づいたことは [docs/MOBILE_CHECKLIST.md](docs/MOBILE_CHECKLIST.md) の項目を参考に教えてください。

## 遊び方

1. タイトルで「バトル」を選び、CPUの難易度を選ぶ
2. お題（最初の文字と最後の文字）が出たら、条件に合う言葉をかなで入力する
3. 各ラウンドは「ROUND → READY → FIGHT!」で始まる。FIGHT! でお題が出て15秒のカウントが始まる
4. 「回答する」を押すと回答が確定（ロック）される。両者の回答がそろうか時間切れになったら判定タイム
5. 有効な回答だけが攻撃になる。速く答えた側が先攻。**長い言葉ほど加速度的に大ダメージ**（速さの影響は控えめ）
6. 判定タイムは3秒表示され、自動で次のラウンドへ進む
7. 相手のHPを0にしたら勝ち

## 主なルール

- 制限時間は1問15秒。時間切れの側はそのターン攻撃なし
- CPUと同じお題に同時に回答する。判定タイムまで相手の答えは見えない（回答済みかどうかだけ分かる）
- 一度「回答する」を押したら変更できない。最初・最後の文字が違う、辞書にない、などは無効で攻撃なし
- 回答時間がまったく同じなら同時攻撃
- 3問連続でどちらも攻撃できなければ引き分け
- ダメージは「文字数（最大20文字分）」と「速さ」で決まる。2〜3文字の即答は10〜12程度、8〜10文字で20〜24、15文字以上なら一撃35〜55の大ダメージ
- 8文字以上・12文字以上・16文字以上で、判定タイムに LONG WORD! / SUPER LONG! / 言霊炸裂!! が出る
- CPUは かんたん・ふつう・むずかしい の3段階
- 同じ言葉は何度使ってもよい
- 使える言葉：名詞（地名・有名人のフルネームなど固有名詞を含む）と、動詞・形容詞の基本形（「たべる」「うつくしい」）
- 濁点・半濁点は区別する（「て」と「で」は別）。末尾の「ー」は「ー」として扱う
- 長音は「ー」で入力する（「〜」や「-」を使った回答は無効）
- バトル開始（「スタート」）後に「やめる」・リロード・ブラウザを閉じるなどで離脱した場合は負け（次回起動時に1回だけ記録）。説明画面までの離脱は記録されない
- 成長要素はなし。完全な実力勝負
- CPU戦は練習モード。レーティングは変動しない（対人のランダムマッチは今後実装予定）

## 戦績

- CPU戦の勝ち・負け・引き分けと勝率（勝ち ÷ 全試合）を保存する
- 直近30試合の履歴（日時・難易度・勝敗・何問目で決着したか）を保存する
- CPU戦ではレーティングは変動しない
- 保存先はブラウザの localStorage（キー `kotodama.save`）。プライベートモードなど保存できない環境では、ページを閉じるまでしか残らない

詳しい仕様は [docs/SPEC.md](docs/SPEC.md)、開発計画は [docs/PLAN.md](docs/PLAN.md) を参照してください。

## 起動方法（ローカル）

ES Modules を使っているため、`index.html` を直接開くのではなくローカルサーバー経由で開きます。

```bash
python3 tools/serve.py
```

（`python3 -m http.server 8000` でも動きますが、ブラウザのキャッシュで編集が反映されないことがあります）

ブラウザで http://localhost:8000/ を開きます。

## テスト

ブラウザでローカルサーバー起動後に http://localhost:8000/tests/ を開くと、全テストが実行されます。

Node.js 14 以上があればコマンドでも実行できます。

```bash
node tests/run.js
```

## 構成

```
index.html
src/
  config.js      バランス調整用の定数
  core/          かな処理・出題・ダメージ・バトル進行
  dictionary/    単語判定（公式辞書・追加辞書）
  cpu/           CPUの定義と思考
  storage/       localStorage への保存
  ui/            各画面
  styles/        CSS
data/            辞書データ（official/ は生成物）
tools/           開発用サーバー・辞書生成スクリプト
licenses/        同梱データのライセンス
tests/           テスト
docs/            仕様書・開発計画
```

## 使用辞書

正誤判定には次の2つを使います。

- 公式辞書：[SudachiDict](https://github.com/WorksApplications/SudachiDict)（Works Applications、版 20260723、small + core）から生成（約26.4万語、`data/official/`）
- 追加辞書：公式辞書にない言葉をゲーム側で補うリスト（`data/extra-words.json`）

出題とCPUの回答には、別に用意した日常語のリスト（`data/prompt-pool.json`、1,025語）を使います。

公式辞書を作り直すとき：

```bash
python3 tools/build_dictionary.py --download
```

（元データ約37MBを `.cache/sudachi/` に取得してから `data/official/` を生成します。2回目以降は `--download` なしで可。`data/prompt-pool.json` を変えたときも再生成してください）

## ライセンス

- 公式辞書のデータ：SudachiDict（Apache License 2.0。UniDic・NEologd の一部を含む）。詳細は [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) と [licenses/sudachidict/](licenses/sudachidict/)。ゲーム内ではタイトル画面のクレジットから [licenses.html](licenses.html) を開けます
- ゲーム本体のコード：ライセンスは指定していません（All rights reserved）

## バランス調整

`python3 tools/serve.py` の起動中に http://localhost:8000/tools/sim/ を開くと、各難易度とプレイヤーモデルで対戦を自動で回して、勝率・平均問題数などを集計できます。

## 技術

HTML / CSS / JavaScript（ES Modules）のみ。ビルドツール・外部ライブラリ・サーバーは不要です。データはブラウザの localStorage に保存されます。
