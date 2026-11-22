/* Network + conflict engine.
 *
 * Works on the street network built from the GTFS shapes (data/corridor.js):
 *   - which lines, trips and stops a closure hits, hour by hour
 *   - the shortest drivable detour around a closure
 *   - whether that natural detour is itself closed at the same time
 * Pure functions, no DOM: runs in the browser and under Node.
 */
(function (root) {
  'use strict';

  var COSLAT = Math.cos(31.925 * Math.PI / 180);

  function decode(str) {
    var i = 0, la = 0, lo = 0, out = [];
    while (i < str.length) {
      for (var k = 0; k < 2; k++) {
        var r = 0, sh = 0, b;
        do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
        var d = (r & 1) ? ~(r >> 1) : (r >> 1);
        if (k === 0) la += d; else lo += d;
      }
      out.push([la / 1e5, lo / 1e5]);
    }
    return out;
  }

  function metres(a, b) {
    var dy = (a[0] - b[0]) * 111320, dx = (a[1] - b[1]) * 111320 * COSLAT;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function pointAt(pts, frac) {
    var total = 0, i, lens = [];
    for (i = 1; i < pts.length; i++) { lens.push(metres(pts[i - 1], pts[i])); total += lens[i - 1]; }
    var want = total * frac;
    for (i = 0; i < lens.length; i++) {
      if (want <= lens[i] || i === lens.length - 1) {
        var f = lens[i] ? Math.min(1, want / lens[i]) : 0;
        return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f];
      }
      want -= lens[i];
    }
    return pts[0];
  }

  function distToPolyline(p, pts) {
    var best = Infinity;
    var px = p[1] * COSLAT, py = p[0];
    for (var i = 1; i < pts.length; i++) {
      var ax = pts[i - 1][1] * COSLAT, ay = pts[i - 1][0], bx = pts[i][1] * COSLAT, by = pts[i][0];
      var dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
      var t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
      var qx = ax + t * dx - px, qy = ay + t * dy - py;
      var d = Math.sqrt(qx * qx + qy * qy) * 111320;
      if (d < best) best = d;
    }
    return best;
  }

  /* ------------------------------------------------------------ the graph */

  function build(C) {
    var G = { C: C, seg: [], out: [], stops: C.stops, pat: C.patterns };
    var i, s;
    for (i = 0; i < C.nodes; i++) G.out.push([]);

    for (i = 0; i < C.seg.length; i++) {
      s = C.seg[i];
      var pts = decode(s.g);
      var first = pts[0], last = pts[pts.length - 1];
      var seg = {
        i: i, a: s.a, b: s.b, d: s.d, l: Math.max(1, s.l), n: s.n, pts: pts,
        mid: pointAt(pts, 0.5),
        bearing: Math.atan2(last[0] - first[0], (last[1] - first[1]) * COSLAT),
        pats: [], stops: [], tw: -1, street: '', city: ''
      };
      G.seg.push(seg);
      if (s.d & 1) G.out[s.a].push({ ref: i + 1, to: s.b, l: seg.l });
      if (s.d & 2) G.out[s.b].push({ ref: -(i + 1), to: s.a, l: seg.l });
    }

    // lines and stops on each segment
    G.pat.forEach(function (p, pi) {
      p.i = pi;
      // the build places each stop on the path by chainage; snap it to the
      // geometrically closest path element nearby
      p.sp = p.sp.map(function (at, k) {
        var st = C.stops[p.st[k]], here = [st.y, st.x], best = at, bestD = Infinity;
        for (var q = Math.max(0, at - 3); q <= Math.min(p.p.length - 1, at + 3); q++) {
          var d = distToPolyline(here, G.seg[Math.abs(p.p[q]) - 1].pts);
          if (d < bestD - 0.5) { bestD = d; best = q; }
        }
        return best;
      });
      var seen = {};
      p.p.forEach(function (ref) {
        var si = Math.abs(ref) - 1;
        if (!seen[si]) { seen[si] = 1; G.seg[si].pats.push(pi); }
      });
      p.st.forEach(function (stopIdx, k) {
        var si = Math.abs(p.p[p.sp[k]]) - 1;
        if (G.seg[si].stops.indexOf(stopIdx) < 0) G.seg[si].stops.push(stopIdx);
      });
    });
    G.stops.forEach(function (st, k) { st.i = k; st.pats = []; });
    G.pat.forEach(function (p, pi) {
      p.st.forEach(function (k) { if (G.stops[k].pats.indexOf(pi) < 0) G.stops[k].pats.push(pi); });
    });

    // street name of a segment = the street most of its stops stand on,
    // spread along the straight continuation where a segment has no stop
    G.seg.forEach(function (sg) {
      var count = {};
      sg.stops.forEach(function (k) {
        var st = G.stops[k]; if (!st.s) return;
        var key = st.s + '|' + st.t; count[key] = (count[key] || 0) + 1;
      });
      var best = Object.keys(count).sort(function (x, y) { return count[y] - count[x]; })[0];
      if (best) { sg.street = best.split('|')[0]; sg.city = best.split('|')[1]; sg.named = true; }
    });
    var atNode = [];
    for (i = 0; i < C.nodes; i++) atNode.push([]);
    G.seg.forEach(function (sg) { atNode[sg.a].push(sg.i); atNode[sg.b].push(sg.i); });
    G.atNode = atNode;
    for (var round = 0; round < 6; round++) {
      G.seg.forEach(function (sg) {
        if (sg.street) return;
        var cand = null, bestTurn = 0.45;
        [sg.a, sg.b].forEach(function (node) {
          atNode[node].forEach(function (oi) {
            var o = G.seg[oi]; if (!o.street || oi === sg.i) return;
            var turn = Math.abs(Math.sin(o.bearing - sg.bearing));
            if (turn < bestTurn) { bestTurn = turn; cand = o; }
          });
        });
        if (cand) { sg.street = cand.street; sg.city = cand.city; }
      });
    }

    // the opposite carriageway of a one-way segment
    var grid = {}, cell = 0.0006;
    function key(p) { return Math.floor(p[0] / cell) + ':' + Math.floor(p[1] / cell); }
    G.seg.forEach(function (sg) { (grid[key(sg.mid)] = grid[key(sg.mid)] || []).push(sg.i); });
    G.grid = grid; G.cell = cell;
    G.seg.forEach(function (sg) {
      if (sg.d === 3) return;
      var best = -1, bestD = 30;
      var cy = Math.floor(sg.mid[0] / cell), cx = Math.floor(sg.mid[1] / cell);
      for (var y = cy - 1; y <= cy + 1; y++) for (var x = cx - 1; x <= cx + 1; x++) {
        (grid[y + ':' + x] || []).forEach(function (oi) {
          var o = G.seg[oi]; if (oi === sg.i || o.d === 3) return;
          var same = (sg.d === o.d) ? 1 : -1;                 // drawn in the same or the opposite sense
          var opposite = Math.cos(sg.bearing - o.bearing) * same < -0.8;
          if (!opposite) return;
          var d = distToPolyline(sg.mid, o.pts);
          if (d < bestD) { bestD = d; best = oi; }
        });
      }
      sg.tw = best;
    });
    return G;
  }

  function nearestSeg(G, latlng, maxMetres) {
    var best = -1, bestD = maxMetres || 40;
    var cy = Math.floor(latlng[0] / G.cell), cx = Math.floor(latlng[1] / G.cell);
    for (var y = cy - 3; y <= cy + 3; y++) for (var x = cx - 3; x <= cx + 3; x++) {
      (G.grid[y + ':' + x] || []).forEach(function (si) {
        var d = distToPolyline(latlng, G.seg[si].pts);
        if (d < bestD) { bestD = d; best = si; }
      });
    }
    return best;
  }

  function startNode(G, ref) { var s = G.seg[Math.abs(ref) - 1]; return ref > 0 ? s.a : s.b; }
  function endNode(G, ref) { var s = G.seg[Math.abs(ref) - 1]; return ref > 0 ? s.b : s.a; }

  /* A pattern's path as drawable polylines (pieces break where the line
     leaves the corridor and comes back). from/to are path indexes. */
  function pathLines(G, refs) {
    var lines = [], cur = null, lastNode = -1;
    refs.forEach(function (ref) {
      var sg = G.seg[Math.abs(ref) - 1];
      var pts = ref > 0 ? sg.pts : sg.pts.slice().reverse();
      if (cur && startNode(G, ref) === lastNode) cur.push.apply(cur, pts.slice(1));
      else { cur = pts.slice(); lines.push(cur); }
      lastNode = endNode(G, ref);
    });
    return lines;
  }

  /* -------------------------------------------------------------- detours */

  function Heap() { this.a = []; }
  Heap.prototype.push = function (k, v) {
    var a = this.a, i = a.length; a.push([k, v]);
    while (i > 0) { var p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; var t = a[p]; a[p] = a[i]; a[i] = t; i = p; }
  };
  Heap.prototype.pop = function () {
    var a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; var i = 0;
      for (;;) {
        var l = 2 * i + 1, r = l + 1, m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break; var t = a[m]; a[m] = a[i]; a[i] = t; i = m;
      }
    }
    return top;
  };

  /* Shortest way for one line around a set of closed segments.
     The bus leaves its route shortly before the closure and rejoins shortly
     after it, so that as few stops as possible are skipped. The search
     window along the route widens only when no way round is found. */
  function detour(G, pat, closed) {
    var path = pat.p, i = -1, j = -1, k;
    for (k = 0; k < path.length; k++) if (closed[Math.abs(path[k]) - 1]) { if (i < 0) i = k; j = k; }
    if (i < 0) return null;
    var prefix = [0];
    for (k = 0; k < path.length; k++) prefix.push(prefix[k] + G.seg[Math.abs(path[k]) - 1].l);
    var windows = [500, 1200, 3000, 1e9], found = null;
    for (var w = 0; w < windows.length && !found; w++) found = search(G, pat, closed, i, j, prefix, windows[w]);
    return found || { from: i, to: j, blocked: true, refs: [], skipped: skippedStops(pat, i, j), served: [] };
  }

  function search(G, pat, closed, i, j, prefix, reach) {
    var path = pat.p, total = prefix[path.length], k;
    var dist = {}, prev = {}, heap = new Heap(), origin = {};
    for (k = i; k >= 0 && prefix[i] - prefix[k] <= reach; k--) {
      var n = startNode(G, path[k]);
      if (dist[n] == null || prefix[k] < dist[n]) { dist[n] = prefix[k]; origin[n] = k; heap.push(prefix[k], n); }
    }
    var target = {};
    for (k = j; k < path.length && prefix[k] - prefix[j + 1] <= reach; k++) {
      var e = endNode(G, path[k]);
      if (target[e] == null) target[e] = k;            // earliest rejoin at this node
    }
    var limit = prefix[i] + reach * 2 + 6000, best = null, bestCost = Infinity;
    while (heap.a.length) {
      var top = heap.pop(), d = top[0], u = top[1];
      if (d > dist[u] || d > limit || d >= bestCost) continue;
      if (target[u] != null && prev[u] != null) {
        var cost = d + (total - prefix[target[u] + 1]);
        if (cost < bestCost) { bestCost = cost; best = u; }
      }
      var edges = G.out[u];
      for (var x = 0; x < edges.length; x++) {
        var ed = edges[x], si = Math.abs(ed.ref) - 1;
        if (closed[si]) continue;
        var nd = d + ed.l;
        if (dist[ed.to] == null || nd < dist[ed.to]) { dist[ed.to] = nd; prev[ed.to] = [u, ed.ref]; heap.push(nd, ed.to); }
      }
    }
    if (best == null) return null;

    var refs = [], node = best;
    while (prev[node]) { refs.unshift(prev[node][1]); node = prev[node][0]; }
    var leave = origin[node], rejoin = target[best];
    // drop the part where the "detour" just follows the original route
    while (refs.length && leave < i && refs[0] === path[leave]) { refs.shift(); leave++; }
    while (refs.length && rejoin > j && refs[refs.length - 1] === path[rejoin]) { refs.pop(); rejoin--; }

    var len = 0; refs.forEach(function (r) { len += G.seg[Math.abs(r) - 1].l; });
    var replaced = prefix[rejoin + 1] - prefix[leave];
    var stops = [], seen = {};
    pat.st.forEach(function (s) { seen[s] = 1; });
    refs.forEach(function (r) {
      var sg = G.seg[Math.abs(r) - 1];
      sg.stops.forEach(function (s) { if (!seen[s]) { seen[s] = 1; stops.push(s); } });
    });
    return {
      from: i, to: j, leave: leave, rejoin: rejoin, refs: refs,
      length: Math.round(len), extra: Math.round(len - replaced),
      skipped: skippedStops(pat, leave, rejoin), served: stops,
      original: path.slice(leave, rejoin + 1)
    };
  }

  function skippedStops(pat, from, to) {
    var out = [];
    pat.st.forEach(function (s, k) { if (pat.sp[k] >= from && pat.sp[k] <= to) out.push(s); });
    return out;
  }

  /* -------------------------------------------------------------- closures */

  function closedSet(closure) {
    var set = {};
    closure.segs.forEach(function (s) { set[s] = 1; });
    return set;
  }

  function overlap(a, b) {
    var s = Math.max(a.start, b.start), e = Math.min(a.end, b.end);
    return e > s ? { start: s, end: e } : null;
  }

  /* What one closure does to the bus network.
     closure: { segs: [segment idx], start, end (minutes after midnight of the
     demo day), kind: 'full' | 'partial' | 'buslane' | 'turns' }
     others:  the other closures of the same night. */
  function impact(G, closure, others) {
    var set = closedSet(closure), byPat = {}, stops = {};
    closure.segs.forEach(function (si) {
      G.seg[si].pats.forEach(function (pi) { byPat[pi] = 1; });
      G.seg[si].stops.forEach(function (s) { stops[s] = 1; });
    });
    var lines = [], tripCount = 0, allPasses = [];
    Object.keys(byPat).forEach(function (pi) {
      var p = G.pat[pi], at = 0;
      for (var k = 0; k < p.p.length; k++) if (set[Math.abs(p.p[k]) - 1]) { at = p.o[k] / 60; break; }
      var passes = p.nt.map(function (t0) { return Math.round(t0 + at); });
      var hit = [], keys = [];
      passes.forEach(function (t, n) {
        allPasses.push(t);
        if (t >= closure.start && t < closure.end) { hit.push(t); keys.push(p.id + ':' + p.nt[n]); }
      });
      var line = { pat: p, passes: passes, hit: hit, keys: keys };
      if (closure.kind === 'full' && hit.length) {
        var natural = detour(G, p, set);
        line.detour = natural;
        // is the natural way round closed by somebody else at the same time?
        (others || []).forEach(function (o) {
          if (o === closure || o.kind !== 'full' || !natural || natural.blocked) return;
          var ov = overlap(closure, o); if (!ov) return;
          var oset = closedSet(o);
          var crosses = natural.refs.some(function (r) { return oset[Math.abs(r) - 1]; });
          if (!crosses) return;
          var caught = hit.filter(function (t) { return t >= ov.start && t < ov.end; });
          if (!caught.length) return;
          line.bypassBlockedBy = o; line.bypassWindow = ov;
          var both = {}; Object.keys(set).forEach(function (s) { both[s] = 1; });
          Object.keys(oset).forEach(function (s) { both[s] = 1; });
          line.detour = detour(G, p, both) || natural;
          line.naturalDetour = natural;
        });
      }
      if (hit.length) { lines.push(line); tripCount += hit.length; }
    });
    lines.sort(function (a, b) { return b.hit.length - a.hit.length; });
    var blocker = null;
    lines.forEach(function (l) { if (l.bypassBlockedBy) blocker = blocker || l.bypassBlockedBy; });
    return {
      lines: lines, trips: tripCount, passes: allPasses,
      stops: Object.keys(stops).map(Number),
      bypassBlockedBy: blocker,
      level: !lines.length ? 'none' : blocker ? 'critical' : closure.kind === 'full' ? 'serious' : 'warning'
    };
  }

  /* Where every bus of the night is at a given minute. */
  function busesAt(G, minute) {
    var out = [];
    G.pat.forEach(function (p) {
      if (!p.nt.length || p.o.length < 2) return;
      var span = p.o[p.o.length - 1];
      for (var t = 0; t < p.nt.length; t++) {
        var dt = (minute - p.nt[t]) * 60;
        if (dt < 0 || dt > span) continue;
        var lo = 0, hi = p.o.length - 1;
        while (hi - lo > 1) { var m = (lo + hi) >> 1; if (p.o[m] <= dt) lo = m; else hi = m; }
        var a = G.seg[Math.abs(p.p[lo]) - 1].mid, b = G.seg[Math.abs(p.p[hi]) - 1].mid;
        if (metres(a, b) > 1500) continue;               // outside the corridor at this moment
        var f = p.o[hi] > p.o[lo] ? (dt - p.o[lo]) / (p.o[hi] - p.o[lo]) : 0;
        out.push({ pat: p, seg: Math.abs(p.p[lo]) - 1, at: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f] });
      }
    });
    return out;
  }

  /* Segments of one line between two of its stops (and the twin carriageway). */
  function stretch(G, pat, fromStop, toStop, withTwin) {
    var a = pat.st.indexOf(fromStop), b = pat.st.indexOf(toStop);
    if (a < 0 || b < 0) return [];
    var out = [], seen = {};
    for (var k = Math.min(pat.sp[a], pat.sp[b]); k <= Math.max(pat.sp[a], pat.sp[b]); k++) {
      var si = Math.abs(pat.p[k]) - 1;
      [si, withTwin === false ? -1 : G.seg[si].tw].forEach(function (x) {
        if (x >= 0 && !seen[x]) { seen[x] = 1; out.push(x); }
      });
    }
    return out;
  }

  var api = {
    build: build, decode: decode, metres: metres, pointAt: pointAt, distToPolyline: distToPolyline,
    nearestSeg: nearestSeg, pathLines: pathLines, detour: detour, impact: impact, busesAt: busesAt,
    stretch: stretch, closedSet: closedSet, startNode: startNode, endNode: endNode, COSLAT: COSLAT
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(this);
