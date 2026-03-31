const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

let musicOscillator: OscillatorNode | null = null;
let musicGain: GainNode | null = null;

let engineOscillator: OscillatorNode | null = null;
let engineGain: GainNode | null = null;
let engineFilter: BiquadFilterNode | null = null;

export function startPlaneSound() {
  if (engineOscillator) return;
  
  engineOscillator = audioCtx.createOscillator();
  engineGain = audioCtx.createGain();
  engineFilter = audioCtx.createBiquadFilter();
  
  engineOscillator.type = 'sawtooth';
  engineOscillator.frequency.setValueAtTime(40, audioCtx.currentTime);
  
  engineFilter.type = 'lowpass';
  engineFilter.frequency.setValueAtTime(400, audioCtx.currentTime);
  engineFilter.Q.setValueAtTime(5, audioCtx.currentTime);
  
  engineGain.gain.setValueAtTime(0, audioCtx.currentTime);
  engineGain.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.5);
  
  engineOscillator.connect(engineFilter);
  engineFilter.connect(engineGain);
  engineGain.connect(audioCtx.destination);
  
  engineOscillator.start();
}

export function updatePlanePitch(multiplier: number) {
  if (!engineOscillator || !engineFilter) return;
  
  const now = audioCtx.currentTime;
  // Increase frequency based on multiplier
  const baseFreq = 40;
  const targetFreq = baseFreq + (multiplier * 10);
  engineOscillator.frequency.exponentialRampToValueAtTime(Math.min(200, targetFreq), now + 0.1);
  
  // Also open up the filter a bit
  const filterFreq = 400 + (multiplier * 50);
  engineFilter.frequency.exponentialRampToValueAtTime(Math.min(2000, filterFreq), now + 0.1);
}

export function stopPlaneSound() {
  if (engineOscillator && engineGain) {
    const now = audioCtx.currentTime;
    engineGain.gain.linearRampToValueAtTime(0, now + 0.2);
    setTimeout(() => {
      if (engineOscillator) {
        engineOscillator.stop();
        engineOscillator.disconnect();
        engineOscillator = null;
        engineGain = null;
        engineFilter = null;
      }
    }, 200);
  }
}

export function startMusic() {
  if (musicOscillator) return;
  
  musicOscillator = audioCtx.createOscillator();
  musicGain = audioCtx.createGain();
  
  musicOscillator.type = 'triangle';
  musicOscillator.frequency.setValueAtTime(110, audioCtx.currentTime);
  
  // Simple rhythmic pattern
  const now = audioCtx.currentTime;
  for (let i = 0; i < 100; i++) {
    const time = now + i * 0.5;
    musicOscillator.frequency.setValueAtTime(110, time);
    musicOscillator.frequency.setValueAtTime(165, time + 0.25);
  }
  
  musicGain.gain.setValueAtTime(0.02, audioCtx.currentTime);
  
  musicOscillator.connect(musicGain);
  musicGain.connect(audioCtx.destination);
  
  musicOscillator.start();
}

export function stopMusic() {
  if (musicOscillator) {
    musicOscillator.stop();
    musicOscillator.disconnect();
    musicOscillator = null;
    musicGain = null;
  }
}

export function playSound(type: 'spin' | 'win' | 'eat' | 'fail' | 'car' | 'horn' | 'shot') {
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  const now = audioCtx.currentTime;

  switch (type) {
    case 'spin':
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(440, now);
      oscillator.frequency.exponentialRampToValueAtTime(110, now + 0.1);
      gainNode.gain.setValueAtTime(0.1, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      oscillator.start(now);
      oscillator.stop(now + 0.1);
      break;
    case 'win':
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(523.25, now); // C5
      oscillator.frequency.setValueAtTime(659.25, now + 0.1); // E5
      oscillator.frequency.setValueAtTime(783.99, now + 0.2); // G5
      gainNode.gain.setValueAtTime(0.1, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      oscillator.start(now);
      oscillator.stop(now + 0.5);
      break;
    case 'eat':
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, now);
      oscillator.frequency.exponentialRampToValueAtTime(1760, now + 0.1);
      gainNode.gain.setValueAtTime(0.1, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      oscillator.start(now);
      oscillator.stop(now + 0.1);
      break;
    case 'fail':
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(220, now);
      oscillator.frequency.exponentialRampToValueAtTime(55, now + 0.5);
      gainNode.gain.setValueAtTime(0.1, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      oscillator.start(now);
      oscillator.stop(now + 0.5);
      break;
    case 'car':
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(100, now);
      oscillator.frequency.exponentialRampToValueAtTime(150, now + 0.1);
      gainNode.gain.setValueAtTime(0.05, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      oscillator.start(now);
      oscillator.stop(now + 0.1);
      break;
    case 'horn':
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(440, now);
      oscillator.frequency.setValueAtTime(349.23, now); // F4
      gainNode.gain.setValueAtTime(0.1, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      oscillator.start(now);
      oscillator.stop(now + 0.3);
      break;
    case 'shot':
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(100, now);
      oscillator.frequency.exponentialRampToValueAtTime(10, now + 0.2);
      gainNode.gain.setValueAtTime(0.2, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      oscillator.start(now);
      oscillator.stop(now + 0.2);
      break;
  }
}
