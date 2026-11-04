// node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const Enemies = require('../enemies.js');

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

// three.js Vector3의 lerp를 흉내 낸 적의 이동 방향 벡터
const dirVec = () => {
  const v = new Enemies.Vec(0, 0, 0);
  v.lerp = function (o, a) { this.x += (o.x - this.x) * a; this.y += (o.y - this.y) * a; this.z += (o.z - this.z) * a; return this; };
  return v;
};
const DEF = {
  speed: { scale: 0.88 }, ranged: { scale: 1, shoots: true }, banner: { scale: 1.05 },
  dodger: { scale: 0.95, shoots: true, dodges: true },
};
const soldier = (type, o = {}) => Object.assign({
  type, def: DEF[type], r: 0.45, speed: 4, yaw: 0, dir: dirVec(),
  chk: 0.8, lx: 0, lz: 0, unstuck: 0, ux: 0, uz: 0, rollT: 0, rollCd: 5, rdx: 0, rdz: 0,
  aimT: 0, recoverT: 0, flagT: 0, strafeT: 5, strafeSign: 1, slowT: 0, buffT: 0,
  atkPh: 0, atkCd: 0, shoot: 5,
}, o);

// 장애물 없는 평지
const OPEN = {
  hasLOS: () => true,
  flowDir: (x, z, px, pz, out) => out.set(px - x, 0, pz - z).normalize(),
  retreatDir: (pos, toP) => toP.set(-toP.x, 0, -toP.z),
  freeAt: () => true,
  collide: () => {},
};
const moveCtx = (e, pos, player, o = {}) => Object.assign({
  pos, player, dist: Math.hypot(player.x - pos.x, player.z - pos.z), canSee: true, rng: () => 0.5,
  enemies: [e], posOf: () => pos, world: OPEN, fx: { rollStart() {} }, ARCH_MIN: 9, ARCH_MAX: 18,
}, o);

// ---------- 이동 ----------
test('근접병: 플레이어 쪽으로 다가간다', () => {
  const e = soldier('speed'), pos = { x: 0, z: 0 };
  Enemies.move(e, 0.1, moveCtx(e, pos, { x: 0, z: 10 }));
  assert.ok(pos.z > 0); close(pos.x, 0);
});

test('공격 범위 안이면 더 다가가지 않는다', () => {
  const e = soldier('speed'), pos = { x: 0, z: 0 };
  Enemies.move(e, 0.1, moveCtx(e, pos, { x: 0, z: 0.9 }));
  close(pos.z, 0);
});

test('둔화되면 40% 속도', () => {
  const run = slowT => { const e = soldier('speed', { slowT }), pos = { x: 0, z: 0 }; e.dir.set(0, 0, 1); Enemies.move(e, 0.1, moveCtx(e, pos, { x: 0, z: 10 })); return pos.z; };
  close(run(1) / run(0), 0.4);
});

test('궁수: 사거리 안이지만 9m보다 가까우면 물러난다', () => {
  const e = soldier('ranged'), pos = { x: 0, z: 0 };
  e.dir.set(0, 0, -1);
  Enemies.move(e, 0.1, moveCtx(e, pos, { x: 0, z: 5 }));
  assert.ok(pos.z < 0);
});

test('궁수: 적정 거리(9~18m)에서는 옆걸음', () => {
  const e = soldier('ranged'), pos = { x: 0, z: 0 };
  e.dir.set(1, 0, 0);
  Enemies.move(e, 0.1, moveCtx(e, pos, { x: 0, z: 12 }));
  assert.ok(Math.abs(pos.x) > 0); close(pos.z, 0, 1e-6);
});

test('궁수: 옆걸음 방향이 막혀 있으면 반대로', () => {
  const e = soldier('ranged', { strafeSign: 1 }), pos = { x: 0, z: 0 };
  Enemies.move(e, 0.1, moveCtx(e, pos, { x: 0, z: 12 }, { world: Object.assign({}, OPEN, { freeAt: () => false }) }));
  assert.equal(e.strafeSign, -1);
});

test('궁수: 조준 중에는 멈춰 선다', () => {
  const e = soldier('ranged', { aimT: 0.3 }), pos = { x: 0, z: 0 };
  Enemies.move(e, 0.1, moveCtx(e, pos, { x: 0, z: 30 }));
  close(pos.z, 0);
});

