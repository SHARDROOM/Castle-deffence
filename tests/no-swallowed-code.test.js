// node --test: 줄 중간에 넣은 // 주석이 그 뒤의 코드를 삼키지 않았는지
// (레이피어 추가 때 패링 성공 소리·불꽃과 새 판 리셋 일부가 이렇게 주석 처리되어 동작하지 않았음)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const FILES = ['index.html', 'combat.js', 'defense.js', 'armory.js', 'waves.js', 'enemies.js'];
// 주석 안에 "; 이름(...);" 또는 "; 이름 = ...;" 같은 문장이 있으면 삼켜진 코드로 봄
const CODE_IN_COMMENT = /;\s*[A-Za-z_$][\w$.]*\s*(\([^)]*\)\s*;|=[^=>][^;]*;)/;

test('// 주석 안에 실행돼야 할 코드가 들어 있지 않다', () => {
  const bad = [];
  for (const f of FILES) {
    fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').forEach((line, i) => {
      const at = line.indexOf('//');
      if (at < 0 || /https?:$/.test(line.slice(0, at))) return;
      if (CODE_IN_COMMENT.test(line.slice(at + 2))) bad.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(bad, []);
});
