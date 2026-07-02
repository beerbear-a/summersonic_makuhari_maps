/**
 * PixiJS によるドット絵描画。
 * レイヤー構成（下から）:
 *   1. タイルマップ（静的、起動時に1回だけテクスチャ化）
 *   2. ヒートマップ
 *   3. 観客スプライト（3x3ピクセルの点）
 *   4. 夜の暗転オーバーレイ + ステージ照明
 *   5. 施設ラベル・LIVE インジケーター
 */

import { Application, Container, Graphics, Sprite, Text } from 'pixi.js';
import { facilities, WORLD_WIDTH, WORLD_HEIGHT } from '../data/venues';
import type { Simulation } from '../simulation/Simulation';
import type { AgentState } from '../simulation/Agent';
import type { HeatmapRenderer } from './HeatmapRenderer';
import type { Player } from '../game/Player';
import {
  makePersonSet,
  HAIR_COLORS,
  PANTS_COLORS,
  SKIN_COLORS,
} from './CharacterSprites';
import type { PersonTextureSet, ViewKey } from './CharacterSprites';

/** 観客の状態ごとの色（キャラクターのシャツの色になる） */
const STATE_COLORS: Record<AgentState, number> = {
  watching: 0x4fc3f7, // 水色: ライブ鑑賞中
  moving: 0xf2f4f8, // 白: 移動中
  eating: 0xffb74d, // 橙: 食事中
  toilet: 0x9575cd, // 紫: トイレ
  shopping: 0xf06292, // 桃: 買い物中
  leaving: 0x9aa4ae, // 灰: 退場中
};

const STATE_ORDER: AgentState[] = [
  'watching',
  'moving',
  'eating',
  'toilet',
  'shopping',
  'leaving',
];
const STATE_INDEX = new Map(STATE_ORDER.map((s, i) => [s, i]));

/** ステージごとの照明色（夜間演出用） */
const STAGE_LIGHT: Record<string, number> = {
  marine_stage: 0x35b8c9,
  beach_stage: 0xd4af37,
  pacific_stage: 0xe4739e,
  spotify_stage: 0x1db954,
  sonic_stage: 0xe08a3c,
  mountain_stage: 0x69c25e,
};

/** 夜の暗転が始まる時刻と完全に暗くなる時刻（分） */
const DUSK_START = 1020; // 17:00
const DUSK_END = 1170; // 19:30
const NIGHT_ALPHA = 0.34;

export class Renderer {
  /** カメラ（ズーム・スクロール）対象のルートコンテナ */
  readonly world = new Container();
  private readonly agentSprites: Sprite[] = [];
  /** 観客の直前フレームの位置（向きの判定用） */
  private readonly prevX: Float32Array;
  private readonly prevY: Float32Array;
  /** 観客の現在の向き（0=front, 1=back, 2=side右, 3=side左） */
  private readonly agentView: Uint8Array;
  /** [状態][見た目バリエーション] → テクスチャセット */
  private readonly agentSets: PersonTextureSet[][] = [];
  private readonly liveChips = new Map<string, Container>();
  /** ズーム時に縮小して画面上のサイズを保つラベル一覧 */
  private readonly scaledChips: Container[] = [];
  private readonly nightOverlay = new Graphics();
  private readonly lightEffects = new Graphics();
  private readonly playerSprite: Sprite;
  private readonly playerSet: PersonTextureSet;
  private readonly playerRing = new Graphics();
  /** 話しかけ可能な相手の頭上に出す吹き出し */
  private readonly talkBubble: Container;
  private pulse = 0;

