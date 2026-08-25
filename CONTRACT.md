# API契約（これは仕様。勝手に変えない。変えたい理由があれば実装せず報告する）

すべて ES モジュール。ビルド工程なし。DOM に触るのは `js/app.js` だけ。
`theory.js` `phrase.js` は純関数のみ。`staff.js` は SVG を**文字列として返す**（node からテスト
できるようにするため。document を使わない）。

## js/theory.js（実装済み・検証済み）
```js
export const STRINGS  // [{id:'G',midi:55,label:'ソ線',color:'#3B6FE2'}, D:62, A:69, E:76]
export const KEYS     // {A:{jp:'イ長調',de:'A-dur',sharps:3}, D:2, G:1, C:0}
export function mtof(midi, a4)            // a4 既定 442
export function cents(freq, midi, a4)
export function fingering(openMidi, key)  // [{finger:0..4, midi}] 第1ポジション
export function glueOf(fg, finger)        // 半音で隣り合う指
export function positionsForMidi(midi, key) // [{stringId, finger}] 指の少ない順
export function noteNameJa(midi)          // 'ラ' 'ド♯'
export function midiToStaff(midi, key)
// → {letter, octave, diatonic, accidental:'none'|'sharp'|'natural'|'flat'}
//   diatonic は E4（ト音記号の五線の最下線）を 0 とする整数。F4=1 G4=2 A4=3 B4=4（第3線）
//   C5=5 D5=6 E5=7 F5=8（最上線）／ D4=-1 C4=-2（下第1加線）B3=-3 A3=-4（下第2加線）G3=-5
//   B5=11。臨時記号は「調号がその letter に与える高さ」と実際の midi を比べて決める。
export function keySignature(key)
// → [{letter, diatonic, accidental:'sharp'}]。検証済みの値:
//   G: F♯(8) / D: F♯(8) C♯(5) / A: F♯(8) C♯(5) G♯(9) / C: []
//   （出典照合済み: Texas A&M OER "Steps to Music Theory" 4.7 と VexFlow src/tables.ts）
```

## js/phrase.js
```js
export const ALL_STRING_IDS = ['G','D','A','E'];
export const LEVELS = {
  1:{label:'ミ線だけ',   strings:['E'],             maxFinger:3},
  2:{label:'ラ線だけ',   strings:['A'],             maxFinger:3},
  3:{label:'レ線だけ',   strings:['D'],             maxFinger:3},
  4:{label:'ソ線だけ',   strings:['G'],             maxFinger:3},
  5:{label:'選んだ2本',  strings:null, choose:{min:1,max:2}, preset:['A','E'],  maxFinger:3},
  6:{label:'選んだ弦で4の指まで', strings:null, choose:{min:1,max:4}, preset:['A'], maxFinger:4},
  7:{label:'4本ぜんぶ',  strings:['G','D','A','E'], maxFinger:3},
  8:{label:'4本ぜんぶ・4の指まで', strings:['G','D','A','E'], maxFinger:4}
};
// strings が null のレベルだけ、画面で選んだ弦を受け取る。本数が choose に合わなければ preset。
// min は上限ちょうどにしない（選択中の弦が1つも外せないボタンになる）。
export function levelStrings(level, picked=null) // → ['G','D',...]（必ずALL_STRING_IDSの順）
export function canChooseStrings(level)         // → boolean
export function makePhrase({level, key, length=4, prev=null, rng=Math.random, strings=null})
// → {notes:[{midi, stringId, finger}], key, level, strings}
// ルール（テストで機械検証する）:
//  - 隣り合う音は原則2度（順次進行）。跳躍（3度以上）は1フレーズに最大1回、最大4度まで。
//  - 最後の音は安定音（その調の主音・第3音・第5音のいずれかの音名）。
//  - 同じ音の連続は2回まで。最低2種類の音高を含む。
//  - level.strings と maxFinger から作る運指の範囲内。
//  - prev と midi 列が完全一致しない。
//  - 同じ高さが2通りで取れるときは、直前の音と同じ弦になる取り方を優先（弦を無駄に跨がせない）。
//  - **多様性**: 異なる seed 100個で生成したフレーズのうち80種類以上が異なること。
//    （生成器が数パターンに収束してはいけない。ここは実測でテストする）
```

