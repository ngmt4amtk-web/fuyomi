import test from 'node:test';
import assert from 'node:assert/strict';

import {LEVELS, makePhrase} from '../js/phrase.js';
import {KEYS, STRINGS, fingering, midiToStaff} from '../js/theory.js';

const TONIC_PITCH_CLASS = {C: 0, G: 7, D: 2, A: 9};
const STABLE_INTERVALS = new Set([0, 4, 7]);

function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const midiSequence = phrase => phrase.notes.map(note => note.midi).join(',');
const pitchClass = midi => ((midi % 12) + 12) % 12;
const CONTOURS = ['上昇', '下降', '山', '谷'];

function contourOf(phrase, key) {
  const diatonics = phrase.notes.map(note => midiToStaff(note.midi, key).diatonic);
  const directions = diatonics.slice(1)
    .map((diatonic, index) => Math.sign(diatonic - diatonics[index]))
    .filter(direction => direction !== 0);
  const first = directions[0];
  const last = directions.at(-1);

  // 同音を除いた最初と最後の動きで、細かな往復も4つの大きな輪郭へ分類する。
  if (first > 0 && last < 0) return '山';
  if (first < 0 && last > 0) return '谷';
  return last > 0 ? '上昇' : '下降';
}

function allowedPositions(levelNumber, key) {
  const level = LEVELS[levelNumber];
  const positions = new Map();

  for (const stringId of level.strings) {
    const string = STRINGS.find(candidate => candidate.id === stringId);
    for (const position of fingering(string.midi, key)) {
      if (position.finger > level.maxFinger) continue;
      if (!positions.has(position.midi)) positions.set(position.midi, []);
      positions.get(position.midi).push({stringId, finger: position.finger});
    }
  }
  return positions;
}

function assertValidPhrase(phrase, {level, key, length}) {
  assert.equal(phrase.level, level);
  assert.equal(phrase.key, key);
  assert.equal(phrase.notes.length, length);

  const allowed = allowedPositions(level, key);
  let leapCount = 0;
  let sameRun = 0;
  let lastMidi = null;

  phrase.notes.forEach((note, index) => {
    const positions = allowed.get(note.midi);
    assert.ok(positions, `Level ${level}・${key}: MIDI ${note.midi} は対象音域内`);
    assert.ok(
      positions.some(position =>
        position.stringId === note.stringId && position.finger === note.finger),
      `Level ${level}・${key}: ${note.stringId}線${note.finger}は有効な運指`
    );

    const previousStringId = phrase.notes[index - 1]?.stringId;
    const canStay = positions.filter(position => position.stringId === previousStringId);
    if (canStay.length > 0) {
      assert.equal(note.stringId, previousStringId, '同音異弦なら直前と同じ弦を優先する');
      assert.equal(note.finger, Math.min(...canStay.map(position => position.finger)));
    } else {
      assert.equal(
        note.finger,
        Math.min(...positions.map(position => position.finger)),
        '同じ弦に残れなければ少ない指を優先する'
      );
    }

    sameRun = note.midi === lastMidi ? sameRun + 1 : 1;
    assert.ok(sameRun <= 2, '同じ音を3回以上連続させない');
    lastMidi = note.midi;

    if (index > 0) {
      const before = midiToStaff(phrase.notes[index - 1].midi, key).diatonic;
      const after = midiToStaff(note.midi, key).diatonic;
      const interval = Math.abs(after - before);
      assert.ok(interval <= 3, `隣接音程 ${interval + 1}度 は4度以内`);
      if (interval >= 2) leapCount++;
    }
  });

  assert.ok(leapCount <= 1, '3度以上の跳躍は最大1回');
  assert.ok(new Set(phrase.notes.map(note => note.midi)).size >= 2, '2種類以上の音高を含む');

  const last = phrase.notes.at(-1);
  const stableInterval = (pitchClass(last.midi) - TONIC_PITCH_CLASS[key] + 12) % 12;
  assert.ok(STABLE_INTERVALS.has(stableInterval), '最後は主音・第3音・第5音のいずれか');
}

test('LEVELSは契約どおりの6段階を公開する', () => {
  assert.deepEqual(LEVELS, {
    1: {label: 'ラ線だけ', strings: ['A'], maxFinger: 3},
    2: {label: 'ミ線だけ', strings: ['E'], maxFinger: 3},
    3: {label: 'ラ線とミ線', strings: ['A', 'E'], maxFinger: 3},
    4: {label: 'レ線とソ線', strings: ['D', 'G'], maxFinger: 3},
    5: {label: '4本ぜんぶ', strings: ['G', 'D', 'A', 'E'], maxFinger: 3},
    6: {label: '4の指まで', strings: ['G', 'D', 'A', 'E'], maxFinger: 4}
  });
});

