import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CLEF_PATH, renderStaff } from '../js/staff.js';
import { midiToStaff } from '../js/theory.js';

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
 * ブラウザの getBBox に頼らず、M/L/H/V/C/Z だけでできた自前パスの外接矩形を求める。
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

// ト音記号の骨格は曲線途中の交差と横幅を検べる必要があるため、細分した点列でも測る。
function sampleCubicPath(d, stepsPerCurve = 80) {
  const tokens = d.match(/[A-Za-z]|[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
  const points = [];
  let tokenIndex = 0;
  let command = null;
  let x = 0;
  let y = 0;

  const read = () => {
    assert.ok(tokenIndex < tokens.length, 'ト音記号パスの数値が途中で終わらない');
    const value = Number(tokens[tokenIndex++]);
    assert.ok(Number.isFinite(value), 'ト音記号パスの座標は有限値');
    return value;
  };

  while (tokenIndex < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[tokenIndex])) command = tokens[tokenIndex++];

    if (command === 'M') {
      x = read();
      y = read();
      points.push({ x, y });
      command = null;
      continue;
    }

    assert.equal(command, 'C', 'ト音記号の骨格はMとCだけで構成する');
    const x0 = x;
    const y0 = y;
    const x1 = read();
    const y1 = read();
    const x2 = read();
    const y2 = read();
    const x3 = read();
    const y3 = read();
    for (let step = 1; step <= stepsPerCurve; step++) {
      const t = step / stepsPerCurve;
      points.push({
        x: cubicAt(x0, x1, x2, x3, t),
        y: cubicAt(y0, y1, y2, y3, t),
      });
    }
    x = x3;
    y = y3;
    command = null;
  }

  return points;
}

function segmentIntersection(a, b, c, d) {
  const abX = b.x - a.x;
  const abY = b.y - a.y;
  const cdX = d.x - c.x;
  const cdY = d.y - c.y;
  const denominator = abX * cdY - abY * cdX;
  if (Math.abs(denominator) < 1e-10) return null;

  const acX = c.x - a.x;
  const acY = c.y - a.y;
  const alongAB = (acX * cdY - acY * cdX) / denominator;
  const alongCD = (acX * abY - acY * abX) / denominator;
  const epsilon = 1e-7;
  if (alongAB < -epsilon || alongAB > 1 + epsilon
    || alongCD < -epsilon || alongCD > 1 + epsilon) return null;

  return {
    x: a.x + alongAB * abX,
    y: a.y + alongAB * abY,
  };
}

function selfIntersections(points) {
  const intersections = [];
  for (let first = 0; first < points.length - 1; first++) {
    for (let second = first + 2; second < points.length - 1; second++) {
      const hit = segmentIntersection(
        points[first],
        points[first + 1],
        points[second],
        points[second + 1],
      );
      if (!hit) continue;
      if (!intersections.some(point => Math.hypot(point.x - hit.x, point.y - hit.y) < 0.025)) {
        intersections.push(hit);
      }
    }
  }
  return intersections;
}

function widestHorizontalSlice(points, slices = 800) {
  const ys = points.map(point => point.y);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  let widest = { width: -Infinity, y: NaN };

  for (let slice = 1; slice < slices; slice++) {
    const y = top + (bottom - top) * slice / slices;
    const crossings = [];
    for (let index = 0; index < points.length - 1; index++) {
      const start = points[index];
      const end = points[index + 1];
      // 半開区間にして、ベジェ分割点を二重に数えない。
      if (!((start.y <= y && end.y > y) || (end.y <= y && start.y > y))) continue;
      const t = (y - start.y) / (end.y - start.y);
      crossings.push(start.x + (end.x - start.x) * t);
    }
    if (crossings.length < 2) continue;
    const width = Math.max(...crossings) - Math.min(...crossings);
    if (width > widest.width) widest = { width, y };
  }

  return widest;
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

function ellipseBox(attrs) {
  const cx = numeric(attrs, 'cx');
  const cy = numeric(attrs, 'cy');
  const rx = numeric(attrs, 'rx');
  const ry = numeric(attrs, 'ry');
  const match = attrs.transform?.match(/^rotate\(([-+.\deE]+)\s/);
  assert.ok(match, '符頭に回転角がある');
  const angle = Number(match[1]) * Math.PI / 180;
  const xRadius = Math.hypot(rx * Math.cos(angle), ry * Math.sin(angle));
  const yRadius = Math.hypot(rx * Math.sin(angle), ry * Math.cos(angle));
  return {
    left: cx - xRadius,
    top: cy - yRadius,
    right: cx + xRadius,
    bottom: cy + yRadius,
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
    .map(({ attrs }) => [attrs['data-note-index'], ellipseBox(attrs)]));
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
    approximately(numeric(attrs, 'cy'), staffBottom - diatonic * space / 2);
  });

  for (let index = 1; index < heads.length; index++) {
    approximately(
      numeric(heads[index - 1].attrs, 'cy') - numeric(heads[index].attrs, 'cy'),
      space / 2,
    );
  }
});

