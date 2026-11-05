// node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const Waves = require('../waves.js');

// 고정 난수: 항상 0.99면 깃발 기수 판정(18%)은 실패, pool은 마지막 항목
const rng99 = () => 0.99;
const spawns = cmds => cmds.filter(c => c.type === 'spawn').map(c => c.kind);
const of = (cmds, type) => cmds.filter(c => c.type === type);
// 다음 웨이브 예약을 실행하고 그 명령들을 돌려줌
const advance = d => { d.waveCleared(); return d.tick(Waves.CLEAR_DELAY, []); };

// ---------- 웨이브 구성 ----------
test('일반 적 수: 3 + 2w, 보스 웨이브는 그 40% 올림', () => {
  const table = { 1: 5, 2: 7, 3: 9, 4: 11, 5: 6, 6: 15, 10: 10, 11: 25, 15: 14, 16: 35 };
  for (const [w, n] of Object.entries(table)) assert.equal(Waves.regularCount(+w), n, `wave ${w}`);
});

test('웨이브별 스폰 목록 (보스·비행선)', () => {
  const table = [
    // [wave, 일반 적 수, 보스, 비행선]
    [1, 5, 0, 0], [2, 7, 0, 0], [5, 6, 1, 0], [6, 15, 0, 0],
    [10, 10, 1, 0], [11, 25, 0, 1], [15, 14, 1, 1], [16, 35, 0, 2],
  ];
  for (const [w, n, boss, air] of table) {
    const cmds = Waves.waveCommands(w, [], rng99), sp = spawns(cmds);
    const isBoss = k => k === 'boss' || k === 'knight'; // 15웨이브 보스는 왕국의 마지막 기사
    assert.equal(sp.filter(k => !isBoss(k)).length, n, `wave ${w} regular`);
    assert.equal(sp.filter(isBoss).length, boss, `wave ${w} boss`);
    assert.equal(of(cmds, 'airship').length, air, `wave ${w} airship`);
  }
});

test('10웨이브부터 광폭화한 보스', () => {
  assert.deepEqual(of(Waves.waveCommands(5, [], rng99), 'bossRoar'), [{ type: 'bossRoar', enraged: false }]);
  assert.deepEqual(of(Waves.waveCommands(10, [], rng99), 'bossRoar'), [{ type: 'bossRoar', enraged: true }]);
});

test('명령 순서: waveStart가 스폰보다 먼저, waveBanner가 마지막', () => {
  const cmds = Waves.waveCommands(5, [], rng99);
  assert.deepEqual(cmds[0], { type: 'waveStart', wave: 5 });
  assert.deepEqual(cmds[cmds.length - 1], { type: 'waveBanner', wave: 5 });
});

test('적 종류 pool: 웨이브마다 늘어남', () => {
  // rng가 0이면 pool의 첫 항목, 0.99면 마지막 항목
  assert.equal(Waves.pickType(1, 0, () => 0.99), 'speed');
  assert.equal(Waves.pickType(2, 0, () => 0.99), 'speed');
  assert.equal(Waves.pickType(3, 0, () => 0.99), 'heavy');
  assert.equal(Waves.pickType(5, 0, () => 0.99), 'heavy');
  assert.equal(Waves.pickType(1, 0, () => 0), 'ranged');
});

test('깃발 기수: 6웨이브부터, 동시에 최대 2명', () => {
  const low = () => 0.1; // 18% 판정 성공
  assert.notEqual(Waves.pickType(5, 0, low), 'banner');
  assert.equal(Waves.pickType(6, 0, low), 'banner');
  assert.notEqual(Waves.pickType(6, 2, low), 'banner');
  // 한 웨이브 안에서도 이미 뽑은 기수를 센다
  const sp = spawns(Waves.waveCommands(6, [], low));
  assert.equal(sp.filter(k => k === 'banner').length, 2);
  // 이미 살아 있는 기수도 센다
  assert.equal(spawns(Waves.waveCommands(6, [{ type: 'banner' }], low)).filter(k => k === 'banner').length, 1);
});

