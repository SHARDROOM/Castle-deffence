// node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const Combat = require('../combat.js');

// ---------- 테스트용 적·상황 ----------
const enemy = (o = {}) => Object.assign({
  type: 'heavy', hp: 100, def: { xp: 10, score: 5 }, g: { position: { x: 0, z: 0 } }, yaw: 0,
}, o);
// 방패를 앞(+z)으로 든 보스. yaw = 0이면 +z 쪽 공격이 정면
const boss = (o = {}) => enemy(Object.assign({ type: 'boss', boss: true, state: 'walk', hp: 1000 }, o));
const FRONT = { x: 0, z: 5 }, BACK = { x: 0, z: -5 };

const ctxFor = (enemies, o = {}) => Object.assign({
  enemies, dmgMul: 1.5, wave: 3, weaponKey: 'rifle', special: false,
  crave: false, craveMul: 1, playing: true, killSkill: 4, bloodRage: false,
  pickupCount: 0, cellFree: () => true, rng: () => 0.99,
}, o);
const hit1 = (e, base, kind, from, o) => Combat.hit(e, { base, kind, from }, ctxFor([e], o));
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

// ---------- 정책표: 리팩터 전 호출부의 식과 같은 값 ----------
test('정책표가 리팩터 전 피해 식과 같은 값을 낸다', () => {
  const M = 1.5; // dmgMul
  const cases = [
    // [설명, 적, base, kind, from, 리팩터 전 식]
    ['검기: 일반 적', enemy(), 25, 'wave', FRONT, 25 * M],
    ['검기: 보스 방패 정면', boss(), 25, 'wave', FRONT, 25 * M * .5],
    ['검기: 보스 등 뒤', boss(), 25, 'wave', BACK, 25 * M],
    ['검: 광폭화 보스 방패 정면', boss({ enraged: true }), 7, 'slash', FRONT, 7 * M * .3],
    ['레이피어 찌르기: 보스 방패 정면', boss(), 1.8, 'thrust', FRONT, 1.8 * M * .5],
    ['화염: 보스 방패 정면은 절반', boss({ enraged: true }), 2, 'flame', FRONT, 2 * M * .5],
    ['헬기: 보스 방패 정면', boss(), 9, 'heli', FRONT, 9 * M * .5],
    ['처형: 보스 3배', boss(), 4, 'exec', FRONT, 4 * M * 3],
    ['처형: 일반 적', enemy(), 8, 'exec', null, 8 * M],
    ['처형 주변 피해: 보스 방패 정면', boss(), 4, 'execSplash', FRONT, 4 * M * .5],
    ['보스 처형: 방패 무시', boss(), 12, 'bossExec', FRONT, 12 * M],
    ['총알: 방패 판정은 mesh가 하므로 없음', boss(), 10, 'bullet', FRONT, 10 * M],
    ['도탄', enemy(), 20, 'ricochet', null, 20 * M],
    ['자동 헤드샷: 방패 무시', boss(), 8, 'headshot', FRONT, 8 * M],
    ['되돌린 화살', boss(), 6, 'arrow', FRONT, 6 * M],
    ['화상: dmgMul 없음', enemy(), .5, 'burn', null, .5],
    ['반사탄: dmgMul은 이미 반영', enemy(), 9, 'reflect', null, 9],
    ['비행선 격추', enemy(), 99999, 'instakill', null, 99999],
  ];
  for (const [name, e, base, kind, from, expected] of cases) {
    const { dealt } = Combat.damageOf(e, { base, kind, from }, { dmgMul: M });
    close(dealt, expected, name);
  }
});

test('방패 상태가 아니면 정면이어도 막히지 않는다', () => {
  const r = Combat.damageOf(boss({ state: 'stun' }), { base: 10, kind: 'slash', from: FRONT }, { dmgMul: 1 });
  assert.equal(r.shielded, false); close(r.dealt, 10);
});

