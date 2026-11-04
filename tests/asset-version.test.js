// node --test: index.html의 스크립트 버전(?v=)과 화면 빌드 버전이 지금 게임 파일 내용과 맞는지
const test = require('node:test');
const assert = require('node:assert/strict');
const AV = require('../tools/asset-version.js');

test('로컬 스크립트마다 ?v=<내용 해시>가 붙어 있고, 지금 내용과 맞는다 (다르면 node tools/asset-version.js --write)', () => {
  const r = AV.check();
  assert.deepEqual(r.scripts.map(s => s.file), ['combat.js', 'defense.js', 'armory.js', 'waves.js', 'enemies.js']);
  for (const s of r.scripts) assert.equal(s.v, r.want, `${s.file}?v=${s.v} — node tools/asset-version.js --write 를 실행하세요`);
});

test('화면 왼쪽 아래 빌드 버전이 지금 게임 전체(index.html + 스크립트) 해시로 끝난다', () => {
  const r = AV.check();
  assert.match(r.shown || '', /^v\d{4}\.\d{2}\.\d{2} · [0-9a-f]{6}$/);
  assert.ok(r.buildOk, `빌드 버전 ${r.shown}, 지금 해시 ${r.build} — node tools/asset-version.js --write 를 실행하세요`);
});
