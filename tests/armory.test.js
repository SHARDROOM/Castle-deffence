// node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const Armory = require('../armory.js');

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);
const rich = (gold = 10000) => { const a = Armory.create(); a.gold = gold; return a; };

// ---------- 초기화 ----------
test('새 무기고: 골드 0, 무기 5종의 빈 장비, 회복템 0개', () => {
  const a = Armory.create();
  assert.equal(a.gold, 0);
  assert.deepEqual(Object.keys(a.gear).sort(), ['pistol', 'rifle', 'shotgun', 'sniper', 'sword']);
  assert.deepEqual(a.inv, { bandage: 0, adren: 0, medkit: 0 });
});

test('resetWallet: 테스트 모드면 골드 10000, 회복템은 0', () => {
  const a = rich(); a.inv.medkit = 3;
  a.resetWallet(true); assert.equal(a.gold, 10000); assert.equal(a.inv.medkit, 0);
  a.resetWallet(false); assert.equal(a.gold, 0);
});

test('reset은 같은 gear·inv 객체를 다시 채운다 (외부 별칭 유지)', () => {
  const a = rich(), gear = a.gear, inv = a.inv;
  a.equip('rifle', 'muzzle', 'brake'); a.buyItem('bandage');
  a.resetGear(); a.resetWallet(false);
  assert.equal(a.gear, gear); assert.equal(a.inv, inv);
  assert.equal(gear.rifle.owned.size, 0); assert.equal(inv.bandage, 0);
});

test('earn: 코인만큼 골드가 늘어난다', () => {
  const a = Armory.create(); a.earn(8); a.earn(12); assert.equal(a.gold, 20);
});

// ---------- 장착·구매 ----------
test('없는 부품을 장착하면 사서 장착한다', () => {
  const a = rich(500), price = Armory.findPart('muzzle', 'brake').price;
  const r = a.equip('rifle', 'muzzle', 'brake');
  assert.deepEqual(r, { ok: true, bought: true, scopeRemoved: false });
  assert.equal(a.gold, 500 - price); assert.ok(a.gear.rifle.owned.has('brake')); assert.equal(a.gear.rifle.eq.muzzle, 'brake');
});

test('골드가 모자라면 사지도 장착하지도 않는다', () => {
  const a = rich(1);
  assert.deepEqual(a.equip('rifle', 'muzzle', 'brake'), { ok: false, reason: 'noGold' });
  assert.equal(a.gold, 1); assert.equal(a.gear.rifle.eq.muzzle, undefined);
});

test('이미 가진 부품은 골드 없이 장착만', () => {
  const a = rich(); a.equip('rifle', 'muzzle', 'brake'); a.equip('rifle', 'muzzle', 'hider');
  const g = a.gold, r = a.equip('rifle', 'muzzle', 'brake');
  assert.equal(r.bought, false); assert.equal(a.gold, g); assert.equal(a.gear.rifle.eq.muzzle, 'brake');
});

test('이미 장착 중이면 아무 일도 없다', () => {
  const a = rich(); a.equip('rifle', 'muzzle', 'brake');
  assert.deepEqual(a.equip('rifle', 'muzzle', 'brake'), { ok: false, reason: 'equipped' });
});

test('id = null이면 그 칸을 비운다 (빈 칸에 null은 이미 장착 중)', () => {
  const a = rich();
  assert.equal(a.equip('rifle', 'muzzle', null).reason, 'equipped');
  a.equip('rifle', 'muzzle', 'brake');
  assert.equal(a.equip('rifle', 'muzzle', null).ok, true); assert.equal(a.gear.rifle.eq.muzzle, undefined);
});

// ---------- 쌍권총·조준기 ----------
test('쌍권총을 달면 조준기를 떼고 알린다', () => {
  const a = rich(); a.equip('pistol', 'scope', 'reddot');
  const r = a.equip('pistol', 'conv', 'dual');
  assert.equal(r.scopeRemoved, true); assert.equal(a.gear.pistol.eq.scope, undefined);
});

test('scopeAllowed: 쌍권총일 때만 false', () => {
  assert.equal(Armory.scopeAllowed({}), true);
  assert.equal(Armory.scopeAllowed({ conv: 'bolt' }), true);
  assert.equal(Armory.scopeAllowed({ conv: 'dual' }), false);
});

