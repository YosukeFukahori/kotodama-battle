# HANDOFF（Ver.0.2 フレンド対戦の開発）

新しいセッションでは CLAUDE.md → docs/SPEC.md（特に §10）→ このファイルの順に読み、必要なファイルだけ確認する。

## 完了（手順1〜5。Firebase 接続はまだ）
- 1：MatchSession / CpuSession。バトル画面はセッションのイベントを表示するだけ（CPU戦の挙動は不変）
- 2：審判 `src/match/referee.js`（refereeRound・sanitizeAnswer）
- 3：戦績 cpu / friend / ranked。friend はレート変更なし。過去データは既定値で補完
- 4：通信なしのフレンド戦（LocalRoomStore ＋ FriendSession）
- 5：ロビー UI（部屋作成・6桁コード・参加・準備OK）、再読み込みからの自動復帰、2画面の操作テスト
- 手順6（コード側）：Firebase 版 RoomStore・匿名認証・接続状態・アクセスルール・通信遅延テスト。Firebase の設定値（src/net/firebaseConfig.js）が未入力なので、今は通信なし版で動く
- 未 push（最後の push は 04410bd まで。公開版に Ver.0.2 はまだ出ていない）

## 重要な設計判断
- セッションの取り決めとイベント一覧は `src/match/session.js` 冒頭が正本。イベントは常に「自分 = player、相手 = opponent」視点
- 戦績の記録はセッションの責任（画面は storage を触らない）。friend の途中離脱は負けにしない。中止は cancelMatch()（記録なし）
- 部屋データ rooms/{code}：meta / players / match / rounds/{n}（schedule・prompt・answers・result）。両者は host / guest で保存
- 時刻はホストが決めたサーバー時刻（schedule・revealAt・nextRoundAt）。各端末は serverNow との差で換算 → 片方の操作で相手の進行は変わらない
- ホストの裁定は「判定結果＋状態＋次ラウンド」を store.update で一括（途中状態を見せない）
- 切断：players/{side}/lastSeen を定期更新 → 途絶で接続待ち表示 → 20秒超で match.status=aborted（記録なし）。再読み込みは main.js の resumeFriendMatch で復帰
- 「やめる」はやめた側の負け（確定）。切断20秒超の中止は記録なし（確定）
- `?profile=xxx` で端末を分けられる（clientId・戦績キー・参加中の部屋）。2画面テスト用

## 主要ファイル
- `src/match/`：session.js・cpuSession.js・referee.js・friendRoom.js・friendSession.js・identity.js
- `src/net/`：roomStore.js（取り決め・LocalRoomStore・loadRoomStore()）、firebase.js（SDK 12.19.0 読み込み・匿名ログイン）、firebaseRoomStore.js、delayedRoomStore.js（?latency= テスト用）、firebaseConfig.js（設定値）
- `database.rules.json`（アクセスルール。コンソールに貼る）
- `src/ui/`：battleScreen.js（表示のみ）・friendLobbyScreen.js・resultScreen.js（mode 別）・recordScreen.js
- `tests/friend.test.js`（部屋・同期・切断）、`tests/e2e/`（input / cpu / friend / rejoin）

## 次にやること
- ユーザーが Firebase コンソールで：プロジェクト作成 → Web アプリ登録 → 匿名認証を有効化 → Realtime Database 作成（asia-southeast1）→ database.rules.json を貼る → 設定値を受け取って src/net/firebaseConfig.js に書く
- Firebase 接続で e2e（friend / rejoin / abort）を実行（?store= を付けなければ Firebase を使う。?latencyHost=&latencyGuest= で遅延も足せる）
- 実機2台で確認 → MOBILE_CHECKLIST にフレンド戦の項目を追加 → push・公開

## 注意点
- テストはブラウザで実行（`/tests/` ロジック 193件、`/tests/e2e/` 操作：input / cpu / friend / rejoin / abort。全部で約3分）
- e2e の iframe は ?profile= ごとに別の Firebase アプリ名で初期化される → 別の匿名ユーザーになる
- 設定値が null のままだとロビーは通信なし版（注意書きが出る）。公開前に設定値を入れて Firebase で確認すること
- 部屋データの古いもの（kotodama.room:*）は自動削除しない（Firebase 版で要検討）
