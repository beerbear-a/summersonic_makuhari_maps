/**
 * PixiJS による会場と観客の描画。
 * レイヤー構成（下から）:
 *   1. 床・施設ゾーン（静的）
 *   2. ヒートマップ
 *   3. 観客スプライト
 *   4. 施設ラベル・LIVE インジケーター
 */

import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
} from 'pixi.js';
import type { Facility } from '../data/venues';
import { facilities, WORLD_WIDTH, WORLD_HEIGHT } from '../data/venues';
import type { Simulation } from '../simulation/Simulation';
import type { AgentState } from '../simulation/Agent';
import type { HeatmapRenderer } from './HeatmapRenderer';

/** 観客の状態ごとの色 */
const STATE_COLORS: Record<AgentState, number> = {
  watching: 0x4fc3f7, // 水色: ライブ鑑賞中
  moving: 0xeceff1, // 白: 移動中
  eating: 0xffb74d, // 橙: 食事中
  toilet: 0x9575cd, // 紫: トイレ
  shopping: 0xf06292, // 桃: 買い物中
  leaving: 0x90a4ae, // 灰: 退場中
};

const FACILITY_COLORS: Record<Facility['type'], number> = {
  stage: 0x1e88e5,
  food: 0xef6c00,
  toilet: 0x5e35b1,
  goods: 0xd81b60,
  exit: 0x43a047,
};

export class Renderer {
  private readonly agentSprites: Sprite[] = [];
  private readonly liveRings = new Map<string, Graphics>();
  private pulse = 0;

  constructor(
    app: Application,
    private readonly sim: Simulation,
    heatmap: HeatmapRenderer,
  ) {
    const floorLayer = new Container();
    const agentLayer = new Container();
    const labelLayer = new Container();

    this.drawFloor(floorLayer);
    this.drawFacilities(floorLayer, labelLayer);

    app.stage.addChild(floorLayer);
    app.stage.addChild(heatmap.container);
    app.stage.addChild(agentLayer);
    app.stage.addChild(labelLayer);

    // 観客スプライト: 円テクスチャを1枚生成して使い回す（高速）
    const circle = new Graphics().circle(0, 0, 3).fill(0xffffff);
    const texture: Texture = app.renderer.generateTexture(circle);
    for (const agent of sim.agents) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.visible = false;
      sprite.position.set(agent.x, agent.y);
      agentLayer.addChild(sprite);
      this.agentSprites.push(sprite);
    }
  }

  /** 毎フレーム: 観客位置・色と LIVE 表示を同期する */
  update(dtSeconds: number): void {
    this.pulse += dtSeconds * 4;

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

    // 演奏中のステージのリングを点滅させる
    const liveStageIds = new Set(this.sim.currentActs.map((a) => a.stageId));
    for (const [stageId, ring] of this.liveRings) {
      const live = liveStageIds.has(stageId);
      ring.visible = live;
      if (live) ring.alpha = 0.55 + Math.sin(this.pulse) * 0.35;
    }
  }

  // ------------------------------------------------------------------
  // 静的な会場描画
  // ------------------------------------------------------------------

  private drawFloor(layer: Container): void {
    const g = new Graphics();
    // 会場全体の床
    g.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT).fill(0x14161c);
    // 上段: ホール床（ステージエリア）
    g.roundRect(30, 30, WORLD_WIDTH - 60, 260, 14).fill(0x1b1f2a);
    // 中段: コンコース
    g.roundRect(30, 330, WORLD_WIDTH - 60, 280, 14).fill(0x181b23);
    // 下段: エントランス広場
    g.roundRect(30, 650, WORLD_WIDTH - 60, 130, 14).fill(0x161a20);
    // 通路のガイドライン
    g.rect(0, 300, WORLD_WIDTH, 6).fill(0x232833);
    g.rect(0, 622, WORLD_WIDTH, 6).fill(0x232833);
    layer.addChild(g);
  }

  private drawFacilities(floorLayer: Container, labelLayer: Container): void {
    for (const f of facilities) {
      const color = FACILITY_COLORS[f.type];
      const zone = new Graphics();
      zone
        .roundRect(f.x - f.width / 2, f.y - f.height / 2, f.width, f.height, 10)
        .fill({ color, alpha: 0.22 })
        .stroke({ color, width: 2, alpha: 0.85 });
      floorLayer.addChild(zone);

      // ステージには「ステージ台」を描く
      if (f.type === 'stage') {
        const deck = new Graphics();
        deck
          .roundRect(f.x - f.width / 2 + 14, f.y - f.height / 2 + 10, f.width - 28, 26, 6)
          .fill({ color, alpha: 0.75 });
        floorLayer.addChild(deck);

        // LIVE 中の点滅リング
        const ring = new Graphics();
        ring
          .roundRect(
            f.x - f.width / 2 - 8,
            f.y - f.height / 2 - 8,
            f.width + 16,
            f.height + 16,
            14,
          )
          .stroke({ color: 0xffeb3b, width: 3 });
        ring.visible = false;
        labelLayer.addChild(ring);
        this.liveRings.set(f.id, ring);
      }

      const label = new Text({
        text: f.name,
        style: {
          fontFamily: 'Arial, sans-serif',
          fontSize: 15,
          fontWeight: 'bold',
          fill: 0xffffff,
          stroke: { color: 0x000000, width: 3 },
        },
      });
      label.anchor.set(0.5);
      label.position.set(f.x, f.type === 'stage' ? f.y - f.height / 2 - 16 : f.y);
      labelLayer.addChild(label);
    }
  }
}
