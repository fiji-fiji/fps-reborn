// Sets everything up and runs the game loop.
// Settings come from the address bar: ?map=barcelona&mode=standard&bots=easy
// LAN play (net.js): ?lan=host on the host; a friend opening the shared link is the guest.

(async () => {
  const canvas = document.getElementById('game');

  // --- renderer: full resolution, smooth edges, soft sun shadows (clean "toy" look) ---
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.autoClear = false;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  Textures.atlas.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  // the look (menu: LOOK): classic textured blocks, or clean flat pastel colours (look.js)
  const CLEAN = Look.pick() === 'clean';
  const HORIZON = CLEAN ? 0xf4f8ff : 0xd7eeff;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(HORIZON);
  scene.fog = CLEAN ? new THREE.Fog(HORIZON, 45, 175) : new THREE.Fog(HORIZON, 70, 190);   // clean: bright white haze
  // soft light from the sky above + warm bounce from the sand below
  const hemi = CLEAN ? new THREE.HemisphereLight(0xf2f6ff, 0x9a9aac, 1.0) : new THREE.HemisphereLight(0xe3f2ff, 0xd8c29a, 0.62);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d6, CLEAN ? 0.38 : 0.62);   // warm sunlight that casts shadows
  scene.add(sun, sun.target);
  sun.castShadow = !CLEAN;                                  // clean: no hard shadows
  renderer.shadowMap.enabled = !CLEAN;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;

  // sky: a big gradient dome + a few puffy clouds drifting slowly
  const skyGeo = new THREE.SphereGeometry(500, 32, 16);
  const skyCols = [];
  const topC = new THREE.Color(CLEAN ? 0xc4dcf5 : 0x5aa9f2), midC = new THREE.Color(HORIZON);
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
  if (!CLEAN) scene.add(clouds);                         // clean: an empty pale sky

  const FOV = 70;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 300);
  camera.rotation.order = 'YXZ';

  // the blaster is drawn in its own pass so it never pokes through walls
  const viewScene = new THREE.Scene();
  const viewCamera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
  viewScene.add(viewCamera);
  const vAmb = new THREE.AmbientLight(0xffffff, 0.6);
  const vSun = new THREE.DirectionalLight(0xffffff, 0.6);
  vSun.position.set(0.3, 1, 0.5);
  viewScene.add(vAmb, vSun);
  // HD look (hd.js): Blender-baked blocks, realistic materials, sky lighting, post-processing
  if (HD.on) HD.setup({ renderer, scene, viewScene, sun, hemi, sky, clouds, viewLights: [vAmb, vSun] });

  // --- settings from the address bar ---
  const params = new URLSearchParams(location.search);
  const choose = (name, allowed, fallback) => (allowed.includes(params.get(name)) ? params.get(name) : fallback);
  let MAP_ID = choose('map', Object.keys(MAPS), 'barcelona');
  let MODE = choose('mode', ['standard', 'swiftplay', 'skirmish'], 'standard');
  let BOTS = choose('bots', Object.keys(BOT_LEVELS), 'easy');
  const NET = Net.detect();

  // --- first screen: practice range or the real game (until you've picked, nothing loads) ---
  if (!NET && !params.has('map')) {
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('launcher').classList.remove('hidden');
    document.getElementById('goRange').addEventListener('click', () => { location.search = 'map=garden'; });
    document.getElementById('goGame').addEventListener('click', () => {
      location.search = new URLSearchParams({ map: 'barcelona', mode: 'standard', bots: 'easy' }).toString();
    });
    return;
  }

  // --- menu: picking map / mode / bots restarts with the new settings ---
  const current = { map: MAP_ID, mode: MODE, bots: BOTS, look: Look.name };
  document.querySelectorAll('.pick').forEach(row => {
    const param = row.dataset.param;
    if (param !== 'map' && param !== 'look' && MAP_ID === 'garden') row.classList.add('disabled');
    row.querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', b.dataset.value === current[param]);
      b.addEventListener('click', () => {
        if (b.dataset.value === current[param]) return;
        if (param === 'look') {                        // just for you: remembered, then reload
          Look.save(b.dataset.value);
          const q = new URLSearchParams(location.search); q.delete('look');
          location.search = q.toString();
          return;
        }
        const next = new URLSearchParams({ map: MAP_ID, mode: MODE, bots: BOTS });
        next.set(param, b.dataset.value);
        if (NET === 'host') next.set('lan', 'host');
        location.search = next.toString();             // restarts with the new settings
      });
    });
  });

  // --- LAN: wait for the friend (host), or join the host and use their settings (guest) ---
  let netCfg = null, welcome = null;
  if (NET === 'host') {
    const l = await Net.hostLobby();
    netCfg = { role: 'host', myId: 'H', players: l.players, noBots: l.noBots };
  } else if (NET === 'guest') {
    welcome = await Net.guestLobby();
    MAP_ID = MAPS[welcome.map] ? welcome.map : MAP_ID;
    MODE = welcome.mode; BOTS = welcome.bots;
    netCfg = { role: 'guest', myId: Net.id, players: welcome.players, noBots: !!welcome.noBots, firstAttack: welcome.at };
  }

  const mapDef = MAPS[MAP_ID];
  const world = new World(...mapDef.size);
  const mapInfo = mapDef.build(world);
  // HD: the world drawn with real materials and bounce light (hdworld.js); otherwise the blocks
  let worldMesh = null;
  const charsReady = HD.on && typeof HDChar !== 'undefined' && HDChar ? HDChar.ready() : null;   // (the HD dogs and cats)
  if (HD.on && HDWorld) { await HDWorld.ready(); worldMesh = HDWorld.build(world); }
  if (charsReady) await charsReady;
  if (!worldMesh) {
    worldMesh = world.buildMesh();
    if (HD.on) HD.world(worldMesh);
  }
  scene.add(worldMesh);
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
  effects.viewer = camera.position;                  // bubbles stay out of your face
  HUD.init({ mode: { hud: () => null } });   // HUD elements ready before the match starts
  const game = new Game({ scene, world, mapInfo, effects, camera, difficulty: BOTS, modeName: MODE, net: netCfg });
  if (charsReady) HDChar.warm(scene, camera);          // (compile the HD dogs' and cats' shaders now)
  if (netCfg && game.remotes.length && NET === 'host') new NetHost(game, Object.assign({ map: MAP_ID, mode: MODE, bots: BOTS }, netCfg));
  if (netCfg && game.remotes.length && NET === 'guest') new NetGuest(game, welcome);
  const nature = new Nature(game);                    // soft wind + birds (sound only)
  // sounds behind a wall come through muffled
  Sound.setOccluder(pos => {
    const from = camera.position, dir = pos.clone().sub(from), d = dir.length();
    if (d < 1) return false;
    return !!world.raycast(from, dir.divideScalar(d), d - 0.4);
  });
  HUD.init(game);
  const me = game.player;
  const viewmodel = new Viewmodel(viewCamera);
  HUD.popHat = new PopHat(viewCamera, me.model);        // your hat pops up with stars when you pop someone

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

  // practice range: T steps through the refill shows (the next refill plays the one picked), then back to random
  const SHOWS = [null, 'pour', ...SASSY_STYLES];
  let showIdx = 0;
  function pickShow() {
    showIdx = (showIdx + 1) % SHOWS.length;
    const st = viewmodel.forcedStyle = SHOWS[showIdx];
    HUD.flashHint(st ? `Next refill: ${st}${REFILL_WEIGHTS[st] ? '' : ' (not in matches)'}  ·  ${showIdx}/${SHOWS.length - 1}` : 'Next refill: random, like in matches');
    Sound.click();
  }

  // Q sparkle pop · E cloud puff · C bubble bomb: hold that one straight away
  function takeNade(kind) {
    if (!me.nades[kind]) { HUD.flashHint(`No ${GRENADES[kind].name}. Buy one in the shop [B]`); return; }
    if (me.slot === 'nade' && me.nadeKind === kind) return;
    me.nadeKind = kind;
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
    me.slot = slot;
    if (me.guns[slot]) me.gun.cooldown = Math.max(me.gun.cooldown, 0.35);   // takes a moment to bring it up
    Sound.swap();
  }
  let plantLook = 0;   // 0..1: how far you've knelt down to plant
  let plantTilt = 0;   // seconds since you started planting
  let sawTilt = 0;     // seconds since you started sawing the tree down

  function muzzle(x = 0.17, y = -0.15, z = -0.56) {
    return camera.position.clone().add(tmp.set(x, y, z).applyQuaternion(camera.quaternion));
  }

  function controlPlayer(dt) {
    const m = me.mover, mode = game.mode;
    const busy = mode.isBusy(me);                      // planting / uprooting
    const locked = mode.phase === 'over' || busy;      // you can blow bubbles before GO too (just for practice)
    const nadeLocked = mode.frozen || busy;            // ...but grenades wait for GO
    const stuck = busy || mode.phase === 'over';       // walking is fine before GO (inside your spawn)

    // switching: 1 main · 2 sidearm · 3 knife · 4 seed · 5 grenades
    if (Input.justPressed('Digit1')) switchTo('main');
    if (Input.justPressed('Digit2')) switchTo('side');
    if (Input.justPressed('Digit3')) switchTo('knife');
    // 4: take out the seed (and hold 4 to plant it). Defending a planted tree, hold 4 next to it to cut it down.
    const nearTree = mode.phase === 'planted' && mode.sideOf && mode.sideOf(me.team) === 'defend' && mode.boo &&
      flatDist(me.pos, mode.boo.pos) <= BOOBOO.uprootReach + 0.5;
    if (Input.justPressed('Digit4') && !nearTree) switchTo('seed');
    if (Input.justPressed('Digit5')) pickNade();
    if (Input.justPressed('KeyQ')) takeNade('flash');
    if (Input.justPressed('KeyE')) takeNade('smoke');
    if (Input.justPressed('KeyC')) takeNade('frag');
    if (Input.justPressed('KeyB')) shop.open();
    if (mode.cheats && Input.justPressed('KeyT')) pickShow();
    if (Input.justPressed('KeyF') && !stuck) game.drops.trySwap(me);
    if (me.slot === 'seed' && !me.carrying) me.slot = me.guns.main ? 'main' : 'side';
    const gun = me.gun;
    const planting = mode.planter === me;
    plantLook += ((planting ? 1 : 0) - plantLook) * Math.min(1, dt * 6);
    if (me.slot !== 'nade' && me.slot !== 'seed') { viewmodel.holdNade(null); viewmodel.setGun(gun); hideArc(); }
    if (me.slot === 'seed') { viewmodel.holdNade(null); hideArc(); }
    viewmodel.holdSeed(me.slot === 'seed' && plantLook < 0.05);       // (after holdNade, which would bring the blaster back)
    if (me.slot === 'seed') viewmodel.setVisible(false);

    // Lily zoom (right mouse)
    view.scoped = me.slot !== 'nade' && !!gun.def.scope && Input.rightDown && !gun.busy;
    const fov = view.scoped ? gun.def.scope.fov : FOV;
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }

    m.look(Input.mouseDX, Input.mouseDY, sensitivity * (camera.fov / FOV));   // you can look around while planting too
    // when you start planting, your view tilts down to the show once (so the hands, the tool
    // and the hole are all in the middle of the screen); after that it's yours
    plantTilt = planting ? plantTilt + dt : 0;
    if (planting && plantTilt < 0.45) {
      const dp = mode.plantAnim.digPoint;
      const eyeY = m.pos.y + m.eyeHeight - PLANT_KNEEL;
      const lookDown = Math.atan2(dp.y + 0.3 - eyeY, Math.max(0.3, Math.hypot(dp.x - m.pos.x, dp.z - m.pos.z) + PLANT_BACK));
      m.pitch += (lookDown - m.pitch) * Math.min(1, dt * 12);
    }
    // same when you start sawing: you turn to the trunk and look at the cut (the saw's in your paws)
    const sawing = mode.defuser === me && mode.boo;
    sawTilt = sawing ? sawTilt + dt : 0;
    if (sawing && sawTilt < 0.45) {
      const b = mode.boo.pos, dx = b.x - m.pos.x, dz = b.z - m.pos.z, k = Math.min(1, dt * 12);
      m.yaw += wrapAngle(Math.atan2(-dx, -dz) - m.yaw) * k;
      const lookDown = Math.atan2(b.y + 0.55 - (m.pos.y + m.eyeHeight), Math.max(0.3, Math.hypot(dx, dz)));
      m.pitch += (lookDown - m.pitch) * k;
    }
    me.actionHeld = Input.held('Digit4') && !mode.frozen && (me.carrying || nearTree || mode.defuser === me);
    m.update(dt, stuck ? NO_INPUT : {
      fwd: (Input.held('KeyW') ? 1 : 0) - (Input.held('KeyS') ? 1 : 0),
      right: (Input.held('KeyD') ? 1 : 0) - (Input.held('KeyA') ? 1 : 0),
      jump: Input.justPressed('Space'),
      crouch: Input.held('ControlLeft') || Input.held('ControlRight'),
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
    if (me.slot === 'nade') { handleNade(dt, nadeLocked, pressed, rightPressed); return; }
    if (me.slot === 'seed') return;                    // holding the seed: hold 4 to plant (see actionHeld)
    if (Input.justPressed('KeyR') && gun.startReload()) { Sound.reload(); game.reloadHeard(me); }
    if (Input.justPressed('KeyY')) viewmodel.inspect();

    if (gun.def.melee) {
      // knife: swipe; pops anyone right in front of you
      if (pressed && gun.ready && !locked) {
        gun.cooldown = 1 / gun.def.fireRate;
        viewmodel.onFire();
        Sound.swish();
        const dir = new THREE.Vector3(-Math.sin(m.yaw) * Math.cos(m.pitch), Math.sin(m.pitch), -Math.cos(m.yaw) * Math.cos(m.pitch));
        game.melee(me, camera.position.clone(), dir, gun.def);
      }
    } else {
      const trigger = gun.def.auto ? down : pressed;
      if (trigger && gun.ready && !locked) {
        if (gun.ammo > 0) {
          const eye = camera.position.clone(), from = muzzle();
          for (const dir of gun.fire(m.yaw, m.pitch, m, view.scoped)) game.fireShot(me, eye, dir, gun, from);
          viewmodel.onFire();
          Sound.shoot(1, gun.def.key);
          game.shotHeard(me, eye, gun.def.key);            // enemies hear where you shot from
        } else {
          Sound.click();
          gun.cooldown = 0.25;
          if (gun.startReload()) { Sound.reload(); game.reloadHeard(me); }
        }
      }
    }
    viewmodel.update(dt, m, view.scoped);
    if (plantLook > 0.05 || mode.defuser === me) viewmodel.setVisible(false);  // paws are busy planting / sawing
  }

  const PLANT_KNEEL = 0.5, PLANT_BACK = 0.35;          // planting view: how low, how far back
  function updateCamera() {
    const m = me.mover;
    m.eyePosition(camera.position);
    if (plantLook > 0.001) {                             // planting: kneel, and lean back a little to watch
      camera.position.y -= PLANT_KNEEL * plantLook;
      const back = PLANT_BACK * plantLook, bx = Math.sin(m.yaw) * back, bz = Math.cos(m.yaw) * back;
      const p = camera.position;
      if (!world.isSolid(world.get(Math.floor(p.x + bx * 1.6), Math.floor(p.y), Math.floor(p.z + bz * 1.6)))) { p.x += bx; p.z += bz; }
    }
    const pitch = m.pitch + me.gun.recoilPitch;
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
  function lanSize(players) { return players.filter(p => p.team === 'blue').length + 'v' + players.filter(p => p.team === 'red').length; }
  HUD.initMinimap(world, mapInfo);
  Input.init(canvas);
  const playBtn = document.getElementById('playBtn');
  const menuSub = document.getElementById('menuSub');
  const homeBtn = document.getElementById('homeBtn');
  if (NET) homeBtn.style.display = 'none';           // a friend game keeps its own link
  homeBtn.addEventListener('click', () => { location.search = ''; });   // back to the first screen
  const modeName = game.mode.kind === 'practice' ? 'Practice Range · cheats on'
    : `${mapDef.name} · ${MODE === 'skirmish' ? 'Skirmish' : game.mode.rules.name} · ${!netCfg ? BOTS + ' bots' : netCfg.noBots ? lanSize(netCfg.players) + ', no bots' : `with friends · ${BOTS} bots`}`;
  menuSub.textContent = modeName;
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
    if (HD.on) HD.resize();
  }
  window.addEventListener('resize', resize);
  resize();
  viewmodel.setGun(me.gun);
  updateCamera();

  // --- inside a Cloud Puff: you see only what's right around you (your hands, the hole
  // you're digging, someone bumping into you); everything further away is white ---
  const fogBase = { near: scene.fog.near, far: scene.fog.far, color: new THREE.Color(HORIZON) };
  const SMOKE_WHITE = new THREE.Color(0xf4f6fa);
  let smokeOn = false, noFogMats = null;
  function smokeView(h) {
    const k = Math.min(1, h * 1.6);
    scene.fog.near = fogBase.near + (0.5 - fogBase.near) * k;
    scene.fog.far = fogBase.far + (2.6 - fogBase.far) * k;
    scene.fog.color.copy(fogBase.color).lerp(SMOKE_WHITE, k);
    scene.background.copy(scene.fog.color);
    // puffs right around your head would hide your own hands: those step aside
    for (const sm of game.throwables.smokes)
      for (const p of sm.puffs) p.mesh.visible = k < 0.05 || p.mesh.position.distanceTo(camera.position) > 1.9;
    const on = k > 0.35;
    if (on === smokeOn) return;
    smokeOn = on;
    sky.visible = clouds.visible = !on;                // no blue sky poking through the cloud
    if (!noFogMats) {                                  // far-away landmarks normally ignore fog
      noFogMats = new Set();
      scene.traverse(o => { if (o.material && o !== sky && o.material.fog === false) noFogMats.add(o.material); });
      clouds.traverse(o => { if (o.material) noFogMats.delete(o.material); });
    }
    for (const m of noFogMats) { m.fog = on; m.needsUpdate = true; }
  }

  // --- game loop ---
  let last = performance.now();
  let lookIn = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (Input.locked || shop.isOpen) {
      if (HUD._openShopNext && Input.locked) { HUD._openShopNext = false; shop.open(); }
      if (me.alive) { watch(null); controlPlayer(dt); HUD.setSpectating(null); } else spectate(dt);
      wasDown = Input.mouseDown;
      game.update(dt);
      if (NET === 'host' && game.net) game.net.update(dt);   // send the world to your friend
      effects.update(dt, world);
      nature.update(dt, camera.position);
      Sound.listen(camera);                            // your ears follow the camera
      shop.update();
      view.haze = game.throwables.smokeAt(camera.position);
      smokeView(view.haze);
      HUD.update(dt, me, game.mode, view);
      HUD.scoreboard(Input.held('Tab'), game, me);
      HUD.updateMarkers(camera, me, plantLook > 0.05 ? [] : game.mode.markersFor(me).concat(game.drops.markersFor(me)));
      if (game.mode.phase === 'over' && Input.justPressed('Enter')) location.reload();
      if (Input.justPressed('KeyM')) HUD.flashHint(Music.toggle() ? 'Music on ♪' : 'Music off');
    }
    HUD.drawMinimap(me, game.entities, game.time, game.mode.booMarker(me.team));
    Input.endFrame();
    if (CLEAN && (lookIn -= dt) <= 0) { lookIn = 0.5; Look.flatten(scene); Look.flatten(viewScene); }   // things made since
    sky.position.copy(camera.position);
    clouds.position.x = Math.sin(now / 60000) * 30;
    clouds.position.z = (now / 400) % 80 - 40;

    if (HD.on) HD.render(camera, viewCamera);
    else {
      renderer.clear();
      renderer.render(scene, camera);
      renderer.clearDepth();
      renderer.render(viewScene, viewCamera);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
