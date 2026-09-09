// 表情と手足を別々に動かせるように、キャラクターは外部画像でなくSVGで描く。
// DOMには触らず、app.jsへ描画用の文字列を返す。
export function companionStage(level) {
  const n = Number(level);
  return Number.isInteger(n) && n >= 5 && n <= 8 ? n - 3 : 1;
}

export const COMPANIONS = ['fluffy', 'dino', 'dog'];

export function renderCompanion(level, happy = false, gloomy = false, kind = 'fluffy') {
  if (kind === 'dino') return renderDinosaur(level, happy, gloomy);
  if (kind === 'dog') return renderDog(level, happy, gloomy);
  const stage = companionStage(level);
  const ribbon = stage >= 2;
  const cape = stage >= 4;
  const crown = stage === 5;
  return `<svg class="companion-svg${happy ? ' is-happy' : ''}${gloomy ? ' is-gloomy' : ''}" data-stage="${stage}" viewBox="0 0 200 180" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <ellipse cx="100" cy="161" rx="47" ry="7" fill="#b9a6bd" opacity=".2"/>
    <g class="companion-sparkles" fill="#edbd67" stroke="#edbd67" stroke-linecap="round" stroke-width="3">
      <path d="M28 60v14m-7-7h14M171 88v14m-7-7h14"/>
      <circle cx="158" cy="40" r="3"/><circle cx="33" cy="120" r="2"/>
      ${cape ? '<path d="M25 93l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" stroke="none"/>' : ''}
      ${crown ? '<path d="M160 122l4 7 8 1-6 6 1 8-7-4-7 4 1-8-6-6 8-1Z" stroke="none"/>' : ''}
    </g>
    <g class="companion-body" stroke="#695562" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
      ${cape ? '<path d="M64 111Q44 132 43 150Q62 161 79 148Q100 164 121 148Q138 161 157 150Q154 128 136 111" fill="#c8b5e5"/><path d="M49 148Q62 157 77 146M123 146Q139 157 151 148" fill="none" stroke="#f5df9d"/>' : ''}
      <ellipse cx="77" cy="153" rx="14" ry="8" fill="#fff8ee"/>
      <ellipse cx="123" cy="153" rx="14" ry="8" fill="#fff8ee"/>
      <path d="M58 68Q42 47 55 39Q68 31 77 54Q99 44 123 54Q132 31 146 40Q158 49 142 70Q158 89 153 116Q152 151 101 154Q47 154 46 119Q41 90 58 68Z" fill="#fff8ee"/>
      <path d="M57 48q8-6 13 10M131 58q5-15 12-9" fill="none" stroke="#edc4cf" stroke-width="5"/>
      <path d="M84 55q2-12 12-11q-1 5 2 7q7-9 14-3" fill="#fff8ee"/>
      <ellipse cx="100" cy="135" rx="23" ry="12" fill="#f8e9df" stroke="none"/>
      <g class="companion-arm left"><path d="M52 112Q35 108 38 121Q40 131 55 129" fill="#fff8ee"/></g>
      <g class="companion-arm right"><path d="M148 112Q165 108 162 121Q160 131 145 129" fill="#fff8ee"/></g>
      <ellipse cx="66" cy="104" rx="10" ry="6" fill="#f3b7c7" stroke="none"/>
      <ellipse cx="134" cy="104" rx="10" ry="6" fill="#f3b7c7" stroke="none"/>
      ${gloomy ? '<path d="m72 90 14 3m28 0 14-3M94 109q6-5 12 0" fill="none"/><path d="M76 99h7m34 0h7" stroke-width="4"/><path d="M140 69v9m6-7v10m6-7v9" stroke="#9b91b0" stroke-width="2"/>' : happy
        ? '<path d="M73 94q6-10 12 0M115 94q6-10 12 0" fill="none"/><path d="M92 104q8 19 16 0Z" fill="#dc8f9f"/>'
        : '<g fill="#51444d" stroke="none"><ellipse cx="79" cy="94" rx="4.4" ry="6"/><ellipse cx="121" cy="94" rx="4.4" ry="6"/></g><g fill="white" stroke="none"><circle cx="80" cy="92" r="1.4"/><circle cx="122" cy="92" r="1.4"/></g><path d="M94 105q6 7 12 0" fill="none"/>'}
      ${ribbon ? '<path d="M97 124q-20-14-18 3q-1 15 19 4M103 124q20-14 18 3q1 15-19 4" fill="#e7a7bc"/><circle cx="100" cy="127" r="5" fill="#f2c4d3"/>' : ''}
      ${stage === 3 || stage === 4 ? '<path d="M75 50q-9-15 13-20q28-7 41 7q7 8-7 14Z" fill="#b7d7d1"/><path d="M101 30l4-7" stroke="#789e99"/><path d="M81 51q24-7 42-1" fill="none" stroke="#789e99"/>' : ''}
      ${cape ? '<path d="m100 136 3 5 6 1-4 4 1 6-6-3-6 3 1-6-4-4 6-1Z" fill="#f5d482" stroke-width="2"/>' : ''}
      ${crown ? '<path d="m76 49-5-25 18 12 11-20 11 20 18-12-5 25Z" fill="#f5d482"/><path d="M79 49h42" stroke="#d4a95e"/><path d="m100 33 4 5-4 5-4-5Z" fill="#e8a9bc" stroke="none"/><g fill="#f5d482" stroke-width="2"><circle cx="71" cy="23" r="3"/><circle cx="100" cy="15" r="3"/><circle cx="129" cy="23" r="3"/></g>' : ''}
    </g>
  </svg>`;
}