test('궁수: 사거리 밖이거나 안 보이면 다가간다', () => {
  const e = soldier('ranged'), pos = { x: 0, z: 0 };
  Enemies.move(e, 0.1, moveCtx(e, pos, { x: 0, z: 30 }));
  assert.ok(pos.z > 0);
  const e2 = soldier('ranged'), pos2 = { x: 0, z: 0 };
  Enemies.move(e2, 0.1, moveCtx(e2, pos2, { x: 0, z: 12 }, { canSee: false }));
  assert.ok(pos2.z > 0);
});

test('곧장 갈 수 없으면 플로우 필드를 따른다', () => {
  const e = soldier('speed'), pos = { x: 0, z: 0 };
  let used = false;
  const world = Object.assign({}, OPEN, { hasLOS: () => false, flowDir: (x, z, px, pz, out) => { used = true; return out.set(1, 0, 0).normalize(); } });
  Enemies.move(e, 0.1, moveCtx(e, pos, { x: 0, z: 10 }, { world }));
  assert.equal(used, true); assert.ok(pos.x > 0);
});

test('회피형: 구르기 쿨타임이 끝나면 옆으로 구르기 시작', () => {
  const e = soldier('dodger', { rollCd: 0.05 }), pos = { x: 0, z: 0 };
  const started = [];
  Enemies.move(e, 0.1, moveCtx(e, pos, { x: 0, z: 10 }, { fx: { rollStart: (en, d) => started.push(d) } }));
  assert.equal(e.rollT, Enemies.ROLL_TIME); assert.deepEqual(started, [10]);
  close(e.rdz, 0, 1e-9); // rng 0.5 → 정확히 옆(90도)
});

test('회피형: 구르는 동안 빠르게 이동, 끝나면 rollEnded', () => {
  const e = soldier('dodger', { rollT: 0.1, rdx: 1, rdz: 0 }), pos = { x: 0, z: 0 };
  let r = Enemies.move(e, 0.05, moveCtx(e, pos, { x: 0, z: 10 }));
  assert.equal(r.rolled, true); assert.equal(r.rollEnded, false); close(pos.x, 11 * 0.05);
  r = Enemies.move(e, 0.06, moveCtx(e, pos, { x: 0, z: 10 }));
  assert.equal(r.rollEnded, true);
});

test('구르기 자세: 시작 0, 중간에 반 바퀴·가장 낮음, 끝에 한 바퀴', () => {
  close(Enemies.rollPose(Enemies.ROLL_TIME).rotX, 0);
  const mid = Enemies.rollPose(Enemies.ROLL_TIME / 2); close(mid.rotX, Math.PI); close(mid.y, 0.5);
  close(Enemies.rollPose(0).rotX, Math.PI * 2);
});

test('0.8초 동안 거의 못 움직였으면 잠깐 옆으로 비켜감', () => {
  const e = soldier('speed', { chk: 0.05, lx: 0, lz: 0 }), pos = { x: 0, z: 0 };
  const world = Object.assign({}, OPEN, { collide: p => { p.x = 0; p.z = 0; } }); // 벽에 막혀 제자리
  Enemies.move(e, 0.1, moveCtx(e, pos, { x: 0, z: 10 }, { world }));
  assert.equal(e.unstuck, 0.45); assert.equal(e.chk, 0.8);
});

test('밀어내기: 겹친 적끼리 서로 떨어진다', () => {
  const a = soldier('speed'), b = soldier('speed'), pa = { x: 0, z: 0 }, pb = { x: 0.3, z: 0 };
  const posOf = o => o === a ? pa : pb;
  Enemies.move(a, 0, moveCtx(a, pa, { x: 0, z: 0.5 }, { enemies: [a, b], posOf }));
  assert.ok(pa.x < 0);
});

test('몸 방향은 플레이어 쪽으로 돌아간다 (조준 중에는 더 빠르게)', () => {
  const turn = aimT => { const e = soldier('ranged', { aimT, yaw: 0 }), pos = { x: 0, z: 0 }; Enemies.move(e, 0.05, moveCtx(e, pos, { x: 10, z: 0 })); return e.yaw; };
  assert.ok(turn(0) > 0); assert.ok(turn(0.3) > turn(0));
});

