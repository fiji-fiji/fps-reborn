// Hands for everything you hold: a forearm in a team-colour sleeve, a gold bracelet,
// four fingers with pink painted nails and a thumb. (They used to be fluffy paws, hence
// the names: makePaw, PAW, toes = fingers, claws = nails.)
//
// Hand space (before scaling): the hand sits at the origin, palm facing down (-y),
// fingers pointing forward (-z), the forearm going back (+z). `curl(k)` bends the fingers
// down around whatever the hand is holding (0 = flat, ~1.4 = a tight grip).

const HAND_SKIN = 0xf2c6a0;
const PAW = {
  toeX: i => 0.036 - i * 0.024,        // where each finger sits across the hand
  tip: i => new THREE.Vector3(0.036 - i * 0.024, 0.004, -0.1),   // just under nail i (flat hand)
  claw: 0xff3d8b,
  bean: 0xffa3be,
  gold: 0xffd36b,
  sleeve: 0x5aa8ff,                     // your team's shirt colour
};

function makePaw({ sleeve = PAW.sleeve, arm = true, shadow = false } = {}) {
  const skinMat = new THREE.MeshLambertMaterial({ color: HAND_SKIN });
  const sleeveMat = new THREE.MeshLambertMaterial({ map: Textures.noisyTexture(0xffffff, 20, 8, 43), color: sleeve });
  const nailMat = new THREE.MeshLambertMaterial({ color: PAW.claw, emissive: 0x551030 });
  const goldMat = new THREE.MeshLambertMaterial({ color: PAW.gold, emissive: 0x403010 });
  const add = (parent, w, h, d, m, x, y, z, round = 0.35) => {
    const b = new THREE.Mesh(roundedBoxGeometry(w, h, d, Math.min(w, h, d) * round, 3), m);
    b.position.set(x, y, z);
    b.castShadow = shadow;
    parent.add(b);
    return b;
  };
  const g = new THREE.Group();
  add(g, 0.098, 0.03, 0.1, skinMat, 0, 0, 0);                         // palm
  const toes = [], claws = [];
  const lens = [0.052, 0.058, 0.055, 0.045];
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Group();
    t.position.set(PAW.toeX(i), 0.002, -0.048);
    g.add(t);
    const L = lens[i];
    add(t, 0.02, 0.022, L, skinMat, 0, 0, -L / 2 + 0.004);            // finger
    claws.push(add(t, 0.016, 0.006, 0.019, nailMat, 0, 0.011, -L + 0.012, 0.3));   // painted nail
    toes.push(t);
  }
  const thumb = add(g, 0.024, 0.024, 0.06, skinMat, 0.058, -0.006, -0.02);        // thumb
  thumb.rotation.y = -0.45;
  add(thumb, 0.017, 0.006, 0.018, nailMat, 0, 0.012, -0.022, 0.3);
  if (arm) {
    add(g, 0.092, 0.024, 0.03, goldMat, 0, 0.002, 0.062);              // gold bracelet
    add(g, 0.08, 0.055, 0.17, skinMat, 0, 0, 0.14);                   // forearm
    add(g, 0.11, 0.08, 0.2, sleeveMat, 0, 0.002, 0.31, 0.3);           // team sleeve
  }
  g.userData = { toes, claws, nails: claws, furMat: skinMat, sleeveMat };
  g.curl = k => { for (const t of toes) t.rotation.x = -k; };
  g.setFur = () => {};                 // hands are always skin-coloured
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
