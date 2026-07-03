# 05. 技術仕様 — アーキテクチャ・データスキーマ・実装規約

## 1. 現状アーキテクチャ（v1・変更禁止の土台）

```
src/
├── main.ts                  # ループ/カメラ/入力/UI接続（v2で分割対象）
├── game/ Player, Dialogue, Achievements, Sound
├── map/ TileMap（32pxタイル84×140・歩行判定・地形コスト・装飾描画）
├── simulation/ Agent, Simulation, FlowField, CrowdGrid, Timetable
├── rendering/ Renderer, CharacterSprites, HeatmapRenderer
└── data/ venues, timetable, decorations
```

### 触ってはいけない不変条件（過去の事故から学ぶこと）
1. **座標は常に WORLD_SCALE(=4) 込みのワールドpx**。論理レイアウト(672×1120)の値を直接使わない
   （実際にスタジアムが消えるバグが起きた。座標定数を書くときは必ず `* WORLD_SCALE` か `t()` ヘルパー経由）
2. FlowField はタイルグリッド(84×140)上の重み付きDijkstra。**マップに歩行可能タイルを足したら
   全フィールド再計算が必要**（起動時のみ計算する設計を維持）
3. CrowdGrid の混雑レベル閾値(3/7/13人/96pxセル)はゲームバランスの根。変更時は必ず通しテスト
4. エージェント800体・毎フレーム更新は維持できているが、**O(N)を超える処理をフレーム内に足さない**
   （近傍探索が必要になったら空間ハッシュを先に入れる）

## 2. v2 新規モジュール構成

```
src/
├── main.ts                    # 【改修】起動とモード遷移だけに縮小
├── game/
│   ├── GameState.ts          # ★中枢: モード/フラグ/時計/所持金/メモリー。全システムの読み書き窓口
│   ├── Player.ts             # 【改修】hydration追加・inventory参照
│   ├── Inventory.ts          # ★8スロット・アイテム効果適用
│   ├── QuestSystem.ts        # ★クエスト状態機械
│   ├── EventDirector.ts      # ★天候/アンコール等のスケジュール&抽選
│   ├── DialogueEngine.ts     # ★（Dialogue.ts改め）ツリー/条件/選択肢/フラグ書込
│   ├── CutsceneDirector.ts   # ★カメラキーフレーム/演出キュー
│   ├── SaveSystem.ts         # ★localStorage セーブ/ロード
│   ├── Achievements.ts       # 【拡張】24種
│   └── audio/
│       ├── Sound.ts          # 【現行】単発SFX
│       └── ChipTracker.ts    # ★4chシーケンサー（→04章）
├── simulation/ …             # 【原則無改修】Persona制御のみ追加
│   └── PersonaController.ts  # ★名前つきNPC12体をAgentに「憑依」させる層
├── rendering/
│   ├── Renderer.ts           # 【拡張】感情バブル/ペンライト/顔チップ連携
│   ├── WeatherLayer.ts       # ★雨・虹・花火パーティクル
│   └── …
├── ui/
│   ├── PhoneMenu.ts          # ★スマホメニュー（DOM実装でよい）
│   ├── DialogueWindow.ts     # main.tsから抽出+選択肢/顔チップ
│   ├── Hud.ts                # main.tsから抽出+バンドLED/ティッカー
│   └── TitleScreen.ts        # ★
└── data/
    ├── items.ts / quests.ts / personas.ts / events.ts / memories.ts  # ★
    ├── dialogue/ mobs.ts, personas/*.ts, quests/*.ts, system.ts      # ★約1,000行
    └── music/ tracks.ts                                              # ★譜面データ
```

## 3. 中核データスキーマ（このまま実装してよい）

