// 게임 파일 버전 표시
//  1) index.html이 불러오는 로컬 스크립트(combat.js 등)에 ?v=<스크립트 내용 해시>를 붙인다.
//     브라우저·GitHub Pages 캐시 때문에 새 index.html과 예전 armory.js가 섞여 로드되는 것을 막는다.
//  2) 화면 왼쪽 아래의 빌드 버전(#buildVer)을 "v날짜 · <게임 전체 해시>"로 적는다.
//     해시는 스크립트와 index.html(버전 표시 자리는 빼고)의 내용으로 계산하므로, 게임이 바뀌면 항상 바뀐다.
//
//   node tools/asset-version.js          표시가 지금 내용과 맞는지 확인 (다르면 exit 1)
//   node tools/asset-version.js --write  표시를 지금 내용으로 갱신 (날짜는 오늘, UTC)
//
// 게임 파일(index.html, 로컬 .js)을 고치면 반드시 --write를 다시 돌린다.
// (tests/asset-version.test.js가 node --test에서 이를 검사한다.)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const TAG = /<script src="([\w-]+\.js)(?:\?v=([0-9a-f]+))?"><\/script>/g; // 로컬 스크립트만 (CDN 주소는 해당 안 됨)
const VER = /<div id="buildVer" class="hud">([^<]*)<\/div>/;          // 화면 왼쪽 아래 빌드 버전

function localScripts(html) {
  return [...html.matchAll(TAG)].map(m => ({ tag: m[0], file: m[1], v: m[2] || null }));
}
function contentHash(files) {
  const h = crypto.createHash('sha1');
  for (const f of files) { h.update(f + '\0'); h.update(fs.readFileSync(path.join(ROOT, f))); h.update('\0'); }
  return h.digest('hex').slice(0, 10);
}
// 게임 전체 해시: 스크립트 + index.html (버전 표시 자리와 ?v= 값은 빼고 계산해서 자기 자신에 영향받지 않음)
function buildHash(html) {
  const norm = html.replace(TAG, (m, file) => `<script src="${file}"></script>`).replace(VER, '<div id="buildVer" class="hud"></div>');
  const h = crypto.createHash('sha1');
  h.update(norm);
  for (const s of localScripts(html)) { h.update(s.file + '\0'); h.update(fs.readFileSync(path.join(ROOT, s.file))); }
  return h.digest('hex').slice(0, 6);
}
function shownBuild(html) { const m = html.match(VER); return m ? m[1] : null; }
function check() {
  const html = fs.readFileSync(INDEX, 'utf8'), scripts = localScripts(html);
  const want = contentHash(scripts.map(s => s.file)), build = buildHash(html), shown = shownBuild(html);
  const scriptsOk = scripts.length > 0 && scripts.every(s => s.v === want);
  const buildOk = !!shown && shown.endsWith(' · ' + build);
  return { want, scripts, build, shown, scriptsOk, buildOk, ok: scriptsOk && buildOk };
}
function write(date = new Date()) {
  let html = fs.readFileSync(INDEX, 'utf8');
  const want = contentHash(localScripts(html).map(s => s.file));
  html = html.replace(TAG, (m, file) => `<script src="${file}?v=${want}"></script>`);
  const d = date.toISOString().slice(0, 10).replace(/-/g, '.');
  const build = buildHash(html);
  html = html.replace(VER, `<div id="buildVer" class="hud">v${d} · ${build}</div>`);
  fs.writeFileSync(INDEX, html);
  return { want, build: `v${d} · ${build}` };
}

module.exports = { check, write, contentHash, buildHash, localScripts, shownBuild };

if (require.main === module) {
  if (process.argv.includes('--write')) { const r = write(); console.log('scripts ?v=' + r.want, '| build', r.build); }
  else {
    const r = check();
    if (r.ok) console.log('asset version OK', r.want, '| build', r.shown);
    else { console.log('out of date: run `node tools/asset-version.js --write`', { scripts: r.scriptsOk, build: r.buildOk, shown: r.shown, want: r.build }); process.exit(1); }
  }
}
