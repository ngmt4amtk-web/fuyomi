import test from 'node:test';
import assert from 'node:assert/strict';

import {RESCUE_MAX_CENTS, TOL, createHolder, detect, judgeNote, median} from '../js/pitch.js';

const SAMPLE_RATE = 48000;
const A4 = 442;
const TAU = Math.PI * 2;
const LEVEL_ONE_CANDIDATES = [
  {midi:69, stringId:'A', finger:0},
  {midi:71, stringId:'A', finger:1},
  {midi:73, stringId:'A', finger:2},
  {midi:74, stringId:'A', finger:3}
];

const frequencyForMidi = midi => A4 * Math.pow(2, (midi - 69) / 12);
const centsBetween = (actual, expected) => 1200 * Math.log2(actual / expected);

const PROFILES = {
  sine: [[1, 0.72, 0.10]],
  violin: [
    [1, 0.56, 0.10],
    [2, 0.30, 0.43],
    [3, 0.19, -0.31],
    [4, 0.12, 0.77],
    [5, 0.07, -0.92]
  ],
  secondDominant: [
    [1, 0.28, 0.16],
    [2, 0.64, -0.27],
    [3, 0.13, 0.61],
    [4, 0.07, -0.74]
  ]
};

function synthTone(freq, harmonics){
  const out = new Float32Array(2048);
  for(let i = 0; i < out.length; i++){
    let sample = 0;
    for(const [multiple, amplitude, phase] of harmonics){
      sample += amplitude * Math.sin(TAU * freq * multiple * i / SAMPLE_RATE + phase);
    }
    out[i] = sample;
  }
  return out;
}

function whiteNoise(seed){
  const out = new Float32Array(2048);
  let state = seed >>> 0;
  for(let i = 0; i < out.length; i++){
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out[i] = (((state >>> 8) / 0x1000000) * 2 - 1) * 0.3;
  }
  return out;
}

test('TOL はゆびいろで確定した3段の値を保つ', () => {
  assert.deepEqual(TOL, {
    loose: {label:'とてもゆるい', hold:225, spread:170, tol:90, conf:0.22},
    mid:   {label:'ゆるい',       hold:300, spread:130, tol:70, conf:0.30},
    tight: {label:'ふつう',       hold:400, spread:90,  tol:45, conf:0.38}
  });
});

test('RESCUE_MAX_CENTS は250セントを公開する', () => {
  assert.equal(RESCUE_MAX_CENTS, 250);
});

test('detect は3種の合成音を8音とも検出し、誤差中央値が5セント以内', async t => {
  const notes = [
    ['A3', 57],
    ['B3', 59],
    ['D4', 62],
    ['E4', 64],
    ['A4', 69],
    ['B4', 71],
    ['D5', 74],
    ['E5', 76]
  ];

  for(const [profileName, harmonics] of Object.entries(PROFILES)){
    await t.test(profileName, () => {
      const absoluteErrors = notes.map(([name, midi]) => {
        const expected = frequencyForMidi(midi);
        const result = detect(synthTone(expected, harmonics), SAMPLE_RATE);
        assert.ok(result.f > 0, `${name} を検出できなかった`);
        assert.ok(result.conf > TOL.loose.conf, `${name} の信頼度が閾値以下: ${result.conf}`);
        return Math.abs(centsBetween(result.f, expected));
      });
      assert.ok(
        median(absoluteErrors) <= 5,
        `${profileName} の誤差中央値: ${median(absoluteErrors).toFixed(2)} cents`
      );
    });
  }
});

test('detect はホワイトノイズ30本を有声音と誤認しない', () => {
  for(let seed = 1; seed <= 30; seed++){
    const result = detect(whiteNoise(seed), SAMPLE_RATE);
    assert.ok(
      !(result.f > 0 && result.conf > TOL.loose.conf),
      `seed ${seed}: ${result.f.toFixed(1)} Hz / conf ${result.conf.toFixed(3)}`
    );
  }
});

test('createHolder は60fps・30fps・20fpsのどれでも loose の保持時間直後に合格する', async t => {
  for(const fps of [60, 30, 20]){
    await t.test(`${fps}fps`, () => {
      const holder = createHolder(TOL.loose);
      const frame = 1000 / fps;
      let result = null;
      let resultAt = 0;

      for(let index = 1; index < 100 && !result; index++){
        resultAt = index * frame;
        result = holder.feed(resultAt, {f:442, conf:1, rms:0.2});
        assert.ok(holder.progress() >= 0 && holder.progress() <= 1);
      }

      assert.ok(result, `${fps}fps で合格しなかった`);
      assert.ok(result.held >= TOL.loose.hold);
      assert.ok(result.held <= TOL.loose.hold + frame + 1e-9);
      assert.ok(resultAt <= TOL.loose.hold + frame * 2 + 1e-9);
      assert.equal(result.freq, 442);
      assert.equal(holder.progress(), 1);
    });
  }
});

test('createHolder は窓内の1フレームだけが1200セント外れても合格する', () => {
  const holder = createHolder(TOL.loose);
  const frame = 1000 / 60;
  let result = null;

  for(let index = 1; index < 100 && !result; index++){
    const freq = index === 10 ? 884 : 442;
    result = holder.feed(index * frame, {f:freq, conf:1, rms:0.2});
  }

  assert.ok(result);
  assert.equal(result.freq, 442);
  assert.equal(holder.progress(), 1);
});

