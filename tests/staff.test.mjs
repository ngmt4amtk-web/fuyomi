import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LEVELS, levelStrings } from '../js/phrase.js';
import { CLEF_PATH, renderStaff } from '../js/staff.js';
import { STRINGS, fingering, midiToStaff } from '../js/theory.js';

const WIDTH = 400;

function makeNotes(midis, states = []) {
  return midis.map((midi, index) => ({
    midi,
    state: states[index] || 'current',
    hint: null,
  }));
}

function attributes(rawTag) {
  return Object.fromEntries(
    [...rawTag.matchAll(/([:\w-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]),
  );
}

function elements(svg, role) {
  const found = [];
  for (const match of svg.matchAll(/<([A-Za-z][\w:-]*)\b[^<>]*>/g)) {
    const attrs = attributes(match[0]);
    if (attrs['data-role'] === role) found.push({ name: match[1], attrs, raw: match[0] });
  }
  return found;
}

function rootAttributes(svg) {
  const match = svg.match(/^<svg\b[^>]*>/);
  assert.ok(match, 'SVGのルート要素がある');
  return attributes(match[0]);
}

function numeric(attrs, name) {
  const value = Number(attrs[name]);
  assert.ok(Number.isFinite(value), `${name} は数値属性`);
  return value;
}

function approximately(actual, expected, tolerance = 0.002) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} は ${expected} の許容差 ${tolerance} 以内`,
  );
}

function blankBox() {
  return { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
}

function addPoint(box, x, y) {
  box.left = Math.min(box.left, x);
  box.top = Math.min(box.top, y);
  box.right = Math.max(box.right, x);
  box.bottom = Math.max(box.bottom, y);
}

function cubicAt(p0, p1, p2, p3, t) {
  const oneMinusT = 1 - t;
  return (oneMinusT ** 3) * p0
    + 3 * (oneMinusT ** 2) * t * p1
    + 3 * oneMinusT * (t ** 2) * p2
    + (t ** 3) * p3;
}

function cubicExtrema(p0, p1, p2, p3) {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const epsilon = 1e-12;

  if (Math.abs(a) < epsilon) {
    if (Math.abs(b) < epsilon) return [];
    const t = -c / b;
    return t > 0 && t < 1 ? [t] : [];
  }

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  const root = Math.sqrt(discriminant);
  return [(-b + root) / (2 * a), (-b - root) / (2 * a)]
    .filter(t => t > 0 && t < 1);
}

/*
 * ブラウザの getBBox に頼らず、M/L/H/V/C/Z だけでできた埋め込みパスの外接矩形を求める。
 * C は制御点の箱ではなく導関数の極値を使い、実際の曲線の範囲を検査する。
 */
function pathGeometry(d) {
  const tokens = d.match(/[A-Za-z]|[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
  const bounds = blankBox();
  const subpathBounds = [];
  let tokenIndex = 0;
  let command = null;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let subpath = -1;

  const read = () => {
    assert.ok(tokenIndex < tokens.length, 'SVGパスの数値が途中で終わらない');
    const value = Number(tokens[tokenIndex++]);
    assert.ok(Number.isFinite(value), 'SVGパスの座標は有限値');
    return value;
  };
  const include = (px, py) => {
    addPoint(bounds, px, py);
    addPoint(subpathBounds[subpath], px, py);
  };

  while (tokenIndex < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[tokenIndex])) {
      command = tokens[tokenIndex++];
      assert.match(command, /^[MLHVCZ]$/);
    }

    if (command === 'Z') {
      x = startX;
      y = startY;
      include(x, y);
      command = null;
      continue;
    }

    if (command === 'M') {
      x = read();
      y = read();
      startX = x;
      startY = y;
      subpath++;
      subpathBounds.push(blankBox());
      include(x, y);
      command = 'L';
      continue;
    }

    assert.ok(subpath >= 0, 'SVGパスはMから始まる');
    if (command === 'L') {
      x = read();
      y = read();
      include(x, y);
    } else if (command === 'H') {
      x = read();
      include(x, y);
    } else if (command === 'V') {
      y = read();
      include(x, y);
    } else if (command === 'C') {
      const x0 = x;
      const y0 = y;
      const x1 = read();
      const y1 = read();
      const x2 = read();
      const y2 = read();
      const x3 = read();
      const y3 = read();
      const extrema = new Set([
        0,
        1,
        ...cubicExtrema(x0, x1, x2, x3),
        ...cubicExtrema(y0, y1, y2, y3),
      ]);
      for (const t of extrema) {
        include(
          cubicAt(x0, x1, x2, x3, t),
          cubicAt(y0, y1, y2, y3, t),
        );
      }
      x = x3;
      y = y3;
    } else {
      assert.fail(`未対応のSVGパス命令: ${command}`);
    }
  }

  return { bounds, subpathBounds, end: { x, y } };
}

function transformOf(attrs) {
  const match = attrs.transform?.match(
    /^translate\(([-+.\deE]+)[ ,]+([-+.\deE]+)\)\s+scale\(([-+.\deE]+)\)$/,
  );
  assert.ok(match, 'pathにtranslate/scaleがある');
  return { x: Number(match[1]), y: Number(match[2]), scale: Number(match[3]) };
}

function pathBox(attrs) {
  const local = pathGeometry(attrs.d).bounds;
  const transform = transformOf(attrs);
  const strokeHalf = attrs['stroke-width'] == null
    ? 0
    : numeric(attrs, 'stroke-width') * transform.scale / 2;
  return {
    left: transform.x + local.left * transform.scale - strokeHalf,
    top: transform.y + local.top * transform.scale - strokeHalf,
    right: transform.x + local.right * transform.scale + strokeHalf,
    bottom: transform.y + local.bottom * transform.scale + strokeHalf,
  };
}

function lineBox(attrs) {
  const values = (attrs.d.match(/[-+]?(?:\d+(?:\.\d*)?|\.\d+)/g) || []).map(Number);
  assert.equal(values.length, 3, '直線パスはMとH/Vの3座標');
  const half = numeric(attrs, 'stroke-width') / 2;
  if (/\sH\s/.test(attrs.d)) {
    const [x1, y, x2] = values;
    return {
      left: Math.min(x1, x2) - half,
      top: y - half,
      right: Math.max(x1, x2) + half,
      bottom: y + half,
    };
  }
  assert.match(attrs.d, /\sV\s/);
  const [x, y1, y2] = values;
  return {
    left: x - half,
    top: Math.min(y1, y2) - half,
    right: x + half,
    bottom: Math.max(y1, y2) + half,
  };
}

function rectBox(attrs) {
  const x = numeric(attrs, 'x');
  const y = numeric(attrs, 'y');
  return {
    left: x,
    top: y,
    right: x + numeric(attrs, 'width'),
    bottom: y + numeric(attrs, 'height'),
  };
}

function unionBoxes(...boxes) {
  return boxes.reduce((union, box) => ({
    left: Math.min(union.left, box.left),
    top: Math.min(union.top, box.top),
    right: Math.max(union.right, box.right),
    bottom: Math.max(union.bottom, box.bottom),
  }), blankBox());
}

function textElements(svg, role) {
  const found = [];
  for (const match of svg.matchAll(/<text\b([^<>]*)>([^<>]*)<\/text>/g)) {
    const attrs = attributes(`<text${match[1]}>`);
    if (attrs['data-role'] === role) found.push({ attrs, text: match[2] });
  }
  return found;
}

function hintBox({ attrs, text }) {
  const x = numeric(attrs, 'x');
  const y = numeric(attrs, 'y');
  const fontSize = numeric(attrs, 'font-size');
  // 日本語1文字を最大1emとして置く保守的な箱。標準のヒント長なら実フォントより広い。
  const width = [...text.replaceAll(/&(?:amp|lt|gt|quot|apos);/g, 'x')].length * fontSize;
  return {
    left: x - width / 2,
    top: y - fontSize,
    right: x + width / 2,
    bottom: y + fontSize * 0.3,
  };
}

function engravingGeometry(svg) {
  const heads = new Map(elements(svg, 'notehead')
    .map(({ attrs }) => [attrs['data-note-index'], pathBox(attrs)]));
  const stems = new Map(elements(svg, 'stem')
    .map(({ attrs }) => [attrs['data-note-index'], lineBox(attrs)]));
  const notes = elements(svg, 'note').map(({ attrs }) => {
    const noteIndex = attrs['data-index'];
    return {
      kind: 'note',
      noteIndex,
      diatonic: attrs['data-diatonic'],
      headBox: heads.get(noteIndex),
      label: `音符${noteIndex}`,
      ...unionBoxes(heads.get(noteIndex), stems.get(noteIndex)),
    };
  });
  const clefs = elements(svg, 'clef').map(({ attrs }, index) => ({
    kind: 'clef', label: `ト音記号${index}`, ...pathBox(attrs),
  }));
  const signatures = elements(svg, 'key-signature').map(({ attrs }) => ({
    kind: 'signature',
    label: `調号${attrs['data-index']}`,
    ...pathBox(attrs),
  }));
  const accidentals = elements(svg, 'note-accidental').map(({ attrs }) => ({
    kind: 'accidental',
    noteIndex: attrs['data-index'],
    label: `臨時記号${attrs['data-index']}`,
    ...pathBox(attrs),
  }));
  const ledgers = elements(svg, 'ledger-line').map(({ attrs }) => ({
    kind: 'ledger',
    noteIndex: attrs['data-note-index'],
    diatonic: attrs['data-diatonic'],
    label: `加線${attrs['data-note-index']}-${attrs['data-ledger-index']}`,
    ...lineBox(attrs),
  }));

  return { notes, clefs, signatures, accidentals, ledgers };
}

function boxesOverlap(left, right, epsilon = 0.002) {
  return Math.min(left.right, right.right) - Math.max(left.left, right.left) > epsilon
    && Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top) > epsilon;
}

function assertInside(box, viewBox, label) {
  const epsilon = 0.003;
  assert.ok(box.left >= viewBox.left - epsilon, `${label}の左端がviewBox内`);
  assert.ok(box.top >= viewBox.top - epsilon, `${label}の上端がviewBox内`);
  assert.ok(box.right <= viewBox.right + epsilon, `${label}の右端がviewBox内`);
  assert.ok(box.bottom <= viewBox.bottom + epsilon, `${label}の下端がviewBox内`);
}

function viewBoxOf(svg) {
  const values = rootAttributes(svg).viewBox.split(/\s+/).map(Number);
  assert.equal(values.length, 4, 'viewBoxは4つの数値');
  assert.ok(values.every(Number.isFinite), 'viewBoxは有限値');
  const [x, y, width, height] = values;
  return { left: x, top: y, right: x + width, bottom: y + height };
}

function assertMinimum(actual, expected, label) {
  // SVG属性は小数第3位へ丸めるため、比較側だけ0.003pxの丸め幅を持たせる。
  assert.ok(actual + 0.003 >= expected, `${label}: ${actual} >= ${expected}`);
}

function notePartsByIndex(svg, noteIndex) {
  const roles = ['notehead', 'stem', 'note-accidental'];
  return roles.flatMap((role) => elements(svg, role)
    .filter(({ attrs }) => attrs['data-note-index'] === String(noteIndex)
      || attrs['data-index'] === String(noteIndex))
    .map(({ attrs }) => (role === 'stem' ? lineBox(attrs) : pathBox(attrs))));
}

function assertHorizontalContract(svg, key, label) {
  const root = rootAttributes(svg);
  const space = numeric(root, 'data-staff-space');
  const viewBox = viewBoxOf(svg);
  const headBoxes = elements(svg, 'notehead').map(({ attrs }) => pathBox(attrs));
  assert.equal(headBoxes.length, 4, `${label}の符頭は4つ`);

  const centers = headBoxes.map((box) => (box.left + box.right) / 2);
  const centerGaps = centers.slice(1).map((center, index) => center - centers[index]);
  for (const gap of centerGaps) {
    assertMinimum(gap, space * 3, `${label}の符頭中心間は3.0線間以上`);
  }
  const smallestGap = Math.min(...centerGaps);
  const largestGap = Math.max(...centerGaps);
  assert.ok(
    largestGap - smallestGap <= smallestGap * 0.05 + 0.003,
    `${label}の4音は5%以内の均等間隔`,
  );

  for (let index = 1; index < headBoxes.length; index += 1) {
    assertMinimum(
      headBoxes[index].left - headBoxes[index - 1].right,
      space * 0.5,
      `${label}の隣接符頭の外接矩形間は0.5線間以上`,
    );
  }

  const lastParts = notePartsByIndex(svg, 3);
  assert.ok(lastParts.length >= 2, `${label}の最後の音に符頭と符幹がある`);
  for (const part of lastParts) {
    assert.ok(part.right <= viewBox.right + 0.003, `${label}の最後の音が右端から出ない`);
  }
  const lastDrawingRight = Math.max(...lastParts.map((part) => part.right));
  assertMinimum(
    viewBox.right - lastDrawingRight,
    space * 1.2,
    `${label}の最後の音の右余白は1.2線間以上`,
  );

  const clefBox = pathBox(elements(svg, 'clef')[0].attrs);
  const firstParts = notePartsByIndex(svg, 0);
  const firstDrawingLeft = Math.min(...firstParts.map((part) => part.left));
  const signatures = elements(svg, 'key-signature').map(({ attrs }) => pathBox(attrs));
  if (signatures.length) {
    assertMinimum(
      signatures[0].left - clefBox.right,
      space * 0.6,
      `${label}のト音記号と最初の♯の空きは0.6線間以上`,
    );
    for (let index = 1; index < signatures.length; index += 1) {
      assertMinimum(
        signatures[index].left - signatures[index - 1].right,
        space * 0.15,
        `${label}の調号同士の空きは0.15線間以上`,
      );
    }
    assertMinimum(
      firstDrawingLeft - signatures.at(-1).right,
      space * 0.8,
      `${label}の最後の♯と最初の音の空きは0.8線間以上`,
    );
  } else {
    assert.equal(key, 'C', `${label}で調号なしはC長調`);
    assertMinimum(
      firstDrawingLeft - clefBox.right,
      space * 0.6,
      `${label}のト音記号と最初の音の空きは0.6線間以上`,
    );
  }
}

function midisForLevel(level, key) {
  const config = LEVELS[level];
  const byId = new Map(STRINGS.map((string) => [string.id, string]));
  return [...new Set(levelStrings(level).flatMap((stringId) => (
    fingering(byId.get(stringId).midi, key)
      .filter(({ finger }) => finger <= config.maxFinger)
      .map(({ midi }) => midi)
  )))].sort((left, right) => left - right);
}

function fourNoteRotations(midis) {
  return midis.map((_, start) => (
    Array.from({ length: 4 }, (unused, offset) => midis[(start + offset) % midis.length])
  ));
}

function assertWellFormed(svg) {
  const stack = [];
  const tagPattern = /<(\/)?([A-Za-z][\w:-]*)(?:\s[^<>]*?)?(\/?)>/g;
  for (const match of svg.matchAll(tagPattern)) {
    const [, closing, name, selfClosing] = match;
    if (closing) {
      assert.equal(stack.pop(), name, `終了タグ </${name}> が対応する`);
    } else if (selfClosing !== '/') {
      stack.push(name);
    }
  }
  assert.deepEqual(stack, [], '閉じていないタグがない');
}

test('五線は5本で、線間と線幅が五線間隔から決まる', () => {
  const svg = renderStaff({ key: 'C', notes: makeNotes([64, 65, 67, 69]), width: WIDTH, theme: 'light' });
  const root = rootAttributes(svg);
  const space = numeric(root, 'data-staff-space');
  const lines = elements(svg, 'staff-line');

  assert.equal(lines.length, 5);
  const ys = lines.map(({ attrs }) => numeric(attrs, 'data-y'));
  for (let index = 1; index < ys.length; index++) {
    approximately(ys[index] - ys[index - 1], space);
  }
  for (const { attrs } of lines) {
    approximately(numeric(attrs, 'stroke-width'), space / 8);
  }
});

test('五線間隔は横の必要量needと実幅だけから決まる', () => {
  for (const width of [375, 390, 430]) {
    for (const key of ['C', 'G', 'D', 'A']) {
      const svg = renderStaff({
        key,
        notes: makeNotes([55, 61, 73, 83], ['current', 'todo', 'todo', 'todo']),
        width,
        theme: 'light',
      });
      const root = rootAttributes(svg);
      const need = numeric(root, 'data-layout-need');
      const space = numeric(root, 'data-staff-space');
      approximately(space, width / need, 0.002);
    }
  }
});

test('音符4つの符頭はdiatonic 1段につき五線間隔の半分だけ上がる', () => {
  const midis = [64, 65, 67, 69]; // E4, F4, G4, A4
  const svg = renderStaff({ key: 'C', notes: makeNotes(midis), width: WIDTH, theme: 'light' });
  const root = rootAttributes(svg);
  const space = numeric(root, 'data-staff-space');
  const staffBottom = numeric(root, 'data-staff-bottom');
  const heads = elements(svg, 'notehead');

  assert.equal(heads.length, 4);
  heads.forEach(({ attrs }, index) => {
    const diatonic = midiToStaff(midis[index], 'C').diatonic;
    approximately(numeric(attrs, 'data-y'), staffBottom - diatonic * space / 2);
  });

  for (let index = 1; index < heads.length; index++) {
    approximately(
      numeric(heads[index - 1].attrs, 'data-y') - numeric(heads[index].attrs, 'data-y'),
      space / 2,
    );
  }
});

test('Bravuraの符頭は規定寸法で、符幹が右上または左下の端へ付く', () => {
  const svg = renderStaff({ key: 'C', notes: makeNotes([69, 71]), width: WIDTH, theme: 'light' });
  const space = numeric(rootAttributes(svg), 'data-staff-space');
  const heads = elements(svg, 'notehead');
  const stems = elements(svg, 'stem');

  heads.forEach(({ attrs }, index) => {
    const box = pathBox(attrs);
    const width = (box.right - box.left) / space;
    const height = (box.bottom - box.top) / space;
    assert.ok(width >= 1 && width <= 1.4, '符頭幅は1.0〜1.4線間');
    assert.ok(height >= 0.85 && height <= 1.15, '符頭高は0.85〜1.15線間');

    const stem = stems[index].attrs;
    const stemValues = (stem.d.match(/[-+]?(?:\d+(?:\.\d*)?|\.\d+)/g) || []).map(Number);
    const stemX = stemValues[0];
    const centerY = numeric(attrs, 'data-y');
    approximately(Math.abs(numeric(stem, 'data-y-end') - centerY) / space, 3.5);
    if (stem['data-direction'] === 'up') {
      approximately(stemX, box.right);
      approximately(numeric(stem, 'data-y-start'), centerY - space * 0.168);
    } else {
      approximately(stemX, box.left);
      approximately(numeric(stem, 'data-y-start'), centerY + space * 0.168);
    }
  });
});

test('符幹はB4より下で上向き、B4以上で下向きになる', () => {
  const midis = [69, 71]; // A4, B4
  const svg = renderStaff({ key: 'C', notes: makeNotes(midis), width: WIDTH, theme: 'light' });
  const stems = elements(svg, 'stem');

  assert.equal(stems[0].attrs['data-direction'], 'up');
  assert.ok(numeric(stems[0].attrs, 'data-y-end') < numeric(stems[0].attrs, 'data-y-start'));
  assert.equal(stems[1].attrs['data-direction'], 'down');
  assert.ok(numeric(stems[1].attrs, 'data-y-end') > numeric(stems[1].attrs, 'data-y-start'));
});

test('低音・高音には必要な本数だけ加線が付く', () => {
  const cases = [
    { midi: 55, expected: [-4, -2] }, // G3: A3まで2本
    { midi: 60, expected: [-2] },     // C4: 下第1加線
    { midi: 83, expected: [10] },     // B5: 上第1加線の上の間
  ];

  for (const { midi, expected } of cases) {
    const svg = renderStaff({ key: 'C', notes: makeNotes([midi]), width: WIDTH, theme: 'light' });
    const ledgers = elements(svg, 'ledger-line')
      .map(({ attrs }) => Number(attrs['data-diatonic']))
      .sort((a, b) => a - b);
    assert.deepEqual(ledgers, expected, `MIDI ${midi} の加線`);
  }

  const inside = renderStaff({
    key: 'C',
    notes: makeNotes([64, 67, 71, 77]), // E4〜F5
    width: WIDTH,
    theme: 'light',
  });
  assert.equal(elements(inside, 'ledger-line').length, 0);
});

test('A長調の開放ソ線には♮が付き、調号内のC♯5には付かない', () => {
  const svg = renderStaff({ key: 'A', notes: makeNotes([55, 73]), width: WIDTH, theme: 'light' });
  const accidentals = elements(svg, 'note-accidental');

  assert.equal(accidentals.length, 1);
  assert.equal(accidentals[0].attrs['data-index'], '0');
  assert.equal(accidentals[0].attrs['data-accidental'], 'natural');
});

test('C長調のC♯5には♯が付く', () => {
  const svg = renderStaff({ key: 'C', notes: makeNotes([73]), width: WIDTH, theme: 'light' });
  const accidentals = elements(svg, 'note-accidental');

  assert.equal(accidentals.length, 1);
  assert.equal(accidentals[0].attrs['data-accidental'], 'sharp');
});

test('調号の♯はC/G/D/Aで0/1/2/3個になる', () => {
  for (const [key, expected] of [['C', 0], ['G', 1], ['D', 2], ['A', 3]]) {
    const svg = renderStaff({ key, notes: makeNotes([69]), width: WIDTH, theme: 'light' });
    assert.equal(elements(svg, 'key-signature').length, expected, `${key}の調号`);
  }
});

test('iPhone 3幅で描画要素がviewBox内に収まり、意図しない外接矩形の重なりがない', () => {
  const widths = [375, 390, 430];
  const keys = ['C', 'G', 'D', 'A'];
  const midis = Array.from({ length: 29 }, (_, index) => 55 + index); // G3〜B5

  for (const width of widths) {
    for (const key of keys) {
      for (let start = 0; start < midis.length; start += 4) {
        const group = midis.slice(start, start + 4);
        while (group.length < 4) group.push(group.at(-1));
        const notes = group.map((midi, index) => ({
          midi,
          state: index === 1 ? 'current' : 'todo',
          hint: index === 0
            ? { stringId: 'G', finger: 0, nameJa: 'ソ' }
            : null,
        }));
        const svg = renderStaff({ key, notes, width, theme: 'light' });
        const viewBox = viewBoxOf(svg);
        const geometry = engravingGeometry(svg);
        const engraving = [
          ...geometry.clefs,
          ...geometry.signatures,
          ...geometry.accidentals,
          ...geometry.notes,
          ...geometry.ledgers,
        ];
        const otherDrawing = [
          ...elements(svg, 'staff-line').map(({ attrs }, index) => ({
            label: `五線${index}`, ...lineBox(attrs),
          })),
          ...elements(svg, 'current-highlight').map(({ attrs }, index) => ({
            label: `ハイライト${index}`, ...rectBox(attrs),
          })),
          ...textElements(svg, 'hint').map((item, index) => ({
            label: `ヒント${index}`, ...hintBox(item),
          })),
        ];

        for (const item of [...engraving, ...otherDrawing]) {
          assertInside(item, viewBox, `${width}px・${key}・${group.join(',')}の${item.label}`);
        }

        for (let leftIndex = 0; leftIndex < engraving.length; leftIndex++) {
          for (let rightIndex = leftIndex + 1; rightIndex < engraving.length; rightIndex++) {
            const left = engraving[leftIndex];
            const right = engraving[rightIndex];
            const isOwnLedger = left.noteIndex != null
              && left.noteIndex === right.noteIndex
              && ((left.kind === 'note' && right.kind === 'ledger')
                || (left.kind === 'ledger' && right.kind === 'note'));
            if (isOwnLedger) {
              const note = left.kind === 'note' ? left : right;
              const ledger = left.kind === 'ledger' ? left : right;
              if (note.diatonic !== ledger.diatonic) {
                // Bravura符頭はちょうど1線間高なので、線間音では外接矩形の端と隣の加線中心が接する。
                // 加線の半幅を超えて食い込んでいないことを検査し、輪郭を縮める誤差調整を避ける。
                const overlap = Math.min(note.headBox.bottom, ledger.bottom)
                  - Math.max(note.headBox.top, ledger.top);
                assert.ok(
                  overlap <= (ledger.bottom - ledger.top) / 2 + 0.003,
                  `${width}px・${key}で${note.label}の符頭が${ledger.label}へ食い込まない`,
                );
              }
              // 音が加線上にある場合は、加線が符頭を横切ること自体が記譜上必要になる。
              continue;
            }
            assert.equal(
              boxesOverlap(left, right),
              false,
              `${width}px・${key}で${left.label}と${right.label}が重ならない`,
            );
          }
        }
      }
    }
  }
});

test('全レベル・全調で4音の横配置契約を3つのiPhone幅で守る', () => {
  let accidentalCases = 0;
  let plainCases = 0;

  for (const width of [375, 390, 430]) {
    for (const key of ['C', 'G', 'D', 'A']) {
      for (const level of Object.keys(LEVELS).map(Number)) {
        for (const midis of fourNoteRotations(midisForLevel(level, key))) {
          const notes = makeNotes(midis, ['current', 'todo', 'todo', 'todo']);
          const svg = renderStaff({ key, notes, width, theme: 'light' });
          const accidentalCount = elements(svg, 'note-accidental').length;
          if (accidentalCount) accidentalCases += 1;
          else plainCases += 1;
          assertHorizontalContract(svg, key, `${width}px・${key}・level ${level}・${midis}`);
        }
      }
    }
  }

  assert.ok(accidentalCases > 0, '全レベル走査に臨時記号ありを含む');
  assert.ok(plainCases > 0, '全レベル走査に臨時記号なしを含む');
});

test('最後の音に臨時記号がある場合も横配置契約を守る', () => {
  const cases = [
    { key: 'A', midis: [62, 64, 66, 55] }, // 開放ソ線を戻す♮が最後に付く。
    { key: 'C', midis: [69, 71, 72, 73] }, // C♯5が最後に付く。
  ];

  for (const width of [375, 390, 430]) {
    for (const { key, midis } of cases) {
      const svg = renderStaff({
        key,
        notes: makeNotes(midis, ['current', 'todo', 'todo', 'todo']),
        width,
        theme: 'light',
      });
      assert.equal(elements(svg, 'note-accidental').at(-1).attrs['data-index'], '3');
      assertHorizontalContract(svg, key, `${width}px・${key}・最後に臨時記号`);
    }
  }
});

test('375px実幅でBravura符頭の高さが8px以上ある', () => {
  const width = 375;
  const svg = renderStaff({
    key: 'A',
    notes: makeNotes([55, 69, 76, 83]),
    width,
    theme: 'light',
  });
  const viewBox = viewBoxOf(svg);
  const cssScale = width / (viewBox.right - viewBox.left);

  for (const { attrs } of elements(svg, 'notehead')) {
    const box = pathBox(attrs);
    assert.ok((box.bottom - box.top) * cssScale >= 8, '符頭高が8px以上');
  }
});

test('臨時記号と符頭の間に375pxでも五線間隔の1/4以上の隙間がある', () => {
  for (const key of ['C', 'G', 'D', 'A']) {
    for (let midi = 55; midi <= 83; midi++) {
      const svg = renderStaff({ key, notes: makeNotes([midi]), width: 375, theme: 'light' });
      const accidental = elements(svg, 'note-accidental')[0];
      if (!accidental) continue;
      const accidentalBounds = pathBox(accidental.attrs);
      const headBounds = pathBox(elements(svg, 'notehead')[0].attrs);
      const space = numeric(rootAttributes(svg), 'data-staff-space');
      assert.ok(
        headBounds.left - accidentalBounds.right >= space * 0.25,
        `${key}・MIDI ${midi}の臨時記号と符頭に隙間がある`,
      );
    }
  }
});

test('A長調の3つの♯は指定したdiatonic位置が中心で、互いに重ならない', () => {
  const svg = renderStaff({ key: 'A', notes: makeNotes([69, 71, 73, 74]), width: 375, theme: 'light' });
  const root = rootAttributes(svg);
  const space = numeric(root, 'data-staff-space');
  const staffBottom = numeric(root, 'data-staff-bottom');
  const signatures = elements(svg, 'key-signature');
  const boxes = signatures.map(({ attrs }) => pathBox(attrs));
  assert.equal(boxes.length, 3);

  signatures.forEach(({ attrs }, index) => {
    const expectedY = staffBottom - Number(attrs['data-diatonic']) * space / 2;
    const boxCenterY = (boxes[index].top + boxes[index].bottom) / 2;
    approximately(numeric(attrs, 'data-y'), expectedY);
    approximately(boxCenterY, expectedY, space * 0.02);
  });

  for (let left = 0; left < boxes.length; left++) {
    for (let right = left + 1; right < boxes.length; right++) {
      assert.equal(boxesOverlap(boxes[left], boxes[right]), false, '調号の♯が互いに重ならない');
    }
  }
});

test('4状態は色または濃さが異なり、currentだけ縦長の帯を持つ', () => {
  const states = ['todo', 'current', 'done', 'miss'];
  const outputs = states.map((state) => renderStaff({
    key: 'C',
    notes: makeNotes([69], [state]),
    width: WIDTH,
    theme: 'light',
  }));

  assert.equal(new Set(outputs).size, 4);
  const appearances = outputs.map((svg) => {
    const note = elements(svg, 'note')[0].attrs;
    return `${note['data-ink']}/${note.opacity}`;
  });
  assert.equal(new Set(appearances).size, 4);
  assert.deepEqual(outputs.map((svg) => elements(svg, 'current-highlight').length), [0, 1, 0, 0]);

  const current = outputs[1];
  const band = elements(current, 'current-highlight')[0].attrs;
  assert.ok(numeric(band, 'height') > numeric(band, 'width'), 'ハイライトは縦長');
  assert.ok(
    current.indexOf('data-role="current-highlight"') < current.indexOf('data-role="staff-line"'),
    '帯は五線より先に描画され、背後に回る',
  );
  assert.ok(
    current.indexOf('data-role="current-highlight"') < current.indexOf('data-role="note"'),
    '帯は音符より先に描画され、背後に回る',
  );
});

test('ト音記号はG4を原点とするBravuraの輪郭をfillで描く', () => {
  const svg = renderStaff({ key: 'C', notes: makeNotes([69]), width: WIDTH, theme: 'light' });
  const root = rootAttributes(svg);
  const clef = elements(svg, 'clef')[0].attrs;
  const space = numeric(root, 'data-staff-space');
  const bottom = numeric(root, 'data-staff-bottom');
  const gLine = numeric(clef, 'data-g-center-y');
  const transform = transformOf(clef);

  approximately(gLine, bottom - space);
  approximately(transform.y, gLine);
  approximately(transform.scale / space, 1);
  assert.equal(clef.fill, '#252A2E');
  assert.equal(clef.stroke, undefined);
  assert.equal((CLEF_PATH.match(/M/g) || []).length, 4, 'Bravuraの4輪郭を保つ');
  assert.equal((CLEF_PATH.match(/Z/g) || []).length, 4, '全輪郭が閉じている');
});

test('ト音記号の渦中心と上下端はG4基準の条件を満たす', () => {
  const geometry = pathGeometry(CLEF_PATH);
  // 2番目の閉輪郭がG4線を囲む渦の内側であり、その箱の中心を機械的な基準にする。
  const gCounter = geometry.subpathBounds[1];
  const gCounterCenterY = (gCounter.top + gCounter.bottom) / 2;

  assert.ok(Math.abs(gCounterCenterY) <= 0.2, '渦の中心はG4線の±0.2線間');
  assert.ok(geometry.bounds.bottom - 1 >= 1.5, '下端は最下線より1.5線間以上下');
  assert.ok(-3 - geometry.bounds.top >= 1, '上端は最上線より1線間以上上');
});

test('SVGは外部参照とscriptを含まず、タグの対応が取れている', () => {
  const svg = renderStaff({
    key: 'A',
    notes: [{
      midi: 55,
      state: 'current',
      hint: { stringId: 'G', finger: 0, nameJa: 'ソ' },
    }],
    width: WIDTH,
    theme: 'dark',
  });

  assert.doesNotMatch(svg, /<script\b/i);
  assert.doesNotMatch(svg, /https?:\/\//i);
  assert.doesNotMatch(svg, /\u{1D11E}/u);
  assert.doesNotMatch(svg, /height="auto"/);
  assert.match(svg, /^<svg\b[^>]*width="100%"/);
  assert.equal(rootAttributes(svg).height, undefined);
  assertWellFormed(svg);
});

const MARKED_NOTES = [
  { midi: 69, stringId: 'A', finger: 0, state: 'current', hint: null },
  { midi: 71, stringId: 'A', finger: 1, state: 'todo', hint: null },
  { midi: 81, stringId: 'E', finger: 3, state: 'done', hint: null },
  { midi: 55, stringId: 'G', finger: 0, state: 'todo', hint: null },
];

test('marks=bothは弦の色と指番号を出し、marks未指定は元の見た目を変えない', () => {
  const both = renderStaff({ key: 'A', notes: MARKED_NOTES, width: WIDTH, theme: 'light', marks: 'both' });
  const fingers = elements(both, 'finger');

  assert.equal(rootAttributes(both)['data-marks'], 'both');
  assert.deepEqual(fingers.map((item) => item.attrs['data-finger']), ['0', '1', '3', '0']);
  assert.deepEqual(fingers.map((item) => item.attrs['data-string']), ['A', 'A', 'E', 'G']);
  assert.deepEqual(
    elements(both, 'notehead').map((item) => item.attrs.fill),
    ['#E23B3B', '#E23B3B', '#2FA84F', '#3B6FE2'],
  );
  // 棒と加線も同じ弦の色で描き、1音が2色に割れないようにする。
  assert.deepEqual(
    elements(both, 'stem').map((item) => item.attrs.stroke),
    ['#E23B3B', '#E23B3B', '#2FA84F', '#3B6FE2'],
  );

  const color = renderStaff({ key: 'A', notes: MARKED_NOTES, width: WIDTH, theme: 'light', marks: 'color' });
  assert.equal(elements(color, 'finger').length, 0);
  assert.deepEqual(
    elements(color, 'notehead').map((item) => item.attrs.fill),
    ['#E23B3B', '#E23B3B', '#2FA84F', '#3B6FE2'],
  );

  const off = renderStaff({ key: 'A', notes: MARKED_NOTES, width: WIDTH, theme: 'light' });
  assert.equal(rootAttributes(off)['data-marks'], 'off');
  assert.equal(elements(off, 'finger').length, 0);
  assert.deepEqual(
    elements(off, 'notehead').map((item) => item.attrs.fill),
    ['#252A2E', '#252A2E', '#557763', '#252A2E'],
  );
});

test('弦の色はテーマで切り替わり、外した音だけは弦の色を使わない', () => {
  const dark = renderStaff({ key: 'A', notes: MARKED_NOTES, width: WIDTH, theme: 'dark', marks: 'both' });
  assert.deepEqual(
    elements(dark, 'notehead').map((item) => item.attrs.fill),
    ['#F07272', '#F07272', '#63C97E', '#7FA6F5'],
  );

  const missed = MARKED_NOTES.map((note, index) => (
    index === 2 ? { ...note, state: 'miss' } : note
  ));
  const light = renderStaff({ key: 'A', notes: missed, width: WIDTH, theme: 'light', marks: 'both' });
  // ミ線の緑と「外した」の色が同じ意味に見えないよう、missだけはテーマの色に戻す。
  assert.equal(elements(light, 'notehead')[2].attrs.fill, '#A36F48');
  assert.equal(elements(light, 'finger')[2].attrs.fill, '#A36F48');
});

test('指番号は五線の外へ出て、その音符より上でviewBoxに収まる', () => {
  for (const key of ['C', 'G', 'D', 'A']) {
    for (const level of Object.keys(LEVELS).map(Number)) {
      const stringIds = levelStrings(level);
      for (const midis of fourNoteRotations(midisForLevel(level, key))) {
        const notes = midis.map((midi, index) => ({
          midi,
          stringId: stringIds[index % stringIds.length],
          finger: index % 5,
          state: 'todo',
          hint: null,
        }));
        const svg = renderStaff({ key, notes, width: WIDTH, theme: 'light', marks: 'both' });
        const fingers = elements(svg, 'finger');
        const heads = elements(svg, 'notehead');
        const staffTop = Number(rootAttributes(svg)['data-staff-top']);
        const where = `${key}・レベル${level}`;

        assert.equal(fingers.length, 4, `${where}: 4音ぶんの指番号`);
        fingers.forEach((finger, index) => {
          const baseline = Number(finger.attrs.y);
          const fontSize = Number(finger.attrs['font-size']);
          assert.ok(baseline < staffTop, `${where}: 指番号が五線の中へ入らない`);
          assert.ok(
            baseline < Number(heads[index].attrs['data-y']),
            `${where}: 指番号はその音符より上`,
          );
          assert.ok(baseline - fontSize * 0.82 >= 0, `${where}: 指番号がviewBoxの上へはみ出さない`);
        });
      }
    }
  }
});

test('五線に収まる音だけのフレーズでは指番号の高さが揃い、飛び出た音だけ持ち上がる', () => {
  const inside = [64, 65, 67, 69].map((midi, index) => ({
    midi, stringId: 'D', finger: index, state: 'todo', hint: null,
  }));
  const flat = elements(
    renderStaff({ key: 'C', notes: inside, width: WIDTH, theme: 'light', marks: 'both' }),
    'finger',
  ).map((item) => item.attrs.y);
  assert.equal(new Set(flat).size, 1, '五線の中の音は同じ高さに揃う');

  const withHigh = [...inside.slice(0, 3), {
    midi: 84, stringId: 'E', finger: 4, state: 'todo', hint: null,
  }];
  const raised = elements(
    renderStaff({ key: 'C', notes: withHigh, width: WIDTH, theme: 'light', marks: 'both' }),
    'finger',
  ).map((item) => Number(item.attrs.y));
  assert.equal(new Set(raised.slice(0, 3)).size, 1, '低い3音はそのまま揃う');
  assert.ok(raised[3] < raised[0], '上加線へ飛び出た音の指番号だけ持ち上がる');
});