// ---------- 공격 ----------
const MA = { dur: 0.5, hit: 0.5, dmg: 10, cd: 1 };
const attackCtx = (o = {}) => {
  const calls = [];
  const fx = {};
  for (const k of ['swing', 'meleeHit', 'bow', 'fireBolt', 'crossbow']) fx[k] = (...a) => { calls.push([k, ...a.slice(1)]); };
  fx.aim = () => { calls.push(['aim']); return 0.1; };
  fx.fireArrow = () => { calls.push(['fireArrow']); return 0.2; };
  return Object.assign({ dist: 1, canSee: true, footY: 0, rng: () => 0, wave: 1, melee: MA, edm: 1.5, ARCH_MAX: 18, AIM_TIME: 0.65, fx, calls }, o);
};

test('근접: 범위에 들고 쿨타임이 끝나면 공격 준비 시작', () => {
  const e = soldier('speed'), ctx = attackCtx();
  Enemies.attack(e, 0.1, ctx);
  assert.equal(e.atkPh, .001); assert.deepEqual(ctx.calls, []);
});

test('근접: 타격 순간에 한 번 휘두르고, 범위 안이면 공격력 배율을 곱해 명중', () => {
  const e = soldier('speed', { atkPh: 0.45 }), ctx = attackCtx();
  Enemies.attack(e, 0.05, ctx);
  assert.deepEqual(ctx.calls, [['swing', 1], ['meleeHit', 15, 1]]);
});

test('근접: 타격 순간에 멀어졌거나 플레이어가 높이 떠 있으면 빗나감', () => {
  for (const o of [{ dist: 5 }, { footY: 3 }]) {
    const e = soldier('speed', { atkPh: 0.45 }), ctx = attackCtx(o);
    Enemies.attack(e, 0.05, ctx);
    assert.deepEqual(ctx.calls.map(c => c[0]), ['swing']);
  }
});

test('근접: 공격이 끝나면 쿨타임', () => {
  const e = soldier('speed', { atkPh: 0.99 }), ctx = attackCtx();
  Enemies.attack(e, 0.1, ctx);
  assert.equal(e.atkPh, 0); close(e.atkCd, MA.cd - 0.1);
});

test('궁수: 쏠 때가 되면 조준 시작 → 조준이 끝나면 발사', () => {
  const e = soldier('ranged', { shoot: 0 }), ctx = attackCtx({ dist: 12 });
  Enemies.attack(e, 0.01, ctx);
  assert.equal(e.aimT, 0.65); assert.equal(e.aimAng, 0.1);
  e.aimT = 0.01; const ctx2 = attackCtx({ dist: 12 });
  Enemies.attack(e, 0.02, ctx2);
  assert.deepEqual(ctx2.calls.map(c => c[0]), ['fireArrow', 'bow']);
  assert.equal(e.aimAng, 0.2); assert.equal(e.recoverT, 0.35);
});

test('궁수: 조준 중에 시야를 잃으면 취소', () => {
  const e = soldier('ranged', { aimT: 0.3 }), ctx = attackCtx({ dist: 12, canSee: false });
  Enemies.attack(e, 0.01, ctx);
  assert.equal(e.aimT, 0); assert.equal(e.shoot, 0.4);
});

test('사격 쿨타임: 웨이브가 오를수록 짧아지되 최소 1.2초', () => {
  const cdAt = wave => { const e = soldier('dodger', { shoot: 0 }); Enemies.attack(e, 0.01, attackCtx({ dist: 10, wave })); return e.shoot; };
  close(cdAt(1), 3.05); close(cdAt(20), 1.2);
});

test('회피형: 24m 안이고 보이면 손쇠뇌 발사, 구르는 중에는 안 쏨', () => {
  const e = soldier('dodger', { shoot: 0 }), ctx = attackCtx({ dist: 10 });
  Enemies.attack(e, 0.01, ctx);
  assert.deepEqual(ctx.calls.map(c => c[0]), ['fireBolt', 'crossbow']);
  const r = soldier('dodger', { shoot: 0, rollT: 0.2 }), ctx2 = attackCtx({ dist: 10 });
  Enemies.attack(r, 0.01, ctx2);
  assert.deepEqual(ctx2.calls, []);
});
