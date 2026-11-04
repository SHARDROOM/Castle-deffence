// Armory: 무기·부품 데이터, 무기 성능 계산, 골드·장비·회복템 거래를 맡는 module.
//
// 상점 화면(DOM·3D 미리보기)은 index.html에 있고, 버튼은 armory의 거래 메서드를 부른 뒤
// 결과에 따라 사운드·다시 그리기만 한다. three.js·DOM에 의존하지 않는다.
//
// 브라우저에서는 전역 `Armory`, Node(테스트)에서는 require('./armory.js').
(function (root) {
  'use strict';

  // ---------- 무기 ----------
  // stats: 위력, 연사 속도, 사거리, 탄창 (1~5)
  const WEAPONS = {
    rifle:  {name:'돌격소총', desc:'빠르게 연사해요. 어느 거리에서나 무난해요.', mag:24, rate:0.11, dmg:1, pellets:1, spread:0.016, range:80, reload:1.4, recoil:0.008, stats:[2,5,4,5]},
    pistol: {name:'권총', desc:'가볍고 다루기 쉬운 반자동 권총이에요. 연사와 장전 속도가 무난해요.', mag:12, rate:0.2, dmg:1.4, pellets:1, spread:0.014, range:60, reload:1.1, recoil:0.012, stats:[2,3,3,2]},
    sniper: {name:'저격총', desc:'한 발이 강하고 줄 선 적을 관통해요. 조준경으로 확대해서 쏘면 정확해요.', mag:5, rate:0.95, dmg:5, pellets:1, spread:0.024, range:120, reload:2.0, recoil:0.06, pierce:true, zoom:true, stats:[5,1,5,1]},
    sword:  {name:'일본도', desc:'가까이서 베는 근접 무기예요. 패링으로 공격을 받아치고, 그로기 상태의 적은 처형할 수 있어요. 보급 무기는 떨어지지 않지만 경험치를 1.5배로 얻어요.', melee:true, mag:1, rate:0.48, dmg:3, pellets:1, spread:0, range:3.0, reload:0, recoil:0, parryWin:.4, parryCd:1, parryRange:6, parryPow:100, stats:[4,3,1,5]},
    shotgun:{name:'샷건', desc:'산탄 8발을 한꺼번에 쏴요. 가까울수록 강하고 멀어지면 약해져요.', mag:6, rate:0.7, dmg:1, pellets:8, spread:0.12, range:28, falloff:9, reload:2.1, recoil:0.042, stats:[4,2,1,2]}
  };
  // 필드 보급 무기: 탄 제한, 장전 없음, 다 쓰면 기본 무기로 돌아감
  const SPECIALS = {
    minigun:{name:'미니건', special:true, ammo:220, mag:220, rate:0.05, dmg:1, pellets:1, spread:0.03, range:70, recoil:0.0025, spin:true},
    flame:  {name:'화염방사기', special:true, ammo:160, mag:160, flame:true, range:7.5, dmg:0.3}
  };

  // ---------- 총기 부품 (상점) ----------
  // 각 총의 부품 칸: 총구, 총열, 스코프, 언더배럴, 탄창, 개머리판, 컨버전 (only: 그 총에만 달 수 있음)
  const PARTS = {
    muzzle: [
      {id:'brake', name:'제동기', price:120, desc:'반동 -40%', mod:{recoil:.6}},
      {id:'hider', name:'소염기', price:120, desc:'탄 퍼짐 -20%, 총구 화염 감소', mod:{spread:.8, flash:.45}},
      {id:'booster', name:'머즐 부스터', price:140, desc:'연사 +20%, 반동 +25%', mod:{rate:1/1.2, recoil:1.25}},
      {id:'choke', name:'쵸크', price:130, desc:'탄 퍼짐 -35%', mod:{spread:.65}, only:['shotgun']},
      {id:'duck',  name:'덕빌', price:130, desc:'탄이 세로로 모임 (가로 퍼짐 -70%, 세로 퍼짐 +25%)', mod:{spreadX:.3, spreadY:1.25}, only:['shotgun']}
    ],
    barrel: [
      {id:'extb', name:'연장 총열', price:180, desc:'피해 +20%', mod:{dmg:1.2}},
      {id:'cutb', name:'컷오프 배럴', price:120, desc:'이동 속도 +10%, 탄 퍼짐 +60%, 반동 +30%', mod:{move:1.1, spread:1.6, recoil:1.3}}
    ],
    scope: [
      {id:'iron',   name:'기계식 조준기', price:60,  desc:'조준 가능 · 1.25배 · 평소 탄 퍼짐 -12%, 조준 시 -25%', zoom:1.25, aimCut:.25, type:'iron', mod:{spread:.88}},
      {id:'reddot', name:'레드도트',     price:120, desc:'1.5배 · 조준 시 탄 퍼짐 -45%', zoom:1.5, aimCut:.45, type:'dot'},
      {id:'holo',   name:'홀로그램',     price:160, desc:'1.8배 · 조준 시 탄 퍼짐 -55%', zoom:1.8, aimCut:.55, type:'holo'},
      {id:'x4',     name:'4배율 조준경', price:250, desc:'4배 · 조준 시 탄 퍼짐 -80%', zoom:4, aimCut:.8, type:'optic'},
      {id:'x8',     name:'8배율 조준경', price:350, desc:'8배 · 조준 시 탄이 퍼지지 않음', zoom:8, aimCut:1, type:'optic'}
    ],
    under: [
      {id:'vgrip', name:'수직 손잡이', price:140, desc:'반동 -25%, 탄 퍼짐 -15%', mod:{recoil:.75, spread:.85}},
      {id:'agrip', name:'앵글 손잡이', price:140, desc:'반동 -10%, 조준 속도 +60%', mod:{recoil:.9, aimSpeed:1.6}}
    ],
    mag: [
      {id:'ext',   name:'확장 탄창',     price:150, desc:'탄창 +50%, 장전 시간 +15%', mod:{mag:1.5, reload:1.15}},
      {id:'quick', name:'퀵드로우 탄창', price:150, desc:'장전 시간 -35%', mod:{reload:.65}}
    ],
    stock: [
      {id:'shorts', name:'숏 개머리판',   price:100, desc:'이동 속도 +5%', mod:{move:1.05}},
      {id:'exts',   name:'연장 개머리판', price:160, desc:'이동 속도 -5%, 연사 +8%, 좌우 반동 -25%', mod:{move:.95, rate:1/1.08, recoilH:.75}}
    ],
    // 사이드 조준기 칸: 레일 오른쪽에 45° 기울여 다는 보조 조준기 (강화 없음)
    side: [
      {id:'sidedot', name:'미니 레드도트 (45°)', price:150, desc:'레일 옆에 45°로 다는 작은 레드도트. 4배율 이상 조준경으로 조준 중에 조준점 근처로 적이 가까이 오면, 총을 자동으로 기울여 이 레드도트로 바로 조준해요', mod:{sideDot:1}, only:['rifle','sniper','shotgun'], noUp:true}
    ],
    // 소음기 칸: 총구 장치 앞에 따로 덧붙임 (강화 없음)
    supp: [
      {id:'suppressor', name:'소음기', price:180, desc:'총구 앞에 끼우는 소음기. 총소리가 작고 짧은 \'퍽\' 소리로 바뀌고 총구 화염이 거의 사라짐', mod:{flash:.15}, only:['rifle','pistol','sniper'], noUp:true}
    ],
    // 탄종 칸: 탄창 칸(확장·퀵드로우)과 따로 하나씩 고를 수 있음
    ammo: [
      {id:'g12',   name:'12게이지', price:200, desc:'한 번에 펠렛 5개를 쏨 (펠렛당 피해 45%), 탄 퍼짐 크게 증가', mod:{setPellets:5, dmg:.45, spread:3, spreadMin:.05}, only:['rifle','sniper','pistol']},
      {id:'lr22',  name:'.22LR', price:160, desc:'피해 ×0.3, 연사 2배, 반동 -70%', mod:{dmg:.3, rate:.5, recoil:.3}, only:['rifle','sniper','pistol']},
      {id:'slug',  name:'슬러그', price:180, desc:'산탄을 한 발로 뭉침: 펠렛 수만큼 피해를 모으고 15% 추가, 탄 퍼짐 대폭 감소, 반동 +30%', mod:{slug:1, spread:.12, recoil:1.3}, only:['shotgun']},
      {id:'bmg50', name:'.50 BMG', price:300, desc:'연사 약 ×0.29, 피해 ×4, 반동 ×4.5. 연달아 쏠수록 반동이 더 커짐 (한 발마다 +40%, 최대 +200%, 쉬면 회복)', mod:{rate:3.5, dmg:4, recoil:4.5}, only:['rifle','sniper','pistol']}
    ],
    // 일본도 칸: 도신, 가드, 손잡이, 영혼
    blade: [
      {id:'greatb', name:'대검날', price:280, desc:'넓고 두꺼운 대검 날: 공격 속도 크게 감소, 피해·패링(가드) 강도 크게 증가, 베기 사거리 +0.6m. 대신 패링 실패 시 대기 +2초, 구르기 쿨타임 +1초. 지키는 자와 함께면 가드 때 칼을 땅에 꽂고 버팀', mod:{great:1, blade:1.15, rate:1.8, dmg:2.2, parryPow:60, rangeAdd:.6, parryCdAdd:2, rollCdAdd:1}},
      {id:'longb',  name:'연장 도신', price:200, desc:'칼이 길어짐: 베기 사거리 +0.8m, 패링 사거리 +1.5m, 공격 속도 -20%', mod:{rangeAdd:.8, parryRangeAdd:1.5, rate:1.25, blade:1.35}},
      {id:'shortb', name:'도신 단축', price:160, desc:'칼이 아주 짧아짐: 이동 속도 +25%, 공격 속도 +60%, 베기 사거리 -55%, 패링 강도 -40', mod:{move:1.25, rate:1/1.6, rangeMul:.45, parryPow:-40, blade:.45}},
      {id:'rapierb', name:'레이피어 날', price:240, desc:'은색의 얇고 뾰족한 찌르기 검: 공격 속도 +35%, 패링 강도 -40, 패링 사거리 +2m. 패링 대신 정밀 흘리기 (적 공격이 닿기 직전에 공격 버튼을 한 번 누르면 날로 빗겨 쳐냄). 공격 버튼을 누르고 있으면 좌우로 벤 뒤 연속 찌르기 (공격 속도가 빠를수록 더 많이). 지키는 자와 함께면 날을 세워 가드', mod:{rapier:1, rate:1/1.35, parryPow:-40, parryRangeAdd:2, blade:1.15}}
    ],
    guard: [
      {id:'noguard', name:'가드 제거', price:140, desc:'패링 유예 0.4 → 0.15초, 패링 쿨타임 -0.4초, 공격 속도 +40%', mod:{parryWin:.15, parryCdAdd:-.4, rate:1/1.4, guard:0}, maxLv:5},
      {id:'rapierg', name:'레이피어 가드', price:150, desc:'손을 감싸는 은색 돔 모양 가드: 공격 속도 +20%', mod:{rate:1/1.2, rapierGuard:1}}
    ],
    grip: [
      {id:'longg',  name:'연장 손잡이', price:150, desc:'손잡이가 길어짐: 베기 사거리 +0.5m, 패링 사거리 +1m', mod:{rangeAdd:.5, parryRangeAdd:1, grip:1.4}},
      {id:'shortg', name:'단축 손잡이', price:120, desc:'이동 속도 +10%, 공격 속도 +15%, 패링 강도 -20', mod:{move:1.1, rate:1/1.15, parryPow:-20, grip:.6}},
      {id:'rapierh', name:'레이피어 손잡이', price:130, desc:'은색 줄을 감은 가죽 손잡이: 이동 속도 +12%, 패링 강도 -20', mod:{move:1.12, parryPow:-20, rapierGrip:1}}
    ],
    saya: [ // 검집
      {id:'basicsaya', name:'기본 검집', price:100, desc:'칼을 칼집에 넣은 상태(납도)로 패링하거나 가드하면 패링 강도 +30', mod:{sheathPow:30}}
    ],
    soul: [
      {id:'guardian', name:'지키는 자', price:260, desc:'칼에 흰 기백이 서림. 패링을 길게 누르면 가드: 패링 강도에 비례해 받는 피해 감소(100당 30%, 최대 60%), 화살 튕겨냄, 근접 공격은 막지만 그로기는 안 걸림. 가드를 풀면 막아낸 피해에 비례해 앞쪽 반원을 1~5번 벰', mod:{guardian:1}},
      {id:'crave', name:'끝없는 갈망', price:220, desc:'공격이 맞을 때마다 체력 0.6 회복, 처치하면 5 추가 회복 (칼날이 붉게 물듦)', mod:{crave:1}, lateRate:.08}
    ],
    // 스킬 칸: 모든 총 공통. 하나를 사서 달면 Q(스킬 버튼)로 사용. 강화하면 스킬 위력이 오름
    skill: [
      {id:'sk_bash',   name:'일격',   price:300, skill:'bash',   desc:'개머리판으로 주변 적을 밀쳐내며 둔화시키고, 곧바로 가장 가까운 적의 머리에 자동으로 두 발'},
      {id:'sk_double', name:'연사',   price:280, skill:'double', desc:'8초 동안 쏠 때마다 40% 확률로 총알 두 발 발사 (추가 탄은 탄창 소모 없음)'},
      {id:'sk_shell',  name:'강화탄', price:300, skill:'shell',  desc:'강화탄 3발 장전: 피해 2.2배, 맞은 적을 밀어내고 둔화'},
      {id:'sk_heli',   name:'공중지원', price:420, skill:'heli', desc:'헬기를 불러 20초 동안 하늘을 돌며, 탑승한 사수 두 명이 지금 든 총과 같은 총으로 주변 적을 난사'}
    ],
    conv: [
      {id:'dual', name:'듀얼', price:250, desc:'양손에 권총을 하나씩 들고 번갈아 쏨: 연사 약 1.8배, 탄창 2배, 탄 퍼짐 +30%, 장전 +30%, 조준 불가', mod:{rate:.55, spread:1.3, mag:2, reload:1.3, dual:1}, only:['pistol']},
      {id:'bolt', name:'볼트액션', price:220, desc:'한 발씩 장전하는 방식으로 바뀜: 연사 ×0.35, 피해 ×2.5, 반동 +60%', mod:{rate:1/.35, dmg:2.5, recoil:1.6}, only:['rifle','shotgun','pistol']}
    ]
  };
  // 조준기 장착면 높이(총별)와 조준선 높이(조준기별): 조준할 때 이 높이가 화면 한가운데로 오게 총을 올림
  const MOUNT_Y = {rifle:.047, pistol:.058, sniper:.059, shotgun:.038};
  const SIGHT_OFF = {iron:.034, dot:.034, holo:.044, optic:.046};
  const GUN_SLOTS = ['muzzle','supp','barrel','scope','side','under','mag','ammo','stock','conv','skill'];
  const SLOT_NAMES = {muzzle:'총구', barrel:'총열', scope:'스코프', under:'언더배럴', mag:'탄창', ammo:'탄종', supp:'소음기', side:'사이드', stock:'개머리판', conv:'컨버전', skill:'스킬', blade:'도신', saya:'검집', guard:'가드', grip:'손잡이', soul:'영혼'};
  const SWORD_SLOTS = ['blade','guard','grip','saya','soul'];

  // ---------- 부품 강화 (Lv1~10): 장점은 레벨마다 +20%, 단점은 레벨마다 -12% ----------
  const MAX_LV = 10;
  const maxLvOf = pt => pt.maxLv || MAX_LV;
  // 레벨당 장점 배율: 기본 +20%씩, lateRate가 있는 부품은 Lv5 이후 상승폭이 줄어듦
  const lvMul = (pt, lv) => pt.lateRate && lv > 5 ? 1.8 + pt.lateRate*(lv - 5) : 1 + .2*(lv - 1);
  const lvDown = lv => Math.max(.5, 1 - .06*(lv - 1)); // 단점은 레벨당 6%씩, 최대 절반까지만 줄어듦
  const lvOf = (gear, key, id) => (gear[key].lv && gear[key].lv[id]) || 1;
  const upCost = (pt, lv) => Math.round(pt.price*.6*lv);
  const GOOD_MUL = {recoil:-1, spread:-1, spreadX:-1, mag:1, reload:-1, flash:-1, aimSpeed:1, dmg:1, rate:-1, move:1, recoilH:-1, rangeMul:1};
  const GOOD_ADD = {rangeAdd:1, parryRangeAdd:1, parryPow:1, parryCdAdd:-1, sheathPow:1, rollCdAdd:-1};
  // 부품 효과를 레벨에 맞춘 실제 수치로 글로 풀어 씀 (예: 반동 -56%, 피해 ×3.1)
  function partEffectText(part, lv){
    const m = modOf(part, lv), f = m.lvMul, out = [];
    const pct = (v, name) => { const d = Math.round((v - 1)*100); if (d) out.push(`${name} ${d > 0 ? '+' : ''}${d}%`); };
    if (m.dmg) (m.dmg >= 2 ? out.push(`피해 ×${m.dmg.toFixed(1)}`) : pct(m.dmg, '피해'));
    if (m.rate){ const sp = 1/m.rate; sp >= 2 || sp <= .5 ? out.push(`연사 ×${sp.toFixed(2)}`) : pct(sp, '연사'); }
    if (m.setPellets) out.push(`펠렛 ${m.setPellets}개`);
    if (m.slug) out.push('산탄을 한 발로 뭉침');
    if (m.mag) pct(m.mag, '탄창');
    if (m.reload) pct(m.reload, '장전 시간');
    if (m.recoil) pct(m.recoil, '반동');
    if (m.recoilH) pct(m.recoilH, '좌우 반동');
    if (m.spread) pct(m.spread, '탄 퍼짐');
    if (m.spreadX) pct(m.spreadX, '가로 퍼짐');
    if (m.spreadY) pct(m.spreadY, '세로 퍼짐');
    if (m.flash) pct(m.flash, '총구 화염');
    if (m.aimSpeed) pct(m.aimSpeed, '조준 속도');
    if (m.move) pct(m.move, '이동 속도');
    if (part.zoom) out.push(`배율 ${part.zoom}배`, `조준 시 퍼짐 -${Math.round(Math.min(1, part.aimCut*f)*100)}%`);
    if (m.rangeMul) pct(m.rangeMul, '베기 사거리');
    if (m.rangeAdd) out.push(`베기 사거리 +${m.rangeAdd.toFixed(2)}m`);
    if (m.parryRangeAdd) out.push(`패링 사거리 +${m.parryRangeAdd.toFixed(2)}m`);
    if (m.parryPow) out.push(`패링 강도 ${m.parryPow > 0 ? '+' : ''}${Math.round(m.parryPow)}`);
    if (m.sheathPow) out.push(`납도 패링 강도 +${Math.round(m.sheathPow)}`);
    if (m.rollCdAdd) out.push(`구르기 쿨타임 +${m.rollCdAdd.toFixed(2)}초`);
    if (m.parryWin) out.push(`패링 유예 ${m.parryWin.toFixed(2)}초`);
    if (m.parryCdAdd) out.push(`패링 쿨타임 ${m.parryCdAdd.toFixed(2)}초`);
    if (m.crave) out.push(`적중 회복 ${(.6*f).toFixed(2)}`, `처치 회복 ${(5*f).toFixed(1)}`);
    if (m.rapier) out.push('패링 대신 정밀 흘리기', '누르고 있으면 연속 찌르기');
    if (part.skill) out.push(`스킬 위력 ×${f.toFixed(1)}`);
    if (m.dual) out.push('쌍권총');
    return out.join(' · ') || '효과 없음';
  }
  function modOf(part, lv){
    const m = part.mod || {}, out = {}, f = lvMul(part, lv), g = lvDown(lv);
    for (const k in m){
      const v = m[k];
      if (k in GOOD_MUL){ // 늘어나는 장점은 비례해서, 줄어드는 효과·단점은 거듭제곱으로 (0이 되거나 폭주하지 않게)
        const good = Math.sign(v - 1) === GOOD_MUL[k];
        let e = good ? f : g; if (k === 'rate' && good) e = 1 + (f - 1)*.3; // 연사 증가는 강화 폭을 작게
        out[k] = good && GOOD_MUL[k] > 0 ? 1 + (v - 1)*e : Math.pow(v, e);
      }
      else if (k in GOOD_ADD){ const good = Math.sign(v) === GOOD_ADD[k]; out[k] = v*(good ? f : g); }
      else if (k === 'parryWin') out[k] = .4 - (.4 - v)*g;      // 가드 제거의 짧은 패링 유예는 강화할수록 덜 짧아짐
      else if (k === 'spreadY') out[k] = 1 + (v - 1)*g;         // 덕빌의 세로 퍼짐(부작용)도 줄어듦
      else out[k] = v;                                          // 모양 관련 값은 그대로
    }
    out.lvMul = f;
    return out;
  }
  const findPart = (slot, id) => (PARTS[slot] || []).find(p => p.id === id);
  const partsFor = (slot, key) => (PARTS[slot] || []).filter(p => !p.only || p.only.includes(key));
  // 기본 무기 + 장착 부품으로 실제 성능 계산. eq를 생략하면 gear에 장착된 부품
  function weaponStats(key, eq, gear){
    const base = WEAPONS[key], w = Object.assign({}, base);
    if (base.melee){ // 일본도: 도신·가드·손잡이 부품
      eq = eq || gear[key].eq;
      Object.assign(w, {moveMul:1, bladeScale:1, gripScale:1, guard:true});
      for (const slot in eq){
        const part = findPart(slot, eq[slot]); if (!part) continue;
        const m = modOf(part, lvOf(gear, key, part.id));
        if (m.rangeMul) w.range *= m.rangeMul;
        if (m.rangeAdd) w.range += m.rangeAdd;
        if (m.rate) w.rate *= m.rate;
        if (m.move) w.moveMul *= m.move;
        if (m.parryWin) w.parryWin = m.parryWin;
        if (m.parryCdAdd) w.parryCd += m.parryCdAdd;
        if (m.parryRangeAdd) w.parryRange += m.parryRangeAdd;
        if (m.parryPow) w.parryPow += m.parryPow;
        if (m.blade) w.bladeScale *= m.blade;
        if (m.grip) w.gripScale *= m.grip;
        if (m.guard === 0) w.guard = false;
        if (m.crave){ w.crave = true; w.craveMul = m.lvMul; }
        if (m.guardian) w.guardian = true;
        if (m.sheathPow) w.sheathPow = (w.sheathPow || 0) + m.sheathPow;
        if (m.dmg) w.dmg *= m.dmg;
        if (m.great) w.great = true;
        if (m.rapier) w.rapier = true;           // 레이피어 날: 찌르기·정밀 흘리기, 패링 불가
        if (m.rapierGuard) w.rapierGuard = true; // 은색 돔 가드 (모양)
        if (m.rapierGrip) w.rapierGrip = true;   // 은색 줄 손잡이 (모양)
        if (m.rollCdAdd) w.rollCdAdd = (w.rollCdAdd || 0) + m.rollCdAdd;
      }
      return w;
    }
    eq = eq || gear[key].eq;
    Object.assign(w, {zoom:false, zoomX:1, zoomFov:75, aimCut:0, scopeType:null, flashScale:1, aimSpeed:1, moveMul:1, recoilHMul:1, spreadX:1, spreadY:1});
    for (const slot in eq){
      const part = findPart(slot, eq[slot]); if (!part) continue;
      const lv = lvOf(gear, key, part.id), m = modOf(part, lv);
      if (m.recoil) w.recoil *= m.recoil;
      if (m.spread) w.spread *= m.spread;
      if (m.spreadX) w.spreadX *= m.spreadX;
      if (m.spreadY) w.spreadY *= m.spreadY;
      if (m.mag) w.mag = Math.ceil(w.mag*m.mag);
      if (m.reload) w.reload *= m.reload;
      if (m.flash) w.flashScale *= m.flash;
      if (m.aimSpeed) w.aimSpeed *= m.aimSpeed;
      if (m.dmg) w.dmg *= m.dmg;
      if (m.rate) w.rate *= m.rate;
      if (m.move) w.moveMul *= m.move;
      if (m.recoilH) w.recoilHMul *= m.recoilH;
      if (m.dual) w.dual = true;
      if (m.sideDot) w.sideDot = true;
      if (m.setPellets) w.pellets = m.setPellets;                       // 12게이지: 여러 발로 쪼개짐
      if (m.slug){ w.dmg *= w.pellets*1.15; w.pellets = 1; w.falloff = 0; w.slug = true; } // 슬러그: 한 발로 뭉침
      if (m.spreadMin) w.spread = Math.max(w.spread, m.spreadMin);
      if (part.skill){ w.skill = part.skill; w.skillMul = m.lvMul; } // 장착한 스킬과 강화 배율
      if (part.zoom && scopeAllowed(eq)){ w.sightH = (MOUNT_Y[key] || .047) + SIGHT_OFF[part.type]; w.zoom = true; w.zoomX = part.zoom; w.aimCut = Math.min(1, part.aimCut*m.lvMul); w.scopeType = part.type; w.zoomFov = 2*Math.atan(Math.tan(75*Math.PI/360)/part.zoom)*180/Math.PI; }
    }
    return w;
  }

  // 쌍권총에는 조준기를 달 수 없다 (규칙은 여기 한 곳)
  // 레이피어 연속 찌르기 횟수: 3 × 공격 속도 배율(기본 일본도 대비, 증강·아드레날린 포함), 최대 8번
  function thrustCount(w, rateMul = 1) {
    const speed = WEAPONS.sword.rate / w.rate * rateMul;
    return Math.max(1, Math.min(8, Math.round(3 * speed)));
  }

  function scopeAllowed(eq) { return !eq || eq.conv !== 'dual'; }

  // ---------- 회복템: 붕대, 아드레날린, 구급상자 ----------
  const ITEMS = {
    bandage:{name:'붕대', icon:'🩹', key:'1', price:40, dur:1.6, heal:25, slow:.5, desc:'1.6초 동안 팔에 붕대를 감으며 체력 25를 서서히 회복. 감는 동안 느려짐'},
    adren:  {name:'아드레날린', icon:'💉', key:'2', price:60, dur:.9, heal:8, buff:8, desc:'주사기를 팔에 빠르게 꽂음: 체력 8 회복 + 8초 동안 받는 피해 -30%, 공격 속도 +15%'},
    medkit: {name:'구급상자', icon:'🧰', key:'3', price:120, dur:4.5, heal:70, slow:.4, desc:'4.5초 동안 붕대를 감고 주사를 놓아 체력 70 회복. 쓰는 동안 많이 느려짐'}
  };

  const WEAPON_KEYS = Object.keys(WEAPONS);

  // 한 판 동안의 골드·장비·회복템. gear와 inv는 같은 객체를 비우고 다시 채운다(외부 별칭 유지).
  function create() {
    const gear = {}, inv = {};
    const a = {
      gold: 0, gear, inv,
      resetGear() { for (const k of WEAPON_KEYS) gear[k] = { owned: new Set(), eq: {}, lv: {} }; },
      resetWallet(testMode) { a.gold = testMode ? 10000 : 0; for (const k in ITEMS) inv[k] = 0; }, // 테스트 모드는 골드 10000
      earn(n) { a.gold += n; },
      // 부품을 장착한다. 없으면 사서 장착. id = null이면 그 칸을 비움.
      equip(key, slot, id) {
        const G = gear[key];
        if ((G.eq[slot] || null) === id) return { ok: false, reason: 'equipped' };
        let bought = false;
        if (id !== null && !G.owned.has(id)) {
          const pt = findPart(slot, id);
          if (a.gold < pt.price) return { ok: false, reason: 'noGold' };
          a.gold -= pt.price; G.owned.add(id); bought = true;
        }
        if (id === null) delete G.eq[slot]; else G.eq[slot] = id;
        let scopeRemoved = false;
        if (!scopeAllowed(G.eq) && G.eq.scope) { delete G.eq.scope; scopeRemoved = true; }
        return { ok: true, bought, scopeRemoved };
      },
      // 가진 부품을 한 단계 강화
      upgrade(key, slot, id) {
        const G = gear[key], pt = findPart(slot, id);
        if (!G.owned.has(id)) return { ok: false, reason: 'notOwned' };
        if (pt.noUp) return { ok: false, reason: 'noUp' };
        const lv = lvOf(gear, key, id), cost = upCost(pt, lv);
        if (lv >= maxLvOf(pt)) return { ok: false, reason: 'max', cost };
        if (a.gold < cost) return { ok: false, reason: 'noGold', cost };
        a.gold -= cost; G.lv[id] = lv + 1;
        return { ok: true, cost, lv: lv + 1 };
      },
      buyItem(k) {
        if (a.gold < ITEMS[k].price) return { ok: false, reason: 'noGold' };
        a.gold -= ITEMS[k].price; inv[k]++;
        return { ok: true };
      },
      takeItem(k) { if (!inv[k]) return false; inv[k]--; return true; },
    };
    a.resetGear(); a.resetWallet(false);
    return a;
  }

  const Armory = {
    create, weaponStats, thrustCount, scopeAllowed, lvOf, upCost, maxLvOf, modOf, partEffectText, findPart, partsFor,
    WEAPONS, SPECIALS, PARTS, ITEMS, MOUNT_Y, SIGHT_OFF, GUN_SLOTS, SLOT_NAMES, SWORD_SLOTS, MAX_LV,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Armory;
  else root.Armory = Armory;
})(typeof globalThis !== 'undefined' ? globalThis : this);
