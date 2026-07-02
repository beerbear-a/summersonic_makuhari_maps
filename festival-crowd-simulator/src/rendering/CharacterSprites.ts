/**
 * ドット絵キャラクターのテクスチャ生成。
 * 8x12ピクセルの「頭でっかちチビキャラ」を「前向き / 後ろ向き / 横向き」×
 * 「歩行2フレーム」で描き、起動時に一度だけテクスチャ化して全スプライトで使い回す。
 * 大きめの頭・丸い目・チーク（ほっぺ）で、レトロなドット絵ゲーム風の可愛さを出す。
 * 観客はシャツの色が状態（鑑賞中・食事中など）を表す。
 */

import { Graphics, Rectangle, Renderer, Texture } from 'pixi.js';

export interface PersonPalette {
  skin: number;
  hair: number;
  shirt: number;
  pants: number;
  /** true なら帽子（プレイヤー用の赤キャップなど）を被る */
  cap?: boolean;
  capColor?: number;
}

export type ViewKey = 'front' | 'back' | 'side';

/** 向きごとの歩行フレーム（[静止/歩行A, 歩行B]） */
export type PersonTextureSet = Record<ViewKey, [Texture, Texture]>;

export const FRAME_W = 8;
export const FRAME_H = 12;
const FRAME = new Rectangle(0, 0, FRAME_W, FRAME_H);
const EYE = 0x1c1c24;
const BLUSH = 0xff9aa8;
const SHOE = 0x14141a;

function capBrim(color: number): number {
  return darken(color);
}

function drawPerson(
  g: Graphics,
  p: PersonPalette,
  view: ViewKey,
  frame: 0 | 1,
): void {
  const hairColor = p.cap ? (p.capColor ?? 0xd32f2f) : p.hair;

  if (view === 'front') {
    // ---- 頭（丸く大きめ、6頭身ならぬ「2頭身」チビ比率） ----
    g.rect(1, 0, 6, 1).fill(hairColor); // 髪の頭頂
    g.rect(0, 1, 8, 2).fill(hairColor); // 前髪（顔全体を覆う丸み）
    if (p.cap) g.rect(0, 1, 8, 1).fill(capBrim(p.capColor ?? 0xd32f2f)); // つば
    g.rect(0, 3, 1, 2).fill(hairColor); // 横髪（左）
    g.rect(7, 3, 1, 2).fill(hairColor); // 横髪（右）
    g.rect(1, 3, 6, 3).fill(p.skin); // 顔
    // 丸い目
    g.rect(2, 4, 1, 1).fill(EYE);
    g.rect(5, 4, 1, 1).fill(EYE);
    // チーク
    g.rect(1, 5, 1, 1).fill(BLUSH);
    g.rect(6, 5, 1, 1).fill(BLUSH);
    // ---- 体 ----
    g.rect(0, 6, 8, 3).fill(p.shirt); // シャツ+腕
    g.rect(2, 9, 2, 2).fill(p.pants);
    g.rect(4, 9, 2, 2).fill(p.pants);
    if (frame === 0) {
      g.rect(2, 11, 2, 1).fill(SHOE);
      g.rect(4, 11, 2, 1).fill(SHOE);
    } else {
      g.rect(1, 11, 2, 1).fill(SHOE); // 歩行: 足を開く
      g.rect(5, 11, 2, 1).fill(SHOE);
    }
    return;
  }

  if (view === 'back') {
    g.rect(1, 0, 6, 1).fill(hairColor);
    g.rect(0, 1, 8, 5).fill(hairColor); // 後頭部（顔は見えない、丸い髪の塊）
    if (p.cap) g.rect(0, 1, 8, 1).fill(capBrim(p.capColor ?? 0xd32f2f));
    g.rect(0, 6, 8, 3).fill(p.shirt);
    g.rect(2, 9, 2, 2).fill(p.pants);
    g.rect(4, 9, 2, 2).fill(p.pants);
    if (frame === 0) {
      g.rect(2, 11, 2, 1).fill(SHOE);
      g.rect(4, 11, 2, 1).fill(SHOE);
    } else {
      g.rect(1, 11, 2, 1).fill(SHOE);
      g.rect(5, 11, 2, 1).fill(SHOE);
    }
    return;
  }

  // side（右向き。左向きは scale.x = -1 で反転）
  g.rect(1, 0, 6, 1).fill(hairColor);
  g.rect(0, 1, 8, 2).fill(hairColor);
  if (p.cap) g.rect(4, 1, 4, 1).fill(capBrim(p.capColor ?? 0xd32f2f)); // 前方のつば
  g.rect(0, 3, 2, 2).fill(hairColor); // 後頭部の髪
  g.rect(2, 3, 6, 3).fill(p.skin);
  g.rect(6, 4, 1, 1).fill(EYE);
  g.rect(2, 5, 1, 1).fill(BLUSH);
  g.rect(0, 6, 8, 3).fill(p.shirt);
  g.rect(2, 9, 2, 2).fill(p.pants);
  if (frame === 0) {
    g.rect(3, 11, 2, 1).fill(SHOE);
  } else {
    g.rect(1, 11, 2, 1).fill(SHOE); // 歩行: 前後に足を開く
    g.rect(5, 11, 2, 1).fill(SHOE);
  }
}

function darken(color: number): number {
  const r = Math.floor(((color >> 16) & 0xff) * 0.72);
  const g = Math.floor(((color >> 8) & 0xff) * 0.72);
  const b = Math.floor((color & 0xff) * 0.72);
  return (r << 16) | (g << 8) | b;
}

/** 1人分（3方向×2フレーム）のテクスチャセットを生成する */
export function makePersonSet(
  renderer: Renderer,
  palette: PersonPalette,
): PersonTextureSet {
  const make = (view: ViewKey, frame: 0 | 1): Texture => {
    const g = new Graphics();
    drawPerson(g, palette, view, frame);
    const tex = renderer.generateTexture({ target: g, frame: FRAME });
    g.destroy();
    return tex;
  };
  return {
    front: [make('front', 0), make('front', 1)],
    back: [make('back', 0), make('back', 1)],
    side: [make('side', 0), make('side', 1)],
  };
}

/** 観客の髪色バリエーション（元気の出るカラフルさも少し混ぜる） */
export const HAIR_COLORS = [0x2e2226, 0x5b3a24, 0x8a6a3a, 0x3a3d4d, 0x7a3b52, 0x2e5a52];

/** 観客のズボン色バリエーション */
export const PANTS_COLORS = [0x27334d, 0x3d3d43, 0x4a3648];

/** 肌色バリエーション */
export const SKIN_COLORS = [0xf3c89b, 0xe0b088, 0xc99870];