test('보스가 아니면 방패 상태 이름이어도 방패 판정을 하지 않는다', () => {
  const r = Combat.damageOf(enemy({ state: 'walk' }), { base: 10, kind: 'slash', from: FRONT }, { dmgMul: 1 });
  assert.equal(r.shielded, false);
});

test('알 수 없는 kind는 바로 오류', () => {
  assert.throws(() => hit1(enemy(), 1, 'laser'), /Unknown attack kind/);
});

// ---------- hit: 적용과 깜빡임·갈망 ----------
test('목록에 없는 적은 적용하지 않는다', () => {
  const e = enemy();
  const r = Combat.hit(e, { base: 10, kind: 'slash' }, ctxFor([]));
  assert.equal(r.applied, false); assert.equal(e.hp, 100);
});

test('hp를 깎고 피격 깜빡임을 준다', () => {
  const e = enemy(); const r = hit1(e, 10, 'slash');
  assert.equal(r.applied, true); close(e.hp, 85); assert.equal(e.flash, .09); assert.equal(r.killed, false);
});

test('화상·화염은 깜빡임도 갈망 회복도 없다', () => {
  for (const kind of ['burn', 'flame']) {
    const e = enemy(); const r = hit1(e, 1, kind, null, { crave: true });
    assert.equal(e.flash, undefined, kind); assert.equal(r.heal, 0, kind);
  }
});

test('갈망: 맞히면 0.6, 처치하면 5 더 (craveMul 배)', () => {
  close(hit1(enemy(), 1, 'slash', null, { crave: true, craveMul: 2 }).heal, 1.2);
  close(hit1(enemy({ hp: 1 }), 10, 'slash', null, { crave: true, craveMul: 2 }).heal, 11.2);
});

test('갈망은 플레이 중일 때만', () => {
  assert.equal(hit1(enemy(), 1, 'slash', null, { crave: true, playing: false }).heal, 0);
});

// ---------- 처치 보상 ----------
test('처치 보상: 점수 = score × wave, 골드 = 종류별', () => {
  const k = hit1(enemy({ hp: 1 }), 10, 'slash').kill;
  assert.equal(k.score, 15); assert.equal(k.xp, 10); assert.equal(k.gold, 18); assert.equal(k.skill, 4);
});

test('일본도로 처치하면 XP 1.5배 (반올림)', () => {
  assert.equal(hit1(enemy({ hp: 1, def: { xp: 7, score: 1 } }), 10, 'slash', null, { weaponKey: 'sword' }).kill.xp, 11);
});

test('검기로 처치하면 스킬 게이지 0', () => {
  assert.equal(hit1(enemy({ hp: 1 }), 10, 'wave').kill.skill, 0);
});

test('보급 무기를 들고 처치하면 스킬 게이지 0', () => {
  assert.equal(hit1(enemy({ hp: 1 }), 10, 'slash', null, { special: true }).kill.skill, 0);
});

test('도둑 처치 골드 = 훔친 골드 + 60 + 10·wave', () => {
  assert.equal(hit1(enemy({ hp: 1, type: 'thief', stolen: 40 }), 10, 'slash').kill.gold, 40 + 60 + 30);
});

test('표에 없는 종류의 골드는 5', () => {
  assert.equal(hit1(enemy({ hp: 1, type: 'soldier' }), 10, 'slash').kill.gold, 5);
});

test('보급품 드롭: rng < 0.02, 보급품 2개 미만, 빈 칸, 일본도 아님', () => {
  const drop = o => hit1(enemy({ hp: 1 }), 10, 'slash', null, Object.assign({ rng: () => 0 }, o)).kill.drop;
  assert.equal(drop({}), true);
  assert.equal(drop({ rng: () => 0.5 }), false);
  assert.equal(drop({ pickupCount: 2 }), false);
  assert.equal(drop({ cellFree: () => false }), false);
  assert.equal(drop({ weaponKey: 'sword' }), false);
});

