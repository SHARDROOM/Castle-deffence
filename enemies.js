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

  // ---------- 철의 거인 (보스) ----------
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  // 방패를 다시 들 수 있게 되는 상태 (그 밖의 공격 패턴이 나오면 noDeflect가 풀림)
  const KEEP_NO_DEFLECT = ['walk', 'deflect', 'recover', 'stun'];
  function setBossState(e, st, dur) {
    if (!KEEP_NO_DEFLECT.includes(st)) e.noDeflect = false;
    e.state = st; e.st = 0; e.dur = dur; e.hitDone = false;
  }
  function startLeaps(e, rng, fx) { // 도약: 광폭화면 1~3번 연속
    e.leapLeft = e.enraged ? 1 + Math.floor(rng() * 3) : 1;
    setBossState(e, 'leapPrep', e.enraged ? .45 : .6); fx.sfx('bossCharge');
  }

  // 맞았고, 가드로 버티지 않았으면 넉백·둔화를 건다 (지키는 자 + 대검 가드는 버팀)
  const debuffs = r => r.landed && !r.resistDebuff;

  // 보스 상태 머신 한 프레임.
  //   ctx = {pos, player:{x,z}, dist, canSee, rng, footY, rollT, edm,
  //          world:{hasLOS, flowDir, collide, breakLanding(e), breakCharge(e)},
  //          fx:{sfx(name), shake(v), shakeSet(v), hurt(attack) → 결과, bashKnock(toYaw), slow(), knock(dir, amt),
  //              crackRing(x, z), crackPath(x, z, yaw), groundBurst(x, z, n, s), sweepScrape(e)}}
  //   반환: 이번 프레임의 이동 방향 벡터 (index.html의 전역 tmp에 그대로 복사)
  // 상태: walk → chargePrep → charge → (stun | recover)
  //            → bashPrep → bash → bashEnd → (도약 | recover)
  //            → sweepPrep → sweep → raise → stomp → hold → slam → (광폭화: raise2 → slam) → recover
  //            → leapPrep → leap (광폭화: 1~3번) → recover
  //            → deflect → walk (광폭화 즉시 반격: sweep | charge)
  function bossStep(e, dt, ctx) {
    const g = ctx.pos, p = ctx.player, dist = ctx.dist, rng = ctx.rng, fx = ctx.fx, W = ctx.world, footY = ctx.footY;
    const v = new Vec(p.x - g.x, 0, p.z - g.z);
    e.st += dt; const k = Math.min(1, e.st / e.dur); e.stP = k;
    const ER = e.enraged ? 1.7 : 1; // 광폭화: 쿨타임이 1.7배 빨리 돎
    e.chargeCd -= dt * ER; e.comboCd -= dt * ER; e.deflectCd -= dt * ER;
    const toYaw = Math.atan2(p.x - g.x, p.z - g.z);
    const turnTo = (target, rate) => { let d = target - e.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); e.yaw += d * Math.min(1, dt * rate); };
    const angTo = target => Math.abs(Math.atan2(Math.sin(target - toYaw), Math.cos(target - toYaw)));
    switch (e.state) {
      case 'walk':
        turnTo(toYaw, 3);
        if (dist > 15 && ctx.canSee && e.chargeCd <= 0) { setBossState(e, 'chargePrep', 2.5); e.chargeCd = 9; fx.sfx('bossCharge'); break; }
        if (dist < 5.5 && e.comboCd <= 0) {
          e.comboCd = 6;
          if (rng() < .35) { setBossState(e, 'bashPrep', .55); fx.sfx('bossShield'); } // 가끔 방패 밀치기 → 도약으로 연계
          else { setBossState(e, 'sweepPrep', .9); fx.sfx('bossSwing'); }
          break;
        }
        // 사각지대: 돌진 조건도 아니고 근접 범위도 아닌 곳에 오래 머물면 도약 내려찍기
        if (!(dist > 15 && ctx.canSee && e.chargeCd <= 0)) e.limboT += dt; else e.limboT = 0;
        if (e.limboT > (e.enraged ? 2.5 : 4)) { e.limboT = 0; startLeaps(e, rng, fx); break; }
        if (e.deflectCd <= 0 && dist < 24 && ctx.canSee && !e.noDeflect) { setBossState(e, 'deflect', 3); e.deflectCd = 10 + rng() * 5; fx.sfx('bossShield'); break; }
        if (dist > 3) {
          if (W.hasLOS(g.x, g.z, p.x, p.z, .6)) v.normalize(); else W.flowDir(g.x, g.z, p.x, p.z, v);
          e.dir.lerp(v, Math.min(1, dt * 4)).normalize();
          const bslow = (e.slowT > 0 ? .5 : 1) * (e.buffT > 0 ? 1.4 : 1) * (e.enraged ? 1.25 : 1);
          g.x += e.dir.x * e.speed * bslow * dt; g.z += e.dir.z * e.speed * bslow * dt;
        }
        break;
      case 'deflect': // 반사 중에는 제자리에 가만히
        if (k >= 1) {
          setBossState(e, 'walk', 1); e.noDeflect = true; // 다음 패턴은 무조건 방패 말고 다른 것
          if (e.quickGuard) { // 광폭화: 막자마자 곧바로 반격 (가까우면 바닥 쓸기, 멀면 준비 자세 없이 돌진)
            e.quickGuard = false; e.yaw = toYaw;
            if (dist < 6) { setBossState(e, 'sweep', .7); fx.sfx('bossSwing'); e.lastTipX = undefined; }
            else { e.chargeDir.set(Math.sin(e.yaw), 0, Math.cos(e.yaw)); e.chargeLeft = Math.min(32, dist + 6); setBossState(e, 'charge', 1.6); fx.sfx('bossDash'); }
          }
        }
        break;
      case 'bashPrep': turnTo(toYaw, 6); if (k >= 1) { setBossState(e, 'bash', .28); e.bashHit = false; fx.sfx('bossDash'); } break; // 방패를 뒤로 끌어당김
      case 'bash': { // 한 발 내디디며 방패로 밀쳐 냄
        g.x += Math.sin(e.yaw) * 5 * dt; g.z += Math.cos(e.yaw) * 5 * dt;
        if (!e.hitDone && k >= .4) {
          e.hitDone = true;
          if (dist < e.r + 3.2 && angTo(e.yaw) < .9 && footY < 2) {
            const r = fx.hurt({ dmg: 15 * ctx.edm, kind: 'bossMelee', from: g, src: e });
            if (r.landed) {
              if (debuffs(r)) fx.bashKnock(toYaw); // 뒤로 날아가고 둔화
              e.bashHit = true; fx.sfx('clang'); fx.shake(.4);
            }
          }
        }
        if (k >= 1) setBossState(e, 'bashEnd', .35);
        break;
      }
      case 'bashEnd': if (k >= 1) { if (e.bashHit) startLeaps(e, rng, fx); else setBossState(e, 'recover', .8 * (e.enraged ? .6 : 1)); } break;
      case 'leapPrep': // 웅크렸다가 플레이어 쪽으로 짧게 도약
        turnTo(toYaw, 5);
        if (k >= 1) {
          const d = Math.min(Math.max(dist - 2.5, 2), 9);
          e.leapFrom.set(g.x, 0, g.z);
          e.leapTo.set(clamp(g.x + Math.sin(e.yaw) * d, -27, 27), 0, clamp(g.z + Math.cos(e.yaw) * d, -27, 27));
          setBossState(e, 'leap', .75); fx.sfx('bossDash');
        }
        break;
      case 'leap': {
        g.x = lerp(e.leapFrom.x, e.leapTo.x, k); g.z = lerp(e.leapFrom.z, e.leapTo.z, k);
        e.leapY = Math.sin(k * Math.PI) * 2.6;
        if (k >= 1) { // 착지: 땅을 골라 주변 둔화, 깔린 엄폐물은 부서짐
          e.leapY = 0;
          W.breakLanding(e);
          W.collide(g, e.r);
          fx.crackRing(g.x, g.z); fx.sfx('bossStomp'); fx.shake(.75);
          const ld = Math.hypot(p.x - g.x, p.z - g.z);
          if (ld < 9 && footY < .6 && ctx.rollT <= 0) { // 도약 땅고르기는 패링 불가
            if (debuffs(fx.hurt({ dmg: (ld < 3 ? 15 : 5) * ctx.edm, kind: 'bossAoe', from: g, src: e }))) fx.slow();
          }
          if (e.leapLeft > 1) { e.leapLeft--; setBossState(e, 'leapPrep', .4); fx.sfx('bossCharge'); } // 광폭화: 연속 도약
          else setBossState(e, 'recover', e.enraged ? .6 : 1.0);
        }
        break;
      }
      case 'chargePrep': {
        if (k < .85) turnTo(toYaw, 2.5);
        const len = Math.min(32, dist + 6);
        if (k >= 1) { e.chargeDir.set(Math.sin(e.yaw), 0, Math.cos(e.yaw)); e.chargeLeft = len; setBossState(e, 'charge', 1.6); fx.sfx('bossDash'); }
        break;
      }
      case 'charge': {
        const step = (e.enraged ? 24 : 20) * dt, bx = g.x, bz = g.z;
        g.x += e.chargeDir.x * step; g.z += e.chargeDir.z * step; e.chargeLeft -= step;
        W.breakCharge(e); // 앞을 막는 소품은 부수고 지나감 (성벽·탑은 못 부숨)
        W.collide(g, e.r);
        const ndist = Math.hypot(p.x - g.x, p.z - g.z);
        if (!e.hitDone && ndist < e.r + 1.3 && footY < 2.5 && ctx.rollT <= 0) {
          e.hitDone = true;
          if (debuffs(fx.hurt({ dmg: 35 * ctx.edm, kind: 'bossMelee', from: { x: bx, z: bz }, src: e }))) fx.knock(e.chargeDir, 5);
        }
        if (Math.hypot(g.x - bx, g.z - bz) < step * .4) { setBossState(e, 'stun', 1.8); fx.sfx('bossBonk'); fx.shakeSet(.4); break; } // 벽에 부딪혀 기절
        if (e.chargeLeft <= 0 || k >= 1) setBossState(e, 'recover', e.enraged ? .6 : 1.0);
        break;
      }
      case 'stun': if (k >= 1) setBossState(e, 'walk', 1); break;
      case 'recover': turnTo(toYaw, e.enraged ? 4 : 2); if (k >= 1) setBossState(e, 'walk', 1); break;
      case 'sweepPrep': turnTo(toYaw, 5); if (k >= 1) { setBossState(e, 'sweep', .7); fx.sfx('bossSwing'); e.lastTipX = undefined; } break;
      case 'sweep': // 바닥 쓸기: 앞쪽 넓은 범위, 공중에 있으면 피함
        if (k > .1) fx.sweepScrape(e); // 칼끝이 땅에 긁힌 자국 (그리기)
        if (!e.hitDone && k > .2 && k < .9 && dist < 6.5 && angTo(e.yaw) < 1.75 && footY < .35) { e.hitDone = true; fx.hurt({ dmg: 25 * ctx.edm, kind: 'bossMelee', from: g, src: e }); }
        if (k >= 1) setBossState(e, 'raise', .55);
        break;
      case 'raise': turnTo(toYaw, 4); if (k >= 1) { e.slamYaw = toYaw; setBossState(e, 'stomp', .6); } break;
      case 'stomp': // 발 구르기: 주변 둔화 (패링 불가)
        turnTo(e.slamYaw, 8);
        if (!e.hitDone && k >= .7) {
          e.hitDone = true; fx.crackRing(g.x, g.z); fx.sfx('bossStomp'); fx.shake(.6);
          if (dist < 9 && footY < .6 && ctx.rollT <= 0) {
            if (debuffs(fx.hurt({ dmg: 5 * ctx.edm, kind: 'bossAoe', from: g, src: e }))) fx.slow();
          }
        }
        if (k >= 1) setBossState(e, 'hold', .65);
        break;
      case 'hold': if (k >= 1) setBossState(e, 'slam', .38); break; // 발 구른 뒤 대검을 든 채 잠깐 멈춤
      case 'slam': // 내려찍기: 고정된 방향으로 땅을 가름
        if (!e.hitDone && k >= .8) {
          e.hitDone = true; fx.sfx('bossSlam'); fx.shake(.75);
          fx.crackPath(g.x + Math.sin(e.slamYaw) * 1.6, g.z + Math.cos(e.slamYaw) * 1.6, e.slamYaw); // 갈라지는 큰 금
          for (let i = 0; i < 4; i++) { const t = 1.5 + i * 2; fx.groundBurst(g.x + Math.sin(e.slamYaw) * t, g.z + Math.cos(e.slamYaw) * t, 5, 1); }
          if (dist < 9.5 && angTo(e.slamYaw) < .4 && footY < 1.5) fx.hurt({ dmg: 40 * ctx.edm, kind: 'bossMelee', from: g, src: e });
        }
        if (k >= 1) {
          if (e.enraged && !e.slam2) { e.slam2 = true; setBossState(e, 'raise2', .45); } // 광폭화: 한 번 더 내려침
          else { e.slam2 = false; setBossState(e, 'recover', e.enraged ? .7 : 1.1); }
        }
        break;
      case 'raise2': turnTo(toYaw, 7); if (k >= 1) { e.slamYaw = toYaw; setBossState(e, 'slam', .34); fx.sfx('bossSwing'); } break;
    }
    if (e.state !== 'charge' && e.state !== 'leap') W.collide(g, e.r);
    return v;
  }

  // ---------- 도둑: 공격하지 않고 금화를 주워 담다가 성문으로 달아남 ----------
  const THIEF_EXIT = { x: 0, z: -27.6 };
  //   ctx = {pos, player:{x,z}, dist, rng, coins, coinPos(c),
  //          world:{hasLOS, collide, exitDir(x, z, tx, tz, out)},
  //          fx:{takeCoin(c, i), escape(e)}}
  //   반환: {escaped, dx, dz, flow}
  //     escaped = 성문으로 빠져나감 (그리기 생략)
  //     dx, dz, flow = 이번 프레임의 목표 방향과 길찾기 결과 (index.html의 전역 tmp·tmp2에 그대로 복사)
  function thiefStep(e, dt, ctx) {
    const g = ctx.pos, p = ctx.player, dist = ctx.dist, W = ctx.world;
    e.thiefT = (e.thiefT || 0) + dt;
    let best = null, bd = 1e9;
    if (e.thiefT < 25) for (const c of ctx.coins) { if (c.magnet) continue; const cp = ctx.coinPos(c), d = Math.hypot(cp.x - g.x, cp.z - g.z); if (d < bd) { bd = d; best = c; } }
    const bp = best && ctx.coinPos(best);
    const tx = best ? bp.x : THIEF_EXIT.x, tz = best ? bp.z : THIEF_EXIT.z;
    if (!best && e.thiefT > 4) e.leaving = true; // 주울 금화가 없으면 달아남
    let dx = tx - g.x, dz = tz - g.z, l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    if (dist < 7) { // 플레이어가 다가오면 피함
      const ax = (g.x - p.x) / (dist || 1), az = (g.z - p.z) / (dist || 1);
      dx = dx * .4 + ax * .9; dz = dz * .4 + az * .9; l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    }
    let flow = null;
    if (!best && !W.hasLOS(g.x, g.z, tx, tz, .5)) { // 성문까지 막혀 있으면 길찾기로 돌아감
      flow = W.exitDir(g.x, g.z, tx, tz, new Vec());
      if (dist >= 7) { dx = flow.x; dz = flow.z; }
    }
    if (e.unstuck > 0) { e.unstuck -= dt; dx = e.ux; dz = e.uz; }
    e.dir.lerp(new Vec(dx, 0, dz), Math.min(1, dt * 6)).normalize();
    const sp = e.speed * (e.slowT > 0 ? .4 : 1);
    g.x += e.dir.x * sp * dt; g.z += e.dir.z * sp * dt;
    W.collide(g, e.r);
    e.chk -= dt;
    if (e.chk <= 0) {
      if (Math.hypot(g.x - e.lx, g.z - e.lz) < sp * .25) { const a = ctx.rng() * Math.PI * 2; e.ux = Math.cos(a); e.uz = Math.sin(a); e.unstuck = .5; }
      e.lx = g.x; e.lz = g.z; e.chk = .8;
    }
    for (let i = ctx.coins.length - 1; i >= 0; i--) { // 지나가며 금화를 주워 자루에 담음
      const c = ctx.coins[i]; if (c.magnet) continue;
      const cp = ctx.coinPos(c);
      if (Math.hypot(cp.x - g.x, cp.z - g.z) < .9) { e.stolen = (e.stolen || 0) + c.v; ctx.fx.takeCoin(c, i); }
    }
    if (e.leaving && Math.hypot(g.x - THIEF_EXIT.x, g.z - THIEF_EXIT.z) < 1.6) { // 성문으로 빠져나감
      ctx.fx.escape(e);
      return { escaped: true, dx, dz, flow };
    }
    let dy = Math.atan2(e.dir.x, e.dir.z) - e.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); e.yaw += dy * Math.min(1, dt * 12);
    return { escaped: false, dx, dz, flow };
  }

  // ---------- 비행선: 플레이어 주위를 선회하며 궁수가 쏘고, 가까이 오면 근접병이 강하 ----------
  //   ctx = {pos, player:{x,z}, footY, rng, meleeRiders,
  //          fx:{pose(e), fireArrow(e), bow(e, hd), dropRider(e, rider)}}
  //   반환: {dying, crashed}  (추락 중이면 높이만 바꾸고, 땅에 닿으면 crashed)
  function airshipStep(e, dt, ctx) {
    const g = ctx.pos, p = ctx.player, rng = ctx.rng;
    e.t += dt;
    if (e.dying) { // 격추: 떨어지다가 땅에 닿으면 폭발 (연출은 index.html)
      e.fallV += 9 * dt; g.y -= e.fallV * dt;
      return { dying: true, crashed: g.y <= 1.2 };
    }
    // 이동: 플레이어 쪽으로 다가와 반지름 14m로 천천히 선회
    const dx = p.x - g.x, dz = p.z - g.z, hd = Math.hypot(dx, dz);
    let tx, tz;
    if (hd > 16) { tx = dx / hd; tz = dz / hd; }
    else { const a = Math.atan2(g.z - p.z, g.x - p.x) + .35; tx = (p.x + Math.cos(a) * 14 - g.x); tz = (p.z + Math.sin(a) * 14 - g.z); const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l; }
    e.dir.x += (tx - e.dir.x) * Math.min(1, dt * .8); e.dir.z += (tz - e.dir.z) * Math.min(1, dt * .8);
    const sp = e.speed * (e.slowT > 0 ? .5 : 1);
    g.x += e.dir.x * sp * dt; g.z += e.dir.z * sp * dt; g.y = 11 + Math.sin(e.t * .7) * .4;
    const ty = Math.atan2(e.dir.x, e.dir.z); let dy = ty - e.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); e.yaw += dy * Math.min(1, dt * 1.2);
    ctx.fx.pose(e); // 몸체 회전을 먼저 맞춤 (강하하는 근접병의 위치가 곤돌라의 실제 위치에서 나옴)
    // 궁수가 곤돌라에서 화살을 쏨
    e.shoot -= dt;
    if (e.archer && e.shoot <= 0 && hd < 40) { e.shoot = 2.2 + rng(); ctx.fx.fireArrow(e); ctx.fx.bow(e, hd); }
    // 플레이어 근처로 오면 근접병들이 차례로 강하
    if (hd < 13 && e.riders.some(r => ctx.meleeRiders.includes(r.type))) {
      e.dropT -= dt;
      if (e.dropT <= 0) { const i = e.riders.findIndex(r => ctx.meleeRiders.includes(r.type)); ctx.fx.dropRider(e, e.riders[i]); e.riders.splice(i, 1); e.dropT = .7; }
    }
    return { dying: false, crashed: false };
  }

  const Enemies = { move, attack, rollPose, Vec, ROLL_TIME, bossStep, setBossState, startLeaps, thiefStep, airshipStep, THIEF_EXIT };
  if (typeof module !== 'undefined' && module.exports) module.exports = Enemies;
  else root.Enemies = Enemies;
})(typeof globalThis !== 'undefined' ? globalThis : this);
