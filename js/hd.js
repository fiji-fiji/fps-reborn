// The HD look (menu: LOOK → HD). Same game, same blocks underneath (collisions, shots), drawn so
// it stops looking like a block game. Three files:
//
//   hd.js       (this one) the renderer: physically based materials everywhere (the game's simple
//               Lambert materials become "standard" as they're made), a sky with a sun and drifting
//               clouds that also lights the scene, sharp shadows that follow you, and
//               post-processing (high dynamic range, 4x anti-aliasing, bloom, sun shafts, a gentle
//               colour grade). Also the Blender-made tree crowns (tools/hd/bake_trees.py)
//   hdworld.js  the world: real-scale materials across whole walls and floors (no block grid),
//               rounded edges, surface depth, and light bouncing around the streets (worked out per
//               map when it loads). Materials: tools/hd/make_materials.py -> assets/hd/mat/
//   hddress.js  the architecture: windows, shutters and balconies, doors and shopfronts, cornices,
//               parapets and mansard roofs, stone arches, round trunks, palms, Gaudi's mosaic shapes
//
// Without WebGL 2 the world falls back to the block textures baked in Blender
// (tools/hd/bake_textures.py -> assets/hd/atlas_*.webp, see world() below).
//
// Loaded right after three.js, before the rest of the game, so it can swap the material type
// before anything is built. Does nothing unless the HD look is picked.
//
// Opened straight from the folder (file://), browsers refuse to load the pictures and data
// files, so index.html then loads assets/hd/offline.js (tools/hd/pack_offline.py): the same
// files as data: URLs. HD_ASSET(path) gives whichever one the page can use, or null if neither.

function HD_ASSET(path) {
  if (typeof HD_OFFLINE !== 'undefined' && HD_OFFLINE[path]) return HD_OFFLINE[path];
  return location.protocol === 'file:' ? null : path;
}

