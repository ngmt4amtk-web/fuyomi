export const TOL = {
  loose: {label:'とてもゆるい', hold:225, spread:170, tol:90, conf:0.22},
  mid:   {label:'ゆるい',       hold:300, spread:130, tol:70, conf:0.30},
  tight: {label:'ふつう',       hold:400, spread:90,  tol:45, conf:0.38}
};

export const RESCUE_MAX_CENTS = 250;

export function median(a){
  const b = a.slice().sort((x, y) => x - y), n = b.length;
  return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2;
}

const YIN_TH = 0.20;

export function detect(x, sr){
  const tauMin = Math.max(2, Math.floor(sr / 1500));
  const tauMax = Math.min(Math.floor(sr / 150), x.length - 1200);
  const W = Math.min(1024, x.length - tauMax - 1);
  if(W < 256) return {f:-1, conf:0, rms:0};

  let e = 0;
  for(let i = 0; i < W; i++) e += x[i] * x[i];
  const rms = Math.sqrt(e / W);
  if(rms < 0.0035) return {f:-1, conf:0, rms:rms};

  const cm = new Float32Array(tauMax + 1);
  let run = 0, best = -1, bestV = 1e9;
  for(let t = tauMin; t <= tauMax; t++){
    let s = 0;
    for(let j = 0; j < W; j++){
      const dd = x[j] - x[j + t];
      s += dd * dd;
    }
    run += s;
    cm[t] = run > 0 ? s * (t - tauMin + 1) / run : 1;
    if(cm[t] < bestV){ bestV = cm[t]; best = t; }
    // 最初に閾値を割った谷の底を使わないと、倍音側へ飛びやすくなる。
    if(cm[t] < YIN_TH && t > tauMin && cm[t] > cm[t - 1]){
      best = t - 1;
      bestV = cm[t - 1];
      break;
    }
  }
  if(best < 0) return {f:-1, conf:0, rms:rms};

  // 離散ラグのままだとセント精度を失うため、移植元どおり放物線で補間する。
  let tau = best;
  if(best > tauMin && best < tauMax){
    const a = cm[best - 1], b = cm[best], c = cm[best + 1];
    const den = 2 * (2 * b - a - c);
    if(den !== 0) tau = best + (c - a) / den;
  }
  return {
    f: sr / tau,
    conf: Math.max(0, Math.min(1, 1 - bestV)),
    rms:rms
  };
}

export async function createMic(){
  const stream = await navigator.mediaDevices.getUserMedia({audio:{
    echoCancellation:false,
    autoGainControl:false,
    noiseSuppression:false,
    channelCount:1
  }});
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  if(ctx.state === 'suspended') await ctx.resume();

  const src = ctx.createMediaStreamSource(stream);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 90;
  hp.Q.value = 0.707;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0;
  src.connect(hp);
  hp.connect(analyser);

  const tdBuf = new Float32Array(analyser.fftSize);
  return {
    read(){
      analyser.getFloatTimeDomainData(tdBuf);
      return tdBuf.subarray(tdBuf.length - 2048);
    },
    sampleRate:ctx.sampleRate,
    close(){
      stream.getTracks().forEach(t => t.stop());
      ctx.close().catch(() => {});
    },
    ctx
  };
}