test('符頭は傾いた楕円で、符幹長は五線間隔のおよそ3.6倍', () => {
  const svg = renderStaff({ key: 'C', notes: makeNotes([69]), width: WIDTH, theme: 'light' });
  const space = numeric(rootAttributes(svg), 'data-staff-space');
  const head = elements(svg, 'notehead')[0].attrs;
  const stem = elements(svg, 'stem')[0].attrs;
  const rx = numeric(head, 'rx');
  const ry = numeric(head, 'ry');
  const stemLength = Math.abs(numeric(stem, 'data-y-end') - numeric(stem, 'data-y-start'));

  assert.ok(rx > ry, '符頭は真円ではない');
  assert.match(head.transform, /^rotate\(-20\s/);
  approximately(stemLength / space, 3.6);
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
                // 符幹は自音の加線を横切るため、線間の音では符頭だけを独立に検査する。
                assert.equal(
                  boxesOverlap(note.headBox, ledger),
                  false,
                  `${width}px・${key}で${note.label}の符頭と${ledger.label}が重ならない`,
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

test('4音の横間隔は375/390/430pxすべてで均等かつ十分に離れる', () => {
  for (const width of [375, 390, 430]) {
    for (const key of ['C', 'G', 'D', 'A']) {
      const svg = renderStaff({
        key,
        notes: makeNotes([55, 61, 73, 83]),
        width,
        theme: 'light',
      });
      const space = numeric(rootAttributes(svg), 'data-staff-space');
      const xs = elements(svg, 'note').map(({ attrs }) => numeric(attrs, 'data-x'));
      assert.equal(xs.length, 4);
      const gaps = xs.slice(1).map((x, index) => x - xs[index]);
      for (const gap of gaps) approximately(gap, gaps[0], 0.003);
      assert.ok(gaps[0] >= space * 5, `${width}px・${key}で隣の音と5線間以上離れる`);
    }
  }
});

test('375px実幅で回転後の符頭高が8px以上ある', () => {
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
    const box = ellipseBox(attrs);
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
      const headBounds = ellipseBox(elements(svg, 'notehead')[0].attrs);
      const space = numeric(rootAttributes(svg), 'data-staff-space');
      assert.ok(
        headBounds.left - accidentalBounds.right >= space * 0.25,
        `${key}・MIDI ${midi}の臨時記号と符頭に隙間がある`,
      );
    }
  }
});

test('A長調の3つの調号は375pxでも1px以上離れる', () => {
  const svg = renderStaff({ key: 'A', notes: makeNotes([69, 71, 73, 74]), width: 375, theme: 'light' });
  const boxes = elements(svg, 'key-signature').map(({ attrs }) => pathBox(attrs));
  assert.equal(boxes.length, 3);
  for (let index = 1; index < boxes.length; index++) {
    assert.ok(boxes[index].left - boxes[index - 1].right >= 1, '調号の字間が1px以上');
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

test('ト音記号はG4を原点とする一本の丸線で描く', () => {
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
  assert.equal(clef.fill, 'none');
  assert.equal(clef['stroke-linecap'], 'round');
  assert.equal(clef['stroke-linejoin'], 'round');

  const renderedStroke = numeric(clef, 'stroke-width') * transform.scale;
  assert.ok(renderedStroke / space >= 0.40, '線幅は五線間隔の0.40倍以上');
  assert.ok(renderedStroke / space <= 0.45, '線幅は五線間隔の0.45倍以下');
  assert.equal((CLEF_PATH.match(/\bM\b/g) || []).length, 1, '骨格は一筆でつながる');
});

test('ト音記号の上下端・幅・渦中心は五線間隔座標の条件を満たす', () => {
  const points = sampleCubicPath(CLEF_PATH);
  const geometry = pathGeometry(CLEF_PATH);
  const width = geometry.bounds.right - geometry.bounds.left;
  const height = geometry.bounds.bottom - geometry.bounds.top;
  // SVGは下向きが正なので、依頼の「上向きを正」とする音楽座標へ符号を戻す。
  const lowestY = -geometry.bounds.bottom;
  const highestY = -geometry.bounds.top;
  const widest = widestHorizontalSlice(points);
  const widestY = -widest.y;

  assert.ok(Math.abs(geometry.end.y) <= 0.15, '渦の中心はG4線の±0.15線間');
  assert.ok(-1 - lowestY >= 2, '最下点は最下線より2線間以上下');
  assert.ok(highestY - 3 >= 1.2, '最上点は最上線より1.2線間以上上');
  assert.ok(width / height <= 0.45, '最大幅は高さの0.45倍以下');
  assert.ok(widestY < 0, '最も横に開く場所はG4線より下');

  const upperCrook = points.filter(point => Math.abs(point.y + 3) <= 0.08);
  assert.ok(Math.min(...upperCrook.map(point => point.x)) <= -0.9,
    '上の張り出しはF5付近で左へ大きく回り込む');
});

test('ト音記号は縦の流れと下降弧がB4付近で自己交差する', () => {
  const intersections = selfIntersections(sampleCubicPath(CLEF_PATH));
  assert.ok(intersections.length >= 1, '自己交差が1回以上ある');
  assert.ok(
    intersections.some(point => Math.hypot(point.x - 0.10, point.y + 1.00) <= 0.04),
    '縦の流れと上からの下降弧がB4線付近で交差する',
  );
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
  assert.match(svg, /^<svg\b[^>]*width="100%"/);
  assertWellFormed(svg);
});
