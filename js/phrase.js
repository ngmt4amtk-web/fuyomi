import {KEYS, STRINGS, fingering, midiToStaff} from './theory.js';

// 低い弦から高い弦へ。画面の並びと配列の順序をここで一本化する。
export const ALL_STRING_IDS = Object.freeze(['G', 'D', 'A', 'E']);

// 単弦の4段階は1つにまとめ、弦を選ぶ。2本の段階は外して1本にもできる既存仕様を保つ。
export const LEVELS = {
  1: {label: '選んだ1本', strings: null, choose: {min: 1, max: 1}, preset: ['E'], maxFinger: 3},
  2: {label: '選んだ2本', strings: null, choose: {min: 1, max: 2}, preset: ['A', 'E'], maxFinger: 3},
  3: {label: '選んだ弦で4の指まで', strings: null, choose: {min: 1, max: 4}, preset: ['A', 'E'], maxFinger: 4},
  4: {label: '4本ぜんぶ', strings: ['G', 'D', 'A', 'E'], maxFinger: 3},
  5: {label: '4本ぜんぶ・4の指まで', strings: ['G', 'D', 'A', 'E'], maxFinger: 4}
};

/**
 * レベルと「選んだ弦」から、実際に出題へ使う弦を決める。
 * 弦を選べないレベルでは選択を無視し、選べるレベルでは本数が合わない選択も無視して preset へ落とす。
 */
export function levelStrings(level, picked = null) {
  const levelConfig = LEVELS[level];
  if (!levelConfig) throw new RangeError(`未対応のlevelです: ${level}`);
  if (levelConfig.strings) return [...levelConfig.strings];

  const chosen = ALL_STRING_IDS.filter(id => Array.isArray(picked) && picked.includes(id));
  const {min, max} = levelConfig.choose;
  return chosen.length >= min && chosen.length <= max ? chosen : [...levelConfig.preset];
}

export function canChooseStrings(level) {
  return Boolean(LEVELS[level] && !LEVELS[level].strings);
}

const TONIC_PITCH_CLASS = {C: 0, G: 7, D: 2, A: 9};
const STABLE_INTERVALS = new Set([0, 4, 7]);
const RANDOM_ATTEMPTS = 64;
const STRING_ORDER = new Map(STRINGS.map((string, index) => [string.id, index]));
const crossingPools = new Map();

const pitchClass = midi => ((midi % 12) + 12) % 12;

function unitRandom(rng) {
  const value = Number(rng());
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1 - Number.EPSILON);
}

function pick(items, rng) {
  return items[Math.floor(unitRandom(rng) * items.length)];
}

function weightedPick(items, weightOf, rng) {
  const weights = items.map(item => weightOf(item));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = unitRandom(rng) * total;

  for (let index = 0; index < items.length; index++) {
    cursor -= weights[index];
    if (cursor < 0) return items[index];
  }
  return items[items.length - 1];
}

function makeToneSet(levelConfig, key) {
  const byMidi = new Map();

  for (const stringId of levelConfig.strings) {
    const string = STRINGS.find(candidate => candidate.id === stringId);
    for (const position of fingering(string.midi, key)) {
      if (position.finger > levelConfig.maxFinger) continue;

      if (!byMidi.has(position.midi)) {
        byMidi.set(position.midi, {
          midi: position.midi,
          diatonic: midiToStaff(position.midi, key).diatonic,
          positions: []
        });
      }
      byMidi.get(position.midi).positions.push({stringId, finger: position.finger});
    }
  }

  return [...byMidi.values()]
    .map(tone => ({
      ...tone,
      positions: tone.positions.sort((a, b) =>
        a.finger - b.finger || STRING_ORDER.get(a.stringId) - STRING_ORDER.get(b.stringId))
    }))
    .sort((a, b) => a.midi - b.midi);
}

function isStable(tone, key) {
  const interval = (pitchClass(tone.midi) - TONIC_PITCH_CLASS[key] + 12) % 12;
  return STABLE_INTERVALS.has(interval);
}

function makeCadences(tones, key, allowLeap = false) {
  return tones
    .filter(tone => isStable(tone, key))
    .flatMap(end => tones
      .filter(approach => {
        const interval = Math.abs(approach.diatonic - end.diatonic);
        return interval >= 1 && interval <= (allowLeap ? 3 : 1);
      })
      .map(approach => ({approach, end})));
}

