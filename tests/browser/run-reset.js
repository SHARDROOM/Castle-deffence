// 새 판 리셋 회귀 검사 (브라우저).
//
// 같은 난수 시드·고정 프레임 시간으로 "새로 연 게임의 첫 판"과 "한 판을 하고 난 뒤의 두 번째 판"의
// 처음 N프레임을 기록해 비교한다. 리셋에서 빠진 상태가 있으면 두 기록이 달라진다.
// 첫 판에서는 웨이브 10(광폭화 보스가 엄폐물을 부숨)부터 시작해, 자동 조준으로 적을 쓰러뜨리고
// 레벨업·상점 구매·회복템 사용을 한 뒤 죽는다.
//
// 실행: node tests/browser/run-reset.js [카드 번호=0] [프레임 수=300]
//   Playwright가 필요하다 (npm i -D playwright). node --test에는 포함되지 않는다.
//   THREE_JS=<three.min.js r128 경로>를 주면 CDN 대신 그 파일을 쓴다 (오프라인 환경).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const repo = path.resolve(__dirname, '..', '..');
const [cardArg = '0', framesArg = '300', seedArg = '4242'] = process.argv.slice(2);
const three = process.env.THREE_JS ? fs.readFileSync(process.env.THREE_JS) : null;

async function record(mode) {

  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  if (three) await p.route('**/three.min.js', r => r.fulfill({ body: three, contentType: 'application/javascript' }));
  await p.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await p.addInitScript(([N, SEED]) => {
    let s = 0; const seed = v => { s = v >>> 0; };
    Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    seed(SEED);
    window.__rec = []; window.__frame = -1; window.__done = false; window.__fixed = false;
    const r6 = v => typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v;
    const PANELS = new Set(['levelUp', 'shop', 'settings']);
    const txt = id => { const el = document.getElementById(id); if (!el) return '';
      if (PANELS.has(id)) return el.className;
      if (id.startsWith('hit')) return el.className + '|' + (parseFloat(el.style.opacity) || 0);
      return el.textContent + '|' + el.className + '|' + el.style.cssText; };
    const hook = (name, fn) => { let M; Object.defineProperty(window, name, { configurable: true, get() { return M; }, set(v) { M = v; fn(v); } }); };
    hook('Waves', Wv => { const create = Wv.create; Wv.create = o => { const d = create(o); const start = d.start;
      d.start = en => { const c = start(en); if (!window.__run1Wave) return c; const w = window.__run1Wave; window.__run1Wave = 0; d.wave = w; return Wv.waveCommands(w, en, Math.random); }; return d; }; });
    hook('Defense', D => { const res = D.resolve; D.resolve = (a, d) => { const r = res(a, d); if (window.__die && r.landed) r.damage = 999; else if (window.__god) r.damage = 0; return r; }; });
    hook('Combat', v => {
      // 첫 판에서 상태를 쌓기 위한 자동 조준·큰 피해 (두 번째 판 기록 중에는 꺼짐)
      const ix = THREE.Raycaster.prototype.intersectObjects;
      THREE.Raycaster.prototype.intersectObjects = function (objs, rec) {
        if (window.__autoaim) { const t = objs.find(o => o.userData && o.userData.e && !o.userData.shield && !o.userData.head); if (t) return [{ object: t, point: t.getWorldPosition(new THREE.Vector3()), distance: 5 }]; }
        return ix.call(this, objs, rec);
      };
      const hit = v.hit; v.hit = (e, a, ctx) => hit(e, Object.assign({}, a, { base: a.base * (window.__boost || 1) }), ctx);
      const getDelta = THREE.Clock.prototype.getDelta;
      THREE.Clock.prototype.getDelta = function () { return window.__fixed ? 1 / 60 : getDelta.call(this); };
      let scene = null;
      const add = THREE.Object3D.prototype.add;
      THREE.Object3D.prototype.add = function (...a) { if (this.isScene && !scene) scene = this; return add.apply(this, a); };
      const snap = () => {
        if (!scene || window.__frame < 0 || window.__done) return;
        const seen = new Set(), list = [];
        scene.traverse(o => { const e = o.userData && o.userData.e; if (e && !seen.has(e)) { seen.add(e); list.push(e); } });
        let cam = null; scene.traverse(x => { if (x.isPerspectiveCamera && !cam) cam = x; });
        const cv = new THREE.Vector3(); if (cam) cam.getWorldPosition(cv);
        let meshes = 0; const top = []; scene.traverseVisible(() => meshes++);
        const path = o => { const n = []; let q = o; while (q && q !== scene) { n.push(q.type + (q.geometry ? '/' + q.geometry.type : '')); q = q.parent; } return n.slice(0, 4).join('<'); };
        scene.traverseVisible(o => { if (o !== scene) top.push(path(o)); });
        window.__rec.push({
          f: window.__frame,
          hud: ['hpFill', 'score', 'goldTxt', 'wave', 'left', 'ammoTxt', 'gunName', 'skillTxt', 'xpLv', 'xpFill', 'it_bandage', 'it_adren', 'it_medkit', 'scope', 'cross', 'vig', 'adrenFx', 'slowFx', 'bossBar', 'shopBtn', 'levelUp', 'shop', 'settings', 'hitTop', 'hitBottom', 'hitLeft', 'hitRight', 'reload', 'sideBtn'].map(txt),
          cam: [r6(cv.x), r6(cv.y), r6(cv.z)], meshes, top, fov: cam ? r6(cam.fov) : 0,
          e: list.map(e => [e.type, r6(e.g.position.x), r6(e.g.position.z), r6(e.hp), r6(e.yaw), r6(e.atkPh), r6(e.aimT), r6(e.rollT), r6(e.shoot), e.state || '']),
        });
        window.__frame++;
        if (window.__frame >= N) window.__done = true;
      };
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = cb => raf(t => { cb(t); snap(); });
    });
    // 기록할 판의 시작 버튼: 난수 재시드, 프레임 고정, 기록 시작
    document.addEventListener('click', ev => { if (ev.target && ev.target.id === 'goBtn' && window.__armRecord) { seed(SEED); window.__fixed = true; window.__frame = 0; } }, true);
  }, [+framesArg, +seedArg]);

  await p.goto('file://' + repo + '/index.html');
  await p.waitForTimeout(1200);
  const card = async () => { await (await p.$$('#cards > *'))[+cardArg].click(); };
  const sleep = ms => p.waitForTimeout(ms);
  if (mode === 'second') {
    await p.evaluate(() => { for (let i = 0; i < 5; i++) document.getElementById('gear').click(); }); // 테스트 모드: 골드로 상점 구매
    await sleep(200); await p.evaluate(() => document.getElementById('closeSet').click());
    await p.evaluate(() => { window.__run1Wave = 10; window.__god = true; });
    await p.click('#startBtn'); await sleep(300); await card(); await p.click('#goBtn'); await sleep(800);
    await sleep(25000); // 광폭화 보스가 돌진·도약하며 엄폐물을 부숨
    // 첫 판: 자동 조준으로 적을 쓰러뜨리며 레벨업 고르기, 상점에서 부품·회복템 구매, 아이템 사용
    await p.evaluate(() => { window.__autoaim = true; window.__boost = 1000; });
    const fire = type => p.evaluate(type => document.getElementById('fire').dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: 900, clientY: 400, bubbles: true })), type);
    const pickAug = () => p.evaluate(() => { const c = document.querySelector('#levelUp:not(.hide) #augCards > *'); if (!c) return false; c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); c.click(); return true; });
    for (let i = 0; i < 60; i++) {
      if (await p.evaluate(() => !document.getElementById('levelUp').classList.contains('hide'))) { await sleep(800); await pickAug(); continue; }
      await fire('pointerdown'); await sleep(200); await fire('pointerup');
      if (i === 20) { // 상점: 부품 사고 강화, 붕대 구매
        await p.evaluate(() => document.getElementById('shopBtn').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))); await sleep(500);
        const slot = await p.$('#slotLayer .slotBtn'); if (slot) { await slot.click(); await sleep(150); }
        const btns = await p.$$('#shopList .item button:not([disabled])'); if (btns[1]) { await btns[1].click(); await sleep(150); }
        const up = await p.$('#shopList button.up:not([disabled])'); if (up) { await up.click(); await sleep(150); }
        await p.evaluate(() => document.querySelector('.shopTabs button[data-tab="items"]').click()); await sleep(300);
        const row = await p.$('#itemsList .itemRow'); if (row) { await row.click(); await sleep(100); }
        await p.evaluate(() => document.getElementById('shopClose').click()); await sleep(300);
        await p.keyboard.press('Digit1'); // 붕대 사용 시작
      }
    }
    await p.evaluate(() => { window.__autoaim = false; window.__boost = 1; window.__god = false; window.__die = true; }); // 다음 피격에 죽음
    for (let i = 0; i < 150 && !(await p.evaluate(() => !document.getElementById('over').classList.contains('hide'))); i++) await sleep(200);
    console.log('run 1 over:', await p.evaluate(() => !document.getElementById('over').classList.contains('hide')), '| score', await p.$eval('#overText', el => el.textContent.slice(0, 60)));
    await p.evaluate(() => { window.__die = false; window.__armRecord = true; });
    await p.click('#againBtn'); await sleep(300); await card(); await p.click('#goBtn');
  } else {
    await p.evaluate(() => { for (let i = 0; i < 5; i++) document.getElementById('gear').click(); }); // 두 번째 판과 같은 조건 (테스트 모드)
    await sleep(200); await p.evaluate(() => document.getElementById('closeSet').click());
    await p.evaluate(() => { window.__armRecord = true; });
    await p.click('#startBtn'); await sleep(300); await card(); await p.click('#goBtn');
  }
  for (let i = 0; i < 300 && !(await p.evaluate(() => window.__done)); i++) await sleep(200);
  const rec = await p.evaluate(() => window.__rec);
  await b.close();
  if (errs.length) console.log(mode, 'page errors:', errs);
  return rec;
}

