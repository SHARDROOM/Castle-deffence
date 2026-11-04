// 게임 스크립트 버전 표시: index.html이 불러오는 로컬 스크립트(combat.js 등)에 ?v=<내용 해시>를 붙인다.
// 브라우저·GitHub Pages 캐시 때문에 새 index.html과 예전 armory.js가 섞여 로드되는 것을 막는다.
//
//   node tools/asset-version.js          지금 해시와 index.html의 표시가 맞는지 확인 (다르면 exit 1)
//   node tools/asset-version.js --write  index.html의 표시를 지금 해시로 갱신
//
// 해시는 로컬 스크립트들의 내용으로 계산하므로, 스크립트를 고치면 반드시 --write를 다시 돌린다.
// (tests/asset-version.test.js가 node --test에서 이를 검사한다.)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const TAG = /<script src="([\w-]+\.js)(?:\?v=([0-9a-f]+))?"><\/script>/g; // 로컬 스크립트만 (CDN 주소는 해당 안 됨)

function localScripts(html) {
  return [...html.matchAll(TAG)].map(m => ({ tag: m[0], file: m[1], v: m[2] || null }));
}
function contentHash(files) {
  const h = crypto.createHash('sha1');
  for (const f of files) { h.update(f + '\0'); h.update(fs.readFileSync(path.join(ROOT, f))); h.update('\0'); }
  return h.digest('hex').slice(0, 10);
}
function check() {
  const html = fs.readFileSync(INDEX, 'utf8'), scripts = localScripts(html);
  const want = contentHash(scripts.map(s => s.file));
  return { want, scripts, ok: scripts.length > 0 && scripts.every(s => s.v === want) };
}
function write() {
  let html = fs.readFileSync(INDEX, 'utf8');
  const want = contentHash(localScripts(html).map(s => s.file));
  html = html.replace(TAG, (m, file) => `<script src="${file}?v=${want}"></script>`);
  fs.writeFileSync(INDEX, html);
  return want;
}

module.exports = { check, write, contentHash, localScripts };

if (require.main === module) {
  if (process.argv.includes('--write')) { console.log('asset version', write()); }
  else {
    const r = check();
    if (r.ok) console.log('asset version OK', r.want);
    else { console.log('asset version out of date: run `node tools/asset-version.js --write`', r.want, r.scripts.map(s => s.file + '?v=' + s.v)); process.exit(1); }
  }
}
