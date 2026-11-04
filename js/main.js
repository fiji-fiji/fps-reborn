// Sets everything up and runs the game loop.
// Settings come from the address bar: ?map=oasis&mode=standard&bots=easy

(() => {
  const canvas = document.getElementById('game');

  // --- renderer: full resolution, smooth edges, soft sun shadows (clean "toy" look) ---
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.autoClear = false;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  Textures.atlas.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const HORIZON = 0xd7eeff;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(HORIZON);
  scene.fog = new THREE.Fog(HORIZON, 70, 190);
  // soft light from the sky above + warm bounce from the sand below
  scene.add(new THREE.HemisphereLight(0xe3f2ff, 0xd8c29a, 0.62));
  const sun = new THREE.DirectionalLight(0xfff0d6, 0.62);   // warm sunlight that casts shadows
  scene.add(sun, sun.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;

  // sky: a big gradient dome + a few puffy clouds drifting slowly
  const skyGeo = new THREE.SphereGeometry(500, 32, 16);
  const skyCols = [];
  const topC = new THREE.Color(0x5aa9f2), midC = new THREE.Color(HORIZON);
  for (let i = 0; i < skyGeo.attributes.position.count; i++) {
    const y = skyGeo.attributes.position.getY(i) / 500;
    const c = midC.clone().lerp(topC, Math.pow(Math.max(0, y), 0.6));
    skyCols.push(c.r, c.g, c.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyCols, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  scene.add(sky);
  const clouds = new THREE.Group();
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9aa4b4, fog: false });
  const crng = makeRng(99);
  for (let i = 0; i < 16; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 4 + Math.floor(crng() * 3); k++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(4 + crng() * 4, 12, 8), cloudMat);
      puff.position.set((k - 2) * 5 + crng() * 3, crng() * 2, crng() * 5);
      puff.scale.y = 0.6;
      c.add(puff);
    }
    const a = crng() * Math.PI * 2, r = 120 + crng() * 160;
    c.position.set(48 + Math.cos(a) * r, 55 + crng() * 25, 48 + Math.sin(a) * r);
    clouds.add(c);
  }
  scene.add(clouds);

  const FOV = 70;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 300);
  camera.rotation.order = 'YXZ';

  // the blaster is drawn in its own pass so it never pokes through walls
  const viewScene = new THREE.Scene();
  const viewCamera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
  viewScene.add(viewCamera);
  viewScene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const vSun = new THREE.DirectionalLight(0xffffff, 0.6);
  vSun.position.set(0.3, 1, 0.5);
  viewScene.add(vSun);

  // --- settings from the address bar ---
  const params = new URLSearchParams(location.search);
  const choose = (name, allowed, fallback) => (allowed.includes(params.get(name)) ? params.get(name) : fallback);
  const MAP_ID = choose('map', Object.keys(MAPS), 'oasis');
  const MODE = choose('mode', ['standard', 'swiftplay', 'skirmish'], 'standard');
  const BOTS = choose('bots', Object.keys(BOT_LEVELS), 'easy');

  const mapDef = MAPS[MAP_ID];
  const world = new World(...mapDef.size);
  const mapInfo = mapDef.build(world);
  scene.add(world.buildMesh());
  if (mapInfo.decor) buildDecor(scene, mapInfo.decor);
  {
    const cx = world.sx / 2, cz = world.sz / 2, half = Math.max(world.sx, world.sz) * 0.75;
    sun.target.position.set(cx, 0, cz);
    sun.position.set(cx + 40, 90, cz + 25);
    const sc = sun.shadow.camera;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
    sc.near = 10; sc.far = 220;
    sc.updateProjectionMatrix();
  }

  const effects = new Effects(scene);
  HUD.init({ mode: { hud: () => null } });   // HUD elements ready before the match starts
  const game = new Game({ scene, world, mapInfo, effects, camera, difficulty: BOTS, modeName: MODE });
  HUD.init(game);
  const me = game.player;
  const viewmodel = new Viewmodel(viewCamera);

  window.game = { scene, world, game, me, mapInfo, effects, renderer, viewmodel }; // handy for debugging in the browser console

  // --- mouse sensitivity (kept in this browser) ---
  let sensitivity = 1;
  try { sensitivity = parseFloat(localStorage.getItem('fps.sens')) || 1; } catch (e) {}
  const sensInput = document.getElementById('sens');
  const sensVal = document.getElementById('sensVal');
  sensInput.value = sensitivity;
  sensVal.textContent = sensitivity.toFixed(2);
  sensInput.addEventListener('input', () => {
    sensitivity = parseFloat(sensInput.value);
    sensVal.textContent = sensitivity.toFixed(2);
    try { localStorage.setItem('fps.sens', sensitivity); } catch (e) {}
  });

  // --- volume (kept in this browser) ---
  const volInput = document.getElementById('vol');
  let volume = 0.7;
  try { const v = parseFloat(localStorage.getItem('fps.vol')); if (!Number.isNaN(v)) volume = v; } catch (e) {}
  volInput.value = volume;
  Sound.setVolume(volume);
  volInput.addEventListener('input', () => {
    volume = parseFloat(volInput.value);
    Sound.setVolume(volume);
    try { localStorage.setItem('fps.vol', volume); } catch (e) {}
  });

  // --- music volume (kept in this browser) ---
  const musicInput = document.getElementById('music');
  let musicVol = 0.5;
  try { const v = parseFloat(localStorage.getItem('fps.music')); if (!Number.isNaN(v)) musicVol = v; } catch (e) {}
  musicInput.value = musicVol;
  Music.setVolume(musicVol);
  musicInput.addEventListener('input', () => {
    musicVol = parseFloat(musicInput.value);
    Music.setVolume(musicVol);
    try { localStorage.setItem('fps.music', musicVol); } catch (e) {}
  });

  // --- grenade throw preview: a dotted arc + a little marker where it lands ---
  const arcGeo = new THREE.BufferGeometry().setFromPoints(new Array(80).fill(0).map(() => new THREE.Vector3()));
  const arcLine = new THREE.Line(arcGeo, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.25, gapSize: 0.18, transparent: true, opacity: 0.85 }));
  arcLine.frustumCulled = false;
  arcLine.visible = false;
  scene.add(arcLine);
  const arcEnd = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.3), new THREE.MeshBasicMaterial({ color: 0x7fffd4 }));
  arcEnd.visible = false;
  scene.add(arcEnd);
  function showArc(from, vel) {
    const p = from.clone(), v = vel.clone(), pts = arcGeo.attributes.position;
    let n = 0, landed = false;
    for (; n < 80; n++) {
      pts.setXYZ(n, p.x, p.y, p.z);
      if (landed) continue;
      v.y -= NADE_GRAVITY * 0.025;
      p.addScaledVector(v, 0.025);
      if (world.solidTopAt(p.x, p.y, p.z) !== null) { landed = true; arcEnd.position.copy(p); }
    }
    pts.needsUpdate = true;
    arcLine.computeLineDistances();
    arcLine.visible = true;
    arcEnd.visible = landed;
  }
  function hideArc() { arcLine.visible = false; arcEnd.visible = false; }

  // --- shop (it frees the mouse while open; the game keeps running) ---
  const menu = document.getElementById('menu');
  const showMenu = () => menu.classList.remove('hidden');
  function relock() {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
    setTimeout(() => { if (!Input.locked && !shop.isOpen) showMenu(); }, 200);
  }
  const shop = new ShopUI(game, me, {
    onOpen() { document.exitPointerLock(); },
    onClose() { relock(); },
  });
  HUD.shop = shop;

  // --- your controls ---
  const tmp = new THREE.Vector3();
  const view = { scoped: false };
  let triggerWasDown = false;

  let rightWasDown = false, nadeCooldown = 0;

  // Start holding a grenade (3), or cycle to the next kind you own.
  function pickNade() {
    const owned = NADE_ORDER.filter(k => me.nades[k] > 0);
    if (!owned.length) { HUD.flashHint('No grenades. Buy some in the shop [B]'); return; }
    if (me.slot !== 'nade') me.nadeKind = owned.includes(me.nadeKind) ? me.nadeKind : owned[0];
    else me.nadeKind = owned[(owned.indexOf(me.nadeKind) + 1) % owned.length];
    me.slot = 'nade';
    Sound.swap();
  }

  function throwVelocity(far) {
    const m = me.mover;
    const dir = new THREE.Vector3(-Math.sin(m.yaw) * Math.cos(m.pitch), Math.sin(m.pitch), -Math.cos(m.yaw) * Math.cos(m.pitch));
    const vel = dir.multiplyScalar(far ? 17 : 8);
    vel.y += far ? 2.5 : 2;
    vel.x += m.vel.x * 0.5; vel.z += m.vel.z * 0.5;
    return vel;
  }

  function handleNade(dt, locked, pressed, rightPressed) {
    const m = me.mover;
    nadeCooldown -= dt;
    if (!me.nades[me.nadeKind]) {                 // ran out: back to a blaster
      const next = NADE_ORDER.find(k => me.nades[k] > 0);
      if (next) me.nadeKind = next; else { me.slot = me.guns.main ? 'main' : 'side'; hideArc(); return; }
    }
    viewmodel.holdNade(me.nadeKind);
    viewmodel.updateNade(dt, m);
    const from = camera.position.clone().add(tmp.set(0.15, -0.1, -0.4).applyQuaternion(camera.quaternion));
    if (!locked) showArc(from, throwVelocity(!Input.rightDown)); else hideArc();
    if ((pressed || rightPressed) && !locked && nadeCooldown <= 0) {
      game.throwables.throw(me, me.nadeKind, from, throwVelocity(pressed));
      me.nades[me.nadeKind]--;
      viewmodel.kick = 1;
      nadeCooldown = 0.6;
    }
  }

  // 1 main · 2 sidearm · 3 knife · 4 seed (when you carry it) · 5 grenades
  function switchTo(slot) {
    if (me.slot === slot) return;
    if (slot === 'seed') {
      if (!me.carrying) { HUD.flashHint("You don't have the seed"); return; }
    } else if (!me.guns[slot]) return;
    me.gun.drawTime = 0;
    me.slot = slot;
    if (me.guns[slot]) me.gun.cooldown = Math.max(me.gun.cooldown, 0.35);   // takes a moment to bring it up
    Sound.swap();
  }
  let plantLook = 0;   // 0..1: how far your view has tilted down to watch yourself plant

  function muzzle(x = 0.17, y = -0.15, z = -0.56) {
    return camera.position.clone().add(tmp.set(x, y, z).applyQuaternion(camera.quaternion));
  }

  function controlPlayer(dt) {
    const m = me.mover, mode = game.mode;
    const busy = mode.isBusy(me);                      // planting / uprooting
    const locked = mode.frozen || busy;                // no shooting before GO or while busy
    const stuck = busy || mode.phase === 'over';       // walking is fine before GO (inside your spawn)

    // switching: 1 main · 2 sidearm · 3 knife · 4 seed · 5 grenades
    if (Input.justPressed('Digit1')) switchTo('main');
    if (Input.justPressed('Digit2')) switchTo('side');
    if (Input.justPressed('Digit3')) switchTo('knife');
    if (Input.justPressed('Digit4')) switchTo('seed');
    if (Input.justPressed('Digit5')) pickNade();
    if (Input.justPressed('KeyQ')) switchTo(me.slot === 'main' ? 'side' : 'main');
    if (Input.justPressed('KeyB')) shop.open();
    if (Input.justPressed('KeyF') && !stuck) game.drops.trySwap(me);
    if (me.slot === 'seed' && !me.carrying) me.slot = me.guns.main ? 'main' : 'side';
    const gun = me.gun;
    const planting = mode.planter === me;
    plantLook += ((planting ? 1 : 0) - plantLook) * Math.min(1, dt * 6);
    viewmodel.holdSeed(me.slot === 'seed' && plantLook < 0.05);
    if (me.slot !== 'nade' && me.slot !== 'seed') { viewmodel.holdNade(null); viewmodel.setGun(gun); hideArc(); }
    if (me.slot === 'seed') { viewmodel.holdNade(null); hideArc(); }

    // Lily zoom (right mouse)
    view.scoped = me.slot !== 'nade' && !!gun.def.scope && Input.rightDown && !gun.busy;
    const fov = view.scoped ? gun.def.scope.fov : FOV;
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }

    if (!planting) m.look(Input.mouseDX, Input.mouseDY, sensitivity * (camera.fov / FOV));
    me.actionHeld = (Input.held('KeyE') || (me.slot === 'seed' && Input.mouseDown)) && !mode.frozen;
    m.update(dt, stuck ? NO_INPUT : {
      fwd: (Input.held('KeyW') ? 1 : 0) - (Input.held('KeyS') ? 1 : 0),
      right: (Input.held('KeyD') ? 1 : 0) - (Input.held('KeyA') ? 1 : 0),
      jump: Input.justPressed('Space'),
      crouch: Input.held('KeyC') || Input.held('ControlLeft') || Input.held('ControlRight'),
      walk: Input.held('ShiftLeft') || Input.held('ShiftRight'),
    });
    // before GO an invisible fence keeps everyone inside their spawn area
    const fence = mode.spawnFence && mode.spawnFence(me);
    if (fence) {
      m.pos.x = Math.max(fence.x0 + 0.35, Math.min(fence.x1 + 0.65, m.pos.x));
      m.pos.z = Math.max(fence.z0 + 0.35, Math.min(fence.z1 + 0.65, m.pos.z));
    }
    if (m.pos.y < -10) game.hasTeams ? game.spawnAt(me) : me.spawn(mapInfo.spawn.x, mapInfo.spawn.y, mapInfo.spawn.z, 0);
    updateCamera();

    for (const g of Object.values(me.guns)) if (g) g.tick(dt);
    game.footsteps(me, dt);
    // a click counts even if the button was already let go before this frame (fast taps)
    const pressed = Input.clicked || (Input.mouseDown && !triggerWasDown);
    const down = Input.mouseDown || pressed;
    const rightPressed = Input.rightDown && !rightWasDown;
    triggerWasDown = down;
    rightWasDown = Input.rightDown;
    if (me.slot === 'nade') { handleNade(dt, locked, pressed, rightPressed); return; }
    if (me.slot === 'seed') return;                    // holding the seed: click/E plants (see actionHeld)
    if (Input.justPressed('KeyR') && gun.startReload()) Sound.reload();

    if (gun.def.melee) {
      // knife: swipe; pops anyone right in front of you
      if (pressed && gun.ready && !locked) {
        gun.cooldown = 1 / gun.def.fireRate;
        viewmodel.onFire();
        Sound.swish();
        const dir = new THREE.Vector3(-Math.sin(m.yaw) * Math.cos(m.pitch), Math.sin(m.pitch), -Math.cos(m.yaw) * Math.cos(m.pitch));
        game.melee(me, camera.position.clone(), dir, gun.def);
      }
    } else if (gun.def.bow) {
      // hold to pull the string, let go to shoot
      if (down && gun.ready && gun.ammo > 0 && !locked) {
        if (gun.drawTime === 0) Sound.bowDraw();
        gun.drawTime += dt;
      } else if (!down && gun.drawTime > 0) {
        const charge = gun.charge;
        if (charge >= 0.15 && !locked) {
          const [dir] = gun.fire(m.yaw, m.pitch, m);
          game.arrows.fire(me, muzzle(0.1, -0.08, -0.4), dir, gun.def, charge);
          viewmodel.onFire();
        }
        gun.drawTime = 0;
      }
      if (gun.ammo === 0 && !gun.busy && gun.reserve > 0) gun.startReload();   // nock the next arrow
    } else {
      const trigger = gun.def.auto ? down : pressed;
      if (trigger && gun.ready && !locked) {
        if (gun.ammo > 0) {
          const eye = camera.position.clone(), from = muzzle();
          for (const dir of gun.fire(m.yaw, m.pitch, m, view.scoped)) game.fireShot(me, eye, dir, gun, from);
          viewmodel.onFire();
          Sound.shoot(1, gun.def.key);
        } else {
          Sound.click();
          gun.cooldown = 0.25;
          if (gun.startReload()) Sound.reload();
        }
      }
    }
    viewmodel.update(dt, m, view.scoped);
    if (plantLook > 0.05) viewmodel.setVisible(false);  // hands are busy planting
  }

  function updateCamera() {
    const m = me.mover;
    m.eyePosition(camera.position);
    camera.position.y -= 0.7 * plantLook;                 // kneel down to plant
    let pitch = m.pitch + me.gun.recoilPitch;
    if (plantLook > 0.001) {
      // tilt down to look at the hole being dug
      const dp = game.mode.plantAnim ? game.mode.plantAnim.digPoint : m.pos;
      const lookDown = Math.atan2(dp.y + 0.15 - camera.position.y, Math.max(0.3, Math.hypot(dp.x - m.pos.x, dp.z - m.pos.z)));
      pitch += (lookDown - pitch) * plantLook;
    }
    camera.rotation.set(pitch, m.yaw + me.gun.recoilYaw, 0);
    camera.updateMatrixWorld();
  }

  // While you're out: see through a teammate's eyes, blaster and all (click to switch).
  let watchIdx = 0, wasDown = false, watching = null, specYaw = 0, specPitch = 0;
  function watch(t) {
    if (watching === t) return;
    if (watching && watching.alive) watching.model.setVisible(true);   // don't leave them invisible
    watching = t;
    if (t) { t.model.setVisible(false); specYaw = t.mover.yaw; specPitch = t.mover.pitch; }   // you're inside their head
  }
  game.onShot = shooter => { if (shooter === watching && !me.alive) viewmodel.onFire(); };
  function spectate(dt) {
    view.scoped = false;
    hideArc();
    if (camera.fov !== FOV) { camera.fov = FOV; camera.updateProjectionMatrix(); }
    const mates = game.entities.filter(e => e !== me && e.alive && e.team === me.team && e.mover);
    const click = Input.mouseDown && !wasDown;
    if (click) watchIdx++;
    if (!mates.length) {
      watch(null);
      viewmodel.setVisible(false);
      HUD.setSpectating(null);
      camera.position.y += Math.max(0, 1.2 - (camera.position.y - me.pos.y - 1.6)) * dt;
      me.mover.look(Input.mouseDX, Input.mouseDY, sensitivity);
      camera.rotation.set(me.mover.pitch, me.mover.yaw, 0);
      camera.updateMatrixWorld();
      return;
    }
    const t = mates[watchIdx % mates.length];
    watch(t);
    HUD.setSpectating(t.name);
    // follow their aim, smoothed a little so it isn't jerky
    const dy = Math.atan2(Math.sin(t.mover.yaw - specYaw), Math.cos(t.mover.yaw - specYaw));
    specYaw += dy * Math.min(1, dt * 14);
    specPitch += (t.mover.pitch - specPitch) * Math.min(1, dt * 14);
    t.mover.eyePosition(camera.position);
    camera.rotation.set(specPitch, specYaw, 0);
    camera.updateMatrixWorld();
    // their blaster in front of you (refills and all)
    viewmodel.holdNade(null);
    viewmodel.holdSeed(false);
    viewmodel.setGun(t.gun);
    viewmodel.update(dt, t.mover, false);
  }

  // --- menu / pointer lock ---
  HUD.initMinimap(world, mapInfo);
  Input.init(canvas);
  const playBtn = document.getElementById('playBtn');
  const menuSub = document.getElementById('menuSub');
  const modeName = game.mode.kind === 'practice' ? mapDef.name
    : `${mapDef.name} · ${MODE === 'skirmish' ? 'Skirmish' : game.mode.rules.name} · ${BOTS} bots`;
  menuSub.textContent = modeName;
  const current = { map: MAP_ID, mode: MODE, bots: BOTS };
  document.querySelectorAll('.pick').forEach(row => {
    const param = row.dataset.param;
    if (param !== 'map' && MAP_ID === 'garden') row.classList.add('disabled');
    row.querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', b.dataset.value === current[param]);
      b.addEventListener('click', () => {
        if (b.dataset.value === current[param]) return;
        const next = new URLSearchParams(current);
        next.set(param, b.dataset.value);
        location.search = next.toString();             // restarts with the new settings
      });
    });
  });
  playBtn.addEventListener('click', () => {
    Sound.init();
    Music.start();
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {}); // browsers refuse if you re-click too fast after Esc
  });
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    menu.classList.toggle('hidden', locked || shop.isOpen);
    if (!locked && !shop.isOpen) { playBtn.textContent = 'RESUME'; menuSub.textContent = `${modeName} · Paused`; }
  });

  // --- resize ---
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = viewCamera.aspect = w / h;
    camera.updateProjectionMatrix();
    viewCamera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();
  viewmodel.setGun(me.gun);
  updateCamera();

  // --- game loop ---
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (Input.locked || shop.isOpen) {
      if (HUD._openShopNext && Input.locked) { HUD._openShopNext = false; shop.open(); }
      if (me.alive) { watch(null); controlPlayer(dt); HUD.setSpectating(null); } else spectate(dt);
      wasDown = Input.mouseDown;
      game.update(dt);
      effects.update(dt, world);
      shop.update();
      view.haze = game.throwables.smokeAt(camera.position);
      HUD.update(dt, me, game.mode, view);
      HUD.scoreboard(Input.held('Tab'), game, me);
      HUD.setSpread(me.gun.computeSpread(me.mover, view.scoped), camera);
      HUD.updateMarkers(camera, me, plantLook > 0.05 ? [] : game.mode.markersFor(me).concat(game.drops.markersFor(me)));
      if (game.mode.phase === 'over' && Input.justPressed('Enter')) location.reload();
      if (Input.justPressed('KeyM')) HUD.flashHint(Music.toggle() ? 'Music on ♪' : 'Music off');
    }
    HUD.drawMinimap(me, game.entities, game.time, game.mode.booMarker(me.team));
    Input.endFrame();
    sky.position.copy(camera.position);
    clouds.position.x = Math.sin(now / 60000) * 30;
    clouds.position.z = (now / 400) % 80 - 40;

    renderer.clear();
    renderer.render(scene, camera);
    renderer.clearDepth();
    renderer.render(viewScene, viewCamera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