function compare(a, b) {
const keys = ['hpFill','score','goldTxt','wave','left','ammoTxt','gunName','skillTxt','xpLv','xpFill','it_bandage','it_adren','it_medkit','scope','cross','vig','adrenFx','slowFx','bossBar','shopBtn','levelUp','shop','settings','hitTop','hitBottom','hitLeft','hitRight','reload','sideBtn'];
const agg = {};
const note = (k, i, msg) => { if (!agg[k]) agg[k] = { first: i, n: 0, msg }; agg[k].n++; };
for (let i = 0; i < Math.min(a.length, b.length); i++) {
  const x = a[i], y = b[i];
  keys.forEach((k, j) => { if (x.hud[j] !== y.hud[j]) note(k, i, JSON.stringify(x.hud[j]).slice(0, 60) + ' vs ' + JSON.stringify(y.hud[j]).slice(0, 60)); });
  if (JSON.stringify(x.cam) !== JSON.stringify(y.cam)) note('cam', i, x.cam + ' vs ' + y.cam);
  if (x.fov !== y.fov) note('fov', i, x.fov + ' vs ' + y.fov);
  if (x.meshes !== y.meshes) note('meshes', i, x.meshes + ' vs ' + y.meshes);
  if (JSON.stringify(x.e) !== JSON.stringify(y.e)) note('enemies', i, x.e.length + ' vs ' + y.e.length);
}
const ks = Object.keys(agg);
if (!ks.length) console.log('OK: 두 번째 판이 첫 판과', Math.min(a.length, b.length), '프레임 동안 같아요');
for (const k of ks) console.log(`  ${k}: first frame ${agg[k].first}, ${agg[k].n} frames — ${agg[k].msg}`);
  return ks.length === 0;
}

(async () => {
  const fresh = await record('fresh');
  const second = await record('second');
  if (fresh.length < +framesArg || second.length < +framesArg) { console.log('기록이 모자라요', fresh.length, second.length); process.exit(2); }
  process.exit(compare(fresh, second) ? 0 : 1);
})();