function continuationWeight(candidate, next, following, stepWeight) {
  const interval = Math.abs(candidate.diatonic - next.diatonic);
  let weight = interval === 1 ? stepWeight : 2;

  if (following) {
    const intoNext = Math.sign(next.diatonic - candidate.diatonic);
    const outOfNext = Math.sign(following.diatonic - next.diatonic);

    // 同方向の順次進行を少し優先し、偶然の往復運動だけに偏りにくくする。
    if (interval === 1 && intoNext !== 0 && intoNext === outOfNext) weight *= 1.5;
    if (candidate.midi === following.midi) weight *= 0.5;
  }

  return weight;
}

function randomToneSequence(tones, cadences, length, rng) {
  /*
   * 順次進行の強さと終止形を別々の乱数で決める。終止形を先頭の1値だけで決めると、
   * 連番seedのように初期値同士が近い乱数器では全フレーズが同じ終止へ潰れるため。
   */
  const stepWeight = 5 + (unitRandom(rng) * 4);
  const cadence = pick(cadences, rng);
  // 終止音から逆向きに組み、移弦では終わりの跳躍も許して形を増やす。
  const reversed = [cadence.end, cadence.approach];
  let leaps = Number(Math.abs(cadence.end.diatonic - cadence.approach.diatonic) >= 2);

  while (reversed.length < length) {
    const next = reversed[reversed.length - 1];
    const following = reversed[reversed.length - 2];
    const choices = tones.filter(candidate => {
      const interval = Math.abs(candidate.diatonic - next.diatonic);
      if (interval > 3) return false;
      if (interval >= 2 && leaps >= 1) return false;
      return !(candidate.midi === next.midi && next.midi === following?.midi);
    });

    const chosen = weightedPick(
      choices,
      candidate => continuationWeight(candidate, next, following, stepWeight),
      rng
    );
    if (Math.abs(chosen.diatonic - next.diatonic) >= 2) leaps++;
    reversed.push(chosen);
  }

  return reversed.reverse();
}

function previousMidis(prev) {
  if (!prev) return null;
  const notes = Array.isArray(prev) ? prev : prev.notes;
  if (!Array.isArray(notes)) return null;
  return notes.map(note => typeof note === 'number' ? note : note?.midi);
}

function sameMidis(tones, midis) {
  return Array.isArray(midis)
    && tones.length === midis.length
    && tones.every((tone, index) => tone.midi === midis[index]);
}

function alternatingCadence({approach, end}, length) {
  return Array.from({length}, (_, index) =>
    (length - 1 - index) % 2 === 0 ? end : approach);
}

function deterministicFallback(cadences, length, prevMidis) {
  /*
   * 各対象音域には、安定音へ2度で入る終止形が複数ある。交互に並べれば、任意の長さで
   * 3連続同音・跳躍・全音同一を起こさない。prev と同じ形だけを飛ばすので乱数にも依存しない。
   */
  for (const cadence of cadences) {
    const sequence = alternatingCadence(cadence, length);
    if (!sameMidis(sequence, prevMidis)) return sequence;
  }

  // 有効なLEVELS・調・length>=2では複数の終止形があるため、ここへは到達しない。
  return alternatingCadence(cadences[0], length);
}

function choosePosition(tone, previousStringId) {
  const sameString = tone.positions.filter(position => position.stringId === previousStringId);
  if (sameString.length > 0) {
    // 同音異弦では直前と同じ弦を残し、読譜と無関係な弦移動を増やさない。
    return sameString.reduce((best, position) =>
      position.finger < best.finger ? position : best);
  }

  // 同じ弦に残れない場合は、初心者が押さえやすい少ない指を代表運指にする。
  return tone.positions[0];
}

function addFingerings(tones) {
  const notes = [];

  for (const tone of tones) {
    const position = choosePosition(tone, notes.at(-1)?.stringId);
    notes.push({midi: tone.midi, stringId: position.stringId, finger: position.finger});
  }
  return notes;
}

