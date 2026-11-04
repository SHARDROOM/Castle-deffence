// Enemies: 일반 병사(근접병·궁수·회피형·깃발 기수)의 행동을 정하는 module.
//
// 이번 프레임에 어디로 움직일지, 구르기를 시작할지, 공격·조준·사격을 할지 정한다.
// 3D 모델·애니메이션·색은 다루지 않는다. 위치는 {x, z}만 읽고 쓴다.
// 길찾기·충돌은 world로, 공격·사격·소리는 fx 콜백으로 주입받는다.
// 공격이 패리되면 같은 프레임에 그 적이 바로 그로기가 되어야 하므로, 의도를 모아 나중에
// 처리하지 않고 콜백을 그 자리에서 부른다 (리팩터 전과 같은 순서).
// 보스·도둑·비행선은 아직 index.html에 있다.
//
// 브라우저에서는 전역 `Enemies`, Node(테스트)에서는 require('./enemies.js').
(function (root) {
  'use strict';

  // three.js Vector3와 같은 계산을 하는 작은 벡터 (결과가 비트 단위로 같아야 함)
  class Vec {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    length() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    normalize() { return this.multiplyScalar(1 / (this.length() || 1)); }
  }

  const ROLL_TIME = 0.35; // 회피형 구르기 시간
  const ROLL_SPEED = 11;

  // 이동: 구르기 → (구르기 시작) → 궁수 거리 유지 / 추격 → 이동 → 벽 충돌 → 끼임 해소 → 밀어내기 → 몸 방향
  //   ctx = {pos, player:{x,z}, dist, canSee, rng, enemies, posOf(o),
  //          world:{hasLOS, flowDir, retreatDir, freeAt, collide},
  //          fx:{rollStart(e, dist)}, ARCH_MIN, ARCH_MAX}
  //   반환: {dir, rolled, rollEnded}
  //     dir = 이번 프레임의 이동 방향 벡터 (index.html의 전역 tmp에 그대로 복사)
  //     rolled/rollEnded = 구르기 자세를 그릴지, 구르기가 끝났는지
  function move(e, dt, ctx) {
    const g = ctx.pos, p = ctx.player, D = e.def, rng = ctx.rng, W = ctx.world;
    const v = new Vec(p.x - g.x, 0, p.z - g.z); // 플레이어 쪽
    const dist = ctx.dist;
    let moving = false, rolled = false, rollEnded = false;
    if (e.rollT > 0) { // 암살자 구르기 중: 무적, 옆으로 빠르게 이동하며 앞구르기
      e.rollT -= dt;
      g.x += e.rdx * ROLL_SPEED * dt; g.z += e.rdz * ROLL_SPEED * dt;
      rolled = true; rollEnded = e.rollT <= 0;
    } else {
      if (D.dodges) {
        e.rollCd -= dt;
        if (e.rollCd <= 0 && dist > 2) {
          e.rollCd = 1.3 + rng() * 2.2; e.rollT = ROLL_TIME;
          const side = rng() < .5 ? 1 : -1;
          const a = Math.atan2(v.z, v.x) + side * (Math.PI / 2 + (rng() - .5) * 0.9);
          e.rdx = Math.cos(a); e.rdz = Math.sin(a);
          ctx.fx.rollStart(e, dist);
        }
      }
      let spd = 1;
      const archer = e.type === 'ranged', bearer = e.type === 'banner';
      const kMin = archer ? ctx.ARCH_MIN : 7, kMax = archer ? ctx.ARCH_MAX : 13;
      if ((archer && (e.aimT > 0 || e.recoverT > 0)) || (bearer && e.flagT > 0)) {
        // 활을 당기는 동안(깃발을 드는 동안)에는 멈춰 섬
      } else if ((archer || bearer) && ctx.canSee && dist <= kMax) {
        // 궁수·기수: 사거리 안에서는 돌진하지 않고 거리를 유지
        moving = true; v.normalize();
        if (dist < kMin) { W.retreatDir(g, v); spd = 0.8; } // 너무 가까우면 뒤로 물러남
        else {                                               // 적정 거리면 옆걸음
          e.strafeT -= dt;
          if (e.strafeT <= 0) { e.strafeT = 1.5 + rng() * 2; e.strafeSign = rng() < .5 ? -1 : 1; }
          v.set(-v.z * e.strafeSign, 0, v.x * e.strafeSign);
          if (!W.freeAt(g.x + v.x * 1.2, g.z + v.z * 1.2)) { e.strafeSign *= -1; v.multiplyScalar(-1); }
          spd = 0.45;
        }
      } else if (dist > e.r + 0.5) {
        // 곧장 갈 수 있으면 직진, 막혀 있으면 플로우 필드를 따라 우회
        moving = true;
        const canWalk = W.hasLOS(g.x, g.z, p.x, p.z, Math.min(e.r, 0.6));
        if (canWalk) v.normalize(); else W.flowDir(g.x, g.z, p.x, p.z, v);
      }
      if (moving) {
        if (e.unstuck > 0) { e.unstuck -= dt; v.set(e.ux, 0, e.uz); }
        e.dir.lerp(v, Math.min(1, dt * 8)).normalize();
        const slowM = (e.slowT > 0 ? .4 : 1) * (e.buffT > 0 ? 1.4 : 1);
        g.x += e.dir.x * e.speed * spd * slowM * dt; g.z += e.dir.z * e.speed * spd * slowM * dt;
      }
    }
    W.collide(g, e.r);
    // 0.8초 동안 거의 못 움직였으면 잠깐 옆으로 비켜감
    e.chk -= dt;
    if (e.chk <= 0) {
      const moved = Math.hypot(g.x - e.lx, g.z - e.lz);
      if (moving && dist > e.r + 1 && moved < e.speed * 0.25) { const a = rng() * Math.PI * 2; e.ux = Math.cos(a); e.uz = Math.sin(a); e.unstuck = 0.45; }
      e.lx = g.x; e.lz = g.z; e.chk = 0.8;
    }
    // 서로 겹치지 않게 밀어냄 (앞서 움직인 적을 기준으로 밀기 때문에 순서에 의존)
    for (const o of ctx.enemies) if (o !== e && !o.airship && !(o.dropY > 0)) {
      const op = ctx.posOf(o);
      const dx = g.x - op.x, dz = g.z - op.z, d = Math.hypot(dx, dz), mn = (e.r + o.r) * 1.1;
      if (d < mn && d > 0) { g.x += dx / d * (mn - d) * .5; g.z += dz / d * (mn - d) * .5; }
    }
    // 몸 방향은 부드럽게 플레이어 쪽으로 (조준 중에는 빠르게)
    let dyaw = Math.atan2(p.x - g.x, p.z - g.z) - e.yaw;
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    e.yaw += dyaw * Math.min(1, dt * (e.aimT > 0 ? 14 : 8));
    return { dir: v, rolled, rollEnded };
  }

  // 구르기 자세: 앞구르기 회전과 높이 (rollT로부터 계산)
  function rollPose(rollT) {
    const prog = 1 - Math.max(0, rollT) / ROLL_TIME;
    return { rotX: prog * Math.PI * 2, y: 0.9 - Math.sin(prog * Math.PI) * 0.4 };
  }

  // 공격: 근접 공격 단계 → 사격
  //   ctx = {dist, canSee, footY, rng, wave, melee:{dur, hit, dmg, cd}, edm,
  //          ARCH_MAX, AIM_TIME, arrowSpeed,
  //          fx:{swing(e, dist), meleeHit(e, dmg, dist), aim(e) → 각도, fireArrow(e) → 각도,
  //              bow(e, dist), fireBolt(e), crossbow(e, dist)}}
  function attack(e, dt, ctx) {
    const D = e.def, MA = ctx.melee, dist = ctx.dist, rng = ctx.rng;
    // 근접 공격: 붙기만 해서는 피해가 없고, 준비 동작 → 타격 순간에 한 번만 판정 (이때 패링 가능)
    if (e.atkPh > 0) {
      const prev = e.atkPh; e.atkPh += dt / MA.dur;
      if (prev < MA.hit && e.atkPh >= MA.hit) {
        ctx.fx.swing(e, dist);
        if (dist < e.r + 1.3 && ctx.footY < 1.6 * D.scale) ctx.fx.meleeHit(e, MA.dmg * ctx.edm, dist);
      }
      if (e.atkPh >= 1) { e.atkPh = 0; e.atkCd = MA.cd; }
    } else if (dist < e.r + .9 && ctx.footY < 1.6 * D.scale && e.atkCd <= 0 && !(e.aimT > 0)) { e.atkPh = .001; }
    e.atkCd -= dt;
    if (D.shoots) {
      e.shoot -= dt;
      const cd = Math.max(1.2, 3.2 - ctx.wave * 0.15) + rng() * 1.5;
      if (e.type === 'ranged') {
        // 궁수: 멈춤 → 조준(활 당기기) → 발사 → 잠깐 자세 유지
        if (e.aimT > 0) {
          e.aimT -= dt;
          if (!ctx.canSee) { e.aimT = 0; e.shoot = 0.4; }
          else if (e.aimT <= 0) { e.aimAng = ctx.fx.fireArrow(e); e.recoverT = 0.35; e.shoot = cd; ctx.fx.bow(e, dist); }
          else e.aimAng = ctx.fx.aim(e);
        } else if (e.recoverT > 0) e.recoverT -= dt;
        else if (e.shoot <= 0 && ctx.canSee && dist <= ctx.ARCH_MAX + 1) {
          e.aimT = ctx.AIM_TIME; e.aimAng = ctx.fx.aim(e);
        }
      } else if (e.shoot <= 0 && dist < 24 && ctx.canSee && !(e.rollT > 0)) {
        // 암살자: 손쇠뇌라 빠르고 납작한 탄도
        e.shoot = cd; ctx.fx.fireBolt(e); ctx.fx.crossbow(e, dist);
      }
    }
  }

  const Enemies = { move, attack, rollPose, Vec, ROLL_TIME };
  if (typeof module !== 'undefined' && module.exports) module.exports = Enemies;
  else root.Enemies = Enemies;
})(typeof globalThis !== 'undefined' ? globalThis : this);
