// node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const Defense = require('../defense.js');

// 플레이어는 원점. 아무 방어 상태도 없음
const def = (o = {}) => Object.assign({
  x: 0, z: 0, rollT: 0, inExec: false, adrenT: 0, guarding: false, parryT: 0, parryRange: 6, parryPow: 100,
}, o);
const ENEMY = { r: 1 };
const atk = (kind, o = {}) => Object.assign({ dmg: 10, kind, from: { x: 0, z: 3 }, src: ENEMY, srcR: 1 }, o);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);
const PARRY = { parryT: .3 }, GUARD = { guarding: true }, ROLL = { rollT: .2 }, EXEC = { inExec: true };

// ---------- 기본 판정 (보스 근접: 리팩터 전 hurt 그대로) ----------
test('아무 방어도 없으면 그대로 맞는다', () => {
  const r = Defense.resolve(atk('bossMelee'), def());
  assert.equal(r.outcome, 'hit'); assert.equal(r.damage, 10); assert.equal(r.landed, true); assert.equal(r.fx, 'heavy');
});

test('구르는 중에는 피하고, 처형 중에는 무시된다', () => {
  assert.equal(Defense.resolve(atk('bossMelee'), def(ROLL)).outcome, 'dodged');
  assert.equal(Defense.resolve(atk('bossMelee'), def(EXEC)).outcome, 'immune');
  assert.equal(Defense.resolve(atk('bossMelee'), def(EXEC)).landed, false);
});

test('아드레날린은 받는 피해 30% 감소', () => {
  close(Defense.resolve(atk('bossMelee'), def({ adrenT: 1 })).damage, 7);
});

test('가드는 패리 강도 100당 30% 감소, 막은 양은 guardBlocked', () => {
  const r = Defense.resolve(atk('bossMelee'), def(GUARD));
  assert.equal(r.outcome, 'guarded'); close(r.damage, 7); close(r.guardBlocked, 3); assert.equal(r.landed, true);
});

test('가드 감소율: 최소 5%, 최대 60%, 강도 0은 100으로', () => {
  close(Defense.guardReduction(100), .3);
  close(Defense.guardReduction(500), .6);
  close(Defense.guardReduction(-40), .05);
  close(Defense.guardReduction(0), .3);
});

test('아드레날린은 가드 다음에 적용된다 (막은 양·반격 위력은 그대로)', () => {
  const r = Defense.resolve(atk('bossMelee'), def(Object.assign({ adrenT: 1 }, GUARD)));
  close(r.guardBlocked, 3); close(r.damage, 7 * .7);
});

test('지키는 자 + 대검(guardResist)으로 가드하면 넉백·둔화를 버팀, 다른 조합은 그대로', () => {
  const resist = Defense.resolve(atk('bossMelee'), def(Object.assign({ guardResist: true }, GUARD)));
  assert.equal(resist.landed, true); assert.equal(resist.resistDebuff, true); close(resist.damage, 7);
  assert.equal(Defense.resolve(atk('bossMelee'), def(GUARD)).resistDebuff, false);
  // 가드하지 않으면 조합이어도 버티지 못함
  assert.equal(Defense.resolve(atk('bossMelee'), def({ guardResist: true })).resistDebuff, false);
});

test('가드는 패리 불가 공격도 줄인다', () => {
  assert.equal(Defense.resolve(atk('bossAoe'), def(GUARD)).outcome, 'guarded');
});

test('가드가 패리보다 먼저다', () => {
  assert.equal(Defense.resolve(atk('bossMelee'), def(Object.assign({}, GUARD, PARRY))).outcome, 'guarded');
});

test('패리 창 안·사거리 안이면 패리, 공격자가 비틀거릴 대상', () => {
  const r = Defense.resolve(atk('bossMelee'), def(PARRY));
  assert.equal(r.outcome, 'parried'); assert.equal(r.damage, 0); assert.equal(r.landed, false); assert.equal(r.parryTarget, ENEMY);
});

test('보스 근접 패리 사거리 = 거리 − 공격자 반지름', () => {
  // 거리 7, 반지름 1 → 6 ≤ 6 이라 패리
  assert.equal(Defense.resolve(atk('bossMelee', { from: { x: 0, z: 7 } }), def(PARRY)).outcome, 'parried');
  // 거리 7.5 → 6.5 > 6 이라 그대로 맞음 (감소 없음)
  const r = Defense.resolve(atk('bossMelee', { from: { x: 0, z: 7.5 } }), def(PARRY));
  assert.equal(r.outcome, 'hit'); assert.equal(r.damage, 10);
});

test('패리 불가 공격(도약·발구르기)은 패리 창이어도 맞는다', () => {
  assert.equal(Defense.resolve(atk('bossAoe'), def(PARRY)).outcome, 'hit');
});

test('부분 패리: 패리 강도가 pow보다 낮으면 패리되지만 60% 피해', () => {
  const r = Defense.resolve(atk('bossMelee', { pow: 150 }), def(PARRY));
  assert.equal(r.outcome, 'parried'); assert.equal(r.parried, true); close(r.damage, 6); assert.equal(r.landed, true);
  assert.equal(Defense.resolve(atk('bossMelee', { pow: 100 }), def(PARRY)).damage, 0);
});

// ---------- 병사 근접: 패리를 먼저 본다 ----------
test('병사 근접: 구르는 중에는 패리하지 않고 피함', () => {
  const r = Defense.resolve(atk('soldierMelee', { dist: 2 }), def(Object.assign({}, PARRY, ROLL)));
  assert.equal(r.outcome, 'dodged'); assert.equal(r.parried, false);
});

