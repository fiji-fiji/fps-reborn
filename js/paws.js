// Big paws for everything you hold: a chubby round paw with four fat toes, pink toe beans
// underneath, pink painted claws (boss), a gold bracelet and the team-colour sleeve.
// Dogs get white Bichon fur; cats get their coat colour.
//
// Paw space (before scaling): the paw sits at the origin, palm (beans) facing down (-y),
// toes pointing forward (-z), the forearm going back (+z). `curl(k)` bends the toes
// down around whatever the paw is holding (0 = flat, ~1.4 = a tight grip).

const PAW = {
  toeX: i => 0.045 - i * 0.03,         // where each toe sits across the paw
  tip: i => new THREE.Vector3(0.045 - i * 0.03, 0.004, -0.108),   // just under claw i (flat paw)
  claw: 0xff3d8b,
  bean: 0xffa3be,
  gold: 0xffd36b,
  sleeve: 0x5aa8ff,                     // your team's shirt colour
};

function makePaw({ fur = BICHON.fur, sleeve = PAW.sleeve, arm = true, shadow = false } = {}) {
  const furTex = Textures.noisyTexture(0xffffff, 14, 8, 41);
  const glow = h => (h === BICHON.fur ? DOG_GLOW : 0x000000);
  const furMat = new THREE.MeshLambertMaterial({ map: furTex, color: fur, emissive: glow(fur) });
  const sleeveMat = new THREE.MeshLambertMaterial({ map: Textures.noisyTexture(0xffffff, 20, 8, 43), color: sleeve });
  const clawMat = new THREE.MeshLambertMaterial({ color: PAW.claw, emissive: 0x551030 });
  const beanMat = new THREE.MeshLambertMaterial({ color: PAW.bean, emissive: 0x3a1020 });
  const goldMat = new THREE.MeshLambertMaterial({ color: PAW.gold, emissive: 0x403010 });
  const add = (parent, w, h, d, m, x, y, z, round = 0.35) => {
    const b = new THREE.Mesh(roundedBoxGeometry(w, h, d, Math.min(w, h, d) * round, 3), m);
    b.position.set(x, y, z);
    b.castShadow = shadow;
    parent.add(b);
    return b;
  };
  const g = new THREE.Group();
  add(g, 0.124, 0.066, 0.108, furMat, 0, 0.002, 0, 0.5);              // the chubby paw
  add(g, 0.064, 0.01, 0.054, beanMat, 0, -0.034, 0.012, 0.5);          // big heart-ish pad
  const toes = [], claws = [];
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Group();
    t.position.set(PAW.toeX(i), 0.002, -0.048);
    g.add(t);
    add(t, 0.031, 0.05, 0.05, furMat, 0, 0, -0.022, 0.5);              // fat round toe
    add(t, 0.019, 0.008, 0.019, beanMat, 0, -0.026, -0.028, 0.5);      // toe bean
    claws.push(add(t, 0.013, 0.01, 0.019, clawMat, 0, 0.007, -0.054, 0.3));   // painted claw
    toes.push(t);
  }
  add(g, 0.03, 0.036, 0.034, furMat, 0.072, -0.004, -0.006, 0.5);      // dewclaw
  if (arm) {
    add(g, 0.13, 0.026, 0.03, goldMat, 0, 0.006, 0.066);              // gold bracelet
    add(g, 0.116, 0.088, 0.17, furMat, 0, 0.006, 0.15, 0.5);          // forearm
    add(g, 0.14, 0.11, 0.2, sleeveMat, 0, 0.006, 0.34, 0.3);           // team sleeve
  }
  g.userData = { toes, claws, nails: claws, furMat, sleeveMat };
  g.curl = k => { for (const t of toes) t.rotation.x = -k; };
  g.setFur = hex => {
    furMat.color.set(hex); furMat.emissive.set(glow(hex));
  };
  g.setSleeve = hex => sleeveMat.color.set(hex);
  return g;
}

// fur + sleeve colours for whoever `e` is
function pawColors(e) {
  const m = e && e.model;
  const species = e && TEAM_SPECIES[e.team];
  return {
    fur: (m && m.fur) || (species === 'cat' ? 0xf0a050 : BICHON.fur),
    sleeve: (m && m.colors && m.colors.shirt) || (e && TEAM_SHIRTS[e.team] ? TEAM_SHIRTS[e.team][1] : PAW.sleeve),
  };
}
