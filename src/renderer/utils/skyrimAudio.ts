/**
 * Skyrim-style Synthesized Quest Completed Audio
 * Uses Web Audio API to produce an authentic ancient harmonic chime
 */
export function playQuestCompletedSound(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;

    // Harmonic chord frequencies for ancient Skyrim/Nordic fanfare
    // D minor / F major ancient pentatonic chime: D4, A4, D5, F5
    const notes = [
      { freq: 293.66, delay: 0.0, duration: 2.2, gain: 0.2 }, // D4
      { freq: 440.0, delay: 0.12, duration: 2.5, gain: 0.22 }, // A4
      { freq: 587.33, delay: 0.25, duration: 2.8, gain: 0.25 }, // D5
      { freq: 698.46, delay: 0.42, duration: 3.2, gain: 0.2 }, // F5
      { freq: 880.0, delay: 0.6, duration: 3.5, gain: 0.18 }, // A5
    ];

    notes.forEach((note) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, now + note.delay);

      // Subtle pitch vibrato/shimmer
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.setValueAtTime(4.5, now + note.delay);
      lfoGain.gain.setValueAtTime(2.0, now + note.delay);
      lfo.connect(osc.frequency);
      lfo.start(now + note.delay);
      lfo.stop(now + note.delay + note.duration);

      // Envelope
      gain.gain.setValueAtTime(0.001, now + note.delay);
      gain.gain.exponentialRampToValueAtTime(note.gain, now + note.delay + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.delay + note.duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + note.delay);
      osc.stop(now + note.delay + note.duration);
    });
  } catch (err) {
    console.warn('Audio playback not permitted or unavailable:', err);
  }
}

/**
 * Skyrim-style Synthesized Arcane Enchanter / Transmutation Chime
 */
export function playEnchantSound(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;

    // Mystical E minor arpeggio chime: E4, G4, B4, E5, F#5, B5
    const notes = [
      { freq: 329.63, delay: 0.0, duration: 2.0, gain: 0.18 },
      { freq: 392.0, delay: 0.1, duration: 2.2, gain: 0.2 },
      { freq: 493.88, delay: 0.22, duration: 2.4, gain: 0.22 },
      { freq: 659.25, delay: 0.35, duration: 2.8, gain: 0.2 },
      { freq: 739.99, delay: 0.48, duration: 3.0, gain: 0.18 },
      { freq: 987.77, delay: 0.62, duration: 3.3, gain: 0.15 },
    ];

    notes.forEach((note) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.freq, now + note.delay);

      gain.gain.setValueAtTime(0.001, now + note.delay);
      gain.gain.exponentialRampToValueAtTime(note.gain, now + note.delay + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.delay + note.duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + note.delay);
      osc.stop(now + note.delay + note.duration);
    });
  } catch (err) {
    console.warn('Enchant audio playback not permitted or unavailable:', err);
  }
}