export function makePhrase({level, key, length = 4, prev = null, rng = Math.random, strings = null}) {
  const levelConfig = LEVELS[level];
  if (!levelConfig) throw new RangeError(`未対応のlevelです: ${level}`);
  if (!KEYS[key]) throw new RangeError(`未対応のkeyです: ${key}`);
  if (!Number.isInteger(length) || length < 2) {
    throw new RangeError('lengthは2以上の整数で指定してください');
  }
  if (typeof rng !== 'function') throw new TypeError('rngは関数で指定してください');

  const stringIds = levelStrings(level, strings);
  const tones = makeToneSet({...levelConfig, strings: stringIds}, key);
  const cadences = makeCadences(tones, key, level >= 2 && stringIds.length > 1);
  const prevMidis = previousMidis(prev);
  const previousStrings = new Set(Array.isArray(prev?.notes) ? prev.notes.map(note => note.stringId) : []);
  // 隣り合わない弦だけを選ぶと、4度以内では渡れない。そこは従来の音程制約を守る。
  const crossing = level >= 2 && stringIds.some((id, i) =>
    i > 0 && STRING_ORDER.get(id) - STRING_ORDER.get(stringIds[i - 1]) === 1);
  const hasCrossing = sequence => new Set(addFingerings(sequence).map(note => note.stringId)).size >= 2;

  // 4音の移弦は候補を列挙して均等に選ぶ。単弦フレーズの棄却だけでは一部の形へ偏る。
  if (crossing && length === 4) {
    const poolKey = `${level}:${key}:${stringIds.join('')}`;
    if (!crossingPools.has(poolKey)) {
      const pool = [];
      const collect = (sequence, leaps) => {
        if (sequence.length === length) {
          if (isStable(sequence.at(-1), key) && hasCrossing(sequence)) pool.push(addFingerings(sequence));
          return;
        }
        for (const tone of tones) {
          const last = sequence.at(-1);
          const interval = last ? Math.abs(last.diatonic - tone.diatonic) : 0;
          if (interval > 3 || (interval >= 2 && leaps >= 1)) continue;
          if (tone.midi === last?.midi && tone.midi === sequence.at(-2)?.midi) continue;
          collect([...sequence, tone], leaps + Number(interval >= 2));
        }
      };
      collect([], 0);
      crossingPools.set(poolKey, pool);
    }
    const pool = crossingPools.get(poolKey).filter(notes => !sameMidis(notes, prevMidis));
    const varied = pool.filter(notes => notes.some(note => !previousStrings.has(note.stringId)));
    const choices = varied.length ? varied : pool;
    if (choices.length) {
      // 初期値が近い乱数器でも特定の音域へ偏らないよう、独立する2値を合わせる。
      let randomBits = (unitRandom(rng) * 0x100000000) ^ (unitRandom(rng) * 0x100000000);
      randomBits = Math.imul(randomBits ^ (randomBits >>> 16), 0x85ebca6b);
      randomBits = Math.imul(randomBits ^ (randomBits >>> 13), 0xc2b2ae35);
      const index = Math.floor(((randomBits ^ (randomBits >>> 16)) >>> 0) / 0x100000000 * choices.length);
      return {notes:choices[index].map(note => ({...note})), key, level, strings:stringIds};
    }
  }

  for (let attempt = 0; attempt < RANDOM_ATTEMPTS; attempt++) {
    const sequence = randomToneSequence(tones, cadences, length, rng);
    const positions = addFingerings(sequence);
    const variesStrings = positions.some(note => !previousStrings.has(note.stringId));
    if (!sameMidis(sequence, prevMidis) && (!crossing || hasCrossing(sequence))
      && (attempt >= 32 || previousStrings.size === 0 || variesStrings || stringIds.every(id => previousStrings.has(id)))) {
      return {notes: addFingerings(sequence), key, level, strings: stringIds};
    }
  }

  // 固定乱数でも同じ弦だけへ戻らないよう、音楽的制約を満たす移弦フレーズを探索する。
  if (crossing) {
    let visits = 0;
    const search = (sequence, leaps) => {
      if (++visits > 20000) return null;
      if (sequence.length === length) {
        return isStable(sequence.at(-1), key) && !sameMidis(sequence, prevMidis) && hasCrossing(sequence)
          ? sequence : null;
      }
      for (const tone of tones) {
        const last = sequence.at(-1);
        const interval = last ? Math.abs(last.diatonic - tone.diatonic) : 0;
        if (interval > 3 || (interval >= 2 && leaps >= 1)) continue;
        if (tone.midi === last?.midi && tone.midi === sequence.at(-2)?.midi) continue;
        const found = search([...sequence, tone], leaps + Number(interval >= 2));
        if (found) return found;
      }
      return null;
    };
    const sequence = search([], 0);
    if (sequence) return {notes:addFingerings(sequence), key, level, strings:stringIds};
  }

  const fallback = deterministicFallback(makeCadences(tones, key), length, prevMidis);
  return {notes: addFingerings(fallback), key, level, strings: stringIds};
}