export function createHolder(cfg){
  let hold = [];
  let lastVoiced = 0;
  let held = 0;
  let mutedUntil = 0;

  const clear = () => {
    hold = [];
    held = 0;
  };

  return {
    feed(now, det){
      if(now < mutedUntil) return null;

      const voiced = det.f > 0 && det.conf > cfg.conf;
      if(!voiced){
        if(hold.length && now - lastVoiced > 220) clear();
        return null;
      }

      lastVoiced = now;
      hold.push({t:now, f:det.f});
      while(hold.length && now - hold[0].t > cfg.hold * 2.2) hold.shift();

      // held は「途切れずに鳴らせている全時間」なので、保持列の先頭から測る。
      // 直近窓の最古サンプルは必ず約1フレーム内側にあり、そこから測ると cfg.hold に
      // 構造的に届かない。短い hold では端末のフレームレート次第で永久に通らなくなる。
      const win = hold.filter(h => now - h.t <= cfg.hold);
      held = now - hold[0].t;

      if(win.length >= 4 && held >= cfg.hold){
        const med = median(win.map(h => h.f));
        // 一瞬だけ倍音を拾う初心者の音を、最大値で窓ごと落とさないための85パーセンタイル。
        const devs = win
          .map(h => Math.abs(1200 * Math.log2(h.f / med)))
          .sort((a, b) => a - b);
        const spread = devs[Math.max(0, Math.ceil(devs.length * 0.85) - 1)];
        // 長く弾いても無反応のまま止まることを避けるため、規定時間の2倍で必ず返す。
        if(spread <= cfg.spread || held >= cfg.hold * 2){
          return {freq:med, held};
        }
      }
      return null;
    },

    progress(){
      return Math.max(0, Math.min(1, held / cfg.hold));
    },

    reset(){
      clear();
    },

    muteUntil(t){
      mutedUntil = t;
      // おてほん前の音を残すと、解除直後に継続音として誤判定するため同時に捨てる。
      clear();
    }
  };
}

const frequencyForMidi = (midi, a4) => a4 * Math.pow(2, (midi - 69) / 12);
const centsFromMidi = (freq, midi, a4) => 1200 * Math.log2(freq / frequencyForMidi(midi, a4));

export function judgeNote({freq, targetMidi, candidates, cfg, a4 = 442}){
  // 同じ高さを複数の弦で取れる場合、移植元どおり指の少ない候補を代表にする。
  const cand = [];
  candidates.slice().sort((a, b) => a.finger - b.finger).forEach(candidate => {
    if(!cand.some(current => current.midi === candidate.midi)) cand.push(candidate);
  });

  const dist = (midi, allowOctave) => {
    let best = centsFromMidi(freq, midi, a4);
    if(allowOctave){
      [-1, 1, 2].forEach(octave => {
        const current = centsFromMidi(freq, midi + 12 * octave, a4);
        if(Math.abs(current) < Math.abs(best)) best = current;
      });
    }
    return best;
  };

  const targetCents = centsFromMidi(freq, targetMidi, a4);

  // 1段目は初心者向けの許容幅をそのまま適用する。
  if(Math.abs(targetCents) <= cfg.tol) return {ok:true, cents:targetCents};

  // 有限な候補集合の端では最寄り判定が無限に広がるため、救済だけに距離上限を付ける。
  const rescueAllowed = Math.abs(targetCents) <= RESCUE_MAX_CENTS;

  // 2段目は、候補の中で目標が最も近ければ境界上の揺れを正解にする。
  let near = cand[0], nearCents = dist(cand[0].midi, false);
  cand.forEach(candidate => {
    const current = dist(candidate.midi, false);
    if(Math.abs(current) < Math.abs(nearCents)){
      near = candidate;
      nearCents = current;
    }
  });
  if(rescueAllowed && near.midi === targetMidi) return {ok:true, cents:targetCents};

  // 3段目は、弱い基音の代わりに倍音を拾った場合だけ目標へ戻す。
  let nearHarmonic = cand[0], nearHarmonicCents = dist(cand[0].midi, true);
  cand.forEach(candidate => {
    const current = dist(candidate.midi, true);
    if(Math.abs(current) < Math.abs(nearHarmonicCents)){
      nearHarmonic = candidate;
      nearHarmonicCents = current;
    }
  });
  if(rescueAllowed && nearHarmonic.midi === targetMidi && Math.abs(nearHarmonicCents) <= cfg.tol){
    return {ok:true, cents:nearHarmonicCents, oct:true};
  }

  // 倍音用の距離を優先すると、実際に鳴った近い音とは別の低い同名音を報告してしまう。
  if(Math.abs(nearCents) <= 250){
    return {ok:false, heard:near, cents:nearCents};
  }
  return {ok:false, heard:nearHarmonic, cents:nearHarmonicCents};
}
