// Defense: 플레이어가 받는 공격을 판정하는 module.
//
// "이 공격이 맞는가, 구르기로 피했는가, 처형 중이라 무시되는가, 패리되는가, 가드로 줄어드는가"를
// 정하고, 들어갈 피해량을 계산한다. 게임 상태는 바꾸지 않는다.
// hp 감소·화면 효과·패리 연출 같은 적용은 index.html의 hurtPlayer가 결과를 보고 한다.
//
// 브라우저에서는 전역 `Defense`, Node(테스트)에서는 require('./defense.js').
(function (root) {
  'use strict';

  // ---------- 공격 종류별 정책 ----------
  // fx:        피격 연출 종류 ('heavy' = 크게 흔들림, 'melee', 'arrow')
  // parryable: 패리할 수 있는가 (가드는 항상 된다)
  // range:     패리 사거리 확인 방식. 'src' = 공격자 위치 − 공격자 반지름, 'none' = 사거리 무시
  // stage:     판정 순서. 공격 종류마다 지금 코드의 순서를 그대로 보존한다.
  //   'core'       구르기·처형 → (아드레날린) → 가드 → 패리
  //   'meleeFirst' 가드 중이 아니고 패리 창·사거리 안이면 먼저 패리. 아니면 core (패리 불가로)
  //   'arrow'      구르기 회피 → 패리·가드면 되돌림(가드는 core로 피해) → core
  //   'bullet'     보스가 살아 있고 패리·가드면 되돌림(가드는 core로 피해) → 구르기면 회피 → core
  const P = (o) => Object.assign({ fx: 'heavy', parryable: true, range: 'src', stage: 'core' }, o);
  const KINDS = {
    bossMelee: P({}),                                                       // 방패 치기, 돌진, 휩쓸기, 내려치기
    bossAoe: P({ parryable: false }),                                       // 도약 착지, 발 구르기
    soldierMelee: P({ fx: 'melee', parryable: false, stage: 'meleeFirst' }), // 병사 근접 공격
    arrow: P({ fx: 'arrow', range: 'none', stage: 'arrow' }),               // 궁수 화살
    bullet: P({ fx: 'arrow', range: 'none', stage: 'bullet' }),             // 거인 방패에 튕겨 나온 총알
  };

  // 지키는 자 가드의 피해 감소율: 패리 강도 100당 30%, 최소 5%, 최대 60%. 패리 강도 0은 100으로 친다.
  const guardReduction = parryPow => Math.min(.6, Math.max(.05, (parryPow || 100) / 100 * .3));

  function policyOf(kind) {
    const p = KINDS[kind];
    if (!p) throw new Error('Unknown attack kind: ' + kind);
    return p;
  }

  // 공격자와 플레이어 사이 거리에서 공격자 반지름을 뺀 값 (패리 사거리 비교용)
  function reachOf(attack, d) {
    const dist = attack.dist !== undefined ? attack.dist
      : Math.hypot(attack.from.x - d.x, attack.from.z - d.z);
    return dist - (attack.srcR || 0);
  }

  const result = (o) => Object.assign({
    outcome: 'hit', damage: 0, landed: false, parried: false, parryTarget: null,
    guardBlocked: 0, returnProjectile: false, showDodge: false,
  }, o);

  // 구르기·처형 → 아드레날린 → 가드 → 패리 → 피격 (리팩터 전 hurt와 같은 순서)
  function core(attack, d, p, parryable, extra) {
    if (d.rollT > 0) return result(Object.assign({ outcome: 'dodged' }, extra));
    if (d.inExec) return result(Object.assign({ outcome: 'immune' }, extra));
    let n = attack.dmg;
    if (d.adrenT > 0) n *= .7; // 아드레날린: 받는 피해 감소
    if (d.guarding) { // 가드: 패리 대신 피해 감소
      const b = n * guardReduction(d.parryPow);
      n -= b;
      if (n < .01) return result(Object.assign({ outcome: 'guarded', guardBlocked: b }, extra));
      return result(Object.assign({ outcome: 'guarded', guardBlocked: b, damage: n, landed: true }, extra));
    }
    if (d.parryT > 0 && parryable) {
      const reach = p.range === 'none' || !attack.from ? 0 : reachOf(attack, d);
      if (reach <= d.parryRange) { // 패리 사거리 안의 공격만 받아냄
        const parried = { outcome: 'parried', parried: true, parryTarget: attack.src || null };
        if (!attack.pow || d.parryPow >= attack.pow) return result(Object.assign(parried, extra));
        // 패리 강도가 모자라면 패리는 되지만 피해 일부(60%)가 들어옴
        return result(Object.assign(parried, { damage: n * .6, landed: true }, extra));
      }
    }
    return result(Object.assign({ outcome: 'hit', damage: n, landed: true }, extra));
  }

  // 공격 하나를 판정한다.
  //   attack:   {dmg, kind, from?: {x, z}, src?, srcR?, dist?, pow?, canReturn?}
  //             src = 패리 성공 시 비틀거릴 적, srcR = 그 적의 반지름,
  //             dist = 미리 잰 거리 (없으면 from으로 계산), canReturn = 반사탄을 되돌릴 보스가 있는가
  //   defender: {x, z, rollT, inExec, adrenT, guarding, parryT, parryRange, parryPow}
  //   반환:     {outcome: 'dodged'|'immune'|'parried'|'guarded'|'hit', damage, landed, fx,
  //             parried, parryTarget, guardBlocked, returnProjectile, showDodge}
  //             landed = 실제로 피해가 들어갔는가 (보스 넉백·둔화 조건)
  function resolve(attack, d) {
    const p = policyOf(attack.kind);
    const r = resolveStage(attack, d, p);
    r.fx = p.fx;
    return r;
  }

  function resolveStage(attack, d, p) {
    switch (p.stage) {
      case 'meleeFirst':
        if (!d.guarding && d.parryT > 0 && reachOf(attack, d) <= d.parryRange) {
          return result({ outcome: 'parried', parried: true, parryTarget: attack.src || null });
        }
        return core(attack, d, p, false);
      case 'arrow':
        if (d.rollT > 0) return result({ outcome: 'dodged', showDodge: true });
        if (d.parryT > 0 || d.guarding) {
          if (d.guarding) return core(attack, d, p, p.parryable, { returnProjectile: true });
          return result({ outcome: 'parried', parried: true, parryTarget: null, returnProjectile: true });
        }
        return core(attack, d, p, p.parryable);
      case 'bullet':
        if ((d.parryT > 0 || d.guarding) && attack.canReturn) {
          if (d.guarding) return core(attack, d, p, p.parryable, { returnProjectile: true });
          return result({ outcome: 'parried', parried: true, parryTarget: null, returnProjectile: true });
        }
        if (d.rollT > 0) return result({ outcome: 'dodged' });
        return core(attack, d, p, p.parryable);
      default:
        return core(attack, d, p, p.parryable);
    }
  }

  // 맞은 방향을 화면 가장자리 표시량으로. 각 값은 0~1, 더할 양이다.
  function hitDirection(from, player, yaw) {
    const dx = from.x - player.x, dz = from.z - player.z, len = Math.hypot(dx, dz) || 1;
    const f = (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / len; // 앞쪽 성분
    const r = (Math.cos(yaw) * dx - Math.sin(yaw) * dz) / len;  // 오른쪽 성분
    return { top: Math.max(0, f), bottom: Math.max(0, -f), right: Math.max(0, r), left: Math.max(0, -r) };
  }

  const Defense = { resolve, hitDirection, guardReduction, KINDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = Defense;
  else root.Defense = Defense;
})(typeof globalThis !== 'undefined' ? globalThis : this);