function renderDinosaur(level, happy, gloomy) {
  const stage = companionStage(level);
  const skin = gloomy ? '#8b9c98' : '#71b9a4';
  return `<svg class="companion-svg${happy ? ' is-happy' : ''}${gloomy ? ' is-gloomy' : ''}" data-stage="${stage}" data-kind="dino" viewBox="0 0 200 180" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse cx="105" cy="163" rx="56" ry="6" fill="#789b90" opacity=".18"/>
  <g class="companion-sparkles" stroke="#e8b451" stroke-width="3" stroke-linecap="round"><path d="M28 48v14m-7-7h14M168 44v14m-7-7h14"/></g>
  <g class="companion-body" stroke="#395b56" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <path d="M136 119q22 23 40 0q-2 44-48 31" fill="${skin}"/>
  <path d="m143 123 5-14 9 18 13-8-1 14" fill="#edc16a"/>
  <path d="m77 57-9-14 22 2 5-14 14 11 13-8 7 19" fill="#edc16a"/>
  <path d="M62 102Q44 99 43 79Q41 51 72 47Q111 37 135 60Q148 72 139 94Q156 118 140 147Q128 163 91 158Q66 153 68 125Z" fill="${skin}"/>
  <path d="M64 85Q62 65 83 62Q99 61 104 77Q112 97 98 111Q83 130 84 143Q104 155 128 145Q134 131 127 121" fill="#e7e6b7" stroke="none"/>
  <ellipse cx="90" cy="157" rx="18" ry="7" fill="${skin}"/><ellipse cx="132" cy="156" rx="15" ry="7" fill="${skin}"/>
  <path d="M79 158v3m8-3v4m37-5v3m8-3v3" stroke="#e7e6b7" stroke-width="3"/>
  <path d="M62 76h1m17-2h1" stroke-width="4"/>
  ${gloomy ? '<path d="m110 74 17 4m-15 5h9M52 94q13-6 26 0" fill="none"/>' : happy ? '<path d="M112 81q6-11 12 0" fill="none"/><path d="M51 92q23 26 38-4Z" fill="#b86b69"/><path d="m59 95 4 7 5-5" fill="#fff7dc" stroke-width="1.5"/>' : '<ellipse cx="118" cy="80" rx="5" ry="7" fill="#294a46" stroke="none"/><circle cx="119" cy="78" r="2" fill="white" stroke="none"/><path d="M51 92q17 10 34-1" fill="none"/>'}
  <ellipse cx="120" cy="96" rx="10" ry="5" fill="#dca88c" stroke="none"/>
  <g class="companion-arm right"><path d="M135 117q-19-8-18 4q0 8 14 9" fill="${skin}"/></g>
  <path d="M144 107h3m-2 6h4" stroke="#428d7b"/>
  ${stage>=2 ? '<path d="M72 115q27 12 62-5l-2 10q-24 12-56 4Z" fill="#e99567"/><path d="m111 123 9 18 8-16" fill="#e99567"/>' : ''}
  ${stage>=3 ? '<path d="m105 124 4 7 8 1-6 6 1 8-7-4-7 4 1-8-6-6 8-1Z" fill="#f3ce67" stroke-width="2"/>' : ''}
  ${stage>=4 ? '<path d="M121 51q25-17 32 7l-10 11" fill="#a9cee0"/><path d="m130 47 10-14 8 19" fill="#a9cee0"/>' : ''}
  ${stage===5 ? '<path d="m72 45-4-21 15 9 9-18 10 17 16-8-4 22Z" fill="#f3ce67"/><path d="m91 30 4 6-4 5-4-5Z" fill="#e99567" stroke="none"/>' : ''}
  </g></svg>`;
}

function renderDog(level, happy, gloomy) {
  const stage = companionStage(level);
  const mood = gloomy ? 'gloomy' : happy ? 'happy' : 'idle';
  // 写真の犬の顔つきを保ち、レベルの変化は写真を囲む飾りで示す。
  return `<div class="companion-dog ${happy ? 'is-happy' : ''}" data-kind="dog" data-stage="${stage}" aria-hidden="true"><div class="dog-portrait" data-mood="${mood}"></div>${stage>1 ? `<span class="dog-medal">${'★'.repeat(stage-1)}</span>` : ''}</div>`;
}
