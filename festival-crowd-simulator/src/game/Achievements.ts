/**
 * 実績（アチーブメント）定義。
 * 歩くモードでのプレイヤーの行動に応じて解除され、画面上部にトースト表示される。
 * MY FES のスコアにも実績数として反映される。
 */

import type { Player } from './Player';

export interface Achievement {
  id: string;
  icon: string;
  title: string;
  desc: string;
  condition: (p: Player) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_live',
    icon: '🎤',
    title: '初めての現場',
    desc: '最前でライブを観た！',
    condition: (p) => p.attendedActs.size >= 1,
  },
  {
    id: 'first_meal',
    icon: '🍜',
    title: 'フェス飯デビュー',
    desc: 'FOOD AREAで一息',
    condition: (p) => p.mealsEaten >= 1,
  },
  {
    id: 'first_goods',
    icon: '🛍',
    title: '戦利品ゲット',
    desc: '限定グッズを購入',
    condition: (p) => p.goodsBought >= 1,
  },
  {
    id: 'first_toilet',
    icon: '🚻',
    title: 'スッキリ！',
    desc: 'トイレで一息ついた',
    condition: (p) => p.toiletVisits >= 1,
  },
  {
    id: 'triple_live',
    icon: '🔥',
    title: 'はしごファン',
    desc: '3つのステージを制覇',
    condition: (p) => p.attendedActs.size >= 3,
  },
  {
    id: 'five_live',
    icon: '👑',
    title: 'フェス皆勤賞',
    desc: '5つのライブを観た',
    condition: (p) => p.attendedActs.size >= 5,
  },
  {
    id: 'shopaholic',
    icon: '💰',
    title: '爆買いトレーナー',
    desc: 'グッズを3個購入',
    condition: (p) => p.goodsBought >= 3,
  },
  {
    id: 'hype_max',
    icon: '💯',
    title: 'HYPE MAX',
    desc: 'テンションが振り切れた！',
    condition: (p) => p.hype >= 95,
  },
];

/** プレイヤーの行動から現在のスコアを算出する */
export function computeScore(p: Player): number {
  return (
    p.mealsEaten * 15 +
    p.goodsBought * 20 +
    p.toiletVisits * 5 +
    p.attendedActs.size * 60 +
    Math.round(p.hype)
  );
}
