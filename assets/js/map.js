/* The map: a basemap drawn from the bus street network, plus overlays. */
(function (root) {
  'use strict';

  var THEMES = {
    day: {
      land: '#E4E9EF', glow: null,
      casing: '#C3CCD8', road: ['#FFFFFF', '#FFFFFF', '#F6F8FA'],
      stop: '#3A4658', stopFill: '#FFFFFF'
    },
    night: {
      land: '#0B1524', glow: '#F0B45A',
      casing: '#0B1524', road: ['#5A6F95', '#3E5173', '#27364F'],
      stop: '#8FA3C4', stopFill: '#0B1524'
    }
  };

  var COLORS = {
    works: '#F47B20', critical: '#E5383B', route: '#2563EB', alt: '#0E9F8E',
    stopYellow: '#FFD21F', ink: '#0E1A2B', white: '#FFFFFF'
  };

  var M = { theme: 'day', handlers: {}, groups: {}, base: [], labels: [], stopMarkers: null };

  function init(el, G) {
    M.G = G;
    var b = G.C.bbox;
    var bounds = L.latLngBounds([b[0], b[1]], [b[2], b[3]]);
    M.bounds = bounds;
    var map = M.map = L.map(el, {
      zoomControl: false, attributionControl: false, zoomSnap: 0.25, zoomDelta: 0.5,
      minZoom: 11.5, maxZoom: 18, maxBounds: bounds.pad(0.35), maxBoundsViscosity: 0.8,
      preferCanvas: true, wheelPxPerZoomLevel: 110
    });
    L.control.zoom({ position: 'bottomleft', zoomInTitle: 'התקרבות', zoomOutTitle: 'התרחקות' }).addTo(map);

    ['base', 'overlay', 'buses'].forEach(function (name, k) {
      map.createPane(name).style.zIndex = 300 + k * 20;
    });
    map.createPane('labels').style.zIndex = 380;
    map.getPane('labels').style.pointerEvents = 'none';
    map.createPane('pins').style.zIndex = 620;
    M.rBase = L.canvas({ pane: 'base', padding: 0.4 });
    M.rOver = L.canvas({ pane: 'overlay', padding: 0.4 });
    M.rBus = L.canvas({ pane: 'buses', padding: 0.4 });

    // network by importance: daily trips on the segment
    var classes = [[], [], []];
    G.seg.forEach(function (s) { classes[s.n >= 260 ? 0 : s.n >= 60 ? 1 : 2].push(s.pts); });
    M.classes = classes;
    var mk = function (lines, interactive) {
      return L.polyline(lines, { renderer: M.rBase, interactive: false, lineCap: 'round', lineJoin: 'round' }).addTo(map);
    };
    M.glow = mk(classes[0]);
    M.base = [2, 1, 0].map(function (c) { return { c: c, casing: mk(classes[c]), fill: mk(classes[c]) }; });

    ['closures', 'route', 'detour', 'stops', 'select', 'pins', 'buses', 'draft'].forEach(function (g) {
      M.groups[g] = L.layerGroup().addTo(map);
    });

    buildLabels();
    map.on('zoomend', restyle);
    map.on('click', onClick);
    map.fitBounds(bounds, { animate: false });
    setTheme('day');
    return map;
  }

  function zoomScale() { return Math.pow(1.5, M.map.getZoom() - 13); }

  function restyle() {
    var t = THEMES[M.theme], k = Math.max(0.55, Math.min(3.2, zoomScale()));
    var w = [3.4 * k, 2.2 * k, 1.3 * k];
    M.base.forEach(function (b) {
      b.casing.setStyle({ color: t.casing, weight: w[b.c] + (M.theme === 'day' ? 2 : 0), opacity: M.theme === 'day' ? 1 : 0 });
      b.fill.setStyle({ color: t.road[b.c], weight: w[b.c], opacity: 1 });
    });
    M.glow.setStyle(t.glow
      ? { color: t.glow, weight: Math.min(26, 14 * k), opacity: 0.06 }
      : { color: '#fff', weight: 0, opacity: 0 });
    M.map.getContainer().style.background = t.land;
    showLabels();
    drawStops();
  }

  function setTheme(name) {
    if (!THEMES[name]) return;
    M.theme = name;
    M.map.getContainer().setAttribute('data-theme', name);
    restyle();
  }

  /* ---------------------------------------------------------------- labels */

  function buildLabels() {
    var G = M.G, groups = {}, cities = {};
    G.stops.forEach(function (s) {
      if (s.t) (cities[s.t] = cities[s.t] || []).push(s);
      if (!s.s || !s.t) return;
      (groups[s.t + '|' + s.s] = groups[s.t + '|' + s.s] || []).push(s);
    });
    var out = [];
    Object.keys(groups).forEach(function (key) {
      var g = groups[key]; if (g.length < 2) return;
      var mx = 0, my = 0;
      g.forEach(function (s) { mx += s.x; my += s.y; }); mx /= g.length; my /= g.length;
      var sxx = 0, syy = 0, sxy = 0;
      g.forEach(function (s) {
        var dx = (s.x - mx) * Engine.COSLAT, dy = s.y - my;
        sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
      });
      var angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);          // principal axis, radians from east
      var ux = Math.cos(angle), uy = Math.sin(angle);
      var sorted = g.slice().sort(function (a, b) {
        return ((a.x - mx) * Engine.COSLAT * ux + (a.y - my) * uy) - ((b.x - mx) * Engine.COSLAT * ux + (b.y - my) * uy);
      });
      var mid = sorted[Math.floor(sorted.length / 2)];
      var seg = Engine.nearestSeg(G, [mid.y, mid.x], 60);
      var at = seg >= 0 ? G.seg[seg].mid : [mid.y, mid.x];
      var deg = -angle * 180 / Math.PI;
      if (seg >= 0) {                                              // follow the street itself where we can
        var p = G.seg[seg].pts, a = p[0], z = p[p.length - 1];
        deg = -Math.atan2(z[0] - a[0], (z[1] - a[1]) * Engine.COSLAT) * 180 / Math.PI;
      }
      while (deg > 90) deg -= 180;
      while (deg < -90) deg += 180;
      out.push({ at: at, deg: deg, text: key.split('|')[1], rank: g.length, kind: 'street' });
    });
    Object.keys(cities).forEach(function (name) {
      var g = cities[name]; if (g.length < 9) return;
      var xs = g.map(function (s) { return s.x; }).sort(), ys = g.map(function (s) { return s.y; }).sort();
      out.push({ at: [ys[ys.length >> 1], xs[xs.length >> 1]], deg: 0, text: name.replace("''", '"'), rank: g.length, kind: 'city' });
    });
    M.labelData = out;
    M.labelLayer = L.layerGroup().addTo(M.map);
  }

  function showLabels() {
    var z = M.map.getZoom();
    M.labelLayer.clearLayers();
    M.labelData.forEach(function (l) {
      var show = l.kind === 'city'
        ? (z < 14.6 && (l.rank >= 60 || z >= 12.5))
        : (z >= 15.75 ? l.rank >= 2 : z >= 15 ? l.rank >= 4 : z >= 14.25 ? l.rank >= 7 : z >= 13.5 ? l.rank >= 10 : false);
      if (!show) return;
      var html = '<span class="maplabel maplabel--' + l.kind + (l.kind === 'city' && l.rank >= 100 ? ' maplabel--big' : '') +
        '" style="transform:translate(-50%,-50%) rotate(' + l.deg.toFixed(1) + 'deg)">' + l.text + '</span>';
      L.marker(l.at, { pane: 'labels', interactive: false, keyboard: false, icon: L.divIcon({ className: 'maplabel-wrap', html: html, iconSize: [0, 0] }) })
        .addTo(M.labelLayer);
    });
  }

  /* ----------------------------------------------------------------- stops */

  var stopState = { show: false, cancelled: {}, added: {}, focus: {}, selected: -1 };

  function setStops(opts) {
    stopState.show = !!opts.show;
    stopState.cancelled = toSet(opts.cancelled);
    stopState.added = toSet(opts.added);
    stopState.focus = toSet(opts.focus);
    stopState.selected = opts.selected == null ? -1 : opts.selected;
    drawStops();
  }
  function toSet(list) { var o = {}; (list || []).forEach(function (i) { o[i] = 1; }); return o; }

  function drawStops() {
    var g = M.groups.stops, t = THEMES[M.theme], z = M.map.getZoom();
    g.clearLayers();
    var all = stopState.show && z >= 14.75;
    M.stopsVisible = all;
    var r = z >= 16.5 ? 5 : z >= 15.5 ? 4 : 3;
    M.G.stops.forEach(function (s) {
      var special = stopState.cancelled[s.i] || stopState.added[s.i] || stopState.focus[s.i] || stopState.selected === s.i;
      if (!all && !special) return;
      if (special) return;                                   // drawn below, on top
      L.circleMarker([s.y, s.x], {
        renderer: M.rOver, radius: s.r ? r + 1 : r, color: t.stop, weight: 1.5,
        fillColor: s.r ? t.stop : t.stopFill, fillOpacity: 1, interactive: false
      }).addTo(g);
    });
    M.G.stops.forEach(function (s) {
      var here = [s.y, s.x];
      if (stopState.cancelled[s.i]) pin(here, 'x', s.n).addTo(g);
      else if (stopState.added[s.i]) pin(here, 'plus', s.n).addTo(g);
      else if (stopState.selected === s.i) pin(here, 'sel', s.n).addTo(g);
      else if (stopState.focus[s.i]) {
        L.circleMarker(here, { renderer: M.rOver, radius: r + 2, color: COLORS.ink, weight: 2, fillColor: COLORS.stopYellow, fillOpacity: 1, interactive: false }).addTo(g);
      }
    });
  }

  function pin(at, kind, title) {
    return L.marker(at, {
      pane: 'pins', interactive: false, keyboard: false,
      icon: L.divIcon({ className: 'pin-wrap', html: '<span class="pin pin--' + kind + '" title="' + title + '"></span>', iconSize: [0, 0] })
    });
  }

  /* -------------------------------------------------------------- overlays */

  function segLines(segs) { return segs.map(function (i) { return M.G.seg[i].pts; }); }

  /* list: [{ id, segs, level, active, selected, kind }] */
  function setClosures(list) {
    var g = M.groups.closures; g.clearLayers();
    var k = Math.max(0.8, Math.min(2.2, zoomScale()));
    list.forEach(function (c) {
      if (!c.segs.length) return;
      var lines = segLines(c.segs);
      var color = c.level === 'critical' ? COLORS.critical : COLORS.works;
      var op = c.active === false ? 0.38 : 1;
      if (c.selected) L.polyline(lines, { renderer: M.rOver, color: color, weight: 13 * k, opacity: 0.2, interactive: false, lineCap: 'round' }).addTo(g);
      L.polyline(lines, { renderer: M.rOver, color: color, weight: 6 * k, opacity: op, interactive: false, lineCap: 'butt' }).addTo(g);
      if (c.kind === 'full') {                         // barrier-tape stripes mark a full closure
        L.polyline(lines, { renderer: M.rOver, color: '#fff', weight: 6 * k, opacity: op * 0.85, dashArray: (5 * k) + ' ' + (9 * k), interactive: false, lineCap: 'butt' }).addTo(g);
      } else {
        L.polyline(lines, { renderer: M.rOver, color: '#fff', weight: 2 * k, opacity: op * 0.9, interactive: false, lineCap: 'butt' }).addTo(g);
      }
      var mid = M.G.seg[c.segs[Math.floor(c.segs.length / 2)]].mid;
      var cls = 'cpin cpin--' + (c.level || 'none') + (c.active === false ? ' cpin--off' : '') + (c.selected ? ' cpin--sel' : '');
      L.marker(mid, {
        pane: 'pins', keyboard: false, zIndexOffset: c.selected ? 500 : c.level === 'critical' ? 300 : 0,
        icon: L.divIcon({ className: 'pin-wrap', html: '<button class="' + cls + '" data-closure="' + c.id + '" aria-label="' + (c.label || c.id) + '">' + (c.badge || '') + '</button>', iconSize: [0, 0] })
      }).on('click', function (e) { L.DomEvent.stop(e); fire('closure', c.id); }).addTo(g);
    });
  }

  function setRoute(refs, opts) {
    var g = M.groups.route; g.clearLayers();
    if (!refs) return;
    opts = opts || {};
    var lines = Engine.pathLines(M.G, refs);
    var k = Math.max(0.8, Math.min(2, zoomScale()));
    L.polyline(lines, { renderer: M.rOver, color: '#fff', weight: 7 * k, opacity: M.theme === 'night' ? 0.15 : 0.9, interactive: false }).addTo(g);
    L.polyline(lines, { renderer: M.rOver, color: opts.color || COLORS.route, weight: 4 * k, opacity: opts.opacity || 1, interactive: false }).addTo(g);
  }

  /* original: refs replaced, alt: refs of the detour */
  function setDetour(list) {
    var g = M.groups.detour; g.clearLayers();
    var k = Math.max(0.8, Math.min(2, zoomScale()));
    (list || []).forEach(function (d) {
      if (d.context) L.polyline(Engine.pathLines(M.G, d.context), { renderer: M.rOver, color: COLORS.route, weight: 3 * k, opacity: 0.55, interactive: false }).addTo(g);
      if (d.original) L.polyline(Engine.pathLines(M.G, d.original), { renderer: M.rOver, color: M.theme === 'night' ? '#9FB0CC' : '#5B6779', weight: 3.5 * k, opacity: 0.95, dashArray: (2 * k) + ' ' + (7 * k), interactive: false }).addTo(g);
      if (d.alt && d.alt.length) {
        var lines = Engine.pathLines(M.G, d.alt);
        L.polyline(lines, { renderer: M.rOver, color: '#fff', weight: 8 * k, opacity: M.theme === 'night' ? 0.12 : 0.95, interactive: false }).addTo(g);
        L.polyline(lines, { renderer: M.rOver, color: d.color || COLORS.alt, weight: 4.5 * k, opacity: 1, dashArray: d.dashed ? (10 * k) + ' ' + (7 * k) : null, interactive: false }).addTo(g);
      }
    });
  }

  function setSelection(segs, color) {
    var g = M.groups.draft; g.clearLayers();
    if (!segs || !segs.length) return;
    var k = Math.max(0.8, Math.min(2.2, zoomScale()));
    L.polyline(segLines(segs), { renderer: M.rOver, color: color || COLORS.works, weight: 7 * k, opacity: 0.95, interactive: false, lineCap: 'butt' }).addTo(g);
    L.polyline(segLines(segs), { renderer: M.rOver, color: '#fff', weight: 7 * k, opacity: 0.85, dashArray: (5 * k) + ' ' + (9 * k), interactive: false, lineCap: 'butt' }).addTo(g);
  }

  /* list: [{ at:[lat,lng], kind, html, id }] */
  function setPins(list) {
    var g = M.groups.pins; g.clearLayers();
    (list || []).forEach(function (p) {
      var m = L.marker(p.at, {
        pane: 'pins', keyboard: false,
        icon: L.divIcon({ className: 'pin-wrap', html: '<span class="flagpin flagpin--' + p.kind + '">' + (p.html || '') + '</span>', iconSize: [0, 0] })
      }).addTo(g);
      if (p.id) m.on('click', function (e) { L.DomEvent.stop(e); fire('pin', p.id); });
    });
  }

  function setBuses(list) {
    var g = M.groups.buses; g.clearLayers();
    var z = M.map.getZoom(), r = z >= 15 ? 5 : z >= 13.5 ? 4 : 3;
    (list || []).forEach(function (b) {
      L.circleMarker(b.at, {
        renderer: M.rBus, radius: b.hit ? r + 1.5 : r, weight: b.hit ? 2 : 1.25,
        color: b.hit ? '#fff' : '#0B1524', fillColor: b.hit ? COLORS.critical : COLORS.stopYellow, fillOpacity: 1, interactive: false
      }).addTo(g);
    });
  }

  /* ----------------------------------------------------------- interaction */

  function onClick(e) {
    var G = M.G, here = [e.latlng.lat, e.latlng.lng];
    var mpp = 40075016 * Math.cos(here[0] * Math.PI / 180) / Math.pow(2, M.map.getZoom() + 8);
    if (M.handlers.stop && (M.stopsVisible || M.mode === 'stops')) {
      var best = -1, bestD = 14 * mpp;
      G.stops.forEach(function (s) {
        var d = Engine.metres(here, [s.y, s.x]);
        if (d < bestD) { bestD = d; best = s.i; }
      });
      if (best >= 0) return fire('stop', best);
    }
    var seg = Engine.nearestSeg(G, here, Math.min(120, 12 * mpp));
    if (seg >= 0 && M.handlers.seg) return fire('seg', seg, here);
    fire('map', here);
  }

  function on(name, fn) { M.handlers[name] = fn; }
  function off(name) { delete M.handlers[name]; }
  function fire(name) {
    if (M.handlers[name]) M.handlers[name].apply(null, Array.prototype.slice.call(arguments, 1));
  }

  function fitSegs(segs, opts) {
    var pts = [];
    segs.forEach(function (i) { M.G.seg[i].pts.forEach(function (p) { pts.push(p); }); });
    fitPoints(pts, opts);
  }
  function fitRefs(refs, opts) { fitSegs(refs.map(function (r) { return Math.abs(r) - 1; }), opts); }
  function fitPoints(pts, opts) {
    if (!pts.length) return;
    opts = opts || {};
    M.map.flyToBounds(L.latLngBounds(pts), {
      paddingTopLeft: [opts.left || 60, opts.top || 70], paddingBottomRight: [opts.right || 60, opts.bottom || 110],
      maxZoom: opts.maxZoom || 16.25, duration: opts.instant ? 0 : 0.6, animate: !opts.instant
    });
  }
  function fitAll(opts) { M.map.flyToBounds(M.bounds, { padding: [10, 10], duration: (opts && opts.instant) ? 0 : 0.6, animate: !(opts && opts.instant) }); }
  function setCursor(mode) { M.mode = mode; M.map.getContainer().setAttribute('data-cursor', mode || ''); }
  function resize() { if (M.map) M.map.invalidateSize({ animate: false }); }
  function clearAll() {
    ['closures', 'route', 'detour', 'select', 'pins', 'buses', 'draft'].forEach(function (g) { M.groups[g].clearLayers(); });
    setStops({ show: false });
  }

  root.MapView = {
    init: init, setTheme: setTheme, setStops: setStops, setClosures: setClosures, setRoute: setRoute,
    setDetour: setDetour, setSelection: setSelection, setPins: setPins, setBuses: setBuses,
    on: on, off: off, fitSegs: fitSegs, fitRefs: fitRefs, fitPoints: fitPoints, fitAll: fitAll,
    setCursor: setCursor, resize: resize, clearAll: clearAll, COLORS: COLORS, M: M
  };
})(this);