  constructor(
    app: Application,
    private readonly sim: Simulation,
    heatmap: HeatmapRenderer,
  ) {
    const mapLayer = new Container();
    const agentLayer = new Container();
    const labelLayer = new Container();

    // ---- タイルマップを1回だけ描いてテクスチャ化 ----
    const mapGraphics = new Graphics();
    sim.map.paint(mapGraphics);
    const mapTexture = app.renderer.generateTexture(mapGraphics);
    mapLayer.addChild(new Sprite(mapTexture));
    mapGraphics.destroy();

    // ---- 夜の暗転オーバーレイ ----
    this.nightOverlay
      .rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
      .fill(0x0a1030);
    this.nightOverlay.alpha = 0;

    this.world.addChild(mapLayer);
    this.world.addChild(heatmap.container);
    this.world.addChild(agentLayer);
    this.world.addChild(this.nightOverlay);
    this.world.addChild(this.lightEffects);
    this.world.addChild(labelLayer);
    app.stage.addChild(this.world);

    this.buildLabels(labelLayer);

    // ---- 観客キャラクターのテクスチャセットを事前生成 ----
    // シャツの色 = 状態色。髪・肌・ズボンは id ごとのバリエーション
    const variantCount = HAIR_COLORS.length;
    for (const state of STATE_ORDER) {
      const sets: PersonTextureSet[] = [];
      for (let v = 0; v < variantCount; v++) {
        sets.push(
          makePersonSet(app.renderer, {
            skin: SKIN_COLORS[v % SKIN_COLORS.length],
            hair: HAIR_COLORS[v],
            shirt: STATE_COLORS[state],
            pants: PANTS_COLORS[v % PANTS_COLORS.length],
          }),
        );
      }
      this.agentSets.push(sets);
    }

    this.prevX = new Float32Array(sim.agents.length);
    this.prevY = new Float32Array(sim.agents.length);
    this.agentView = new Uint8Array(sim.agents.length);
    for (const agent of sim.agents) {
      const sprite = new Sprite(this.agentSets[1][agent.id % variantCount].front[0]);
      sprite.anchor.set(0.5, 0.9);
      sprite.visible = false;
      sprite.roundPixels = true;
      sprite.position.set(agent.x, agent.y);
      this.prevX[agent.id] = agent.x;
      this.prevY[agent.id] = agent.y;
      agentLayer.addChild(sprite);
      this.agentSprites.push(sprite);
    }

    // ---- プレイヤー（赤キャップのトレーナー + 足元の点滅リング） ----
    this.playerRing.circle(0, 0, 6).stroke({ color: 0xffe066, width: 1.5 });
    this.world.addChild(this.playerRing);
    this.playerSet = makePersonSet(app.renderer, {
      skin: 0xf3c89b,
      hair: 0x2e2226,
      shirt: 0x1e5fbf,
      pants: 0x27334d,
      cap: true,
      capColor: 0xd32f2f,
    });
    this.playerSprite = new Sprite(this.playerSet.front[0]);
    this.playerSprite.anchor.set(0.5, 0.92);
    this.playerSprite.roundPixels = true;
    this.world.addChild(this.playerSprite);

    // ---- 話しかけ吹き出し（💬風のドット絵） ----
    this.talkBubble = new Container();
    const bubble = new Graphics();
    bubble.rect(0, 0, 11, 7).fill(0xffffff);
    bubble.rect(3, 7, 2, 2).fill(0xffffff); // しっぽ
    bubble.rect(2, 3, 1, 1).fill(0x1c1c24); // 「…」
    bubble.rect(5, 3, 1, 1).fill(0x1c1c24);
    bubble.rect(8, 3, 1, 1).fill(0x1c1c24);
    this.talkBubble.addChild(bubble);
    this.talkBubble.pivot.set(5, 9);
    this.talkBubble.visible = false;
    this.world.addChild(this.talkBubble);
    this.scaledChips.push(this.talkBubble);
  }

  /**
   * 毎フレーム: 観客・プレイヤー・LIVE 表示・夜間演出を同期する。
   * talkTarget は話しかけ可能な相手の位置（吹き出しを出す）。
   */
  update(
    dtSeconds: number,
    player: Player,
    talkTarget: { x: number; y: number } | null = null,
  ): void {
    this.pulse += dtSeconds * 5;

    const agents = this.sim.agents;
    const variantCount = HAIR_COLORS.length;
    const walkFrame = Math.floor(this.pulse * 1.6);
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      const s = this.agentSprites[i];
      if (!a.active || a.left) {
        s.visible = false;
        continue;
      }
      s.visible = true;
      s.position.set(a.x, a.y);

      // 移動方向（鑑賞中はステージの方向）から向きを決める
      let dx = a.x - this.prevX[i];
      let dy = a.y - this.prevY[i];
      const moved = Math.abs(dx) + Math.abs(dy) > 0.06;
      if (a.state === 'watching') {
        dx = a.targetX - a.x;
        dy = a.targetY - a.y;
      }
      if (moved || a.state === 'watching') {
        if (Math.abs(dx) > Math.abs(dy)) {
          this.agentView[i] = dx >= 0 ? 2 : 3; // side 右 / 左
        } else if (Math.abs(dy) > 0.01) {
          this.agentView[i] = dy < 0 ? 1 : 0; // back / front
        }
      }
      this.prevX[i] = a.x;
      this.prevY[i] = a.y;

      const set =
        this.agentSets[STATE_INDEX.get(a.state) ?? 1][a.id % variantCount];
      const view: ViewKey =
        this.agentView[i] === 1 ? 'back' : this.agentView[i] >= 2 ? 'side' : 'front';
      const frame = moved ? ((walkFrame + a.id) % 2) as 0 | 1 : 0;
      s.texture = set[view][frame];
      s.scale.x = this.agentView[i] === 3 ? -1 : 1;
    }

    // ---- ラベルはズームしても画面上で最大2倍までに抑える ----
    const zoom = this.world.scale.x;
    const chipScale = 1 / Math.max(1, zoom / 2);
    for (const chip of this.scaledChips) {
      if (chip.scale.x !== chipScale) chip.scale.set(chipScale);
    }

    // ---- プレイヤーの位置・4方向スプライト・歩行アニメーション ----
    const bob = player.moving ? Math.abs(Math.sin(player.walkPhase)) * 1 : 0;
    this.playerSprite.position.set(player.x, player.y - bob);
    const pView: ViewKey =
      player.dir === 'up' ? 'back' : player.dir === 'down' ? 'front' : 'side';
    const pFrame = player.moving
      ? ((Math.floor(player.walkPhase) % 2) as 0 | 1)
      : 0;
    this.playerSprite.texture = this.playerSet[pView][pFrame];
    this.playerSprite.scale.x = player.dir === 'left' ? -1 : 1;
    this.playerRing.position.set(player.x, player.y);
    this.playerRing.alpha = 0.45 + Math.sin(this.pulse) * 0.3;

