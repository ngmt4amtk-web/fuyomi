import test from 'node:test';
import assert from 'node:assert/strict';
import {KEYS,keySignature,midiToStaff} from '../js/theory.js';
import {renderStaff} from '../js/staff.js';
test('フラットの調号はシ・ミ・ラの位置に1〜3個並ぶ',()=>{
 for(const [i,key] of ['F','Bb','Eb'].entries()) {
  assert.equal(KEYS[key].flats,i+1);
  assert.deepEqual(keySignature(key).map(n=>[n.letter,n.diatonic,n.accidental]),[['B',4,'flat'],['E',7,'flat'],['A',3,'flat']].slice(0,i+1));
  const svg=renderStaff({key,notes:[],width:320});
  assert.equal((svg.match(/data-accidental="flat"/g)||[]).length,i+1);
 }
});
test('シ♭・ミ♭・ラ♭の綴りと自然音への解除を全オクターブで区別する',()=>{
 for(const [key,pc,letter] of [['F',10,'B'],['Bb',3,'E'],['Eb',8,'A']])for(const octave of [3,4,5,6]) {
  const midi=12*(octave+1)+pc;
  const flat=midiToStaff(midi,key),natural=midiToStaff(midi+1,key);
  assert.equal(flat.letter,letter);assert.equal(flat.accidental,'none');
  assert.equal(natural.diatonic,flat.diatonic);assert.equal(natural.accidental,'natural');
 }
});
test('同じ小節でミ♮の後のミ♭に戻す記号を付ける',()=>{
 const svg=renderStaff({key:'Eb',notes:[76,75,76,75].map(midi=>({midi,state:'current'})),width:320});
 const accidentals=[...svg.matchAll(/data-role="note-accidental"[^>]*data-accidental="(\w+)"/g)].map(m=>m[1]);
 assert.deepEqual(accidentals,['natural','flat','natural','flat']);
});