test('웨이브 알림', () => {
  const texts = w => of(Waves.waveCommands(w, [], rng99), 'notice').map(n => n.text);
  assert.deepEqual(texts(1), []);
  assert.match(texts(2)[0], /암살자/);
  assert.match(texts(3)[0], /중갑기사/);
  assert.match(texts(5)[0], /^철의 거인/);
  assert.match(texts(6)[0], /깃발/);
  assert.match(texts(10)[0], /광폭화/);
  assert.deepEqual(texts(11).length, 1); assert.match(texts(11)[0], /비행선/);
  assert.deepEqual(texts(15).length, 1); assert.match(texts(15)[0], /왕국의 마지막 기사/);
  assert.match(texts(20)[0], /광폭화/);
});

// ---------- 진행 ----------
test('start: 웨이브 1부터', () => {
  const d = Waves.create({ rng: rng99 }), cmds = d.start([]);
  assert.equal(d.wave, 1); assert.equal(spawns(cmds).length, 5);
});

test('클리어 후 게임 시간 1.8초가 지나야 다음 웨이브', () => {
  const d = Waves.create({ rng: rng99 }); d.start([]);
  d.waveCleared();
  assert.deepEqual(d.tick(1.0, []), []); assert.equal(d.wave, 1);
  assert.deepEqual(d.tick(0.7, []), []); assert.equal(d.wave, 1);
  const cmds = d.tick(0.11, []);
  assert.equal(d.wave, 2); assert.deepEqual(cmds[0], { type: 'waveStart', wave: 2 }); assert.equal(spawns(cmds).length, 7);
  assert.deepEqual(d.tick(5, []), []); // 예약은 한 번만
});

test('tick이 불리지 않으면(일시정지) 다음 웨이브도 오지 않는다', () => {
  const d = Waves.create({ rng: rng99 }); d.start([]);
  d.waveCleared();
  // 일시정지 동안에는 index.html이 tick을 부르지 않는다. 다시 이어서 1.8초가 지나야 온다.
  assert.deepEqual(d.tick(1.79, []), []);
  assert.equal(advance(d)[0].wave, 2);
});

test('회귀: 클리어 직후 새 판을 시작하면 이전 판의 예약이 사라진다', () => {
  const d = Waves.create({ rng: rng99 }); d.start([]);
  d.waveCleared();       // 웨이브 1 클리어, 1.8초 뒤 예약
  d.tick(0.5, []);       // 0.5초 뒤 사망 → 새 판
  d.start([]);
  assert.equal(d.wave, 1);
  assert.deepEqual(d.tick(5, []), []); // 이전 예약이 새 판의 웨이브를 2로 올리지 않음
  assert.equal(d.wave, 1);
});

test('여러 웨이브를 이어서 진행', () => {
  const d = Waves.create({ rng: rng99 }); d.start([]);
  for (let w = 2; w <= 6; w++) assert.equal(advance(d)[0].wave, w);
  assert.equal(d.wave, 6);
});

// ---------- 도둑 ----------
test('도둑: 판 시작 60초 뒤 첫 판정, 1웨이브에는 안 나옴', () => {
  const d = Waves.create({ rng: () => 0 }); d.start([]);
  assert.deepEqual(d.tick(59, []), []);
  assert.deepEqual(d.tick(1, []), []); // 1웨이브: 최대 0명
  assert.equal(d.thiefTimer, 20);      // 다음 판정은 20 + rng*15초 뒤
});

test('도둑: 2웨이브부터 60% 확률, 동시에 1명 (8웨이브부터 2명)', () => {
  const at = (wave, enemies, r) => {
    const d = Waves.create({ rng: () => r }); d.start([]); d.wave = wave; d.thiefTimer = 0.01;
    return spawns(d.tick(0.02, enemies));
  };
  assert.deepEqual(at(2, [], 0), ['thief']);
  assert.deepEqual(at(2, [], 0.7), []);                    // 60% 판정 실패
  assert.deepEqual(at(2, [{ type: 'thief' }], 0), []);     // 이미 1명
  assert.deepEqual(at(8, [{ type: 'thief' }], 0), ['thief']);
  assert.deepEqual(at(8, [{ type: 'thief' }, { type: 'thief' }], 0), []);
});

test('도둑이 나오면 알림 명령도 함께', () => {
  const d = Waves.create({ rng: () => 0 }); d.start([]); d.wave = 3; d.thiefTimer = 0;
  assert.deepEqual(d.tick(0.01, []), [{ type: 'spawn', kind: 'thief' }, { type: 'thiefNotice' }]);
});

