/**
 * PixiJS によるドット絵描画。
 * レイヤー構成（下から）:
 *   1. タイルマップ（静的、起動時に1回だけテクスチャ化）
 *   2. ヒートマップ
 *   3. 観客スプライト（3x3ピクセルの点）
 *   4. 夜の暗転オーバーレイ + ステージ照明
 *   5. 施設ラベル・LIVE インジケーター
 */

import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
} from 'pixi.js';
import { facilities, WORLD_WIDTH, WORLD_HEIGHT } from '../data/venues';
import type { Simulation } from '../simulation/Simulation';
import type { AgentState } from '../simulation/Agent';
import type { HeatmapRenderer } from './HeatmapRenderer';
import type { Player } from '../game/Player';

/** 観客の状態ごとの色 */
const STATE_COLORS: Record<AgentState, number> = {
  watching: 0x4fc3f7, // 水色: ライブ鑑賞中
  moving: 0xf2f4f8, // 白: 移動中
  eating: 0xffb74d, // 橙: 食事中
  toilet: 0x9575cd, // 紫: トイレ
  shopping: 0xf06292, // 桃: 買い物中
  leaving: 0x9aa4ae, // 灰: 退場中
};

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
  private readonly liveChips = new Map<string, Container>();
  private readonly nightOverlay = new Graphics();
  private readonly lightEffects = new Graphics();
  private readonly playerSprite: Sprite;
  private readonly playerRing = new Graphics();
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

    // ---- 観客スプライト: 3x3ピクセルの点テクスチャを使い回す ----
    const dot = new Graphics().rect(0, 0, 3, 3).fill(0xffffff);
    const texture: Texture = app.renderer.generateTexture(dot);
    dot.destroy();
    for (const agent of sim.agents) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.visible = false;
      sprite.roundPixels = true;
      sprite.position.set(agent.x, agent.y);
      agentLayer.addChild(sprite);
      this.agentSprites.push(sprite);
    }

    // ---- プレイヤー（ドット絵トレーナー + 足元の点滅リング） ----
    this.playerRing.circle(0, 0, 6).stroke({ color: 0xffe066, width: 1.5 });
    this.world.addChild(this.playerRing);
    const trainer = new Graphics();
    trainer.rect(1, 0, 4, 2).fill(0xd32f2f); // 帽子
    trainer.rect(0, 1, 6, 1).fill(0xb02525); // 帽子のつば
    trainer.rect(1, 2, 4, 2).fill(0xf3c89b); // 顔
    trainer.rect(1, 3, 1, 1).fill(0x222222); // 目
    trainer.rect(4, 3, 1, 1).fill(0x222222);
    trainer.rect(0, 4, 6, 3).fill(0x1e5fbf); // シャツ
    trainer.rect(1, 7, 2, 2).fill(0x27334d); // ズボン
    trainer.rect(3, 7, 2, 2).fill(0x27334d);
    trainer.rect(1, 9, 2, 1).fill(0x111111); // 靴
    trainer.rect(3, 9, 2, 1).fill(0x111111);
    const trainerTexture = app.renderer.generateTexture(trainer);
    trainer.destroy();
    this.playerSprite = new Sprite(trainerTexture);
    this.playerSprite.anchor.set(0.5, 0.92);
    this.playerSprite.roundPixels = true;
    this.world.addChild(this.playerSprite);
  }

  /** 毎フレーム: 観客・プレイヤー・LIVE 表示・夜間演出を同期する */
  update(dtSeconds: number, player: Player): void {
    this.pulse += dtSeconds * 5;

    const agents = this.sim.agents;
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      const s = this.agentSprites[i];
      if (!a.active || a.left) {
        s.visible = false;
        continue;
      }
      s.visible = true;
      s.position.set(a.x, a.y);
      s.tint = STATE_COLORS[a.state];
    }

    // ---- プレイヤーの位置・歩行アニメーション ----
    const bob = player.moving ? Math.abs(Math.sin(player.walkPhase)) * 1.5 : 0;
    this.playerSprite.position.set(player.x, player.y - bob);
    this.playerSprite.scale.x = player.facing;
    this.playerRing.position.set(player.x, player.y);
    this.playerRing.alpha = 0.45 + Math.sin(this.pulse) * 0.3;

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
    const label = new Text({
      text,
      style: {
        fontFamily: '"Courier New", monospace',
        fontSize: 9,
        fontWeight: 'bold',
        fill: color,
      },
      resolution: 2,
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