const HD = (() => {
  let on = false;
  try {
    const fromUrl = new URLSearchParams(location.search).get('look');
    on = (fromUrl || localStorage.getItem('fps.look') || '') === 'hd';
  } catch (e) {}
  if (!on) return { on: false };

  // No graphics card in use (the browser is drawing in software, e.g. after a GPU driver crash or
  // with hardware acceleration off)? HD would crawl: play with the classic look instead.
  let gl2Supported = false;
  function softwareRenderer() {
    try {
      const c = document.createElement('canvas');
      const gl2 = c.getContext('webgl2');
      gl2Supported = !!gl2;
      const gl = gl2 || c.getContext('webgl');
      if (!gl) return 'no WebGL';
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const name = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      return /swiftshader|llvmpipe|software|basic render/i.test(name) ? name : '';
    } catch (e) { return ''; }
  }
  const soft = softwareRenderer();
  if (soft) {
    console.warn(`HD look turned off: the browser isn't using the graphics card (${soft}). ` +
      'Turn on hardware acceleration in the browser settings (or restart the browser) to use HD.');
    return { on: false, blocked: soft };
  }

  // ---------------------------------------------------------------------------------------
  // Materials: every MeshLambertMaterial the game makes becomes a MeshStandardMaterial with
  // the same colours / textures / glow. See-through things (bubbles, glass, soap) get smooth
  // and shiny so they catch the sky and the sun.
  // ---------------------------------------------------------------------------------------
  const LAMBERT_ONLY = ['specularMap', 'combine', 'reflectivity', 'refractionRatio'];
  // the light bouncing around the map (hdworld.js) lights everything in the world, not just the
  // blocks: materials made before hdworld.js is ready wait in a queue
  let giHook = null;
  const giWaiting = [];
  function withGi(m) {
    if (!gl2Supported) return m;
    if (giHook) giHook(m); else giWaiting.push(m);
    return m;
  }
  function setGiHook(fn) { giHook = fn; giWaiting.splice(0).forEach(fn); }
  class HDLambertMaterial extends THREE.MeshStandardMaterial {
    constructor(params) {
      super();
      const p = Object.assign({}, params);
      for (const k of LAMBERT_ONLY) delete p[k];
      const glassy = p.transparent && (p.opacity === undefined || p.opacity < 0.9) && !p.map;
      if (glassy && p.opacity !== undefined && p.opacity <= 0.6) {
        // bubbles and soap film: a thin rainbow sheen, like the real thing
        const m = new THREE.MeshPhysicalMaterial({ roughness: 0.08, metalness: 0, envMapIntensity: 1.6,
          iridescence: 1, iridescenceIOR: 1.33, iridescenceThicknessRange: [180, 520] });
        m.setValues(p);
        return withGi(m);                           // (a constructor may hand back a different object)
      }
      this.roughness = glassy ? 0.12 : 0.72;
      this.metalness = 0;
      this.envMapIntensity = glassy ? 1.4 : 1;
      this.setValues(p);
      withGi(this);
    }
  }
  THREE.MeshLambertMaterial = HDLambertMaterial;

  // ---------------------------------------------------------------------------------------
  // Sky: gradient, sun disk, glow around the sun; also used (without the disk) to light the
  // scene through reflections. Outputs linear light (the post pass does the tone curve).
  // ---------------------------------------------------------------------------------------
  // the photographed sky (assets/hd/sky.webp + sky.json, from tools/hd/make_sky.py); until it
  // has loaded (or if it can't), the gradient sky above
  const PHOTO = {
    tex: { value: null }, on: { value: 0 }, maxv: { value: 4 }, elev: { value: new THREE.Vector2(-10, 90) },
    rot: { value: 0 }, meta: null,
  };
  function loadPhotoSky(done) {
    const meta = HD_ASSET('assets/hd/sky.json'), pic = HD_ASSET('assets/hd/sky.webp');
    if (!meta || !pic) return;
    fetch(meta).then(r => (r.ok ? r.json() : null)).then(meta => {
      if (!meta) return;
      new THREE.TextureLoader().load(pic, tex => {
        tex.encoding = THREE.sRGBEncoding;
        tex.wrapS = THREE.RepeatWrapping;
        tex.generateMipmaps = false;                 // (always magnified; mips would show the seam)
        tex.minFilter = tex.magFilter = THREE.LinearFilter;
        PHOTO.meta = meta;
        PHOTO.tex.value = tex; PHOTO.maxv.value = meta.maxv;
        PHOTO.elev.value.set(meta.elev[0], meta.elev[1]);
        PHOTO.on.value = 1;
        done();
      });
    }).catch(() => {});
  }
  // the photo's column u faces the azimuth atan(z, x) = 2 pi (u - 0.5) - rot: turn it so its sun is the map's
  function aimPhoto(dir) {
    if (!PHOTO.meta) return;
    PHOTO.rot.value = 2 * Math.PI * (PHOTO.meta.sunU - 0.5) - Math.atan2(dir.z, dir.x);
  }

  function skyMaterial(colors, disk, gain = 1, clouds = 0) {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        gain: { value: gain },
        top: { value: new THREE.Color(colors.top) },
        horizon: { value: new THREE.Color(colors.horizon) },
        ground: { value: new THREE.Color(colors.ground) },
        sunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
        sunColor: { value: new THREE.Color(0xfff0d6) },
        disk: { value: disk },
        clouds: { value: clouds },
        time: { value: 0 },
        photo: PHOTO.tex, photoOn: PHOTO.on, photoMaxv: PHOTO.maxv, photoE: PHOTO.elev, photoRot: PHOTO.rot,
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 top, horizon, ground, sunDir, sunColor;
        uniform float disk, gain, clouds, time;
        uniform sampler2D photo; uniform float photoOn, photoMaxv, photoRot; uniform vec2 photoE;
        varying vec3 vDir;
        float h2(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
        float vn(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float fbm(vec2 p) {
          float s = 0.0, a = 0.5;
          for (int i = 0; i < 6; i++) { s += a * vn(p); p = p * 2.02 + vec2(1.7, 9.2); a *= 0.5; }
          return s;
        }
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 c = mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.55));
          float s = max(dot(d, sunDir), 0.0);
          float above = smoothstep(-0.03, 0.02, h);
          if (photoOn > 0.5) {
            // the photographed sky (make_sky.py), turned so its sun is where the map's sun is;
            // it fades into the haze (the fog's colour) towards the horizon
            float el = degrees(asin(clamp(h, -1.0, 1.0)));
            float u = fract(0.5 + (atan(d.z, d.x) + photoRot) / 6.2831853);
            vec3 p = texture2D(photo, vec2(u, clamp((el - photoE.x) / (photoE.y - photoE.x), 0.0, 1.0))).rgb * photoMaxv;
            c = mix(p, horizon, (1.0 - smoothstep(0.0, 0.16, h)) * 0.85);
            c += sunColor * above * pow(s, 900.0) * 40.0 * disk;
          } else {
            c += sunColor * above * (pow(s, 900.0) * 40.0 * disk + pow(s, 64.0) * 0.35 + pow(s, 6.0) * 0.12);
          }
          c = mix(c, ground, smoothstep(0.0, -0.12, h));
          if (clouds > 0.0 && h > 0.0 && photoOn < 0.5) {
            // a cloud layer high up: fair-weather cumulus, drifting, lit from the sun's side
            vec2 p = d.xz / (h + 0.06) * 0.55 + vec2(time * 0.004, time * 0.0015);
            float n = fbm(p);
            float cover = smoothstep(0.5, 0.78, n);
            float toward = fbm(p + sunDir.xz * 0.06);
            float lit = clamp(0.75 + (n - toward) * 5.0, 0.35, 1.25);
            vec3 cc = mix(vec3(0.62, 0.66, 0.74), vec3(1.05, 1.0, 0.94), lit) + sunColor * pow(s, 8.0) * 0.5 * (1.0 - cover);
            float fade = smoothstep(0.015, 0.2, h);
            c = mix(c, cc, cover * fade * clouds);
          }
          gl_FragColor = vec4(c * gain, 1.0);
        }`,
    });
  }

  // ---------------------------------------------------------------------------------------
  // Post-processing
  // ---------------------------------------------------------------------------------------
  const QUAD_VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene();
  quadScene.add(quad);

  const brightMat = new THREE.ShaderMaterial({
    uniforms: { tex: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 1.15 }, knee: { value: 0.8 } },
    vertexShader: QUAD_VERT, depthTest: false, depthWrite: false,
    fragmentShader: `
      uniform sampler2D tex; uniform vec2 texel; uniform float threshold, knee;
      varying vec2 vUv;
      void main() {
        // 4 bilinear taps = a 4x4 box: a smooth half-size copy
        vec3 c = (texture2D(tex, vUv + texel * vec2(-1.0, -1.0)).rgb + texture2D(tex, vUv + texel * vec2(1.0, -1.0)).rgb +
                  texture2D(tex, vUv + texel * vec2(-1.0, 1.0)).rgb + texture2D(tex, vUv + texel * vec2(1.0, 1.0)).rgb) * 0.25;
        float br = max(c.r, max(c.g, c.b));
        float k = clamp((br - threshold) / knee, 0.0, 1.0);
        gl_FragColor = vec4(min(c * k * k * (3.0 - 2.0 * k), vec3(40.0)), 1.0);
      }`,
  });
  const downMat = new THREE.ShaderMaterial({
    uniforms: { tex: { value: null }, texel: { value: new THREE.Vector2() } },
    vertexShader: QUAD_VERT, depthTest: false, depthWrite: false,
    fragmentShader: `
      uniform sampler2D tex; uniform vec2 texel; varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tex, vUv).rgb * 0.5;
        c += (texture2D(tex, vUv + texel * vec2(-1.0, -1.0)).rgb + texture2D(tex, vUv + texel * vec2(1.0, -1.0)).rgb +
              texture2D(tex, vUv + texel * vec2(-1.0, 1.0)).rgb + texture2D(tex, vUv + texel * vec2(1.0, 1.0)).rgb) * 0.125;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const upMat = new THREE.ShaderMaterial({
    uniforms: { tex: { value: null }, texel: { value: new THREE.Vector2() } },
    vertexShader: QUAD_VERT, depthTest: false, depthWrite: false,
    blending: THREE.AdditiveBlending, transparent: true,
    fragmentShader: `
      uniform sampler2D tex; uniform vec2 texel; varying vec2 vUv;
      void main() {   // 9-tap tent: a soft, round glow as it grows back up
        vec3 c = texture2D(tex, vUv).rgb * 4.0;
        c += (texture2D(tex, vUv + vec2(texel.x, 0.0)).rgb + texture2D(tex, vUv - vec2(texel.x, 0.0)).rgb +
              texture2D(tex, vUv + vec2(0.0, texel.y)).rgb + texture2D(tex, vUv - vec2(0.0, texel.y)).rgb) * 2.0;
        c += texture2D(tex, vUv + texel).rgb + texture2D(tex, vUv - texel).rgb +
             texture2D(tex, vUv + vec2(texel.x, -texel.y)).rgb + texture2D(tex, vUv + vec2(-texel.x, texel.y)).rgb;
        gl_FragColor = vec4(c / 16.0, 1.0);
      }`,
  });
  const finalMat = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: null }, tBloom: { value: null }, tShafts: { value: null },
      shaftStrength: { value: 0 }, shaftColor: { value: new THREE.Color(1.0, 0.86, 0.62) },
      exposure: { value: 0.9 }, bloomStrength: { value: 0.16 },
      saturation: { value: 1.08 }, contrast: { value: 0.12 }, vignette: { value: 0.22 },
      warmth: { value: 0.03 },
    },
    vertexShader: QUAD_VERT, depthTest: false, depthWrite: false,
    fragmentShader: `
      uniform sampler2D tScene, tBloom, tShafts;
      uniform float exposure, bloomStrength, saturation, contrast, vignette, warmth, shaftStrength;
      uniform vec3 shaftColor;
      varying vec2 vUv;
      // Khronos PBR Neutral: a filmic roll-off that keeps colours true (no orange/grey shift)
      vec3 neutral(vec3 color) {
        const float start = 0.76, desat = 0.15;
        float x = min(color.r, min(color.g, color.b));
        float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
        color -= offset;
        float peak = max(color.r, max(color.g, color.b));
        if (peak < start) return color;
        const float d = 1.0 - start;
        float newPeak = 1.0 - d * d / (peak + d - start);
        color *= newPeak / peak;
        float g = 1.0 - 1.0 / (desat * (peak - newPeak) + 1.0);
        return mix(color, vec3(newPeak), g);
      }
      vec3 toSRGB(vec3 c) {
        return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
      }
      void main() {
        vec3 c = texture2D(tScene, vUv).rgb + texture2D(tBloom, vUv).rgb * bloomStrength;
        if (shaftStrength > 0.0) c += texture2D(tShafts, vUv).rgb * shaftColor * shaftStrength;
        c *= exposure;
        c = neutral(max(c, 0.0));
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, saturation);                                    // a touch richer
        c *= vec3(1.0 + warmth, 1.0, 1.0 - warmth);                         // a touch of warm afternoon light
        c = toSRGB(clamp(c, 0.0, 1.0));
        c = mix(c, c * c * (3.0 - 2.0 * c), contrast);                      // gentle S-curve
        vec2 q = vUv - 0.5;
        c *= 1.0 - vignette * dot(q, q) * 1.6;
        c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;   // no banding in the sky
        gl_FragColor = vec4(c, 1.0);
      }`,
  });

  const blackMat = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });
  const shaftMat = new THREE.ShaderMaterial({
    uniforms: { tex: { value: null }, sunUV: { value: new THREE.Vector2() }, aspect: { value: 1 } },
    vertexShader: QUAD_VERT, depthTest: false, depthWrite: false,
    fragmentShader: `
      uniform sampler2D tex; uniform vec2 sunUV; uniform float aspect;
      varying vec2 vUv;
      void main() {
        vec2 d = vUv - sunUV;
        vec2 stepv = d / 48.0;
        vec2 p = vUv;
        float acc = 0.0, w = 1.0;
        for (int i = 0; i < 48; i++) {           // walk towards the sun, adding up open sky
          p -= stepv;
          acc += texture2D(tex, clamp(p, 0.0, 1.0)).r * w;
          w *= 0.97;
        }
        acc /= 30.0;
        d.x *= aspect;
        float glow = exp(-length(d) * 2.4);       // strongest close to the sun
        gl_FragColor = vec4(vec3(acc * glow), 1.0);
      }`,
  });
  let maskRT = null, shaftRT = null;
  let renderer = null, rt = null, mips = [], scene = null, viewScene = null, sun = null, sky = null;
  let envSky = null, envDone = false, post = false;
  const size = new THREE.Vector2();
  const COLORS = { top: 0x4f9fef, horizon: 0xd7eeff, ground: 0xb8a888 };

  function pass(mat, target, clear = true) {
    quad.material = mat;
    renderer.setRenderTarget(target);
    if (clear) renderer.clear();
    renderer.render(quadScene, quadCam);
  }

  // ---------------------------------------------------------------------------------------
  // Setup (from main.js, once the scene, lights and sky exist)
  // ---------------------------------------------------------------------------------------
  function setup(o) {
    renderer = o.renderer; scene = o.scene; viewScene = o.viewScene; sun = o.sun; sky = o.sky;
    const gl2 = renderer.capabilities.isWebGL2;
    const floatOk = gl2 && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
    post = gl2;
    const type = floatOk ? THREE.HalfFloatType : THREE.UnsignedByteType;
    if (post) {
      rt = new THREE.WebGLRenderTarget(1, 1, { type, samples: 4 });
      for (let i = 0; i < 6; i++) mips.push(new THREE.WebGLRenderTarget(1, 1, { type, depthBuffer: false }));
      maskRT = new THREE.WebGLRenderTarget(1, 1);
      shaftRT = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    } else {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;           // no post: let three.js do the tone curve
      renderer.toneMappingExposure = 1.0;
    }
    if (!floatOk) brightMat.uniforms.threshold.value = 0.75;

    // lights: the sky now lights everything (reflections + ambient), so the flat fill is lower;
    // the sun is stronger, for crisp light and shade
    o.hemi.intensity = 0.42;                                       // (warm-neutral: shade isn't cold blue)
    o.hemi.color.set(0xfff3e4); o.hemi.groundColor.set(0xd8b890);
    sun.intensity = 0.85;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.025;
    for (const l of o.viewLights) l.intensity *= 0.6;

    // the sky dome (pulled inside the camera's far distance, so its edge never shows)
    sky.material = skyMaterial(COLORS, 1, 1, 0.85);
    if (o.clouds && o.clouds.parent) o.clouds.parent.remove(o.clouds);    // (the sky draws its own clouds)
    sky.scale.setScalar(0.55);
    loadPhotoSky(() => { if (envDone) { aimPhoto(sunDir); lightFromSky(); } });
    scene.background = new THREE.Color(COLORS.horizon);
    // a small copy of the sky (no sun disk: the sun light does the highlights) to light the scene,
    // dimmer than the real one (the sun + the fill light do most of the lighting)
    envSky = new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24),
      skyMaterial(Object.assign({}, COLORS, { top: 0x9cc4ec, horizon: 0xe8eef4, ground: 0xc8a882 }), 0, 0.42));
  }

  // The sun: same direction as the map sets it, a bit lower in the sky (afternoon light: more
  // shape on the blocks, warmer, and you can see light shafts past the rooftops).
  const SUN_ELEVATION = 48 * Math.PI / 180;           // (= the photographed sky's sun: make_sky.py)
  const sunDir = new THREE.Vector3();
  // Shadows follow you: the shadow map covers SHADOW_HALF metres around you (instead of the whole
  // map), so nearby shadows are about twice as sharp. Snapped to whole shadow texels, so the
  // edges don't shimmer as you move.
  const SHADOW_HALF = 55;
  const UP = new THREE.Vector3(0, 1, 0), lx = new THREE.Vector3(), ly = new THREE.Vector3();
  const center = new THREE.Vector3(), fwd = new THREE.Vector3();

  function followShadow(camera) {
    camera.getWorldDirection(fwd); fwd.y = 0;
    if (fwd.lengthSq() > 1e-6) fwd.normalize();
    center.copy(camera.position).addScaledVector(fwd, 18);       // more of it ahead of you than behind
    lx.crossVectors(UP, sunDir).normalize(); ly.crossVectors(sunDir, lx);
    const texel = (2 * SHADOW_HALF) / sun.shadow.mapSize.x;
    const a = Math.round(center.dot(lx) / texel) * texel;
    const b = Math.round(center.dot(ly) / texel) * texel;
    const c = center.dot(sunDir);
    sun.target.position.set(0, 0, 0).addScaledVector(lx, a).addScaledVector(ly, b).addScaledVector(sunDir, c);
    sun.position.copy(sun.target.position).addScaledVector(sunDir, 160);
    sun.target.updateMatrixWorld();
  }

  // the scene's reflections + sky light: a blurred copy of the (dimmer) sky
  function lightFromSky() {
    const s = new THREE.Scene();
    s.add(envSky);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(s, 0.02).texture;
    pmrem.dispose();
    if (scene.environment) scene.environment.dispose();
    scene.environment = env;
    viewScene.environment = env;
  }

  function makeEnv() {
    const d = sun.position.clone().sub(sun.target.position);
    const flat = new THREE.Vector3(d.x, 0, d.z).normalize();
    sunDir.copy(flat).multiplyScalar(Math.cos(SUN_ELEVATION)).add(new THREE.Vector3(0, Math.sin(SUN_ELEVATION), 0)).normalize();
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -SHADOW_HALF; sc.right = sc.top = SHADOW_HALF;
    sc.near = 1; sc.far = 340;
    sc.updateProjectionMatrix();
    const dir = sunDir;
    sky.material.uniforms.sunDir.value.copy(dir);
    envSky.material.uniforms.sunDir.value.copy(dir);
    aimPhoto(dir);
    lightFromSky();
    envDone = true;
    if (typeof HDWorld !== 'undefined' && HDWorld) HDWorld.onEnv(sunDir);
  }

  // ---------------------------------------------------------------------------------------
  // Parallax occlusion mapping: the blocks' height map (baked with the textures) shifts where
  // each pixel reads its texture, as if the surface really had depth — mortar sinks between
  // bricks, cobbles bulge, window frames stand out, and the bumps hide what's behind them when
  // you look along a wall. Fades out with distance (no point far away, and it saves work).
  // ---------------------------------------------------------------------------------------
  const HEIGHT_RANGE = 0.04;                        // metres from 0 to 1 in the height map (bake_textures.py: HMAX)
  const pomUniforms = { pomDepth: { value: 0 }, pomOn: { value: 1 } };

  function addParallax(mat) {
    // one block (1 m) spans a tile's inner area: that much of the atlas (textures.js)
    pomUniforms.pomDepth.value = HEIGHT_RANGE * TEX_INNER / (TEX_CELL * ATLAS_SIZE);
    mat.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, pomUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <uv_pars_vertex>', 'varying vec2 vUv_;\nuniform mat3 uvTransform;')
        .replace('#include <uv_vertex>', 'vUv_ = ( uvTransform * vec3( uv, 1 ) ).xy;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <uv_pars_fragment>', 'varying vec2 vUv_;\nvec2 vUv;\nuniform float pomDepth, pomOn;')
        // the normal map's surface directions come from the real UVs, not the shifted ones
        .replace('#include <normalmap_pars_fragment>', THREE.ShaderChunk.normalmap_pars_fragment.replace(/vUv/g, 'vUv_'))
        .replace('void main() {', `
          vec2 pomUV(vec2 uv) {
            vec2 st0 = dFdx(uv), st1 = dFdy(uv);
            vec3 q0 = dFdx(-vViewPosition), q1 = dFdy(-vViewPosition);
            float dist = length(vViewPosition);
            float fade = clamp(1.0 - (dist - 14.0) / 10.0, 0.0, 1.0);
            if (pomOn < 0.5 || fade <= 0.0) return uv;
            vec3 N = normalize(vNormal);
            vec3 q1perp = cross(q1, N), q0perp = cross(N, q0);
            vec3 T = q1perp * st0.x + q0perp * st1.x;      // which way u and v run, on screen
            vec3 B = q1perp * st0.y + q0perp * st1.y;
            float det = max(dot(T, T), dot(B, B));
            if (det == 0.0) return uv;
            float s = inversesqrt(det); T *= s; B *= s;
            vec3 V = normalize(vViewPosition);
            vec3 v = vec3(dot(V, T), dot(V, B), dot(V, N));
            vec2 ratio = v.xy / max(v.z, 0.05);
            float rl = length(ratio);
            if (rl > 1.5) ratio *= 1.5 / rl;                 // stay within the tile's padding
            vec2 P = ratio * pomDepth * fade;
            float n = mix(28.0, 10.0, clamp(v.z, 0.0, 1.0));
            float stepD = 1.0 / n;
            vec2 dUV = P * stepD;
            vec2 cur = uv;
            float layer = 0.0;
            float d = 1.0 - textureGrad(roughnessMap, cur, st0, st1).r;
            for (int i = 0; i < 28; i++) {
              if (layer >= d || float(i) >= n) break;
              cur -= dUV; layer += stepD;
              d = 1.0 - textureGrad(roughnessMap, cur, st0, st1).r;
            }
            vec2 prev = cur + dUV;
            float after = d - layer;
            float before = (1.0 - textureGrad(roughnessMap, prev, st0, st1).r) - (layer - stepD);
            float w = after / (after - before + 1e-5);
            return mix(cur, prev, clamp(w, 0.0, 1.0));
          }
          void main() {
            vUv = pomUV(vUv_);`);
    };
    mat.customProgramCacheKey = () => 'hd-parallax';
    mat.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------------------
  // The world: Blender-baked block textures (falls back to the normal atlas until loaded)
  // ---------------------------------------------------------------------------------------
  function world(group) {
    const [ground, water] = group.children;
    const gm = ground.material;
    gm.roughness = 0.8; gm.metalness = 0; gm.envMapIntensity = 0.7;
    if (water) {
      const wm = water.material;
      wm.roughness = 0.06; wm.metalness = 0; wm.opacity = 0.78; wm.envMapIntensity = 1.3;
      wm.color.set(0xdff4ff);
    }
    if (!HD_ASSET('assets/hd/atlas_albedo.webp')) return;   // (file:// without the offline pack)
    const loader = new THREE.TextureLoader();
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const load = (name, srgb, done) => loader.load(HD_ASSET(`assets/hd/${name}.webp`), t => {
      t.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
      t.anisotropy = aniso;
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      done(t);
    }, undefined, () => console.warn(`HD: couldn't load assets/hd/${name}.webp, using the normal blocks`));
    load('atlas_albedo', true, t => {
      gm.map = t; gm.needsUpdate = true;
      if (water) { water.material.map = t; water.material.needsUpdate = true; }
    });
    load('atlas_normal', false, t => {
      gm.normalMap = t; gm.normalScale.set(1.15, 1.15); gm.needsUpdate = true;
      if (water) { water.material.normalMap = t; water.material.normalScale.set(0.6, 0.6); water.material.needsUpdate = true; }
    });
    load('atlas_hrm', false, t => {                        // R height, G roughness, B metalness
      gm.roughnessMap = t; gm.metalnessMap = t;
      gm.roughness = 1; gm.metalness = 1;                 // the map holds the real values
      if (post) addParallax(gm);                          // (needs WebGL2)
      gm.needsUpdate = true;
    });
  }

  // ---------------------------------------------------------------------------------------
  // Tree crowns modelled in Blender (tools/hd/bake_trees.py): soft leafy canopies with the
  // shade baked into their colours, swaying a little in the wind. decor.js asks for one per
  // tree; they appear as soon as assets/hd/crowns.json has loaded.
  // ---------------------------------------------------------------------------------------
  const wind = { value: 0 };
  let crownData = null;
  const crownGeos = {};
  const crownMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, envMapIntensity: 0.8 });
  crownMat.onBeforeCompile = shader => {
    shader.uniforms.windTime = wind;
    shader.vertexShader = 'uniform float windTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      {
        vec4 wp = modelMatrix * vec4(transformed, 1.0);
        float k = clamp((transformed.y + 0.5) / 4.0, 0.0, 1.0);      // the top moves, the base stays
        transformed.x += sin(windTime * 1.1 + wp.x * 0.35 + wp.z * 0.2) * 0.06 * k;
        transformed.z += cos(windTime * 0.85 + wp.z * 0.3 + wp.x * 0.1) * 0.045 * k;
        transformed.y += sin(windTime * 2.3 + wp.x * 0.9 + wp.y * 0.7) * 0.012 * k;   // leaves trembling
      }`);
  };
  crownMat.customProgramCacheKey = () => 'hd-crown';
  withGi(crownMat);
  const CROWN_DROP = { tree: -0.3, orange: 0 };          // tuck the canopy over the trunk top

  function crownGeometry(kind, i) {
    const key = kind + i;
    if (crownGeos[key]) return crownGeos[key];
    const d = crownData[kind][i];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(d.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(d.col, 3));
    g.setIndex(d.idx);
    g.computeBoundingSphere();
    return (crownGeos[key] = g);
  }

  const crownLoad = !HD_ASSET('assets/hd/crowns.json') ? null
    : fetch(HD_ASSET('assets/hd/crowns.json')).then(r => (r.ok ? r.json() : null)).then(d => (crownData = d)).catch(() => null);

  function crown(parent, kind, x, y, z, rng) {
    if (!crownLoad) return false;                        // (file:// without the offline pack: classic crowns)
    const pick = rng(), spin = rng() * Math.PI * 2;
    const holder = new THREE.Group();
    holder.position.set(x, y + (CROWN_DROP[kind] || 0), z);
    holder.rotation.y = spin;
    parent.add(holder);
    crownLoad.then(d => {
      if (!d || !d[kind] || !d[kind].length) return;
      const m = new THREE.Mesh(crownGeometry(kind, Math.floor(pick * d[kind].length)), crownMat);
      m.castShadow = m.receiveShadow = true;
      holder.add(m);
    });
    return true;
  }

  // ---------------------------------------------------------------------------------------
  // Each frame
  // ---------------------------------------------------------------------------------------
  // The scene is drawn at `scale` x the screen's resolution (then stretched smoothly to fit).
  // Normally 1; if the computer can't keep up (under ~45 fps) it steps down, as far as half,
  // and back up when there's room again.
  let scale = 1, frameSum = 0, frameCount = 0, lastFrame = 0, holdUntil = 0;

  function resize() {
    if (!post) return;
    renderer.getDrawingBufferSize(size);
    const W = Math.max(1, Math.round(size.x * scale)), H = Math.max(1, Math.round(size.y * scale));
    rt.setSize(W, H);
    let w = W, h = H;
    for (const m of mips) { w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); m.setSize(w, h); }
    maskRT.setSize(Math.max(1, W >> 2), Math.max(1, H >> 2));
    shaftRT.setSize(Math.max(1, W >> 2), Math.max(1, H >> 2));
  }

  function adapt(now) {
    if (lastFrame) {
      const dt = now - lastFrame;
      if (dt < 250) { frameSum += dt; frameCount++; }      // (ignore pauses: tab switches, alt-tab)
    }
    lastFrame = now;
    if (frameCount < 90) return;
    const avg = frameSum / frameCount;
    frameSum = frameCount = 0;
    if (now < holdUntil) return;
    if (avg > 22 && scale > 0.5) {
      scale = Math.max(0.5, +(scale - 0.15).toFixed(2));
      holdUntil = now + 3000;
      resize();
      console.info(`HD: running slow (${(1000 / avg).toFixed(0)} fps), drawing at ${Math.round(scale * 100)}% resolution`);
    } else if (avg < 15 && scale < 1) {
      scale = Math.min(1, +(scale + 0.1).toFixed(2));
      holdUntil = now + 8000;
      resize();
    }
  }

  // Light shafts: the sky seen past the rooftops/trees (a small black-and-white picture), smeared
  // out from the sun and added back as warm light. Only when you're facing the sun.
  const shaftCam = new THREE.Vector3(), sunUV = new THREE.Vector2();
  const WHITE = new THREE.Color(0xffffff);
  function shafts(camera) {
    camera.getWorldDirection(fwd);
    const facing = fwd.dot(sunDir);
    finalMat.uniforms.shaftStrength.value = 0.55 * THREE.MathUtils.smoothstep(facing, 0.15, 0.6);
    if (facing <= 0.15) return;
    shaftCam.copy(camera.position).addScaledVector(sunDir, 200).project(camera);
    sunUV.set(shaftCam.x * 0.5 + 0.5, shaftCam.y * 0.5 + 0.5);
    // the mask: everything black, the open sky white
    const bg = scene.background, fog = scene.fog, skyOn = sky.visible, auto = renderer.shadowMap.autoUpdate;
    scene.background = WHITE; scene.fog = null; scene.overrideMaterial = blackMat; sky.visible = false;
    renderer.shadowMap.autoUpdate = false;                    // (the shadows were just drawn)
    renderer.setRenderTarget(maskRT); renderer.clear(); renderer.render(scene, camera);
    scene.background = bg; scene.fog = fog; scene.overrideMaterial = null; sky.visible = skyOn;
    renderer.shadowMap.autoUpdate = auto;
    if (!skyOn) { finalMat.uniforms.shaftStrength.value = 0; return; }   // inside a cloud puff
    shaftMat.uniforms.tex.value = maskRT.texture;
    shaftMat.uniforms.sunUV.value.copy(sunUV);
    shaftMat.uniforms.aspect.value = maskRT.width / maskRT.height;
    pass(shaftMat, shaftRT);
  }

  function render(camera, viewCamera) {
    if (!envDone) makeEnv();
    wind.value = performance.now() / 1000;
    sky.material.uniforms.time.value = wind.value;
    const W = typeof HDWorld !== 'undefined' && HDWorld;
    if (W) W.tick(wind.value);
    followShadow(camera);
    if (post) adapt(performance.now());
    if (!post) {
      renderer.setRenderTarget(null);
      renderer.clear(); renderer.render(scene, camera);
      renderer.clearDepth(); renderer.render(viewScene, viewCamera);
      return;
    }
    renderer.setRenderTarget(rt);
    renderer.clear(); renderer.render(scene, camera);
    const giOn = W ? W.U.hdGiOn.value : 0;
    if (W) W.U.hdGiOn.value = 0;                              // (the gun in your hands isn't in the world)
    renderer.clearDepth(); renderer.render(viewScene, viewCamera);
    if (W) W.U.hdGiOn.value = giOn;

    // bloom: bright parts, halved down a few times, then added back up (a wide soft glow)
    brightMat.uniforms.tex.value = rt.texture;
    brightMat.uniforms.texel.value.set(1 / rt.width, 1 / rt.height);
    pass(brightMat, mips[0]);
    for (let i = 1; i < mips.length; i++) {
      downMat.uniforms.tex.value = mips[i - 1].texture;
      downMat.uniforms.texel.value.set(1 / mips[i - 1].width, 1 / mips[i - 1].height);
      pass(downMat, mips[i]);
    }
    for (let i = mips.length - 2; i >= 0; i--) {
      upMat.uniforms.tex.value = mips[i + 1].texture;
      upMat.uniforms.texel.value.set(1 / mips[i + 1].width, 1 / mips[i + 1].height);
      pass(upMat, mips[i], false);
    }
    shafts(camera);
    finalMat.uniforms.tScene.value = rt.texture;
    finalMat.uniforms.tBloom.value = mips[0].texture;
    finalMat.uniforms.tShafts.value = shaftRT.texture;
    pass(finalMat, null);
  }

  return { on: true, setup, world, crown, resize, render, finalMat, brightMat, sunDir, pomUniforms, setGiHook,
    get scale() { return scale; }, get post() { return post; }, get renderer() { return renderer; } };
})();
