# HANDOFF（Ver.0.2 フレンド対戦の開発）

新しいセッションでは CLAUDE.md → docs/SPEC.md（特に §10）→ このファイルの順に読み、必要なファイルだけ確認する。

## 完了（手順1〜5。Firebase 接続はまだ）
- 1：MatchSession / CpuSession。バトル画面はセッションのイベントを表示するだけ（CPU戦の挙動は不変）
- 2：審判 `src/match/referee.js`（refereeRound・sanitizeAnswer）
- 3：戦績 cpu / friend / ranked。friend はレート変更なし。過去データは既定値で補完
- 4：通信なしのフレンド戦（LocalRoomStore ＋ FriendSession）
- 5：ロビー UI（部屋作成・6桁コード・参加・準備OK）、再読み込みからの自動復帰、2画面の操作テスト
- 手順6：Firebase 接続完了（プロジェクト kotodama-battle、RTDB asia-southeast1、匿名認証、ルール公開済み）。設定値は src/net/firebaseConfig.js。本物の Firebase で e2e（friend / rejoin / abort / 遅延あり）と実ルールテスト（tests/live/、35件）が通過
- 手順7：Ver.0.2 公開（README・MOBILE_CHECKLIST をフレンド戦に合わせて更新、全テスト通過後に main へ push → GitHub Pages に公開）

## 重要な設計判断
- セッションの取り決めとイベント一覧は `src/match/session.js` 冒頭が正本。イベントは常に「自分 = player、相手 = opponent」視点
- 戦績の記録はセッションの責任（画面は storage を触らない）。friend の途中離脱は負けにしない。中止は cancelMatch()（記録なし）
- 部屋データ rooms/{code}：meta / players / match / rounds/{n}（schedule・prompt・answers・result）。両者は host / guest で保存
- 時刻はホストが決めたサーバー時刻（schedule・revealAt・nextRoundAt）。各端末は serverNow との差で換算 → 片方の操作で相手の進行は変わらない
- ホストの裁定は「判定結果＋状態＋次ラウンド」を store.update で一括（途中状態を見せない）。ラウンドは roundFields() で schedule / prompt を別パスに書く（ルールの都合。rounds/{n} 丸ごとは書けない）
- 切断：players/{side}/lastSeen を定期更新 → 途絶で接続待ち表示 → 20秒超で match.status=aborted（記録なし）。再読み込みは main.js の resumeFriendMatch で復帰
- 「やめる」はやめた側の負け（確定）。切断20秒超の中止は記録なし（確定）
- 試合状態・勝敗の確定（match.* / meta.status）はホストだけ。ゲストの「やめる」は signals/forfeit/guest を書く → ホストが確定（ホストが応答しなければ config.friend.forfeitConfirmWaitMs 後にゲスト端末だけで負けとして終える）。中止もホストだけが書き、ホスト不在時はゲスト端末の中だけで中止
- `?profile=xxx` で端末を分けられる（clientId・戦績キー・参加中の部屋）。2画面テスト用

## 主要ファイル
- `src/match/`：session.js・cpuSession.js・referee.js・friendRoom.js・friendSession.js・identity.js
- `src/net/`：roomStore.js（取り決め・LocalRoomStore・loadRoomStore()）、firebase.js（SDK 12.19.0 読み込み・匿名ログイン）、firebaseRoomStore.js、delayedRoomStore.js（?latency= テスト用）、firebaseConfig.js（設定値）
- `database.rules.json`（アクセスルール。コンソールに貼る）。rounds/{n} には親の .write を置かず、schedule / prompt / result はホスト、answers/{side} は本人だけ。ゲストが書けるのは自分の players・answers・signals/forfeit/guest だけ
- `tests/rulesEval.js`（ルールの簡易評価器。公式エミュレーターの代わり）・`tests/rules.test.js`
- `src/ui/`：battleScreen.js（表示のみ）・friendLobbyScreen.js・resultScreen.js（mode 別）・recordScreen.js
- `tests/friend.test.js`（部屋・同期・切断）、`tests/e2e/`（input / cpu / friend / rejoin）

## 次にやること
- 実機2台（別回線）でフレンド戦を確認（docs/MOBILE_CHECKLIST.md の F1〜F20）
- 以降の push はユーザーの指示を待つ

## 注意点
- テストはブラウザで実行（`/tests/` ロジック 214件、`/tests/e2e/` 操作：input / cpu / friend / rejoin / abort。全部で約3分）
- e2e の iframe は ?profile= ごとに別の Firebase アプリ名で初期化される → 別の匿名ユーザーになる
- e2e は ?store= を付けなければ本物の Firebase を使う（?store=local で通信なし版）。?latencyHost=&latencyGuest= で遅延を足せる
- 実ルールテストは /tests/live/（3人の匿名ユーザー＋未ログイン。テスト用の部屋は25秒で期限切れにして最後に削除）
- ルールを変えたら tests/rules.test.js（評価器）と /tests/live/（本物）の両方を実行し、コンソールへの公開はユーザーが行う
- e2e で作った部屋は RTDB に残る（30分で期限切れ。自動削除はしない）
- 開発機の時計はサーバーより約2.1秒ずれていたが、serverTimeOffset で補正され同期に影響なし
- 部屋データの古いもの（kotodama.room:*）は自動削除しない（Firebase 版で要検討）
