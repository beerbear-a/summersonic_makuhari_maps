/**
 * タイムテーブルへの問い合わせをまとめたクラス。
 * 「いま演奏中のアクトは？」「もうすぐ始まるアクトは？」などを提供する。
 */

import type { Act } from '../data/timetable';

export class Timetable {
  constructor(readonly acts: readonly Act[]) {}

  /** 指定時刻に演奏中のアクト一覧 */
  actsAt(time: number): Act[] {
    return this.acts.filter((a) => a.start <= time && time < a.end);
  }

  /** 指定時刻から withinMinutes 以内に開演するアクト一覧 */
  upcomingWithin(time: number, withinMinutes: number): Act[] {
    return this.acts.filter(
      (a) => time < a.start && a.start - time <= withinMinutes,
    );
  }

  /** 指定ステージで演奏中のアクト */
  currentActOnStage(stageId: string, time: number): Act | undefined {
    return this.acts.find(
      (a) => a.stageId === stageId && a.start <= time && time < a.end,
    );
  }

  /** 指定時刻以降に終演を迎えるアクトがまだあるか（= フェスが続いているか） */
  hasRemainingActs(time: number): boolean {
    return this.acts.some((a) => a.end > time);
  }

  byId(actId: string): Act | undefined {
    return this.acts.find((a) => a.id === actId);
  }
}

/** 分表記を "HH:MM" 文字列にする（例: 720 -> "12:00"） */
export function formatTime(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  const hh = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${hh}:${mm.toString().padStart(2, '0')}`;
}
