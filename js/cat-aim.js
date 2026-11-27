/* Warcats cat that aims at the cursor.
   Built from the game rig (Player.prefab + the_player.psb). Coordinates are full-size PSB pixels (1481 x 1958).
   Values marked [PREFAB] come straight from RigAimController in Player.prefab; [ART] come from the PSB layers;
   [GUESS] are placeholders until RigAimController.cs / the gun sprite meta are checked. */
var CatAim = (function () {
  var CFG = {
    exportScale: 0.6,            // layer images were saved at 60% of full size
    canvasW: 1481, canvasH: 1958,
    anchor: { x: 741, y: 884 },  // [GUESS] WeaponAnchor (chest, between the shoulders)
    gunDistance: -60,             // [GUESS] prefab says 0.25 world units (~238 px at 100 px/unit); 70 puts the stock on the chest
    gunLength: 1250,             // [GUESS] M4 length in cat pixels (image is 1985 px; shown at this length)
    gunBoreY: 165 / 546,         // [ART] muzzle line, fraction of gun height from the top
    gripTrigger: { x: 0.28, y: 0.78 },   // [GUESS] trigger-hand point on the gun image (fractions)
    gripSupport: { x: 0.50, y: 0.48 },   // [GUESS] support-hand point on the gun image (fractions)
    maxGunTurn: 88,              // [PREFAB] maxGunTurnFromFacing
    mirrorDeadZone: 0.15,        // [PREFAB] share of width around the middle where the cat keeps its side
    bodyWeight: 0.35 * 2, maxBody: 25,   // [PREFAB] bodyBones: 2 bones x 0.35, maxBodyAngle 25
    headWeight: 0.7, maxHead: 35,        // [PREFAB] headWeight 0.7, maxHeadAngle 35
    turnSmooth: 18,              // [PREFAB] turnSmooth
    // arm joints in PSB pixels [ART]: shoulder, elbow, wrist for the right-hand arm (the one that points +x in the T-pose)
    armR: { s: { x: 845, y: 908 }, e: { x: 1100, y: 908 }, w: { x: 1297, y: 908 } },
    armL: { s: { x: 640, y: 908 }, e: { x: 380, y: 908 },  w: { x: 188,  y: 908 } }
  };
  var L = {}; // layers
  var NAMES = ['tail1','tail2','tail3','legR1','legR2','legL1','legL2','hips','torso','armR1','armR2','armL1','armL2','handR','handL',
    'earL','earR','earInner','head','eyeWhiteL','eyeWhiteR','eyeBlueL','eyeBlueR','pupilL','pupilR','glintL','glintR','lidL','lidR','browL','browR','nose','m4'];
  var POS = null;

  function load(base, done) {
    var left = NAMES.length;
    NAMES.forEach(function (n) {
      var im = new Image();
      im.onload = function () { if (--left === 0) done(); };
      im.src = base + n + '.png';
      L[n] = im;
    });
  }
  var LAYER_POS = {"tail3":[268,1267],"tail1":[97,1189],"armR1":[837,829],"armR2":[1027,831],"handR":[1231,840],"tail2":[165,1190],"earL":[205,34],"earR":[777,0],"legR1":[793,1577],"legR2":[790,1449],"hips":[489,958],"torso":[500,774],"head":[224,169],"eyeWhiteR":[800,569],"eyeWhiteL":[476,574],"pupilL":[564,579],"pupilR":[842,575],"glintL":[600,615],"nose":[727,675],"browL":[593,478],"browR":[805,479],"glintR":[876,610],"lidL":[473,553],"eyeBlueL":[476,573],"legL1":[494,1577],"legL2":[491,1449],"lidR":[801,551],"eyeBlueR":[821,569],"earInner":[270,115],"armL1":[310,834],"armL2":[122,838],"handL":[106,843]};

  function deg(r) { return r * 180 / Math.PI; }
  function rad(d) { return d * Math.PI / 180; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // draw a layer at its PSB position, optionally rotated about (px,py) in PSB px
  function drawL(ctx, n, rot, px, py, dx, dy) {
    var im = L[n], p = LAYER_POS[n]; if (!p) return;
    var w = im.width / CFG.exportScale, h = im.height / CFG.exportScale;
    ctx.save();
    if (rot) { ctx.translate(px, py); ctx.rotate(rot); ctx.translate(-px, -py); }
    ctx.drawImage(im, p[0] + (dx || 0), p[1] + (dy || 0), w, h);
    ctx.restore();
  }

  // two-bone IK: returns elbow point for shoulder S, target T, lengths a,b, bending toward +y (down)
  function ik(S, T, a, b) {
    var dx = T.x - S.x, dy = T.y - S.y, d = Math.hypot(dx, dy);
    var dd = clamp(d, Math.abs(a - b) + 1, a + b - 1);
    var ang = Math.atan2(dy, dx);
    var cosA = (a * a + dd * dd - b * b) / (2 * a * dd);
    var A = Math.acos(clamp(cosA, -1, 1));
    var sgn = Math.cos(ang) >= 0 ? 1 : -1;       // keep the elbow below the line on both sides
    var ea = ang + A * sgn;
    var E = { x: S.x + Math.cos(ea) * a, y: S.y + Math.sin(ea) * a };
    var W = { x: S.x + Math.cos(ang) * dd, y: S.y + Math.sin(ang) * dd };
    return { E: E, W: W };
  }

  // create(basePath): loads the layers; render(ctx, p) draws one frame and returns the screen aim angle (radians), or null while loading.
  // p = { fx, fy: feet centre (css px), h: cat height head-to-feet (css px), tx, ty: point to aim at (css px), dt: seconds }
  function create(basePath) {
    var ready = false, face = 1, gunA = 0, headA = 0, bodyA = 0;
    load(basePath || '/img/cat-rig/', function () { ready = true; });
    var FEET_Y = 1887, TOP_Y = 0;
    function render(ctx, p) {
      if (!ready) return null;
      var k = p.h / (FEET_Y - TOP_Y);
      var ox = p.fx - CFG.canvasW / 2 * k, oy = p.fy - FEET_Y * k;
      var mx = (p.tx - ox) / k, my = (p.ty - oy) / k;
      var relx = (mx - CFG.anchor.x) / CFG.canvasW;
      if (relx > CFG.mirrorDeadZone * 0.05) face = 1; else if (relx < -CFG.mirrorDeadZone * 0.05) face = -1;
      var dx = (mx - CFG.anchor.x) * face, dy = my - CFG.anchor.y;
      var aim = deg(Math.atan2(dy, dx));
      var tgtGun = clamp(aim, -CFG.maxGunTurn, CFG.maxGunTurn);
      var tgtHead = clamp(tgtGun * CFG.headWeight, -CFG.maxHead, CFG.maxHead);
      var tgtBody = clamp(tgtGun * CFG.bodyWeight, -CFG.maxBody, CFG.maxBody);
      var f = 1 - Math.exp(-CFG.turnSmooth * Math.min(p.dt || 0.016, 0.05));
      gunA += (tgtGun - gunA) * f; headA += (tgtHead - headA) * f; bodyA += (tgtBody - bodyA) * f;
      ctx.save();
      ctx.translate(ox, oy); ctx.scale(k, k);
      if (face < 0) { ctx.translate(CFG.canvasW, 0); ctx.scale(-1, 1); }
      drawCat(ctx, k, gunA, headA, bodyA);
      ctx.restore();
      var ga = rad(gunA);
      return face > 0 ? ga : Math.PI - ga;
    }
    return { render: render, isReady: function () { return ready; } };
  }

  function drawCat(ctx, k, gunA, headA, bodyA) {
    var cxm = CFG.canvasW / 2, hipY = 1300, neckY = 860, ga = rad(gunA);
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(cxm, 1895, 330, 55, 0, 0, 7); ctx.fill(); ctx.restore();
    drawL(ctx, 'tail3'); drawL(ctx, 'tail2'); drawL(ctx, 'tail1');
    drawL(ctx, 'legR1'); drawL(ctx, 'legR2'); drawL(ctx, 'legL1'); drawL(ctx, 'legL2');
    ctx.save(); ctx.translate(cxm, hipY); ctx.rotate(rad(bodyA * 0.35)); ctx.translate(-cxm, -hipY);
    drawL(ctx, 'hips'); drawL(ctx, 'torso');
    var A = CFG.anchor, gl = CFG.gunLength, gimg = L.m4, gh = gl * gimg.height / gimg.width;
    var pivot = { x: A.x + Math.cos(ga) * CFG.gunDistance, y: A.y + Math.sin(ga) * CFG.gunDistance };
    function gunPt(fx, fy) {
      var lx = fx * gl, ly = (fy - CFG.gunBoreY) * gh;
      return { x: pivot.x + lx * Math.cos(ga) - ly * Math.sin(ga), y: pivot.y + lx * Math.sin(ga) + ly * Math.cos(ga) };
    }
    var trig = gunPt(CFG.gripTrigger.x, CFG.gripTrigger.y), sup = gunPt(CFG.gripSupport.x, CFG.gripSupport.y);
    function armDraw(Ar, T, a1, a2, hn) {
      var a = Math.hypot(Ar.e.x - Ar.s.x, Ar.e.y - Ar.s.y), b = Math.hypot(Ar.w.x - Ar.e.x, Ar.w.y - Ar.e.y);
      var sol = ik(Ar.s, T, a, b);
      var base1 = Math.atan2(Ar.e.y - Ar.s.y, Ar.e.x - Ar.s.x), base2 = Math.atan2(Ar.w.y - Ar.e.y, Ar.w.x - Ar.e.x);
      var r1 = Math.atan2(sol.E.y - Ar.s.y, sol.E.x - Ar.s.x) - base1;
      var r2 = Math.atan2(sol.W.y - sol.E.y, sol.W.x - sol.E.x) - base2;
      drawL(ctx, a1, r1, Ar.s.x, Ar.s.y);
      drawL(ctx, a2, r2, sol.E.x, sol.E.y, sol.E.x - Ar.e.x, sol.E.y - Ar.e.y);
      return { W: sol.W, r2: r2, hn: hn, d: { x: sol.W.x - Ar.w.x, y: sol.W.y - Ar.w.y } };
    }
    function armsAndGun() {
      // support arm (reaches out along the barrel) goes BEHIND the gun, the trigger arm and both hands go in FRONT of it
      var support = armDraw(CFG.armR, sup, 'armR1', 'armR2', 'handR');
      ctx.save(); ctx.translate(pivot.x, pivot.y); ctx.rotate(ga);
      ctx.drawImage(gimg, 0, -CFG.gunBoreY * gh, gl, gh); ctx.restore();
      var trigger = armDraw(CFG.armL, trig, 'armL1', 'armL2', 'handL');
      [support, trigger].forEach(function (h) { drawL(ctx, h.hn, h.r2, h.W.x, h.W.y, h.d.x, h.d.y); });
    }
    var gunOver = gunA < -25;   // aiming up: the gun and arms go in front of the head
    if (!gunOver) armsAndGun();
    ctx.save(); ctx.translate(cxm, neckY); ctx.rotate(rad(headA * 0.5)); ctx.translate(-cxm, -neckY);
    drawL(ctx, 'earL'); drawL(ctx, 'earR'); drawL(ctx, 'earInner'); drawL(ctx, 'head');
    var lookX = Math.cos(ga) * 14, lookY = Math.sin(ga) * 10;
    ['eyeWhiteL','eyeWhiteR','eyeBlueL','eyeBlueR'].forEach(function (n) { drawL(ctx, n); });
    ['pupilL','pupilR','glintL','glintR'].forEach(function (n) { drawL(ctx, n, 0, 0, 0, lookX, lookY); });
    ['lidL','lidR','browL','browR','nose'].forEach(function (n) { drawL(ctx, n); });
    ctx.restore();
    if (gunOver) armsAndGun();
    ctx.restore();
  }

  return { create: create, cfg: CFG };
})();
