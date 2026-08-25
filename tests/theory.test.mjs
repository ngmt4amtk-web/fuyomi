import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STRINGS,
  KEYS,
  mtof,
  cents,
  fingering,
  glueOf,
  positionsForMidi,
  noteNameJa,
  midiToStaff,
  keySignature
} from '../js/theory.js';

test('定数は契約どおりの弦と調を持つ', () => {
  assert.deepEqual(STRINGS, [
    {id: 'G', midi: 55, label: 'ソ線', color: '#3B6FE2', colorDark: '#7FA6F5'},
    {id: 'D', midi: 62, label: 'レ線', color: '#E28B3B', colorDark: '#F0A868'},
    {id: 'A', midi: 69, label: 'ラ線', color: '#E23B3B', colorDark: '#F07272'},
    {id: 'E', midi: 76, label: 'ミ線', color: '#2FA84F', colorDark: '#63C97E'}
  ]);
  assert.deepEqual(KEYS, {
    A: {jp: 'イ長調', de: 'A-dur', sharps: 3},
    D: {jp: 'ニ長調', de: 'D-dur', sharps: 2},
    G: {jp: 'ト長調', de: 'G-dur', sharps: 1},
    C: {jp: 'ハ長調', de: 'C-dur', sharps: 0}
  });
});

test('mtofとcentsはA4=442Hzを既定値にする', () => {
  assert.equal(mtof(69), 442);
  assert.equal(mtof(57), 221);
  assert.equal(cents(442, 69), 0);
  assert.ok(Math.abs(cents(884, 69) - 1200) < 1e-10);
  assert.equal(mtof(69, 440), 440);
});

test('fingeringは4弦×4調で0〜4の5音を昇順にし、4の指を完全5度上に置く', () => {
  for (const string of STRINGS) {
    for (const key of Object.keys(KEYS)) {
      const positions = fingering(string.midi, key);
      assert.deepEqual(
        positions.map(position => position.finger),
        [0, 1, 2, 3, 4],
        `${string.id}線・${key}の指番号`
      );
      assert.equal(positions.length, 5, `${string.id}線・${key}の要素数`);
      assert.ok(
        positions.every((position, index) => index === 0 || positions[index - 1].midi < position.midi),
        `${string.id}線・${key}のmidi昇順`
      );
      assert.equal(
        positions[4].midi,
        string.midi + 7,
        `${string.id}線・${key}の4の指`
      );
    }
  }

  // イ長調の開放ソは調外なので、直上のソ♯を捨てる必要がある具体例。
  assert.deepEqual(fingering(55, 'A'), [
    {finger: 0, midi: 55},
    {finger: 1, midi: 57},
    {finger: 2, midi: 59},
    {finger: 3, midi: 61},
    {finger: 4, midi: 62}
  ]);
  assert.equal(fingering(76, 'A')[4].midi, 83);
});

test('glueOfは半音で隣り合う指だけを返す', () => {
  const aMajorOnA = fingering(69, 'A');
  assert.deepEqual(glueOf(aMajorOnA, 2), [3]);
  assert.deepEqual(glueOf(aMajorOnA, 3), [2]);
  assert.deepEqual(glueOf(aMajorOnA, 1), []);
});

test('positionsForMidiは同じ高さの全運指を指の少ない順で返す', () => {
  assert.deepEqual(positionsForMidi(69, 'A'), [
    {stringId: 'A', finger: 0},
    {stringId: 'D', finger: 4}
  ]);
  assert.deepEqual(positionsForMidi(54, 'A'), []);
});

test('noteNameJaはMIDI番号をドレミの♯表記へ変換する', () => {
  assert.deepEqual(
    Array.from({length: 12}, (_, pc) => noteNameJa(60 + pc)),
    ['ド', 'ド♯', 'レ', 'レ♯', 'ミ', 'ファ', 'ファ♯', 'ソ', 'ソ♯', 'ラ', 'ラ♯', 'シ']
  );
});

test('midiToStaffは音名の綴りから五線位置と臨時記号を決める', () => {
  const cases = [
    {midi: 55, key: 'C', expected: {letter: 'G', octave: 3, diatonic: -5, accidental: 'none'}},
    {midi: 60, key: 'C', expected: {letter: 'C', octave: 4, diatonic: -2, accidental: 'none'}},
    {midi: 64, key: 'C', expected: {letter: 'E', octave: 4, diatonic: 0, accidental: 'none'}},
    {midi: 71, key: 'C', expected: {letter: 'B', octave: 4, diatonic: 4, accidental: 'none'}},
    {midi: 77, key: 'C', expected: {letter: 'F', octave: 5, diatonic: 8, accidental: 'none'}},
    {midi: 81, key: 'C', expected: {letter: 'A', octave: 5, diatonic: 10, accidental: 'none'}},
    {midi: 83, key: 'C', expected: {letter: 'B', octave: 5, diatonic: 11, accidental: 'none'}},
    {midi: 55, key: 'A', expected: {letter: 'G', octave: 3, diatonic: -5, accidental: 'natural'}},
    {midi: 61, key: 'A', expected: {letter: 'C', octave: 4, diatonic: -2, accidental: 'none'}},
    {midi: 66, key: 'A', expected: {letter: 'F', octave: 4, diatonic: 1, accidental: 'none'}},
    {midi: 68, key: 'A', expected: {letter: 'G', octave: 4, diatonic: 2, accidental: 'none'}},
    {midi: 61, key: 'C', expected: {letter: 'C', octave: 4, diatonic: -2, accidental: 'sharp'}},
    {midi: 66, key: 'C', expected: {letter: 'F', octave: 4, diatonic: 1, accidental: 'sharp'}},
    {midi: 68, key: 'C', expected: {letter: 'G', octave: 4, diatonic: 2, accidental: 'sharp'}}
  ];

  for (const {midi, key, expected} of cases) {
    assert.deepEqual(midiToStaff(midi, key), expected, `midi=${midi}, key=${key}`);
  }
});

test('同じletterは1オクターブ上がるとdiatonicが7増える', () => {
  for (const midi of [60, 62, 64, 65, 67, 69, 71]) {
    const lower = midiToStaff(midi, 'C');
    const upper = midiToStaff(midi + 12, 'C');
    assert.equal(upper.letter, lower.letter);
    assert.equal(upper.octave, lower.octave + 1);
    assert.equal(upper.diatonic, lower.diatonic + 7);
  }
});

test('keySignatureはト音記号の慣習位置へF♯、C♯、G♯の順に置く', () => {
  assert.deepEqual(keySignature('C'), []);
  assert.deepEqual(keySignature('G'), [
    {letter: 'F', diatonic: 8, accidental: 'sharp'}
  ]);
  assert.deepEqual(keySignature('D'), [
    {letter: 'F', diatonic: 8, accidental: 'sharp'},
    {letter: 'C', diatonic: 5, accidental: 'sharp'}
  ]);
  assert.deepEqual(keySignature('A'), [
    {letter: 'F', diatonic: 8, accidental: 'sharp'},
    {letter: 'C', diatonic: 5, accidental: 'sharp'},
    {letter: 'G', diatonic: 9, accidental: 'sharp'}
  ]);
});