test('병사 근접: 사거리 안이면 처형 중에도 패리', () => {
  const r = Defense.resolve(atk('soldierMelee', { dist: 2 }), def(Object.assign({}, PARRY, EXEC)));
  assert.equal(r.outcome, 'parried'); assert.equal(r.parryTarget, ENEMY);
});

test('병사 근접: 미리 잰 dist를 쓴다', () => {
  // from으로는 거리 3이지만 dist 8 → 7 > 6 이라 패리 실패, 그대로 맞음
  const r = Defense.resolve(atk('soldierMelee', { dist: 8 }), def(PARRY));
  assert.equal(r.outcome, 'hit'); assert.equal(r.fx, 'melee');
});

test('병사 근접: 가드 중이면 패리 대신 가드', () => {
  assert.equal(Defense.resolve(atk('soldierMelee', { dist: 2 }), def(Object.assign({}, PARRY, GUARD))).outcome, 'guarded');
});

// ---------- 화살 ----------
test('화살: 구르면 회피 표시, 화살은 계속 날아감', () => {
  const r = Defense.resolve(atk('arrow'), def(Object.assign({}, ROLL, PARRY)));
  assert.equal(r.outcome, 'dodged'); assert.equal(r.showDodge, true); assert.equal(r.returnProjectile, false);
});

test('화살: 패리를 누른 순간 사거리 안이었으면 되돌림 (쏜 적과의 거리는 무관), 비틀거릴 적은 없음', () => {
  const r = Defense.resolve(atk('arrow', { from: { x: 0, z: 50 }, inParryRange: true }), def(PARRY));
  assert.equal(r.outcome, 'parried'); assert.equal(r.returnProjectile, true); assert.equal(r.parryTarget, null);
});

test('화살: 너무 일찍 눌러서(사거리 밖) 패리 창이어도 그대로 맞음', () => {
  const r = Defense.resolve(atk('arrow', { inParryRange: false }), def(PARRY));
  assert.equal(r.outcome, 'hit'); assert.equal(r.returnProjectile, false); close(r.damage, 10);
});

test('화살: 가드하면 되돌리면서 줄어든 피해를 받음', () => {
  const r = Defense.resolve(atk('arrow'), def(GUARD));
  assert.equal(r.outcome, 'guarded'); assert.equal(r.returnProjectile, true); close(r.damage, 7);
});

test('화살: 처형 중에 패리 창이면 되돌리기만 (피해 없음)', () => {
  const r = Defense.resolve(atk('arrow'), def(Object.assign({}, EXEC, GUARD)));
  assert.equal(r.outcome, 'immune'); assert.equal(r.returnProjectile, true);
});

// ---------- 반사탄 ----------
test('반사탄: 구르는 중에는 패리·가드하지 않고 피함 (되돌리지도 않음)', () => {
  for (const extra of [PARRY, GUARD]) {
    const r = Defense.resolve(atk('bullet', { canReturn: true, inParryRange: true }), def(Object.assign({}, ROLL, extra)));
    assert.equal(r.outcome, 'dodged'); assert.equal(r.returnProjectile, false); assert.equal(r.landed, false);
  }
});

test('반사탄: 보스가 살아 있고 누른 순간 사거리 안이었으면 패리로 되돌림', () => {
  const r = Defense.resolve(atk('bullet', { canReturn: true, inParryRange: true }), def(PARRY));
  assert.equal(r.outcome, 'parried'); assert.equal(r.returnProjectile, true);
  assert.equal(Defense.resolve(atk('bullet', { canReturn: true, inParryRange: false }), def(PARRY)).outcome, 'hit');
});

test('반사탄: 가드는 사거리와 관계없이 되돌리며 줄어든 피해를 받음', () => {
  const r = Defense.resolve(atk('bullet', { canReturn: true, inParryRange: false }), def(GUARD));
  assert.equal(r.outcome, 'guarded'); assert.equal(r.returnProjectile, true); close(r.damage, 7);
});

test('반사탄: 보스가 없으면 되돌리지 않고, 사거리 안 패리면 그 자리에서 패리', () => {
  const r = Defense.resolve(atk('bullet', { canReturn: false, src: undefined, inParryRange: true }), def(PARRY));
  assert.equal(r.outcome, 'parried'); assert.equal(r.returnProjectile, false); assert.equal(r.parryTarget, null);
});

test('반사탄: 구르면 회피 (회피 표시는 없음)', () => {
  const r = Defense.resolve(atk('bullet', { canReturn: true }), def(ROLL));
  assert.equal(r.outcome, 'dodged'); assert.equal(r.showDodge, false);
});

test('알 수 없는 kind는 바로 오류', () => {
  assert.throws(() => Defense.resolve(atk('laser'), def()), /Unknown attack kind/);
});

// ---------- 피격 방향 ----------
test('피격 방향: yaw 0이면 −z가 앞, +x가 오른쪽', () => {
  const P = { x: 0, z: 0 };
  assert.deepEqual(Defense.hitDirection({ x: 0, z: -5 }, P, 0), { top: 1, bottom: 0, right: 0, left: 0 });
  assert.deepEqual(Defense.hitDirection({ x: 0, z: 5 }, P, 0), { top: 0, bottom: 1, right: 0, left: 0 });
  assert.deepEqual(Defense.hitDirection({ x: 5, z: 0 }, P, 0), { top: 0, bottom: 0, right: 1, left: 0 });
  const d = Defense.hitDirection({ x: 0, z: -5 }, P, Math.PI / 2); // 왼쪽으로 90도 돌면 원래 앞은 오른쪽
  close(d.right, 1); close(d.top, 0);
});
