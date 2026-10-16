/* Stick-figure demo cues. Each figure is two poses (A, B) blended back and forth,
 * or a function of t (0..1 within one cycle). ViewBox 0 0 200 140, ground at y=123. */
window.Figures = (function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  function P(o, extra) { var r = {}, k; for (k in o) r[k] = o[k]; for (k in extra) r[k] = extra[k]; return r; }
  function rot(pt, c, a) {
    var s = Math.sin(a), co = Math.cos(a), x = pt[0] - c[0], y = pt[1] - c[1];
    return [c[0] + x * co - y * s, c[1] + x * s + y * co];
  }
  var SIDE = { h: [100, 30], n: [100, 44], p: [100, 80], k1: [100, 102], f1: [100, 123], e1: [100, 62], w1: [101, 78] };
  var FRONT = {
    h: [100, 30], n: [100, 44], p: [100, 80], s1: [88, 47], s2: [112, 47],
    e1: [85, 63], w1: [84, 79], e2: [115, 63], w2: [116, 79],
    k1: [94, 102], f1: [92, 123], k2: [106, 102], f2: [108, 123]
  };
  var SEATED_SIDE = { h: [91, 42], n: [94, 55], p: [102, 92], e1: [104, 73], w1: [108, 94] };

  var DEFS = {
    march: {
      period: 1.2,
      A: P(SIDE, { k1: [118, 88], f1: [114, 108], k2: [100, 102], f2: [100, 123], e1: [94, 58], w1: [90, 72], e2: [106, 58], w2: [114, 68] }),
      B: P(SIDE, { k1: [100, 102], f1: [100, 123], k2: [118, 88], f2: [114, 108], e1: [106, 58], w1: [114, 68], e2: [94, 58], w2: [90, 72] })
    },
    armcircles: {
      period: 1.6,
      fn: function (t) {
        var a = 2 * Math.PI * t, o = P(FRONT, {});
        o.w1 = [62 + 7 * Math.cos(a), 46 + 7 * Math.sin(a)];
        o.w2 = [138 - 7 * Math.cos(a), 46 + 7 * Math.sin(a)];
        o.e1 = [(o.s1[0] + o.w1[0]) / 2, (o.s1[1] + o.w1[1]) / 2];
        o.e2 = [(o.s2[0] + o.w2[0]) / 2, (o.s2[1] + o.w2[1]) / 2];
        return o;
      }
    },
    squat: {
      period: 3,
      A: P(SIDE, { k1: [101, 102], e1: [112, 50], w1: [126, 48] }),
      B: { h: [93, 52], n: [90, 64], p: [78, 96], k1: [102, 103], f1: [100, 123], e1: [104, 68], w1: [119, 64] }
    },
    pushup: {
      period: 2.4,
      A: { h: [152, 93], n: [140, 99], p: [92, 111], k1: [66, 117], f1: [40, 123], e1: [140, 111], w1: [141, 123] },
      B: { h: [152, 108], n: [140, 114], p: [92, 118], k1: [66, 121], f1: [40, 123], e1: [129, 116], w1: [141, 123] }
    },
    row: {
      period: 2.4, props: ['bag'],
      A: { h: [132, 52], n: [122, 60], p: [88, 78], k1: [95, 100], f1: [90, 123], e1: [123, 74], w1: [124, 88] },
      B: { h: [132, 52], n: [122, 60], p: [88, 78], k1: [95, 100], f1: [90, 123], e1: [108, 66], w1: [118, 78] }
    },
    pike: {
      period: 2.6,
      A: { h: [132, 113], n: [124, 106], p: [98, 82], k1: [86, 102], f1: [75, 123], e1: [129, 114], w1: [132, 123] },
      B: { h: [134, 116], n: [126, 113], p: [99, 84], k1: [87, 103], f1: [75, 123], e1: [118, 116], w1: [132, 123] }
    },
    bridge: {
      period: 2.6,
      A: { h: [38, 115], n: [52, 119], p: [88, 121], k1: [108, 100], f1: [124, 123], e1: [68, 122], w1: [82, 122] },
      B: { h: [38, 115], n: [52, 118], p: [86, 104], k1: [110, 98], f1: [124, 123], e1: [68, 122], w1: [82, 122] }
    },
    rollout: {
      period: 4, props: ['wheel'],
      A: { h: [130, 80], n: [118, 84], p: [84, 95], k1: [80, 121], f1: [55, 123], e1: [119, 100], w1: [120, 115] },
      B: { h: [148, 107], n: [136, 111], p: [100, 108], k1: [80, 121], f1: [55, 123], e1: [150, 114], w1: [164, 116] }
    },
    plank: {
      period: 3,
      A: { h: [150, 95], n: [138, 100], p: [92, 110], k1: [66, 116], f1: [40, 122], e1: [138, 122], w1: [156, 122] },
      B: { h: [150, 95], n: [138, 100], p: [92, 108], k1: [66, 115], f1: [40, 122], e1: [138, 122], w1: [156, 122] }
    },
    crunch: {
      period: 2.4, props: ['chairLow'],
      A: { h: [47, 116], n: [60, 120], p: [96, 120], k1: [120, 99], f1: [146, 99], e1: [52, 109], w1: [44, 111] },
      B: { h: [56, 103], n: [66, 110], p: [96, 120], k1: [120, 99], f1: [146, 99], e1: [58, 99], w1: [52, 103] }
    },
    kneetuck: {
      period: 2.4, props: ['chairSide'],
      A: P(SEATED_SIDE, { k1: [124, 96], f1: [146, 104] }),
      B: P(SEATED_SIDE, { h: [88, 44], n: [92, 57], k1: [116, 74], f1: [124, 92] })
    },
    legraise: {
      period: 2.8, props: ['chairSide'],
      A: P(SEATED_SIDE, { k1: [124, 98], f1: [146, 104] }),
      B: P(SEATED_SIDE, { h: [88, 44], n: [92, 57], k1: [123, 90], f1: [144, 80] })
    },
    sidecrunch: {
      period: 2.4, props: ['chairFront'],
      fn: function (t) {
        var u = (1 - Math.cos(2 * Math.PI * t)) / 2, a = -0.3 * u, c = [100, 94];
        var up = { h: [100, 44], n: [100, 58], s1: [88, 60], s2: [112, 60], e1: [79, 50], w1: [94, 40], e2: [121, 50], w2: [106, 40] };
        var o = { p: [100, 94], k1: [91, 100], f1: [91, 123], k2: [109, 100], f2: [109, 123] };
        for (var k in up) o[k] = rot(up[k], c, a);
        return o;
      }
    },
    neckroll: {
      period: 4,
      fn: function (t) {
        var th = 0.75 * Math.sin(2 * Math.PI * t), o = P(FRONT, {});
        o.h = [100 + 14 * Math.sin(th), 44 - 14 * Math.cos(th) + 2 * (1 - Math.cos(th))];
        return o;
      }
    },
    shoulderroll: {
      period: 2.2,
      fn: function (t) {
        var a = 2 * Math.PI * t, o = P(FRONT, {}), dy = 3.5 * Math.sin(a), dx = 1.5 * Math.cos(a);
        o.s1 = [88 - dx, 47 + dy]; o.s2 = [112 + dx, 47 + dy];
        o.e1 = [o.s1[0] - 3, o.s1[1] + 16]; o.w1 = [o.s1[0] - 4, o.s1[1] + 32];
        o.e2 = [o.s2[0] + 3, o.s2[1] + 16]; o.w2 = [o.s2[0] + 4, o.s2[1] + 32];
        return o;
      }
    },
    chestopener: {
      period: 4,
      A: P(FRONT, {}),
      B: P(FRONT, { h: [100, 29], e1: [74, 58], w1: [62, 66], e2: [126, 58], w2: [138, 66] })
    },
    hamstring: {
      period: 5,
      A: P(SIDE, { e1: [101, 30], w1: [102, 16] }),
      B: { h: [134, 108], n: [126, 98], p: [96, 80], k1: [101, 102], f1: [100, 123], e1: [120, 110], w1: [110, 120] }
    },
    calfraise: {
      period: 2.2,
      A: P(SIDE, { toe: [111, 123] }),
      B: { h: [100, 23], n: [100, 37], p: [100, 73], k1: [100, 95], f1: [102, 116], e1: [100, 55], w1: [101, 71], toe: [111, 123] }
    },
    lunge: {
      period: 6,
      A: { h: [96, 50], n: [96, 64], p: [96, 100], k1: [120, 100], f1: [124, 123], k2: [82, 122], f2: [58, 123], e1: [88, 80], w1: [96, 94] },
      B: { h: [101, 52], n: [101, 66], p: [101, 102], k1: [121, 100], f1: [124, 123], k2: [83, 122], f2: [58, 123], e1: [93, 82], w1: [101, 96] }
    },
    glute: {
      period: 6,
      A: { h: [38, 115], n: [52, 119], p: [88, 121], k2: [104, 98], f2: [120, 104], k1: [108, 108], f1: [104, 96], e1: [72, 108], w1: [98, 100] },
      B: { h: [38, 115], n: [52, 119], p: [88, 121], k2: [100, 94], f2: [116, 98], k1: [104, 104], f1: [100, 92], e1: [70, 106], w1: [94, 97] }
    }
  };

  function lerp(a, b, u) { return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; }
  function pose(def, t) {
    if (def.fn) return def.fn(t);
    var u = (1 - Math.cos(2 * Math.PI * t)) / 2, o = {};
    for (var k in def.A) o[k] = def.B && def.B[k] ? lerp(def.A[k], def.B[k], u) : def.A[k];
    return o;
  }
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function pts() {
    var s = '';
    for (var i = 0; i < arguments.length; i++) if (arguments[i]) s += arguments[i][0].toFixed(1) + ',' + arguments[i][1].toFixed(1) + ' ';
    return s;
  }

  var svg, g, parts = {}, props = {}, current = null;
  function mount(svgEl) {
    svg = svgEl;
    el('line', { x1: 14, y1: 127, x2: 186, y2: 127, class: 'fig-ground' }, svg);
    g = el('g', {}, svg);
    var pg = el('g', { class: 'fig-prop' }, g);
    props.chairSide = el('path', { d: 'M80 97 H114 M82 97 V62 M82 97 V125 M112 97 V125' }, pg);
    props.chairLow = el('path', { d: 'M116 102 H152 M118 102 V125 M150 102 V125 M150 102 V74' }, pg);
    props.chairFront = el('path', { d: 'M76 97 H124 M80 97 V125 M120 97 V125' }, pg);
    props.bag = el('rect', { width: 12, height: 10, rx: 2 }, pg);
    props.wheel = el('circle', { r: 5 }, pg);
    ['arm2', 'leg2'].forEach(function (k) { parts[k] = el('polyline', { class: 'fig-limb far' }, g); });
    parts.torso = el('polyline', { class: 'fig-limb' }, g);
    parts.shoulders = el('polyline', { class: 'fig-limb' }, g);
    parts.leg1 = el('polyline', { class: 'fig-limb' }, g);
    parts.foot = el('polyline', { class: 'fig-limb' }, g);
    parts.arm1 = el('polyline', { class: 'fig-limb' }, g);
    parts.head = el('circle', { r: 8.5, class: 'fig-head' }, g);
  }
  function show(name) {
    current = DEFS[name] || null;
    for (var k in props) props[k].style.display = current && current.props && current.props.indexOf(k) >= 0 ? '' : 'none';
  }
  function draw(name, timeSec, mirror) {
    if (!svg) return;
    if (!current || current !== DEFS[name]) show(name);
    if (!current) return;
    var t = ((timeSec / current.period) % 1 + 1) % 1;
    var o = pose(current, t);
    g.setAttribute('transform', mirror ? 'translate(200,0) scale(-1,1)' : '');
    parts.torso.setAttribute('points', pts(o.n, o.p));
    parts.shoulders.setAttribute('points', o.s1 ? pts(o.s1, o.n, o.s2) : '');
    parts.arm1.setAttribute('points', pts(o.s1 || o.n, o.e1, o.w1));
    parts.arm2.setAttribute('points', o.e2 ? pts(o.s2 || o.n, o.e2, o.w2) : '');
    parts.leg1.setAttribute('points', pts(o.p, o.k1, o.f1));
    parts.leg2.setAttribute('points', o.k2 ? pts(o.p, o.k2, o.f2) : '');
    parts.foot.setAttribute('points', o.toe ? pts(o.f1, o.toe) : '');
    parts.head.setAttribute('cx', o.h[0].toFixed(1));
    parts.head.setAttribute('cy', o.h[1].toFixed(1));
    if (current.props && current.props.indexOf('bag') >= 0) {
      props.bag.setAttribute('x', (o.w1[0] - 6).toFixed(1));
      props.bag.setAttribute('y', (o.w1[1]).toFixed(1));
    }
    if (current.props && current.props.indexOf('wheel') >= 0) {
      props.wheel.setAttribute('cx', o.w1[0].toFixed(1));
      props.wheel.setAttribute('cy', '118');
    }
  }
  return { mount: mount, draw: draw, has: function (n) { return !!DEFS[n]; }, names: Object.keys(DEFS) };
})();
