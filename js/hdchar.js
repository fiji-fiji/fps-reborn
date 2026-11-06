// HD look: the dogs and cats as real animals (well, upright ones): a smooth skinned body
// (tools/hd/make_characters.py -> assets/hd/char/), real fur (shells: the body drawn again a
// little bigger each time, keeping only the strands, which get thinner towards their tips),
// glossy eyes, a knitted team vest, scarf and armbands, and a skeleton animated here: walk,
// aim, breathing, tail and ears, paws on the blaster (two-bone IK).
//
// CharacterModel (character.js) hands its job to build() when the look is HD and the bodies
// have loaded; the rest of the game sees the same object (group, head, aim, lArm/rArm, setPose...).

const HDChar = (() => {
  if (typeof HD === 'undefined' || !HD.on) return null;
  const flags = new URLSearchParams(location.search);
  if (flags.get('hdchar') === '0') return null;

  const SHELLS = (navigator.deviceMemory && navigator.deviceMemory < 8) ? 8 : 14;
  const bodies = {};                                 // species -> { meta, attrs, index, vestIndex, ... }
  let loading = null;

  // ---------------------------------------------------------------------------------------
  // Loading: the json says where each array is in the .bin
  // ---------------------------------------------------------------------------------------
  const TYPES = { float32: Float32Array, int8: Int8Array, uint8: Uint8Array, uint16: Uint16Array, uint32: Uint32Array };
  async function load(sp) {
    const [meta, buf] = await Promise.all([
      fetch(HD_ASSET(`assets/hd/char/${sp}.json`)).then(r => { if (!r.ok) throw new Error(sp); return r.json(); }),
      fetch(HD_ASSET(`assets/hd/char/${sp}.bin`)).then(r => { if (!r.ok) throw new Error(sp); return r.arrayBuffer(); }),
    ]);
    const get = name => { const l = meta.layout[name]; return new TYPES[l.type](buf, l.offset, l.count); };
    const n = meta.vertices;
    const pos = get('position'), nrm8 = get('normal'), uv = get('uv');
    const nrm = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) nrm[i * 3 + k] = nrm8[i * 4 + k] / 127;
    const base = {
      position: new THREE.BufferAttribute(pos, 3),
      normal: new THREE.BufferAttribute(nrm, 3),
      uv: new THREE.BufferAttribute(uv, 2),
      skinIndex: new THREE.BufferAttribute(get('skinIndex'), 4),
      skinWeight: new THREE.BufferAttribute(get('skinWeight'), 4, true),
      masks: new THREE.BufferAttribute(get('masks'), 4, true),
    };
    const index = get('index'), vestIndex = get('vestIndex');
    // the fur: SHELLS copies of the body (not under the vest), each with its height (0..1]
    const shellAttrs = {};
    for (const [k, a] of Object.entries(base)) {
      const src = a.array, out = new src.constructor(src.length * SHELLS);
      for (let s = 0; s < SHELLS; s++) out.set(src, s * src.length);
      shellAttrs[k] = new THREE.BufferAttribute(out, a.itemSize, a.normalized);
    }
    const sh = new Float32Array(n * SHELLS);
    for (let s = 0; s < SHELLS; s++) sh.fill((s + 1) / SHELLS, s * n, (s + 1) * n);
    shellAttrs.shell = new THREE.BufferAttribute(sh, 1);
    const big = n * SHELLS > 65535;
    const sidx = big ? new Uint32Array(index.length * SHELLS) : new Uint16Array(index.length * SHELLS);
    for (let s = 0; s < SHELLS; s++) for (let i = 0; i < index.length; i++) sidx[s * index.length + i] = index[i] + s * n;
    bodies[sp] = {
      meta, base, shellAttrs,
      index: new THREE.BufferAttribute(index, 1),
      vestIndex: new THREE.BufferAttribute(vestIndex, 1),
      shellIndex: new THREE.BufferAttribute(sidx, 1),
      trisPerShell: index.length / 3,
      bone: Object.fromEntries(meta.bones.map((b, i) => [b.name, i])),
      // for pixelize: a spread of vertices
      sample: Array.from({ length: Math.min(700, n) }, (_, k) => Math.floor(k * n / Math.min(700, n))),
      masks: base.masks.array, vestSet: new Set(vestIndex),
    };
  }
  function ready() {
    if (!loading) loading = Promise.all(['dog', 'cat'].map(sp => load(sp).catch(e => console.warn('HD: no', sp, e))));
    return loading;
  }
  const has = sp => !!bodies[sp];

  // ---------------------------------------------------------------------------------------
  // Materials
  // ---------------------------------------------------------------------------------------
  const NOISE = `
    float hcN(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float vnN(vec3 x) {
      vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(hcN(i), hcN(i + vec3(1, 0, 0)), f.x), mix(hcN(i + vec3(0, 1, 0)), hcN(i + vec3(1, 1, 0)), f.x), f.y),
                 mix(mix(hcN(i + vec3(0, 0, 1)), hcN(i + vec3(1, 0, 1)), f.x), mix(hcN(i + vec3(0, 1, 1)), hcN(i + vec3(1, 1, 1)), f.x), f.y), f.z);
    }
    float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
    // the team vest (rest pose): hem, a V at the front of the neckline, round armholes
    float vestMask(vec3 p) {
      float m = smoothstep(0.935, 0.95, p.y) * (1.0 - smoothstep(1.335, 1.35, p.y + 0.13 * smoothstep(0.03, 0.15, p.z) * smoothstep(0.09, 0.0, abs(p.x))));
      vec3 q = vec3(abs(p.x), p.y, p.z) - vec3(0.205, 1.26, 0.0);
      m *= smoothstep(0.1, 0.112, length(q * vec3(1.0, 0.75, 1.0)));
      m *= 1.0 - smoothstep(0.255, 0.265, abs(p.x));
      // armbands, around the upper arms
      vec3 a = vec3(0.2, 1.31, 0.0), d = vec3(0.13, -0.23, 0.0);
      vec3 r = vec3(abs(p.x), p.y, p.z) - a;
      float t = dot(r, d) / dot(d, d);
      float band = smoothstep(0.36, 0.38, t) * (1.0 - smoothstep(0.54, 0.56, t)) * step(0.0, length(r - d * t) * -1.0 + 0.11);
      return max(m, band);
    }`;

  // kind: 'skin' (the body itself), 'fur' (the shells), 'vest'
  function charMaterial(kind, u) {
    const m = new THREE.MeshStandardMaterial({ roughness: kind === 'vest' ? 0.92 : 0.8, metalness: 0,
      side: kind === 'vest' ? THREE.DoubleSide : THREE.FrontSide });
    if (kind === 'fur') m.alphaToCoverage = true;
    m.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec4 masks;
          ${kind === 'fur' ? 'attribute float shell;' : ''}
          uniform float furLen, curl, vestOff, density;
          varying vec4 vMasks; varying float vShell; varying vec3 vRest; varying vec2 vFurUv;
          ${NOISE}`)
        .replace('#include <skinning_vertex>', `#include <skinning_vertex>
          vMasks = masks; vRest = position; vFurUv = uv * density;
          ${kind === 'fur' ? `
            vShell = shell;
            float flen = masks.a * 0.08 * furLen * (1.0 - 0.9 * vestMask(position));
            vec3 nn = normalize(objectNormal);
            // curls (the Bichon) and a little droop: the strands don't stand straight up
            vec3 cv = vec3(vnN(position * 38.0), vnN(position * 38.0 + 7.1), vnN(position * 38.0 + 3.7)) - 0.5;
            transformed += nn * flen * shell + (cv * curl * 1.4 + vec3(0.0, -0.35, -0.1)) * flen * shell * shell;`
            : kind === 'vest' ? 'vShell = 0.0; transformed += normalize(objectNormal) * vestOff;' : 'vShell = 0.0;'}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform vec3 coatA, coatB, coatC, coatLight, coatPink, coatDark;
          uniform float pattern, curl;
          varying vec4 vMasks; varying float vShell; varying vec3 vRest; varying vec2 vFurUv;
          float furA = 1.0;
          ${NOISE}
          vec3 coatColor() {
            vec3 c = coatA;
            if (pattern > 0.5 && pattern < 1.5) {          // tabby stripes (rings on the tail)
              float n = vnN(vRest * 7.0) * 3.0;
              float s = sin(vRest.y * 36.0 + n + abs(vRest.x) * 9.0 + (vRest.z < -0.15 ? vRest.z * 30.0 : 0.0));
              c = mix(c, coatB, smoothstep(0.25, 0.7, s));
            } else if (pattern > 1.5) {                    // calico patches
              c = mix(c, coatB, smoothstep(0.6, 0.66, vnN(vRest * 5.0 + 3.0)));
              c = mix(c, coatC, smoothstep(0.64, 0.7, vnN(vRest * 4.3 + 17.0)));
            }
            c = mix(c, coatLight, vMasks.x);
            c = mix(c, coatPink, vMasks.y);
            c = mix(c, coatDark, vMasks.z);
            // each hair a slightly different shade
            return c * (0.9 + 0.2 * vnN(vRest * 160.0));
          }`)
        .replace('#include <color_fragment>', kind === 'vest' ? `
          if (vestMask(vRest) < 0.5) discard;
          {
            // knitted: ribs, and the stitches along them
            float rib = sin(vRest.x * 260.0 + vnN(vRest * 9.0) * 2.0);
            float st = sin(vRest.y * 420.0 + step(0.0, rib) * 1.57);
            diffuseColor.rgb *= 0.82 + 0.1 * rib + 0.06 * st;
          }` : kind === 'fur' ? `
          {
            // strands: one per cell, a random spot in it, a random height, thinner towards the tip
            vec2 cellId = floor(vFurUv);
            vec2 f = fract(vFurUv) - 0.5 - (vec2(h21(cellId), h21(cellId + 17.0)) - 0.5) * 0.35;
            float h = 0.55 + 0.45 * h21(cellId + 41.0);
            float r = 0.48 * (1.0 - vShell / h);
            float d = length(f);
            float aa = max(fwidth(d), 0.02);
            float cover = vShell > h ? 0.0 : smoothstep(r + aa, r - aa, d);
            if (cover < 0.02) discard;
            furA = cover;
            diffuseColor.rgb = coatColor() * mix(0.7, 1.08, vShell);
          }` : `
          diffuseColor.rgb = coatColor() * mix(0.68, 1.0, 1.0 - min(1.0, vMasks.a * 4.0) * (1.0 - max(vMasks.y, vMasks.z)));`)
        .replace('#include <output_fragment>', kind === 'fur' ? `#include <output_fragment>
          gl_FragColor.a = furA;` : '#include <output_fragment>')
        .replace('#include <roughnessmap_fragment>', `float roughnessFactor = mix(roughness, 0.32, max(vMasks.z, vMasks.y * 0.6) * (1.0 - vMasks.a * 6.0));`);
    };
    m.customProgramCacheKey = () => 'hdchar-' + kind;
    if (typeof HDWorld !== 'undefined' && HDWorld) HDWorld.addGi(m);
    return m;
  }

  // the knitted bits that aren't skinned (scarf, armbands): the same look, plain mesh
  function knitMaterial(hex) {
    const m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.92, metalness: 0 });
    m.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vKp;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKp = position;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vKp;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          diffuseColor.rgb *= 0.84 + 0.1 * sin(atan(vKp.y, vKp.x) * 60.0) + 0.05 * sin(vKp.z * 500.0);`);
    };
    m.customProgramCacheKey = () => 'hdchar-knit';
    if (typeof HDWorld !== 'undefined' && HDWorld) HDWorld.addGi(m);
    return m;
  }

  // eyes: a glossy ball with an iris painted on (+z = looking forward)
  const eyeTex = {};
  function eyeMaterial(iris, slit) {
    const key = iris + (slit ? 's' : 'r');
    if (!eyeTex[key]) {
      const c = document.createElement('canvas');
      c.width = 512; c.height = 256;
      const g = c.getContext('2d');
      g.fillStyle = '#f4efe6'; g.fillRect(0, 0, 512, 256);
      // the front of a three.js sphere is at u = 0.25, v = 0.5
      const cx = 128, cy = 128, R = slit ? 92 : 100;
      const col = new THREE.Color(iris);
      const grad = g.createRadialGradient(cx, cy, 4, cx, cy, R);
      grad.addColorStop(0, '#' + col.clone().multiplyScalar(0.5).getHexString());
      grad.addColorStop(0.55, '#' + col.getHexString());
      grad.addColorStop(0.92, '#' + col.clone().multiplyScalar(0.55).getHexString());
      grad.addColorStop(1, '#1a1410');
      g.fillStyle = grad;
      g.beginPath(); g.ellipse(cx, cy, R * 1.0, R * 1.0, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1.2;      // iris fibres
      for (let i = 0; i < 70; i++) {
        const a = (i / 70) * Math.PI * 2;
        g.beginPath(); g.moveTo(cx + Math.cos(a) * R * 0.3, cy + Math.sin(a) * R * 0.3);
        g.lineTo(cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9); g.stroke();
      }
      g.fillStyle = '#050505';
      g.beginPath();
      if (slit) g.ellipse(cx, cy, R * 0.16, R * 0.8, 0, 0, Math.PI * 2);
      else g.ellipse(cx, cy, R * 0.5, R * 0.5, 0, 0, Math.PI * 2);
      g.fill();
      if (!slit) { g.fillStyle = '#120c08'; g.beginPath(); g.ellipse(cx, cy, R * 0.98, R * 0.98, 0, 0, Math.PI * 2); g.globalAlpha = 0.0; g.fill(); g.globalAlpha = 1; }
      const t = new THREE.CanvasTexture(c);
      t.encoding = THREE.sRGBEncoding;
      t.anisotropy = 4;
      eyeTex[key] = t;
    }
    const m = new THREE.MeshPhysicalMaterial({ map: eyeTex[key], roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02 });
    if (typeof HDWorld !== 'undefined' && HDWorld) HDWorld.addGi(m);
    return m;
  }

  // ---------------------------------------------------------------------------------------
  // Looks
  // ---------------------------------------------------------------------------------------
  const lin = hex => new THREE.Color(hex);
  function coatOf(sp, seed) {
    if (sp === 'dog') {
      // fluffy white Bichon: cream-white coat, black nose and pads, dark-brown eyes
      return { a: 0xf3eee4, b: 0xf3eee4, c: 0xf3eee4, light: 0xfaf6ee, pink: 0xd89a98, dark: 0x16120f,
        pattern: 0, eye: 0x4a2c16, slit: false, fur: 1, curl: 1, density: 1 / 0.0042 };
    }
    const k = seed % 5;
    // [fur, marks, third, eye, pattern]
    const C = [
      [0xd9852f, 0x9a4f18, 0, 0x8fbf4a, 1],       // orange tabby
      [0x8d9198, 0x4e5258, 0, 0xd9b030, 1],       // grey tabby
      [0x26262c, 0x26262c, 0, 0xd9b030, 0],       // black
      [0xead6b4, 0xcfb084, 0, 0x5aa6e0, 1],       // cream (faint stripes)
      [0xf2eee6, 0xd77a2c, 0x2c2a2c, 0x7bbf5a, 2], // calico
    ][k];
    return { a: C[0], b: C[1], c: C[2] || C[0], light: k === 2 ? 0x34343a : 0xf6f2ea, pink: 0xe79aa5, dark: 0x1a1414,
      pattern: C[4], eye: C[3], slit: true, fur: 1, curl: 0, density: 1 / 0.0028 };
  }

  // ---------------------------------------------------------------------------------------
  // One character
  // ---------------------------------------------------------------------------------------
  const V = () => new THREE.Vector3();
  const _a = V(), _b = V(), _c = V(), _d = V(), _e = V(), _t = V(), _p = V();
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
  const _gL = V(), _gR = V(), _down = V(), _side = V(), _pole = V();

  class Rig {
    constructor(model, sp, o) {
      const B = bodies[sp], meta = B.meta;
      this.model = model; this.sp = sp; this.B = B;
      const coat = this.coat = coatOf(sp, o.seed || 1);
      const shirt = o.shirt || 0xff8fb1;
      this.shirt = shirt;
      const u = this.u = {
        coatA: { value: lin(coat.a) }, coatB: { value: lin(coat.b) }, coatC: { value: lin(coat.c) },
        coatLight: { value: lin(coat.light) }, coatPink: { value: lin(coat.pink) }, coatDark: { value: lin(coat.dark) },
        pattern: { value: coat.pattern }, curl: { value: coat.curl }, furLen: { value: 1 },
        vestOff: { value: sp === 'dog' ? 0.016 : 0.009 }, density: { value: meta.uvMetres * coat.density },
      };

      // skeleton: bones with no rest rotation, so turning one turns it about the model's own axes
      const g = model.group;
      this.bones = {};
      const list = meta.bones.map(b => {
        const bone = new THREE.Bone();
        bone.name = b.name;
        this.bones[b.name] = bone;
        return bone;
      });
      meta.bones.forEach((b, i) => {
        const bone = list[i], p = meta.bones.find(x => x.name === b.parent);
        bone.position.set(b.pos[0] - (p ? p.pos[0] : 0), b.pos[1] - (p ? p.pos[1] : 0), b.pos[2] - (p ? p.pos[2] : 0));
        if (p) this.bones[p.name].add(bone); else g.add(bone);
        bone.userData.rest = bone.position.clone();
      });
      const inverses = meta.bones.map(b => new THREE.Matrix4().makeTranslation(-b.pos[0], -b.pos[1], -b.pos[2]));
      this.skeleton = new THREE.Skeleton(list, inverses);
      this.restLen = {};
      for (const s of ['L', 'R']) {
        const P = n => new THREE.Vector3(...meta.bones[B.bone[n]].pos);
        this.restLen[s] = [P(`forearm.${s}`).distanceTo(P(`upperarm.${s}`)), P(`hand.${s}`).distanceTo(P(`forearm.${s}`)) + 0.05];
      }

      const sphere = new THREE.Sphere(new THREE.Vector3(0, 1.0, 0), 1.45);
      const geo = (attrs, index) => {
        const ge = new THREE.BufferGeometry();
        for (const [k, a] of Object.entries(attrs)) ge.setAttribute(k, a);
        ge.setIndex(index);
        ge.boundingSphere = sphere;
        return ge;
      };
      const mats = model.mats;
      const skin = charMaterial('skin', u), fur = charMaterial('fur', u);
      const vestMat = charMaterial('vest', u);
      vestMat.color.set(shirt);
      mats.push(skin, fur, vestMat);
      this.body = new THREE.SkinnedMesh(geo(B.base, B.index), skin);
      this.furGeo = geo(B.shellAttrs, B.shellIndex);
      this.fur = new THREE.SkinnedMesh(this.furGeo, fur);
      this.vest = new THREE.SkinnedMesh(geo(B.base, B.vestIndex), vestMat);
      if (flags.get('hdfur') === '0') this.fur.visible = false;
      for (const m of [this.body, this.fur, this.vest]) {
        m.bind(this.skeleton, new THREE.Matrix4());
        m.frustumCulled = true;
        m.receiveShadow = true;
        g.add(m);
      }
      this.body.castShadow = this.vest.castShadow = true;
      this.shells = SHELLS;

      // scarf and armbands (knitted, the team colour)
      const knit = knitMaterial(shirt);
      mats.push(knit);
      const fl = sp === 'dog' ? 0.045 : 0.014;
      const neck = this.bones.neck, nk = meta.bones[B.bone.neck].pos;
      // a rolled, knitted cowl: a ring with a soft rounded profile
      const R0 = 0.1 + fl * 0.85, prof = [];
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * Math.PI;
        prof.push(new THREE.Vector2(R0 + Math.sin(a) * 0.03, -Math.cos(a) * 0.045));
      }
      const scarf = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), knit);
      scarf.rotation.x = 0.28;                                   // lower at the front
      scarf.position.set(0, 0.07, 0.006);
      neck.add(scarf);
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 9), knit);
      knot.scale.set(1.1, 1, 0.75);
      knot.position.set(0.055, 0.03, R0 + 0.035);
      neck.add(knot);
      const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 0.12, 4, 10), knit);
      tail.scale.set(1.3, 1, 0.5);
      tail.position.set(0.07, -0.05, R0 + 0.03);
      tail.rotation.z = 0.22;
      neck.add(tail);
      for (const m of [scarf, knot, tail]) m.castShadow = true;

      // eyes
      const head = this.bones.head, hp = meta.bones[B.bone.head].pos;
      const em = eyeMaterial(coat.eye, coat.slit);
      mats.push(em);
      for (const e of meta.eyes) {
        const ball = new THREE.Mesh(new THREE.SphereGeometry(e.r, 28, 18), em);
        ball.position.set(e.pos[0] - hp[0], e.pos[1] - hp[1], e.pos[2] - hp[2]);
        ball.rotation.y = Math.sign(e.pos[0]) * (sp === 'cat' ? 0.12 : 0.16);    // a little outwards
        head.add(ball);
      }

      // whiskers (cats): fine tapering hairs fanning out from the whisker pads
      if (sp === 'cat') {
        const wg = new THREE.CylinderGeometry(0.0003, 0.0011, 0.13, 4, 1).translate(0, 0.065, 0);
        const wm = new THREE.MeshStandardMaterial({ color: 0xf4f0e8, roughness: 0.45, metalness: 0 });
        mats.push(wm);
        const up = new THREE.Vector3(0, 1, 0);
        for (const k of [1, -1]) for (let i = 0; i < 4; i++) {
          const w = new THREE.Mesh(wg, wm);
          w.position.set(k * 0.045 - hp[0], 1.535 - i * 0.006 - hp[1], 0.155 - hp[2]);
          const dir = new THREE.Vector3(k, 0.12 - i * 0.12, 0.35 - i * 0.05).normalize();
          w.quaternion.setFromUnitVectors(up, dir);
          head.add(w);
        }
      }

      // what the rest of the game holds on to
      // the hat sits on top of the head: addHat() puts it 0.47 above model.head
      model.head = new THREE.Object3D();
      model.head.position.set(0, (sp === 'dog' ? 1.80 : 1.765) - 0.47 - hp[1], -0.02);
      head.add(model.head);
      model.aim = new THREE.Object3D();
      model.aim.position.set(0, 1.3, 0.02);
      g.add(model.aim);
      model.lArm = new THREE.Object3D(); model.rArm = new THREE.Object3D();
      g.add(model.lArm, model.rArm);
      this.t = Math.random() * 10;
      this.wag = 0;
      this.speed = 0;
      this.hasHat = false;
    }

    // -------------------------------------------------------------------------------------
    // Pose
    // -------------------------------------------------------------------------------------
    resetPose() {
      for (const b of Object.values(this.bones)) { b.rotation.set(0, 0, 0); b.position.copy(b.userData.rest); b.scale.set(1, 1, 1); }
    }

    setPose(pos, yaw, pitch, speed, dt) {
      const m = this.model, b = this.bones, g = m.group;
      g.position.copy(pos);
      g.rotation.y = yaw + Math.PI;
      this.t += dt;
      this.speed += (speed - this.speed) * Math.min(1, dt * 8);
      const w = Math.min(1, this.speed / 4);
      m.walkPhase += dt * speed * 2.2;
      const ph = m.walkPhase, t = this.t;
      this.resetPose();
      this.pitch = pitch;
      // legs: swing from the hip, the knee folds as the leg comes forward, the foot stays flat
      for (const [s, off] of [['L', 0], ['R', Math.PI]]) {
        const p = ph + off;
        const th = -Math.sin(p) * 0.6 * w;
        const kn = (0.12 + 0.75 * Math.max(0, Math.sin(p + 1.9))) * w;
        b[`thigh.${s}`].rotation.x = th - 0.05 * w;
        b[`shin.${s}`].rotation.x = kn;
        b[`foot.${s}`].rotation.x = -(th + kn) * 0.85;
      }
      // hips bob and turn, the spine counters, a little lean into the run
      b.hips.position.y += -0.035 * w * Math.abs(Math.cos(ph)) + 0.012 * w;
      b.hips.rotation.y = Math.sin(ph) * 0.14 * w;
      b.hips.rotation.z = Math.cos(ph) * 0.04 * w;
      b.spine.rotation.y = -Math.sin(ph) * 0.1 * w;
      b.spine.rotation.x = 0.08 * w;
      // breathing
      const br = Math.sin(t * 2.2) * 0.012 * (1 - w * 0.5);
      b.chest.scale.set(1 + br, 1 + br * 0.5, 1 + br);
      // looking up / down: shared by the chest, neck and head
      b.chest.rotation.x = -pitch * 0.3 - 0.08 * w;
      b.neck.rotation.x = -pitch * 0.25;
      b.head.rotation.x = -pitch * 0.35 + Math.sin(t * 0.7) * 0.02;
      b.head.rotation.z = Math.sin(t * 0.45) * 0.03;
      m.aim.rotation.x = -pitch;
      // tail: the dog wags, the cat sways
      const nT = this.sp === 'cat' ? 5 : 4;
      for (let i = 0; i < nT; i++) {
        const tb = b[`tail${i}`];
        if (!tb) continue;
        if (this.sp === 'dog') tb.rotation.z = Math.sin(t * 10 - i * 0.7) * (0.22 + 0.12 * i / nT);
        else { tb.rotation.y = Math.sin(t * 1.5 - i * 0.55) * 0.16; tb.rotation.x = -0.06 + Math.sin(t * 0.9 - i * 0.4) * 0.05; }
      }
      // ears: floppy ones bounce, pointy ones twitch now and then (and lie flatter under a hat)
      for (const [s, k] of [['L', 1], ['R', -1]]) {
        const e = b[`ear.${s}`];
        if (this.sp === 'dog') e.rotation.z = k * (0.04 + Math.abs(Math.cos(ph)) * 0.1 * w + Math.sin(t * 1.3) * 0.02);
        else {
          const tw = Math.max(0, Math.sin(t * 0.8 + k) * 8 - 7.6);
          e.rotation.z = -k * ((this.hasHat ? 0.55 : 0.05) + tw * 0.35);
        }
      }
      // arms
      if (m.armed) this.armsOnBlaster();
      else {
        for (const [s, k, off] of [['L', 1, Math.PI], ['R', -1, 0]]) {
          b[`upperarm.${s}`].rotation.set(-Math.sin(ph + off) * 0.5 * w, 0, -k * 0.38);
          b[`forearm.${s}`].rotation.x = -0.25 - Math.max(0, -Math.sin(ph + off)) * 0.4 * w;
        }
      }
      this.handsOut();
    }

    // two-bone IK: put the hand at `target` (world), the elbow bending towards `pole` (world dir)
    reach(s, target, pole) {
      const b = this.bones, ua = b[`upperarm.${s}`], fa = b[`forearm.${s}`], hd = b[`hand.${s}`];
      const [la, lb] = this.restLen[s];
      ua.updateMatrixWorld(true);
      const S = ua.getWorldPosition(_a), E0 = fa.getWorldPosition(_b);
      const dv = _c.copy(target).sub(S);
      const d = Math.min(Math.max(dv.length(), 0.05), (la + lb) * 0.999);
      const n = dv.normalize();
      const cosA = Math.min(1, Math.max(-1, (la * la + d * d - lb * lb) / (2 * la * d)));
      const p = _d.copy(pole).addScaledVector(n, -pole.dot(n)).normalize();
      const Edir = _e.copy(n).multiplyScalar(cosA).addScaledVector(p, Math.sqrt(1 - cosA * cosA));
      this._aimBone(ua, _t.copy(E0).sub(S).normalize(), Edir);
      ua.updateMatrixWorld(true);
      const E = fa.getWorldPosition(_a), H = hd.getWorldPosition(_b);
      const want = _p.copy(target).sub(E).normalize();
      this._aimBone(fa, _t.copy(H).sub(E).normalize(), want);
      fa.updateMatrixWorld(true);
    }
    _aimBone(bone, from, to) {
      // turn the bone (in the world) so `from` lines up with `to`, then back into its parent's frame
      _q.setFromUnitVectors(from, to);
      bone.getWorldQuaternion(_q2);
      _q2.premultiply(_q);
      bone.parent.getWorldQuaternion(_q).invert();
      bone.quaternion.copy(_q.multiply(_q2));
    }

    armsOnBlaster() {
      const m = this.model, g = m.group;
      g.updateMatrixWorld(true);
      // the blaster hangs off `aim`; the right paw on the grip, the left one under the barrel
      const L = m.aim.localToWorld(_gL.set(0.15, -0.2, 0.28));
      const R = m.aim.localToWorld(_gR.set(0.09, -0.18, 0.52));
      const down = _down.set(0, -1, 0).applyQuaternion(g.quaternion);
      const side = _side.set(1, 0, 0).applyQuaternion(g.quaternion);
      this.reach('L', L, _pole.copy(down).addScaledVector(side, 0.7));
      this.reach('R', R, _pole.copy(down).addScaledVector(side, -0.9));
      this.bones['hand.L'].rotation.x = -0.4;
      this.bones['hand.R'].rotation.x = -0.6;
    }

    // where the paws are (chainsaw.js reads them: lArm/rArm (0, -0.6, 0))
    handsOut() {
      const m = this.model, g = m.group;
      g.updateMatrixWorld(true);
      for (const [s, o] of [['L', m.lArm], ['R', m.rArm]]) {
        this.bones[`hand.${s}`].getWorldPosition(_a).addScaledVector(_b.set(0, -1, 0).applyQuaternion(this.bones[`hand.${s}`].getWorldQuaternion(_q)), 0.05);
        g.worldToLocal(_a);
        o.position.set(_a.x, _a.y + 0.6, _a.z);
        o.rotation.set(0, 0, 0);
      }
    }

    setAction(kind, time, target) {
      const m = this.model, b = this.bones, g = m.group;
      if (!kind) return;
      if (kind === 'plant') {
        // kneeling, digging with both paws
        g.position.y -= 0.48;                       // (a squat: thighs level, shins folded back, feet flat)
        for (const [s, k] of [['L', 1], ['R', -1]]) {
          b[`thigh.${s}`].rotation.set(-1.3, 0, k * 0.12);
          b[`shin.${s}`].rotation.set(2.3, 0, 0);
          b[`foot.${s}`].rotation.set(-1.0, 0, 0);
        }
        b.spine.rotation.x = 0.35; b.chest.rotation.x = 0.2; b.neck.rotation.x = 0.2; b.head.rotation.x = 0.3;
        g.updateMatrixWorld(true);
        const dig = Math.sin(time * 7) * 0.06;
        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(g.quaternion);
        const side = new THREE.Vector3(1, 0, 0).applyQuaternion(g.quaternion);
        const ground = g.position.y + 0.48 + 0.05;
        for (const [s, k] of [['L', 1], ['R', -1]]) {
          const T = g.position.clone().addScaledVector(fwd, 0.45 + (k > 0 ? dig : -dig)).addScaledVector(side, k * 0.13);
          T.y = ground + Math.abs(dig);
          this.reach(s, T, new THREE.Vector3(0, -1, 0).addScaledVector(side, k));
        }
      } else if (kind === 'saw') {
        const buzz = Math.sin(time * 70) * 0.012;
        if (target) {
          const p = g.position, dx = target.x - p.x, dz = target.z - p.z, d = Math.hypot(dx, dz);
          g.rotation.y = Math.atan2(dx, dz);
          if (d > 1.2) { p.x += dx / d * (d - 1.2); p.z += dz / d * (d - 1.2); }
        }
        b.spine.rotation.x = 0.2; b.head.rotation.x = 0.35;
        b['thigh.L'].rotation.x = -0.25; b['thigh.R'].rotation.x = 0.2; b['shin.L'].rotation.x = 0.3;
        g.updateMatrixWorld(true);
        for (const [s, k, y, z] of [['L', 1, 0.98, 0.5], ['R', -1, 0.92, 0.36]]) {
          const T = g.localToWorld(new THREE.Vector3(k * 0.08, y + buzz, z));
          this.reach(s, T, new THREE.Vector3(0, -1, 0).addScaledVector(new THREE.Vector3(k, 0, 0).applyQuaternion(g.quaternion), 1));
        }
      }
      this.handsOut();
    }

    update(dt, camera) {
      // fewer fur layers far away
      const d = camera ? camera.position.distanceTo(this.model.group.position) : 0;
      const n = d < 9 ? this.shells : d < 20 ? Math.ceil(this.shells * 0.55) : d < 40 ? Math.ceil(this.shells * 0.3) : 2;
      this.furGeo.setDrawRange(0, this.B.trisPerShell * 3 * n);
    }

    // the body as little cubes, for when they're popped
    pixelize(out) {
      const m = this.body, B = this.B, M = B.masks, c = this.coat;
      m.updateMatrixWorld(true);
      this.skeleton.update();
      const col = (hex, k) => hex;
      for (const i of B.sample) {
        const p = m.boneTransform(i, new THREE.Vector3());
        m.localToWorld(p);
        const l = M[i * 4] / 255, pk = M[i * 4 + 1] / 255, dk = M[i * 4 + 2] / 255;
        const hex = B.vestSet.has(i) ? this.shirt : dk > 0.5 ? c.dark : pk > 0.5 ? c.pink : l > 0.5 ? c.light : (i % 3 === 0 ? c.b : c.a);
        out.push({ pos: p, color: col(hex) });
      }
      return out;
    }
  }

  function build(model, scene, o) {
    let sp = o.species;
    if (sp !== 'dog' && sp !== 'cat') sp = (o.seed || 0) % 2 ? 'cat' : 'dog';     // (practice buddies)
    model.rig = new Rig(model, sp, o);
    return sp;
  }

  // Draw a dog and a cat for the first few frames (behind the menu), so their shaders (and the
  // shadow ones) are compiled before the match, not the first time someone walks into view
  function warm(scene, camera) {
    if (!has('dog') || !has('cat')) return;
    const ms = ['dog', 'cat'].map((species, i) => {
      const m = new CharacterModel(scene, { species, seed: i + 1, armed: true, shirt: 0x888888 });
      m.addHat('tophat', 0xffd23f);
      return m;
    });
    const fwd = new THREE.Vector3();
    let n = 0;
    const tick = () => {
      camera.getWorldDirection(fwd);
      ms.forEach((m, i) => {
        m.setPose(camera.position.clone().addScaledVector(fwd, 4).add(new THREE.Vector3(i - 0.5, -1.4, 0)), 0, 0, 3, 1 / 60);
        m.update(1 / 60, camera);
      });
      if (++n < 4) requestAnimationFrame(tick);
      else ms.forEach(m => scene.remove(m.group));          // (the bodies' buffers are shared: not disposed)
    };
    tick();
  }

  return { ready, has, build, warm, SHELLS };
})();