    // ---- 話しかけ吹き出し ----
    this.talkBubble.visible = talkTarget !== null;
    if (talkTarget) {
      this.talkBubble.position.set(talkTarget.x, talkTarget.y - 10);
      this.talkBubble.alpha = 0.75 + Math.sin(this.pulse * 1.4) * 0.25;
    }

    // ---- LIVE チップの点滅 ----
    const liveStageIds = new Set(this.sim.currentActs.map((a) => a.stageId));
    for (const [stageId, chip] of this.liveChips) {
      const live = liveStageIds.has(stageId);
      chip.visible = live;
      if (live) chip.alpha = Math.sin(this.pulse) > -0.2 ? 1 : 0.25;
    }

    // ---- 夜の暗転 ----
    const t = this.sim.time;
    const duskT = Math.min(1, Math.max(0, (t - DUSK_START) / (DUSK_END - DUSK_START)));
    this.nightOverlay.alpha = duskT * NIGHT_ALPHA;

    // ---- 夜間はライブ中のステージから照明が伸びる ----
    this.lightEffects.clear();
    if (duskT > 0.25) {
      for (const act of this.sim.currentActs) {
        const stage = facilities.find((f) => f.id === act.stageId);
        if (!stage) continue;
        const color = STAGE_LIGHT[stage.id] ?? 0xffe066;
        // ステージ→客席方向へ広がる光の台形（横向きステージにも対応）
        const sx = stage.x;
        const sy = stage.y;
        let dx = (stage.audienceX ?? stage.x) - sx;
        let dy = (stage.audienceY ?? stage.y) - sy;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
        const px = -dy; // 進行方向に垂直な単位ベクトル
        const py = dx;
        const ax = sx + dx * (len + 30);
        const ay = sy + dy * (len + 30);
        const flicker = 0.1 + Math.abs(Math.sin(this.pulse * 0.7)) * 0.08;
        this.lightEffects
          .poly([
            sx + px * 26, sy + py * 26,
            sx - px * 26, sy - py * 26,
            ax - px * 52, ay - py * 52,
            ax + px * 52, ay + py * 52,
          ])
          .fill({ color, alpha: duskT * flicker });
      }
    }
  }

  // ------------------------------------------------------------------
  // ラベル
  // ------------------------------------------------------------------

  /** ラベルに使う短縮名 */
  private shortName(id: string, name: string): string {
    const table: Record<string, string> = {
      marine_stage: 'MARINE STAGE',
      beach_stage: 'BEACH STAGE',
      pacific_stage: 'PACIFIC',
      spotify_stage: 'Spotify',
      sonic_stage: 'SONIC',
      mountain_stage: 'MOUNTAIN',
      food_area: 'FOOD',
      toilet_messe: 'WC',
      toilet_stadium: 'WC',
      goods_area: 'GOODS',
      exit_station: 'KAIHIN-MAKUHARI STA.',
    };
    return table[id] ?? name;
  }

  private buildLabels(layer: Container): void {
    for (const f of facilities) {
      const chipText = this.shortName(f.id, f.name);
      const label = this.makeChip(chipText, 0xffffff, 0x14161c);
      label.position.set(f.x, f.type === 'stage' ? f.y - 14 : f.y - 12);
      layer.addChild(label);

      if (f.type === 'stage') {
        const live = this.makeChip('LIVE', 0xffffff, 0xcc1133);
        live.position.set(f.x, f.y - 26);
        live.visible = false;
        layer.addChild(live);
        this.liveChips.set(f.id, live);
      }
    }

    // 場所の説明ラベル
    const areaLabels: Array<[string, number, number]> = [
      ['ZOZO MARINE STADIUM', 392, 122],
      ['MAKUHARI MESSE', 250, 506],
      ['ENTRANCE', 396, 452],
      ['SUB ENT.', 112, 278],
    ];
    for (const [text, x, y] of areaLabels) {
      const chip = this.makeChip(text, 0xc9d1dc, 0x14161c);
      chip.position.set(x, y);
      layer.addChild(chip);
    }
  }

  /** ドット絵風のラベルチップ（黒背景 + 白文字） */
  private makeChip(text: string, color: number, bg: number): Container {
    const chip = new Container();
    this.scaledChips.push(chip);
    const label = new Text({
      text,
      style: {
        fontFamily: '"Courier New", monospace',
        fontSize: 9,
        fontWeight: 'bold',
        fill: color,
      },
      resolution: 4,
    });
    label.anchor.set(0.5);
    const pad = 3;
    const bgRect = new Graphics()
      .rect(
        -label.width / 2 - pad,
        -label.height / 2 - 1,
        label.width + pad * 2,
        label.height + 2,
      )
      .fill({ color: bg, alpha: 0.78 });
    chip.addChild(bgRect);
    chip.addChild(label);
    return chip;
  }
}