test('보스 처치: boss 표시, 일본도가 아니면 보스 보급품', () => {
  const k = hit1(boss({ hp: 1 }), 10, 'bossExec').kill;
  assert.equal(k.boss, true); assert.equal(k.bossDrop, true); assert.equal(k.gold, 150);
  assert.equal(hit1(boss({ hp: 1 }), 10, 'bossExec', null, { weaponKey: 'sword' }).kill.bossDrop, false);
});

test('피의 광분 업그레이드가 있으면 rage', () => {
  assert.equal(hit1(enemy({ hp: 1 }), 10, 'slash', null, { bloodRage: true }).kill.rage, true);
});

test('비행선: 보상은 즉시, 이미 추락 중이면 보상 없음', () => {
  const k = hit1(enemy({ hp: 1, airship: true }), 10, 'bullet').kill;
  assert.equal(k.airship, true); assert.equal(k.gold, 60); assert.equal(k.skill, 4);
  const r = hit1(enemy({ hp: 1, airship: true, dying: true }), 10, 'bullet');
  assert.equal(r.killed, true); assert.equal(r.kill, null);
});

// ---------- 웨이브 클리어 ----------
test('도둑을 뺀 마지막 적을 처치하면 waveCleared', () => {
  const last = enemy({ hp: 1 }), thief = enemy({ type: 'thief' });
  assert.equal(Combat.hit(last, { base: 10, kind: 'slash' }, ctxFor([last, thief])).kill.waveCleared, true);
});

test('다른 적이 남아 있으면 waveCleared 아님', () => {
  const a = enemy({ hp: 1 }), b = enemy();
  assert.equal(Combat.hit(a, { base: 10, kind: 'slash' }, ctxFor([a, b])).kill.waveCleared, false);
});

test('도둑 처치는 웨이브 클리어를 일으키지 않는다', () => {
  const t = enemy({ hp: 1, type: 'thief' });
  assert.equal(hit1(t, 10, 'slash').kill.waveCleared, false);
});

test('isWaveCleared는 제거된 적이 배열에 있든 없든 같다', () => {
  const a = enemy(), thief = enemy({ type: 'thief' });
  assert.equal(Combat.isWaveCleared([a, thief], a), true);
  assert.equal(Combat.isWaveCleared([thief], a), true);
});

// ---------- 대상 프로필 ----------
test('대상 프로필: 리팩터 전 조건 그대로', () => {
  const rolling = enemy({ rollT: 1 }), airship = enemy({ airship: true }), dropping = enemy({ dropY: 3 }), plain = enemy();
  const table = {
    //        plain rolling airship dropping
    melee: [true, false, false, false],
    aimed: [true, true, false, false],
    sweep: [true, false, false, true],
    ray: [true, false, true, true],
    blunt: [true, true, false, true],
  };
  for (const [profile, expected] of Object.entries(table)) {
    assert.deepEqual([plain, rolling, airship, dropping].map(e => Combat.targetable(e, profile)), expected, profile);
  }
  assert.throws(() => Combat.targetable(plain, 'nope'), /Unknown target profile/);
});

// ---------- 처형 중에는 죽지 않음 ----------
test('처형 중인 적은 마지막 일격 전에는 hp 1 아래로 내려가지 않는다', () => {
  const e = enemy({ hp: 5 });
  const r = hit1(e, 10, 'exec', null, { execTarget: e });
  assert.equal(e.hp, 1); assert.equal(r.killed, false); assert.equal(r.kill, null);
  hit1(e, 10, 'bullet', null, { execTarget: e }); // 다른 공격도 마찬가지
  assert.equal(e.hp, 1);
});

test('처형의 마지막 일격은 처치할 수 있다', () => {
  const e = enemy({ hp: 1 });
  const r = Combat.hit(e, { base: 10, kind: 'exec', finisher: true }, ctxFor([e], { execTarget: e }));
  assert.equal(r.killed, true); assert.ok(r.kill);
});

test('처형 대상이 아닌 적은 평소처럼 죽는다', () => {
  const e = enemy({ hp: 1 }), other = enemy();
  assert.equal(hit1(e, 10, 'execSplash', null, { execTarget: other }).killed, true);
});