test('start(enemies, startWave): 테스트 모드에서 고른 웨이브부터 시작', () => {
  const d = Waves.create({ rng: () => 0.5 });
  const cmds = d.start([], 10);
  assert.equal(d.wave, 10);
  assert.equal(cmds.find(c => c.type === 'waveStart').wave, 10);
  assert.ok(cmds.some(c => c.type === 'waveBanner' && c.wave === 10));
  d.start([]); assert.equal(d.wave, 1); // 생략하면 1
  d.start([], 0); assert.equal(d.wave, 1); // 이상한 값은 1
});

test('15웨이브는 철의 거인 대신 왕국의 마지막 기사', () => {
  const rng = () => 0.99, kinds = w => Waves.waveCommands(w, [], rng).filter(c => c.type === 'spawn').map(c => c.kind);
  assert.ok(kinds(15).includes('knight')); assert.ok(!kinds(15).includes('boss'));
  assert.ok(kinds(10).includes('boss')); assert.ok(kinds(20).includes('boss')); assert.ok(!kinds(20).includes('knight'));
  const notes = Waves.waveCommands(15, [], rng).filter(c => c.type === 'notice').map(c => c.text);
  assert.ok(notes.some(t => t.includes('왕국의 마지막 기사'))); assert.ok(!notes.some(t => t.includes('철의 거인')));
});

test('보스 전용(테스트 모드): 보스 웨이브만, 일반 적·비행선·도둑 없이 보스만', () => {
  const d = Waves.create({ rng: () => 0 });
  const spawns = cmds => cmds.filter(c => c.type === 'spawn' || c.type === 'airship').map(c => c.kind || c.type);
  let cmds = d.start([], 12, { bossOnly: true });
  assert.equal(d.wave, 15); assert.deepEqual(spawns(cmds), ['knight']); // 12 → 다음 보스 웨이브 15
  assert.ok(cmds.some(c => c.type === 'waveBanner' && c.wave === 15));
  assert.deepEqual(d.tick(500, []), []); // 도둑 없음
  d.waveCleared(); cmds = d.tick(Waves.CLEAR_DELAY + .01, []);
  assert.equal(d.wave, 20); assert.deepEqual(spawns(cmds), ['boss']); // 비행선(16웨이브부터)도 없음
  d.start([], 10, { bossOnly: true }); assert.equal(d.wave, 10); // 보스 웨이브는 그대로
  d.start([], 1, { bossOnly: true }); assert.equal(d.wave, 5);
  d.start([], 3); assert.equal(d.wave, 3); assert.equal(d.bossOnly, false); // 옵션 없으면 평소대로
  assert.ok(d.start([], 3).some(c => c.type === 'spawn' && c.kind !== 'boss'));
});

test('15웨이브: 기사가 먼저 혼자 나와 등장 연출, 나머지 적은 ENTRANCE초 뒤에', () => {
  const d = Waves.create({ rng: () => 0.5 });
  const cmds = d.start([], 15), types = cmds.map(c => c.type + (c.kind ? ':' + c.kind : ''));
  assert.deepEqual(cmds.filter(c => c.type === 'spawn').map(c => c.kind), ['knight']);
  assert.ok(!cmds.some(c => c.type === 'airship'));
  assert.equal(types.indexOf('bossEntrance'), types.indexOf('spawn:knight') + 1);
  assert.ok(types.indexOf('waveStart') < types.indexOf('spawn:knight'));
  d.waveCleared(); assert.equal(d.nextWaveIn, null); // 나머지가 나오기 전엔 클리어가 아님
  assert.deepEqual(d.tick(Waves.ENTRANCE - .1, []), []);
  const later = d.tick(.2, []);
  assert.equal(later.filter(c => c.type === 'spawn').length, Waves.regularCount(15));
  assert.equal(later.filter(c => c.type === 'airship').length, Waves.airshipCount(15));
  assert.deepEqual(d.tick(5, []), []); // 한 번만
  // 다른 보스 웨이브는 그대로 한꺼번에
  const c10 = Waves.create({ rng: () => 0.5 }).start([], 10);
  assert.ok(c10.filter(c => c.type === 'spawn').length > 1); assert.ok(!c10.some(c => c.type === 'bossEntrance'));
});
