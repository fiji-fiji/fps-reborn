// Little pixel-art icons for the pop feed (one per blaster, the Bubble Bomb and
// the blooming tree). Each icon is drawn from a tiny text picture: every letter
// is a colour, '.' is see-through. Icons face right, toward who got popped.

const ICON_COLORS = {
  G: '#4caf50', g: '#2e7d32', L: '#7bd66b', Y: '#ffd36b', y: '#fff27a', W: '#ffffff',
  P: '#ff8fb1', p: '#ffb3cc', R: '#ff5d73', r: '#ff5d8f', O: '#ffc107', B: '#6b4a2b',
  C: '#7fdcff', c: '#bfefff', K: '#3a3a4a', S: '#dddddd',
};

const ICON_ART = {
  dandelion: [
    '..........yWy...',
    '.........yWWWy..',
    'gGGGGGGGGyWYWy..',
    'gGGGGGGGGyWWWy..',
    '..gg......yWy...',
    '..gg............',
  ],
  tulip: [
    '..............R.R.R.',
    '..............RRRRR.',
    'gGGGGGGGGGGGGGRRRRR.',
    'gGGGGGGGGGGGGG.RRR..',
    '...gg....L..........',
    '...gg...............',
  ],
  sunflower: [
    '................OYO.....',
    '..............OYYYYYO...',
    '.............YYBBBBBYY..',
    'gGGGGGGGGGGGGYBBBBBBBY..',
    'gGGGGGGGGGGGGYBBBBBBBY..',
    '.............YYBBBBBYY..',
    '..ggg.........OYYYYYO...',
    '..ggg...........OYO.....',
  ],
  rosebow: [
    'r...................',
    '.G..................',
    '..G.S...............',
    '..G..S..............',
    '..G...SLLLLLLLLLLLrr',
    '..G..S..............',
    '..G.S...............',
    '.G..................',
    'r...................',
  ],
  bloom: [
    '................PpP.....',
    '...........CC..PPpPP....',
    '..........cCCc.pPYYPp...',
    'gGGGGGGGGGGGGGGGPYYYPp..',
    'gGGGGGGGGGGGGGGGPYYYPp..',
    '...gg.....L....pPYYPp...',
    '...gg....LL.....PPpPP...',
    '...gg............PpP....',
  ],
  lily: [
    '...........KKKKK........WW..',
    '............K.K........WWWW.',
    'gGGGGGGGGGGGGGGGGGGGGGGWYWW.',
    'gGGGGGGGGGGGGGGGGGGGGGGWWWW.',
    '....gg.................WW...',
    '....gg......................',
  ],
  knife: [
    '..........WWWWWWWW.',
    'PPPPPPYWWWWWWpppWWW',
    'PPPPPPYWWWWWWWWWWW.',
    '.......WWWWWWW.....',
  ],
  frag: [
    '...PP...',
    '..cCCc..',
    '.cCWCCc.',
    '.CCCCCC.',
    '.cCCCCc.',
    '..cCCc..',
  ],
  // shop: shields + the other grenades
  light: [
    '.cCCCCc.',
    'cCWCCCCc',
    'CWCCCCCC',
    'CCCCCCCC',
    '.CCCCCC.',
    '..CCCC..',
    '...CC...',
  ],
  heavy: [
    '..cCCCCCCc..',
    '.cCWWCCCCCc.',
    'cCWCCCCCCCCc',
    'CCWCCCCCCCCC',
    'CCCCCCCCCCCC',
    '.CCCCCCCCCC.',
    '..CCCCCCCC..',
    '...CCCCCC...',
    '....CCCC....',
  ],
  smoke: [
    '...SWW.....',
    '..SWWWWSW..',
    '.SWWWWWWWW.',
    'SWWWWWWWWWS',
    '.SSWWWSSSS.',
  ],
  flash: [
    '....y....',
    '....y....',
    '...yYy...',
    'yyyYWYyyy',
    '...yYy...',
    '....y....',
    '....y....',
  ],
  // money: a doggy bank note (a fluffy pup in the middle)
  note: [
    'gggggggggggggggggggg',
    'gLLLLLLLLLLLLLLLLLLg',
    'gLGGLLLLLWWWWWLLLLLg',
    'gLGLLLLLWWWWWWWLLLLg',
    'gLLLLLLLWKWWWKWLLLLg',
    'gLLLLLLLWWWKWWWLLGLg',
    'gLLLLLLLLWWpWWLLGGLg',
    'gLLLLLLLLLWWWLLLLLLg',
    'gLLLLLLLLLLLLLLLLLLg',
    'gggggggggggggggggggg',
  ],
  tree: [
    '..LPL...',
    '.LLLLL..',
    'LLPLLLL.',
    '.LLLPL..',
    '...B....',
    '...B....',
    '..BBB...',
  ],
};

const WeaponIcons = (() => {
  const cache = {};
  function draw(key) {
    const art = ICON_ART[key];
    if (!art) return null;
    const w = Math.max(...art.map(r => r.length)), h = art.length;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    art.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const col = ICON_COLORS[row[x]];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    });
    return { url: c.toDataURL(), w, h };
  }
  return {
    // <img> tag for a weapon key, sized to the text (pixels stay crisp)
    html(key) {
      if (!(key in cache)) cache[key] = draw(key);
      const ic = cache[key];
      if (!ic) return '';
      return `<img class="wicon" src="${ic.url}" style="height:${(ic.h / 8) * 1.5}em" alt="">`;
    },
    // the money icon, `em` tall, as an <img> tag
    money(em = 1) {
      if (!('note' in cache)) cache.note = draw('note');
      const ic = cache.note;
      return `<img class="wicon money" src="${ic.url}" style="height:${em}em;width:${em * ic.w / ic.h}em" alt="">`;
    },
    // a big version for the shop: every icon pixel is `px` rem
    big(key, px) {
      if (!(key in cache)) cache[key] = draw(key);
      const ic = cache[key];
      if (!ic) return '';
      return `<img class="wicon big" src="${ic.url}" style="height:${ic.h * px}rem;width:${ic.w * px}rem" alt="">`;
    },
  };
})();
