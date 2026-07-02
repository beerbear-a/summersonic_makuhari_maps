/**
 * ポケモン風の会話ウィンドウに出すセリフの生成。
 * 観客に話しかけると、その人の状態（鑑賞中・空腹・ストレスなど）に
 * 応じたセリフを返す。施設・ステージの看板にも話しかけられる。
 */

import type { Agent } from '../simulation/Agent';
import type { Facility } from '../data/venues';
import type { Simulation } from '../simulation/Simulation';
import { formatTime } from '../simulation/Timetable';
import { DAY_END } from '../data/timetable';

export interface DialogueLine {
  name: string;
  text: string;
}

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** 観客の呼び名（見た目のバリエーションに合わせて） */
const AGENT_NAMES = [
  'フェス好きの若者',
  'ベテランフェス勢',
  'はしゃぐ観客',
  '音楽好きの学生',
  '遠征してきた人',
  'フェス仲間',
];

export function agentDialogue(a: Agent, sim: Simulation): DialogueLine {
  const name = AGENT_NAMES[a.id % AGENT_NAMES.length];
  const act = a.currentActId ? sim.timetable.byId(a.currentActId) : undefined;

  // 状態ごとの専用セリフ（優先度順）
  if (a.state === 'toilet') {
    return { name, text: pick(['……いま話しかけないでくれ……', '（すごい列だったなぁ…）']) };
  }
  if (a.state === 'eating') {
    return {
      name,
      text: pick([
        'フェス飯は正義。これは譲れない',
        'ここのケバブ、毎年食べてるんだ',
        'めっちゃ並んだけど…うまい！',
        '海を見ながら食べるごはん、最高じゃない？',
      ]),
    };
  }
  if (a.state === 'shopping') {
    return {
      name,
      text: pick([
        '限定Tシャツ、色違いも買っちゃった',
        'タオルは何枚あってもいいからね',
        'お目当てのグッズ、まだ残ってるかな…',
      ]),
    };
  }
  if (a.state === 'leaving') {
    return {
      name,
      text: pick([
        '今日は最高の一日だった！また来年！',
        '帰りの電車、絶対混むよなぁ…',
        '足はもう棒だけど、心は大満足！',
        'いちばん良かったのどのステージだった？',
      ]),
    };
  }
  if (a.state === 'watching' && act) {
    return {
      name,
      text: pick([
        `${act.artist}サイコー！！`,
        `この曲を生で聴けただけで来た甲斐があった…！`,
        `${act.artist}のライブ、一生の思い出だよ！`,
        'もっと前の方まで行けばよかった〜',
      ]),
    };
  }
  if (a.state === 'moving' && act) {
    return {
      name,
      text: pick([
        `これから ${act.artist} を見に行くんだ！`,
        `急がないと ${act.artist} が始まっちゃう！`,
        `${act.artist} は絶対最前で見るって決めてたの`,
      ]),
    };
  }

  // 欲求ベースのセリフ
  if (a.toilet > 70) {
    return { name, text: pick(['トイレどこ…！？', 'やばい、そろそろ限界かも…']) };
  }
  if (a.hunger > 70) {
    return {
      name,
      text: pick(['お腹すいた…FOOD AREA 行こうかな', 'どこからかいい匂いがする…']),
    };
  }
  if (a.stress > 70) {
    return {
      name,
      text: pick([
        '人が多すぎるよ〜！',
        '押さないで〜！！',
        'ここ、ちょっと危ないくらい混んでない？',
      ]),
    };
  }
  if (a.fatigue > 85) {
    return {
      name,
      text: pick(['ちょっと日陰で休みたい…', '朝から立ちっぱなしで足が…']),
    };
  }
  if (a.satisfaction > 80) {
    return {
      name,
      text: pick(['このフェス、神運営だね！', '来年も絶対来るって決めた！']),
    };
  }
  if (a.satisfaction < 35) {
    return {
      name,
      text: pick(['正直ちょっと疲れたかも…', 'さっきから移動ばっかりしてる気がする…']),
    };
  }

  // 汎用セリフ
  return {
    name,
    text: pick([
      'いい天気でフェス日和だね！',
      '次はどのステージ行くの？',
      'タイムテーブルの被りがつらい…',
      '海風が気持ちいいね〜',
      'リストバンド、記念に持って帰るんだ',
    ]),
  };
}

export function facilityDialogue(f: Facility, sim: Simulation): DialogueLine {
  if (f.type === 'stage') {
    const current = sim.timetable.currentActOnStage(f.id, sim.time);
    if (current) {
      return {
        name: f.name,
        text: `NOW PLAYING: ${current.artist}（〜${formatTime(current.end)}）`,
      };
    }
    const next = sim.timetable.acts
      .filter((a) => a.stageId === f.id && a.start > sim.time)
      .sort((a, b) => a.start - b.start)[0];
    if (next) {
      return {
        name: f.name,
        text: `NEXT: ${formatTime(next.start)}〜 ${next.artist}`,
      };
    }
    return { name: f.name, text: '本日の公演はすべて終了しました。' };
  }
  switch (f.type) {
    case 'food':
      return { name: 'FOOD AREA', text: 'いらっしゃい！フェス飯どうですか〜！' };
    case 'goods':
      return { name: 'GOODS 売り場', text: '公式グッズ売り場です。限定Tシャツ、残りわずか！' };
    case 'toilet':
      return { name: '仮設トイレ', text: '譲り合ってご利用ください。混雑時は別のトイレへ！' };
    case 'exit':
      return {
        name: '海浜幕張駅',
        text:
          sim.time >= DAY_END
            ? '規制退場にご協力ください。ICカードのチャージはお済みですか？'
            : 'ようこそ SUMMER SONIC へ！良い一日を！',
      };
  }
}