```ts
// ---- GameState ----
interface GameState {
  mode: 'title' | 'prologue' | 'story' | 'staff' | 'freeroam' | 'ending';
  playerName: string;
  favoriteFood: string;           // プロローグで入力、屋台のセリフに差し込む
  money: number;                  // 円
  memories: Set<MemoryId>;        // 'm1'..'m8'
  flags: Map<string, number>;     // クエスト/イベント/会話フラグ（数値で段階も持てる）
  clockPaused: boolean;           // 会話・メニュー・カットシーン中true
  ngPlus: boolean;
}

// ---- アイテム ----
interface ItemDef {
  id: string; name: string; flavor: string; price: number | null; // nullは非売品
  effect?: (p: Player, gs: GameState) => void;
  equip?: 'towel' | 'tshirt' | 'poncho';   // 装備スロット（見た目差分あり）
}

// ---- クエスト ----
interface QuestDef {
  id: string; title: string;
  steps: QuestStep[];             // 順番に進む状態機械
  reward?: { money?: number; itemId?: string; memoryId?: MemoryId };
}
interface QuestStep {
  memo: string;                                   // 「やること」タブに出る文
  trigger:                                        // 進行条件（どれか1つ）
    | { type: 'talk'; personaId: string; dialogueId: string }
    | { type: 'reach'; x: number; y: number; radius: number }
    | { type: 'item'; give: string; to: string }
    | { type: 'time'; at: number }                // 分
    | { type: 'flag'; key: string; gte: number };
  onComplete?: (gs: GameState) => void;           // フラグ書込等
}

// ---- ペルソナ（名前つきNPC）----
interface PersonaDef {
  id: string; name: string; faceChip: number;     // 顔アイコンindex
  sprite: { hair: number; shirt: number; cap?: boolean };  // 専用配色
  schedule: Array<{ from: number; to: number; x: number; y: number }>; // 分単位の所在
  dialogue: DialogueNodeId;                        // 入口ノード
}
// 実装: PersonaControllerが毎フレーム、担当Agent(id 0-11を予約)に
// schedule上の目的地をFlowField経由で歩かせる。汎用Agentのdecide()は無効化

// ---- 会話ツリー ----
interface DialogueNode {
  id: string;
  text: string | ((gs: GameState, p: Player) => string);
  cond?: (gs: GameState) => boolean;              // 出現条件（時間帯/フラグ）
  choices?: Array<{ label: string; next: string; setFlag?: [string, number] }>;
  next?: string;                                   // 選択肢なしの続き
  onShow?: (gs: GameState) => void;               // 金銭授受・アイテム等の副作用
}
// モブは現行のプール方式を維持し、名前つきNPC/クエストのみツリーを使う（複雑化しすぎない）

// ---- イベント ----
interface EventDef {
  id: string;
  window: [number, number];        // 発生可能時間帯（分）
  chance: number;                  // 毎分抽選 or 1で確定
  duration: number;
  onStart/onTick/onEnd: (world) => void;   // 群衆への介入はここに集約
}

// ---- セーブ（localStorage key: 'memoryband_save_v1'）----
interface SaveData {
  version: 1;
  gameState: {...GameStateの直列化};
  player: { x; y; needs; inventory; equips };
  simTime: number;
  questStates: Record<string, number>;   // questId -> step index
  album: string[];                        // 撮影済み写真id
  // 注: 群衆800体の個体状態は保存しない。ロード時は時刻から再シミュレート
  //     （タイテ準拠で観客分布は自然に復元される。厳密再現より軽さを取る）
}
```

## 4. 群衆シムへのイベント介入API

EventDirectorがSimulationに触れるのは以下の3メソッドだけに限定する（結合を薄く保つ）:

```ts
Simulation.overrideWeather(w: 'sunny'|'rain'): void
  // rain中: 屋外タイルの地形コスト+20、全Agentに「屋根フィールドへ向かう」一時目標を注入
Simulation.extendAct(actId: string, minutes: number): void   // アンコール
Simulation.injectAct(act: Act): void                          // シークレットゲスト
```

## 5. パフォーマンス予算

| 項目 | 予算 |
| --- | --- |
| フレーム | 60fps目標 / 実測30fps下限（SwiftShader計測は参考値） |
| Agent更新 | 800体 O(N)厳守。Persona12体の追加コストは無視できる量 |
| 雨パーティクル | 最大400粒（画面内のみ生成・プール再利用） |
| ペンライト発光 | スタジアム内の観客のみ（最大~450）。Graphics1本にrect描画でまとめる |
| ChipTracker | オシレータ同時8本まで（4ch×2音） |
| セーブ容量 | 50KB以下 |

## 6. 実装規約

- 既存コードのコメント密度・日本語コメント文化を踏襲する
- 新規の座標定数は必ず `WORLD_SCALE` を掛けるか、`t()`（タイル→px）ヘルパーを使う
- 乱数で挙動が変わる箇所（イベント抽選）はseed注入可能にしてテスト再現性を確保
- DOM UI（メニュー/会話）とPixi描画の責務境界を守る: **ワールド内の物はPixi、覆い被さる物はDOM**
- `npm run build`（tsc + vite）が常にグリーンであること

## 7. 検証計画（Playwright・実装モデルへの必須指示）

各マイルストーン完了時に headless Chromium で以下の通しシナリオを自動実行し、
スクリーンショットとconsoleエラー0件を確認する（現行の check*.mjs 方式を踏襲）:

1. **セーブ/ロード**: プロローグ→開場→LINEセーブ→リロード→位置/時刻/所持品の一致
2. **クエスト最短経路**: 「はじめてのおつかい」をキー操作のみで完了→報酬/フラグ確認
3. **豪雨イベント**: seed固定で豪雨を発生させ、群衆が屋根へ向かうことをヒートマップで確認
4. **メモリー両取り**: 19:00優里→19:30スタジアム走り込みが実際に間に合うこと（バランスの生命線）
5. **エンディング分岐**: メモリー8/8+ミライ⑤でトゥルー、7以下で通常、途中退場で退場エンド
6. **一日通し**: 8倍速相当のデバッグ機能で開場→終演→リザルトまでエラーなし
