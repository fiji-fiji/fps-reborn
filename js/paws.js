// Fluffy paws for everything you hold: a furry forearm with a team-colour sleeve,
// a gold bracelet, a round paw with four toes, pink painted claws (boss) and pink
// toe beans underneath. Dogs get white Bichon fluff; cats get their coat colour.
//
// Paw space (before scaling): the paw sits at the origin, palm (beans) facing down (-y),
// toes pointing forward (-z), the forearm going back (+z). `curl(k)` bends the toes
// down around whatever the paw is holding (0 = flat, ~1.4 = a tight grip).

const PAW = {
  toeX: i => 0.039 - i * 0.026,        // where each toe sits across the paw
  tip: i => new THREE.Vector3(0.039 - i * 0.026, 0.004, -0.1),   // just under claw i (flat paw)
  claw: 0xff3d8b,
  bean: 0xffa3be,
  gold: 0xffd36b,
  sleeve: 0x5aa8ff,                     // your team's shirt colour
};

function makePaw({ fur = BICHON.fur, sleeve = PAW.sleeve, arm = true, shadow = false } = {}) {
  const furMat = new THREE.MeshLambertMaterial({ map: Textures.noisyTexture(0xffffff, 14, 8, 41), color: fur, emissive: fur === BICHON.fur ? DOG_GLOW : 0x000000 });
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
  add(g, 0.11, 0.052, 0.1, furMat, 0, 0, 0, 0.45);                    // the paw
  add(g, 0.05, 0.007, 0.042, beanMat, 0, -0.026, 0.008);              // big pad
  const toes = [], claws = [];
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Group();
    t.position.set(PAW.toeX(i), 0.002, -0.046);
    g.add(t);
    add(t, 0.025, 0.042, 0.046, furMat, 0, 0, -0.02, 0.45);           // fluffy toe
    add(t, 0.016, 0.007, 0.016, beanMat, 0, -0.022, -0.026);          // toe bean
    claws.push(add(t, 0.012, 0.009, 0.018, clawMat, 0, 0.006, -0.048, 0.3));   // painted claw
    toes.push(t);
  }
  add(g, 0.022, 0.03, 0.03, furMat, 0.062, -0.004, -0.004);           // dewclaw
  if (arm) {
    add(g, 0.114, 0.026, 0.03, goldMat, 0, 0.005, 0.062);             // gold bracelet
    add(g, 0.1, 0.075, 0.17, furMat, 0, 0.004, 0.14, 0.45);           // fluffy forearm
    add(g, 0.06, 0.03, 0.06, furMat, 0.035, 0.04, 0.12);              // a tuft of fluff
    add(g, 0.12, 0.09, 0.2, sleeveMat, 0, 0.004, 0.31, 0.3);          // team sleeve
  }
  g.userData = { toes, claws, nails: claws, furMat, sleeveMat };
  g.curl = k => { for (const t of toes) t.rotation.x = -k; };
  g.setFur = hex => { furMat.color.set(hex); furMat.emissive.set(hex === BICHON.fur ? DOG_GLOW : 0x000000); };
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
