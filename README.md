# 言霊バトル

「あ」から始まり「で」で終わる言葉は？——
お題に合う言葉を、**長く・速く**答えて相手のHPを削る、日本語の言葉バトルゲームです。

仲間内で遊ぶための試作版（Ver.0.2）。ブラウザだけで動き、スマホでも遊べます。CPU戦と、6桁の部屋コードで遊ぶフレンド対戦があります。

**▶ 遊ぶ：https://yosukefukahori.github.io/kotodama-battle/**

スマホで遊んで気づいたことは [docs/MOBILE_CHECKLIST.md](docs/MOBILE_CHECKLIST.md) の項目を参考に教えてください。

## 遊び方

1. タイトルで「バトル」を選び、CPUの難易度を選ぶ（フレンド対戦は下の「フレンド対戦」を参照）
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
- CPU戦：バトル開始（「スタート」）後に「やめる」・リロード・ブラウザを閉じるなどで離脱した場合は負け（次回起動時に1回だけ記録）。説明画面までの離脱は記録されない
- 成長要素はなし。完全な実力勝負
- CPU戦は練習モード。レーティングは変動しない（対人のランダムマッチは今後実装予定）

## フレンド対戦（Ver.0.2）

友だちと2人で、別々のスマホ・PCから対戦できます。ルール（お題・判定・ダメージ・HP・演出・3秒固定の自動進行）は CPU 戦と同じです。

1. タイトルで「フレンド対戦」を選び、名前を入れる（空欄なら自動の名前）
2. 片方が「部屋を作る」を押すと6桁の部屋コードが出る。もう片方はそのコードを入力して参加する
3. 2人とも「準備OK」を押すと対戦が始まる。ROUND / READY / FIGHT! は2台で同じ時刻に表示される

- 部屋コードは6桁の数字。有効期限は作成から30分。1部屋2人まで
- 通信は Firebase Realtime Database。ログインは不要（Firebase の匿名認証を自動で使う。再読み込みしても同じ立場で戻れる）
- 審判役（判定・ダメージ・HP・勝敗の確定）は部屋を作った側（ホスト）の端末が行う
- 再読み込みなどで接続が切れたら、相手に「接続待ち」が出る。20秒以内に戻れば続きから再開、戻らなければ試合中止（勝敗は記録しない）
- 「やめる」を押した側の負け（相手の勝ち）として記録する
- フレンド戦の戦績はCPU戦とは別に記録する。レーティングは変動しない
- Firebase の読み込みはフレンド対戦を開いたときだけ。CPU戦だけなら通信はしない
- 仲間内で遊ぶ前提の試作のため、完全な不正対策はしていない（回答時間は各端末の申告、ホストが審判など）

## 戦績

- CPU戦とフレンド戦で分けて、勝ち・負け・引き分けと勝率（勝ち ÷ 全試合）を保存する
- 直近30試合の履歴（日時・相手・勝敗・何問目で決着したか）を保存する
- CPU戦・フレンド戦ではレーティングは変動しない
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

操作テスト（実際のアプリを動かして、FIGHT! 前後の入力の制御などを確認）は http://localhost:8000/tests/e2e/ を開くと実行されます。
`?only=input|cpu|friend|rejoin|abort` で絞り込み、`&store=local` で Firebase を使わずブラウザ内だけで、`&latencyHost=150&latencyGuest=400` で通信遅延を足して試せます。

本物の Firebase でアクセスルールを確かめるテストは http://localhost:8000/tests/live/ です（テスト用の部屋を作り、最後に削除します）。

Node.js 14 以上があれば、ロジックのテストはコマンドでも実行できます。

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
  match/         対戦の進行（CPU戦・フレンド戦の共通審判と部屋）
  net/           通信（Firebase / ブラウザ内の部屋データ）
  storage/       localStorage への保存
  ui/            各画面
  styles/        CSS
data/            辞書データ（official/ は生成物）
tools/           開発用サーバー・辞書生成スクリプト
licenses/        同梱データのライセンス
tests/           テスト
docs/            仕様書・開発計画
database.rules.json  Firebase Realtime Database のアクセスルール
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

HTML / CSS / JavaScript（ES Modules）のみ。ビルドツールは不要です。戦績はブラウザの localStorage に保存されます。

外部ライブラリは、フレンド対戦でのみ Firebase JS SDK（Anonymous Authentication ＋ Realtime Database、リージョン asia-southeast1）を gstatic から読み込みます。設定値は `src/net/firebaseConfig.js`（ブラウザに公開される前提の値で、データは `database.rules.json` のアクセスルールで守ります）。