test('createHolder は不安定な入力でも hold の2倍で必ず値を返す', () => {
  const holder = createHolder(TOL.loose);
  const frame = 1000 / 60;
  let result = null;

  for(let index = 1; index < 100 && !result; index++){
    const freq = index % 2 ? 442 : 884;
    result = holder.feed(index * frame, {f:freq, conf:1, rms:0.2});
  }

  assert.ok(result, 'ゆれ幅が大きい入力で値が返らなかった');
  assert.ok(result.held >= TOL.loose.hold * 2);
  assert.ok(result.held <= TOL.loose.hold * 2 + frame + 1e-9);
  assert.equal(holder.progress(), 1);
});

test('createHolder は220msを超える無音と muteUntil で保持を捨てる', () => {
  const holder = createHolder(TOL.loose);
  const voiced = {f:442, conf:1, rms:0.2};
  const silent = {f:-1, conf:0, rms:0};

  holder.feed(0, voiced);
  holder.feed(100, voiced);
  holder.feed(320, silent);
  assert.ok(holder.progress() > 0, '220msちょうどではリセットしない');
  holder.feed(321, silent);
  assert.equal(holder.progress(), 0);

  holder.feed(400, voiced);
  holder.feed(500, voiced);
  holder.muteUntil(800);
  assert.equal(holder.progress(), 0);
  assert.equal(holder.feed(700, voiced), null);
  assert.equal(holder.progress(), 0);
  assert.equal(holder.feed(800, voiced), null);
  assert.equal(holder.progress(), 0);
});

test('judgeNote はレベル1の最低候補より1オクターブ下を正解にしない', () => {
  const result = judgeNote({
    freq:frequencyForMidi(57),
    targetMidi:69,
    candidates:LEVEL_ONE_CANDIDATES,
    cfg:TOL.loose,
    a4:A4
  });

  assert.equal(result.ok, false);
});

test('judgeNote は目標から240セントなら最近傍で救済する', () => {
  const result = judgeNote({
    freq:frequencyForMidi(74) * Math.pow(2, 240 / 1200),
    targetMidi:74,
    candidates:LEVEL_ONE_CANDIDATES,
    cfg:TOL.loose,
    a4:A4
  });

  assert.equal(result.ok, true);
  assert.ok(Math.abs(result.cents - 240) < 1e-9);
});

test('judgeNote は目標から260セントなら最近傍でも救済しない', () => {
  const result = judgeNote({
    freq:frequencyForMidi(74) * Math.pow(2, 260 / 1200),
    targetMidi:74,
    candidates:LEVEL_ONE_CANDIDATES,
    cfg:TOL.loose,
    a4:A4
  });

  assert.equal(result.ok, false);
});

test('judgeNote の第1段は救済上限を超えても cfg.tol 以内なら正解にする', () => {
  const result = judgeNote({
    freq:frequencyForMidi(74) * Math.pow(2, 260 / 1200),
    targetMidi:74,
    candidates:LEVEL_ONE_CANDIDATES,
    cfg:{...TOL.loose, tol:270},
    a4:A4
  });

  assert.equal(result.ok, true);
  assert.ok(Math.abs(result.cents - 260) < 1e-9);
});

test('judgeNote は許容幅・最近傍・オクターブの3段で救済し、実音を報告する', async t => {
  const candidates = [
    {midi:65, stringId:'D', finger:1},
    {midi:67, stringId:'D', finger:2},
    {midi:69, stringId:'A', finger:0},
    {midi:71, stringId:'A', finger:1},
    {midi:72, stringId:'A', finger:2},
    {midi:74, stringId:'A', finger:3},
    {midi:76, stringId:'E', finger:0}
  ];
  const judge = freq => judgeNote({
    freq,
    targetMidi:69,
    candidates,
    cfg:TOL.loose,
    a4:A4
  });

  await t.test('目標ぴったり', () => {
    const result = judge(frequencyForMidi(69));
    assert.equal(result.ok, true);
    assert.ok(Math.abs(result.cents) < 1e-9);
  });

  await t.test('少しずれは許容幅で救済', () => {
    const result = judge(frequencyForMidi(69) * Math.pow(2, 80 / 1200));
    assert.equal(result.ok, true);
    assert.ok(Math.abs(result.cents - 80) < 1e-9);
  });

  await t.test('許容幅外でも候補中の最近傍なら救済', () => {
    const result = judge(frequencyForMidi(69) * Math.pow(2, 95 / 1200));
    assert.equal(result.ok, true);
    assert.ok(Math.abs(result.cents - 95) < 1e-9);
  });

  await t.test('1オクターブ下は倍音分岐でも上限外として救済しない', () => {
    const result = judge(frequencyForMidi(57));
    assert.equal(result.ok, false);
    assert.equal(result.heard, candidates.find(candidate => candidate.midi === 69));
    assert.ok(Math.abs(result.cents) < 1e-9);
  });

  await t.test('完全に別の候補音は実際に鳴った高さを報告', () => {
    const heard = candidates.find(candidate => candidate.midi === 72);
    const result = judge(frequencyForMidi(72));
    assert.equal(result.ok, false);
    assert.equal(result.heard, heard);
    assert.ok(Math.abs(result.cents) < 1e-9);
  });
});