## js/pitch.js（ゆびいろからの移植・実装済み）
```js
export const TOL = { loose:{hold:225,spread:170,tol:90,conf:0.22}, mid:{300,130,70,0.30}, tight:{400,90,45,0.38} };
export const RESCUE_MAX_CENTS = 250;  // 第2段の音域外安全弁（decisions.md 採用10・11）
export function detect(x, sr)          // → {f, conf, rms}  YIN/CMND
export function median(a)
export async function createMic()      // → {read(), sampleRate, close(), ctx}
export function createHolder(cfg)      // → {feed(now,det), progress(), reset(), muteUntil(t)}
export function judgeNote({freq, targetMidi, candidates, cfg, a4})
// candidates は非空。現在の調で第1ポジションから出せる4弦すべての音を渡し、
// 同じmidiは指の少ない運指を代表に1つだけ残す。出題レベルの範囲には狭めない。
// → {ok:true, cents, oct?:true} | {ok:false, heard:{midi,stringId,finger}, cents}
// 3段の判定:
//  1. 目標までの生の距離が |cents| <= cfg.tol なら正解。
//  2. 生の距離が |cents| <= RESCUE_MAX_CENTS かつ、生の最近傍候補が目標なら正解。
//  3. 目標までの距離をオクターブで畳み、その距離が |cents| <= cfg.tol なら
//     {ok:true, cents, oct:true}。第3段に RESCUE_MAX_CENTS は適用しない。
```

`createMic()` は `getUserMedia()` 成功後の初期化に失敗した場合、取得済みの全トラックを停止し、
作成済み `AudioContext` があれば閉じてから元の失敗を再スローする。

`createHolder(cfg)` は生成直後だけ有声を受け付ける。`reset()` と `muteUntil(t)` は保持を捨てて
受付を閉じ、期限外で無声を1フレーム観測した後に再武装する。通常の保持中は、220msを超える
無声で保持を捨てる。短い検出抜けを許容する220msと、判定間の再武装条件は別である。

## js/staff.js（document を使わない・実装済み）
```js
export function renderStaff({key, notes, width, theme, marks})
// notes = [{midi, stringId, finger, state:'done'|'current'|'todo'|'miss', hint:{stringId,finger,nameJa}|null}]
// marks = 'both'（弦の色＋指番号）| 'color'（弦の色だけ）| 'off'（既定。五線だけ）
// → SVG文字列。五線・ト音記号（自前パス）・調号・音符・符幹・加線・臨時記号・状態の描き分け。
// 指番号は data-role="finger"。五線の上端より上に置き、上加線へ出た音だけ自分の加線ぶん持ち上げる。
// state='miss' のときだけ弦の色を使わない（ミ線の緑と合否の緑を混ぜない）。
export const CLEF_PATH
```

## js/app.js
上記を組み合わせる。DOM・localStorage（キー `fuyomi`）・URLクエリでの設定上書き・
音の確認画面・練習画面・結果画面・おてほんの音。詳細は `docs/decisions.md` に従う。

```js
export function createFuyomiApp(dependencies = {}) // → {destroy()}
```

`dependencies` では `window`・`document`・`clock`・`microphone` を差し替えられる。
`clock` は `{now, setTimeout, clearTimeout, requestAnimationFrame, cancelAnimationFrame}`、
`microphone` は `{create, detect, available?}` の形にする。
状態機械を決定的に検証するため、同じ境界から `storage`・`navigator`・`ResizeObserver` と、
既存契約を実装する `createHolder`・`judgeNote`・`makePhrase`・`renderStaff` も注入できる。
返り値は実行資源を破棄する `destroy()` だけで、内部状態を読み書きする操作は公開しない。

- `makePhrase` の出題範囲はレベルに従う。`judgeNote` の候補はレベルに狭めず、現在の調の
  第1ポジションで4弦から出せる全音高を使う。
- 判定後は holder を `reset()` し、画面遷移待ちの間も無声を観測して再武装する。
- おてほんの `muteUntil` 中は判定と `firstVoiceMs` の採取を行わない。
- マイク取得の非同期結果は、開始時と同じセッションかつ音確認画面にいる間だけ採用する。
- 結果のやり直し回数はmidiで集計し、音名を主語、勧めた運指を従属情報として表示する。
- セッション無効化時はタイマー・rAF・発振器・マイク・AudioContextを解放する。

## tests/run.mjs
node 22 の標準機能だけ（`node:test` / `node:assert`）。`node tests/run.mjs` が exit 0 で緑。