test('全レベル・全調で200フレーズずつ音楽的ルールを守る', () => {
  for (const level of Object.keys(LEVELS).map(Number)) {
    for (const key of Object.keys(KEYS)) {
      const rng = lcg(level * 1009 + key.charCodeAt(0));
      let prev = null;

      for (let index = 0; index < 200; index++) {
        const phrase = makePhrase({level, key, prev, rng});
        assertValidPhrase(phrase, {level, key, length: 4});
        if (prev) assert.notEqual(midiSequence(phrase), midiSequence(prev));
        prev = phrase;
      }
    }
  }
});

test('length=3と6でも全レベル・全調で同じルールが成立する', () => {
  for (const length of [3, 6]) {
    for (const level of Object.keys(LEVELS).map(Number)) {
      for (const key of Object.keys(KEYS)) {
        const rng = lcg(length * 100000 + level * 101 + key.charCodeAt(0));
        let prev = null;

        for (let index = 0; index < 40; index++) {
          const phrase = makePhrase({level, key, length, prev, rng});
          assertValidPhrase(phrase, {level, key, length});
          if (prev) assert.notEqual(midiSequence(phrase), midiSequence(prev));
          prev = phrase;
        }
      }
    }
  }
});

test('同じseedなら連続生成しても同じフレーズ列になる', () => {
  const leftRng = lcg(20260823);
  const rightRng = lcg(20260823);
  let leftPrev = null;
  let rightPrev = null;

  for (let index = 0; index < 30; index++) {
    const left = makePhrase({level: 6, key: 'A', length: 6, prev: leftPrev, rng: leftRng});
    const right = makePhrase({level: 6, key: 'A', length: 6, prev: rightPrev, rng: rightRng});
    assert.deepEqual(left, right);
    leftPrev = left;
    rightPrev = right;
  }
});

test('異なる100 seedから少なくとも80種類のフレーズが生まれる', () => {
  const variants = new Set();
  for (let seed = 1; seed <= 100; seed++) {
    variants.add(midiSequence(makePhrase({level: 6, key: 'A', rng: lcg(seed)})));
  }
  assert.ok(variants.size >= 80, `異なるフレーズは ${variants.size}/100 種類`);
});

test('全レベル・全調で上昇・下降・山・谷の輪郭が一方向へ偏らない', () => {
  for (const level of Object.keys(LEVELS).map(Number)) {
    for (const key of Object.keys(KEYS)) {
      const counts = Object.fromEntries(CONTOURS.map(contour => [contour, 0]));

      for (let seed = 1; seed <= 100; seed++) {
        const phrase = makePhrase({level, key, rng: lcg(seed)});
        counts[contourOf(phrase, key)]++;
      }

      for (const contour of CONTOURS) {
        assert.ok(
          counts[contour] >= 10,
          `Level ${level}・${key}: ${contour}が ${counts[contour]}/100 件しかない`
        );
      }
      assert.ok(
        Math.max(...Object.values(counts)) <= 70,
        `Level ${level}・${key}: 輪郭が偏っている ${JSON.stringify(counts)}`
      );
    }
  }
});

test('rngが同じ値を返し続けてもprevと異なる決定的フォールバックを返す', () => {
  const fixedRng = () => 0;
  const first = makePhrase({level: 6, key: 'D', rng: fixedRng});
  const next = makePhrase({level: 6, key: 'D', prev: first, rng: fixedRng});

  assert.notEqual(midiSequence(next), midiSequence(first));
  assertValidPhrase(next, {level: 6, key: 'D', length: 4});
});

test('同音異弦では同じ弦を保つ場合と少ない指へ移る場合の両方を守る', () => {
  let sawSameString = false;
  let sawLowerFinger = false;

  for (let seed = 1; seed <= 2000 && !(sawSameString && sawLowerFinger); seed++) {
    const phrase = makePhrase({level: 6, key: 'D', length: 6, rng: lcg(seed)});
    const allowed = allowedPositions(6, 'D');

    phrase.notes.forEach((note, index) => {
      const positions = allowed.get(note.midi);
      if (positions.length < 2) return;

      const previousStringId = phrase.notes[index - 1]?.stringId;
      if (positions.some(position => position.stringId === previousStringId)) {
        sawSameString = true;
        assert.equal(note.stringId, previousStringId);
      } else {
        sawLowerFinger = true;
        assert.equal(note.finger, Math.min(...positions.map(position => position.finger)));
      }
    });
  }

  assert.equal(sawSameString, true, '直前の弦に残れる同音異弦を生成できた');
  assert.equal(sawLowerFinger, true, '直前の弦に残れない同音異弦を生成できた');
});
