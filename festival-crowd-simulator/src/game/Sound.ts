/**
 * 効果音（Web Audio API でその場合成する簡易SFX）。
 * 音声ファイルを使わず短いビープ/チャイムを鳴らすことでゲーム的な手応えを足す。
 * AudioContext はブラウザの自動再生制限を避けるため、ユーザー操作後に生成する。
 */
export class SoundFx {
  private ctx: AudioContext | null = null;
  muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(
    freq: number,
    startOffset: number,
    duration: number,
    type: OscillatorType,
    gainPeak: number,
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t0 = ctx.currentTime + startOffset;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(gainPeak, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  /** 会話ウィンドウを開く/送るときの短いクリック音 */
  blip(): void {
    this.tone(880, 0, 0.055, 'square', 0.045);
  }

  /** 食べる/買う/トイレなど行動成功時のポップ音 */
  action(): void {
    this.tone(660, 0, 0.08, 'triangle', 0.06);
    this.tone(1050, 0.06, 0.1, 'triangle', 0.05);
  }

  /** 実績解除ファンファーレ */
  achievement(): void {
    this.tone(523.25, 0, 0.09, 'square', 0.06);
    this.tone(659.25, 0.09, 0.09, 'square', 0.06);
    this.tone(783.99, 0.18, 0.2, 'square', 0.07);
  }

  /** 俯瞰⇄歩くモードの切り替え音 */
  toggleMode(): void {
    this.tone(440, 0, 0.05, 'sine', 0.045);
    this.tone(660, 0.05, 0.09, 'sine', 0.045);
  }
}