test('쌍권총이면 조준기 부품이 있어도 조준 배율이 없다', () => {
  const a = rich();
  const withScope = Armory.weaponStats('pistol', { scope: 'x4' }, a.gear);
  const dual = Armory.weaponStats('pistol', { scope: 'x4', conv: 'dual' }, a.gear);
  assert.equal(withScope.zoom, true); assert.equal(withScope.zoomX, 4);
  assert.equal(dual.zoom, false); assert.equal(dual.dual, true);
});

// ---------- 강화 ----------
test('강화 비용 = 가격 × 0.6 × 현재 레벨 (반올림)', () => {
  const pt = Armory.findPart('muzzle', 'brake');
  assert.equal(Armory.upCost(pt, 1), Math.round(pt.price * .6));
  assert.equal(Armory.upCost(pt, 3), Math.round(pt.price * .6 * 3));
});

test('강화하면 골드를 쓰고 레벨이 오른다', () => {
  const a = rich(); a.equip('rifle', 'muzzle', 'brake');
  const g = a.gold, pt = Armory.findPart('muzzle', 'brake');
  const r = a.upgrade('rifle', 'muzzle', 'brake');
  assert.deepEqual(r, { ok: true, cost: Armory.upCost(pt, 1), lv: 2 });
  assert.equal(a.gold, g - r.cost); assert.equal(Armory.lvOf(a.gear, 'rifle', 'brake'), 2);
});

test('강화: 안 가진 부품, 강화 불가 부품, 골드 부족, 최대 레벨', () => {
  const a = rich();
  assert.equal(a.upgrade('rifle', 'muzzle', 'brake').reason, 'notOwned');
  a.equip('rifle', 'supp', 'suppressor');
  assert.equal(a.upgrade('rifle', 'supp', 'suppressor').reason, 'noUp');
  a.equip('rifle', 'muzzle', 'brake'); a.gold = 0;
  assert.equal(a.upgrade('rifle', 'muzzle', 'brake').reason, 'noGold');
  a.gold = 1e9;
  for (let i = 1; i < Armory.MAX_LV; i++) assert.equal(a.upgrade('rifle', 'muzzle', 'brake').ok, true);
  assert.equal(a.upgrade('rifle', 'muzzle', 'brake').reason, 'max');
});

test('가드 제거 부품은 최대 Lv5', () => {
  const a = rich(1e9); a.equip('sword', 'guard', 'noguard');
  for (let i = 1; i < 5; i++) a.upgrade('sword', 'guard', 'noguard');
  assert.equal(a.upgrade('sword', 'guard', 'noguard').reason, 'max');
});

// ---------- 회복템 ----------
test('회복템 구매·사용', () => {
  const a = rich(100);
  assert.equal(a.buyItem('bandage').ok, true); assert.equal(a.gold, 60); assert.equal(a.inv.bandage, 1);
  assert.equal(a.buyItem('medkit').reason, 'noGold'); assert.equal(a.inv.medkit, 0);
  assert.equal(a.takeItem('bandage'), true); assert.equal(a.inv.bandage, 0);
  assert.equal(a.takeItem('bandage'), false); assert.equal(a.inv.bandage, 0);
});

// ---------- 무기 성능 계산 ----------
test('부품 없는 무기는 기본 성능 그대로', () => {
  const a = Armory.create(), w = Armory.weaponStats('rifle', null, a.gear);
  assert.equal(w.dmg, Armory.WEAPONS.rifle.dmg); assert.equal(w.mag, Armory.WEAPONS.rifle.mag);
});

test('eq를 생략하면 gear에 장착된 부품으로 계산', () => {
  const a = rich(); a.equip('shotgun', 'ammo', 'slug');
  assert.equal(Armory.weaponStats('shotgun', undefined, a.gear).slug, true);
});

test('샷건 슬러그: 펠릿을 한 발로 합치고 1.15배, 거리 감쇠 없음', () => {
  const a = rich(), base = Armory.WEAPONS.shotgun;
  const w = Armory.weaponStats('shotgun', { ammo: 'slug' }, a.gear);
  const slugMod = Armory.modOf(Armory.findPart('ammo', 'slug'), 1);
  close(w.dmg, base.dmg * (slugMod.dmg || 1) * base.pellets * 1.15);
  assert.equal(w.pellets, 1); assert.equal(w.falloff, 0);
});

test('탄창 부품은 올림으로 계산', () => {
  const a = rich(), m = Armory.modOf(Armory.findPart('mag', 'ext'), 1).mag;
  assert.equal(Armory.weaponStats('rifle', { mag: 'ext' }, a.gear).mag, Math.ceil(Armory.WEAPONS.rifle.mag * m));
});

