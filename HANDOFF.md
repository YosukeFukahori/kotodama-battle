# HANDOFF（Ver.0.2 フレンド対戦の開発）

新しいセッションでは CLAUDE.md → docs/SPEC.md（特に §10）→ このファイルの順に読み、必要なファイルだけ確認する。

## 完了（手順1〜5。Firebase 接続はまだ）
- 1：MatchSession / CpuSession。バトル画面はセッションのイベントを表示するだけ（CPU戦の挙動は不変）
- 2：審判 `src/match/referee.js`（refereeRound・sanitizeAnswer）
- 3：戦績 cpu / friend / ranked。friend はレート変更なし。過去データは既定値で補完
- 4：通信なしのフレンド戦（LocalRoomStore ＋ FriendSession）
- 5：ロビー UI（部屋作成・6桁コード・参加・準備OK）、再読み込みからの自動復帰、2画面の操作テスト
- 未 push（最後の push は 04410bd まで。公開版に Ver.0.2 はまだ出ていない）

## 重要な設計判断
- セッションの取り決めとイベント一覧は `src/match/session.js` 冒頭が正本。イベントは常に「自分 = player、相手 = opponent」視点
- 戦績の記録はセッションの責任（画面は storage を触らない）。friend の途中離脱は負けにしない。中止は cancelMatch()（記録なし）
- 部屋データ rooms/{code}：meta / players / match / rounds/{n}（schedule・prompt・answers・result）。両者は host / guest で保存
- 時刻はホストが決めたサーバー時刻（schedule・revealAt・nextRoundAt）。各端末は serverNow との差で換算 → 片方の操作で相手の進行は変わらない
- ホストの裁定は「判定結果＋状態＋次ラウンド」を store.update で一括（途中状態を見せない）
- 切断：players/{side}/lastSeen を定期更新 → 途絶で接続待ち表示 → 20秒超で match.status=aborted（記録なし）。再読み込みは main.js の resumeFriendMatch で復帰
- 「やめる」はやめた側の負け（SPEC §10.4。ユーザー確認待ち）
- `?profile=xxx` で端末を分けられる（clientId・戦績キー・参加中の部屋）。2画面テスト用

## 主要ファイル
- `src/match/`：session.js・cpuSession.js・referee.js・friendRoom.js・friendSession.js・identity.js
- `src/net/roomStore.js`：RoomStore の取り決め、LocalRoomStore、getRoomStore()（Firebase 版に差し替える場所）
- `src/ui/`：battleScreen.js（表示のみ）・friendLobbyScreen.js・resultScreen.js（mode 別）・recordScreen.js
- `tests/friend.test.js`（部屋・同期・切断）、`tests/e2e/`（input / cpu / friend / rejoin）

## 次にやること（手順6以降）
- FirebaseRoomStore（RoomStore の取り決めを実装）：serverNow は `.info/serverTimeOffset`、update は RTDB の multi-path update、createIfAbsent は transaction、subscribe は onValue
- 匿名認証の uid を clientId に使う。アクセスルール（database.rules.json）を作り、コンソールに貼る（この Mac の Node は v8 で Firebase CLI 不可）
- 切断検知は lastSeen のままでよい（onDisconnect は補助）
- 実機2台で確認 → MOBILE_CHECKLIST にフレンド戦の項目を追加 → push・公開

## 注意点
- テストはブラウザで実行（`/tests/` ロジック 191件、`/tests/e2e/` 操作 45件・約2分）
- LocalRoomStore は同じブラウザ内だけ。公開版に出す前に Firebase 版へ差し替えるか、ロビーを隠すこと
- 部屋データの古いもの（kotodama.room:*）は自動削除しない（Firebase 版で要検討）
