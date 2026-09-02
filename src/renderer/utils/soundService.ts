let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export function playClick() {
  try {
    const c = getCtx();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.value = 520;
    g.gain.value = 0.08;
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.08);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.08);
  } catch { /* audio not available */ }
}

export function playCobrar() {
  try {
    const c = getCtx();
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.value = 0.1;
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.15 + i * 0.12);
      o.connect(g).connect(c.destination);
      o.start(c.currentTime + i * 0.12);
      o.stop(c.currentTime + 0.2 + i * 0.12);
    });
  } catch { /* audio not available */ }
}

export function playError() {
  try {
    const c = getCtx();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.value = 180;
    g.gain.value = 0.12;
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.25);
  } catch { /* audio not available */ }
}

export function playScan() {
  try {
    const c = getCtx();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.value = 0.06;
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.12);
    // segundo tono para dar feedback de "OK"
    const o2 = c.createOscillator();
    const g2 = c.createGain();
    o2.type = 'sine';
    o2.frequency.value = 1108;
    g2.gain.value = 0.06;
    g2.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.18);
    o2.connect(g2).connect(c.destination);
    o2.start(c.currentTime + 0.08);
    o2.stop(c.currentTime + 0.2);
  } catch { /* audio not available */ }
}