test('레벨이 오르면 장점이 커진다 (Lv1 → Lv2, +20%)', () => {
  const pt = Armory.findPart('muzzle', 'brake');
  const k = Object.keys(pt.mod).find(k => k === 'recoil');
  const l1 = Armory.modOf(pt, 1)[k], l2 = Armory.modOf(pt, 2)[k];
  close(l2, Math.pow(pt.mod[k], 1.2)); assert.ok(l2 < l1);
});

test('일본도: 지키는 자는 guardian, 갈망은 craveMul', () => {
  const a = rich();
  assert.equal(Armory.weaponStats('sword', { soul: 'guardian' }, a.gear).guardian, true);
  const c = Armory.weaponStats('sword', { soul: 'crave' }, a.gear);
  assert.equal(c.crave, true); close(c.craveMul, 1);
});

test('부품 효과 글: 효과가 없으면 "효과 없음"', () => {
  assert.equal(Armory.partEffectText({ mod: {} }, 1), '효과 없음');
  assert.match(Armory.partEffectText(Armory.findPart('muzzle', 'brake'), 1), /반동/);
});

// ---------- 레이피어 ----------
test('레이피어 부품: 날·가드·손잡이의 스탯과 표시', () => {
  const a = rich(1e5);
  a.equip('sword', 'blade', 'rapierb');
  let w = Armory.weaponStats('sword', undefined, a.gear);
  assert.equal(w.rapier, true); close(Armory.WEAPONS.sword.rate / w.rate, 1.35);
  assert.equal(w.parryPow, 60); assert.equal(w.parryRange, 8);
  a.equip('sword', 'guard', 'rapierg'); a.equip('sword', 'grip', 'rapierh');
  w = Armory.weaponStats('sword', undefined, a.gear);
  assert.equal(w.rapierGuard, true); assert.equal(w.rapierGrip, true);
  close(Armory.WEAPONS.sword.rate / w.rate, 1.35 * 1.2); close(w.moveMul, 1.12); assert.equal(w.parryPow, 40);
  assert.match(Armory.partEffectText(Armory.findPart('blade', 'rapierb'), 1), /정밀 흘리기/);
});

test('레이피어 가드·손잡이만 달면 일반 날 그대로 (찌르기·흘리기 없음)', () => {
  const a = rich(1e5); a.equip('sword', 'guard', 'rapierg'); a.equip('sword', 'grip', 'rapierh');
  assert.ok(!Armory.weaponStats('sword', undefined, a.gear).rapier);
});

test('연속 찌르기 횟수 = 반올림(3 × 공격 속도 배율), 최대 8번', () => {
  const at = (eq, rateMul) => { const a = rich(1e5); return Armory.thrustCount(Armory.weaponStats('sword', eq, a.gear), rateMul); };
  assert.equal(at({}, 1), 3);                                  // 기본 일본도 속도면 3번
  assert.equal(at({ blade: 'rapierb' }, 1), 4);                // 1.35배
  assert.equal(at({ blade: 'rapierb', guard: 'rapierg' }, 1), 5); // 1.62배
  assert.equal(at({ blade: 'rapierb', guard: 'rapierg' }, 1.15), 6); // 아드레날린
  assert.equal(at({ blade: 'rapierb', guard: 'rapierg' }, 3), 8);    // 최대 8번
});

// ---------- CQB (총 패링 스킬) ----------
test('CQB: 네 가지 총 모두 장착하면 총 패링이 켜지고, 패링 강도는 0, 게이지 스킬은 없다', () => {
  const a = rich();
  for (const key of ['rifle', 'pistol', 'sniper', 'shotgun']) {
    assert.equal(a.equip(key, 'skill', 'sk_cqb').ok, true, key);
    const w = Armory.weaponStats(key, undefined, a.gear);
    assert.equal(w.cqb, true, key);
    assert.equal(w.parryPow || 0, 0, key);
    assert.equal(w.skill, undefined, key);
  }
});

test('CQB: 300골드에 사고, 강화는 할 수 없다', () => {
  const a = rich(1000);
  assert.deepEqual(a.equip('rifle', 'skill', 'sk_cqb'), { ok: true, bought: true, scopeRemoved: false });
  assert.equal(a.gold, 700);
  assert.equal(a.upgrade('rifle', 'skill', 'sk_cqb').reason, 'noUp');
});
