/* Application shell: state, helpers, navigation and the map side of each view.
   The panels themselves are in views.js. */
(function (root) {
  'use strict';

  var G, Sc = root.Scenario;

  var S = root.State = {
    view: 'night', role: 'dist_tlv',
    minute: 23 * 60 + 30, playing: false,
    night: { sel: null, filter: 'all', form: null, line: null },
    det: { sel: null, dir: 0 },
    mapx: { q: '', stop: null, pat: null, propose: null, layers: { works: true, stops: true, proposals: true }, exportBy: 'op' },
    gtfs: { sel: null },
    menu: false,
    proposals: [],
    impacts: {}
  };

  /* --------------------------------------------------------------- helpers */

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function hm(min) {
    var m = ((Math.round(min) % 1440) + 1440) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }
  function parseHm(text, after) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(text || '');
    if (!m) return null;
    var v = (+m[1]) * 60 + (+m[2]);
    if (after != null && v <= after) v += 1440;
    return v;
  }
  function km(metres) {
    var v = metres / 1000;
    return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1) + ' ק"מ';
  }
  /* dates, clock times and ranges read left to right inside Hebrew text */
  function ltr(text) { return '<span class="ltr">' + esc(text) + '</span>'; }
  function plural(n, one, many) { return n === 1 ? one : n + ' ' + many; }
  function uniq(list) { var seen = {}, out = []; list.forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } }); return out; }

  var ICONS = {
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
    detour: '<path d="M5 20V9a4 4 0 0 1 4-4h7"/><path d="m13 2 3 3-3 3"/><path d="M19 4v16"/><path d="M19 12h-5"/>',
    map: '<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2Z"/><path d="M9 4v14M15 6v14"/>',
    sync: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15"/><path d="M4 20v-5h5"/>',
    roles: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.5a6 6 0 0 1 3 5.5"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    flag: '<path d="M6 21V4"/><path d="M6 4.5h11l-2.2 3.75L17 12H6"/>',
    alert: '<path d="M12 3.5 2.5 20h19L12 3.5Z"/><path d="M12 10v4.5M12 17.2v.3"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    back: '<path d="M9 6l6 6-6 6"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    play: '<path d="M8 5.5v13l11-6.5-11-6.5Z"/>',
    pause: '<path d="M8 5.5v13M16 5.5v13"/>',
    download: '<path d="M12 4v11"/><path d="m7.5 11 4.5 4.5L16.5 11"/><path d="M5 19.5h14"/>',
    lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    send: '<path d="M20.5 3.5 3.5 10.5l6.5 2.8 2.8 6.7 7.7-16.5Z"/><path d="m10 13.3 4-4"/>',
    bus: '<rect x="5" y="4" width="14" height="13" rx="2.5"/><path d="M5 11h14M8 20v-3M16 20v-3"/><path d="M8.5 14.2h.01M15.5 14.2h.01"/>',
    pin: '<path d="M12 21s6.5-6 6.5-11a6.5 6.5 0 0 0-13 0c0 5 6.5 11 6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
    file: '<path d="M7 3.5h7l4 4V20.5H7V3.5Z"/><path d="M14 3.5v4h4"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>',
    layers: '<path d="m12 4 9 4.5-9 4.5-9-4.5L12 4Z"/><path d="m3 13 9 4.5 9-4.5"/>',
    turn: '<path d="M7 20V10a3 3 0 0 1 3-3h8"/><path d="m15 4 3 3-3 3"/>',
    lanes: '<path d="M5 4v16M19 4v16M12 4v3M12 10.5v3M12 17v3"/>',
    barrier: '<rect x="3" y="8" width="18" height="6" rx="1"/><path d="M6 14v5M18 14v5M7.5 8l3 6M12.5 8l3 6"/>'
  };
  function icon(name, cls) {
    return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }

  var LEVELS = {
    critical: { label: 'דגל אדום, עוקף חסום', icon: 'flag' },
    serious: { label: 'דגל אדום', icon: 'flag' },
    warning: { label: 'עיכוב צפוי', icon: 'clock' },
    none: { label: 'ללא קונפליקט', icon: 'check' }
  };
  var KIND_ICON = { full: 'barrier', partial: 'lanes', buslane: 'bus', turns: 'turn' };

  function levelChip(level) {
    var l = LEVELS[level] || LEVELS.none;
    return '<span class="lvl lvl--' + level + '">' + icon(l.icon) + l.label + '</span>';
  }
  function lineBadge(no, big) { return '<span class="lb' + (big ? ' lb--big' : '') + '">' + esc(no) + '</span>'; }
  function role() { return Sc.ROLES.filter(function (r) { return r.id === S.role; })[0]; }
  function can(what) { return !!role().can[what]; }

  /* ------------------------------------------------------------ the model */

  function closures() {
    var list = Sc.CLOSURES;
    return role().ownOnly ? list.filter(function (c) { return c.mine; }) : list;
  }
  function closureById(id) {
    return Sc.CLOSURES.concat(Sc.ARRANGEMENTS).filter(function (c) { return c.id === id; })[0];
  }
  function tickets() {
    return role().ownOnly ? Sc.TICKETS.filter(function (t) { return t.mine; }) : Sc.TICKETS;
  }
  function recompute() {
    S.impacts = {};
    Sc.CLOSURES.forEach(function (c) { S.impacts[c.id] = Engine.impact(G, c, Sc.CLOSURES); });
  }
  function lineCount(imp) { return uniq(imp.lines.map(function (l) { return l.pat.op + '|' + l.pat.no; })).length; }
  function operatorsOf(imp) { return uniq(imp.lines.map(function (l) { return l.pat.op; })); }

  /* lines of an impact, merged per line number and destination */
  function lineRows(imp) {
    var rows = {}, order = [];
    imp.lines.forEach(function (l) {
      var key = l.pat.op + '|' + l.pat.no + '|' + l.pat.tc;
      if (!rows[key]) { rows[key] = { key: key, pat: l.pat, hit: [], line: l, blocked: false }; order.push(key); }
      var r = rows[key];
      r.hit = r.hit.concat(l.hit);
      if (l.bypassBlockedBy) r.blocked = true;
      if (l.hit.length > r.line.hit.length) { r.line = l; r.pat = l.pat; }
    });
    return order.map(function (k) { rows[k].hit.sort(function (a, b) { return a - b; }); return rows[k]; })
      .sort(function (a, b) { return b.hit.length - a.hit.length; });
  }

  function ticketInfo(t) {
    var keys = Object.keys(t.approvals);
    var states = keys.map(function (k) { return t.approvals[k].status; });
    var ok = states.filter(function (s) { return s === 'approved'; }).length;
    var status = states.indexOf('rejected') >= 0 ? 'rejected'
      : ok === keys.length ? 'approved'
        : (ok > 0 || states.indexOf('reserved') >= 0) ? 'partial' : 'pending';
    var closure = closureById(t.closure);
    var set = Engine.closedSet(closure);
    var dirs = G.pat.filter(function (p) { return p.no === t.line && p.op === t.op; }).map(function (p) {
      return { pat: p, detour: Engine.detour(G, p, set) };
    }).filter(function (d) { return d.detour && !d.detour.blocked && d.detour.refs.length; });
    var seen = {};
    dirs = dirs.filter(function (d) { if (seen[d.pat.tc]) return false; seen[d.pat.tc] = 1; return true; });
    // is the proposed way round closed by another closure at the same hours?
    dirs.forEach(function (d) {
      Sc.CLOSURES.forEach(function (o) {
        if (o === closure || o.kind !== 'full') return;
        var oset = Engine.closedSet(o);
        if (Math.min(o.end, closure.end) > Math.max(o.start, closure.start) &&
          d.detour.refs.some(function (r) { return oset[Math.abs(r) - 1]; })) d.clash = o;
      });
    });
    return { status: status, districts: keys, closure: closure, dirs: dirs };
  }
  var TICKET_STATUS = {
    approved: { label: 'מאושר לתח"צ', level: 'good', icon: 'check' },
    partial: { label: 'אישור חלקי', level: 'critical', icon: 'alert' },
    pending: { label: 'ממתין לאישור', level: 'warning', icon: 'clock' },
    rejected: { label: 'נדחה', level: 'critical', icon: 'x' }
  };
  var APPROVAL = {
    approved: { label: 'אישר', level: 'good', icon: 'check' },
    pending: { label: 'טרם הגיב', level: 'warning', icon: 'clock' },
    reserved: { label: 'רשם הסתייגות', level: 'serious', icon: 'alert' },
    rejected: { label: 'דחה', level: 'critical', icon: 'x' }
  };

  function streetsOf(refs, limit) {
    var out = [];
    refs.forEach(function (r) {
      var s = G.seg[Math.abs(r) - 1];
      if (s.named && s.l > 40 && out.indexOf(s.street) < 0) out.push(s.street);
    });
    return out.slice(0, limit || 3);
  }

  /* ------------------------------------------------------------------ shell */

  var NAV = [
    { id: 'overview', label: 'תמונת מצב', icon: 'grid', layout: 'page' },
    { id: 'night', label: 'הלילה הקרוב', icon: 'moon', layout: 'map' },
    { id: 'detours', label: 'הסטות מסלול', icon: 'detour', layout: 'map' },
    { id: 'map', label: 'מפת תח"צ', icon: 'map', layout: 'map' },
    { id: 'gtfs', label: 'עדכון GTFS', icon: 'sync', layout: 'map' },
    { id: 'roles', label: 'תפקידים', icon: 'roles', layout: 'page' }
  ];

  function navBadge(id) {
    if (id === 'night') {
      var n = closures().filter(function (c) { return S.impacts[c.id] && S.impacts[c.id].level === 'critical'; }).length;
      return n ? '<span class="rail-badge rail-badge--critical">' + n + '</span>' : '';
    }
    if (id === 'detours') {
      var d = role().district;
      var mine = tickets().filter(function (t) {
        return d ? (t.approvals[d] && t.approvals[d].status === 'pending') : ticketInfo(t).status === 'partial';
      }).length;
      return mine ? '<span class="rail-badge">' + mine + '</span>' : '';
    }
    if (id === 'gtfs') {
      var g = Sc.DELTAS.filter(function (x) { return x.level !== 'good'; }).length;
      return role().ownOnly ? '' : '<span class="rail-badge">' + g + '</span>';
    }
    return '';
  }

  function renderShell() {
    var r = role();
    document.getElementById('rail').innerHTML = NAV.map(function (n) {
      return '<button class="rail-item' + (S.view === n.id ? ' is-on' : '') + '" data-act="go" data-arg="' + n.id + '"' + (S.view === n.id ? ' aria-current="page"' : '') + '>' +
        icon(n.icon) + '<span>' + n.label + '</span>' + navBadge(n.id) + '</button>';
    }).join('');

    document.getElementById('rolebox').innerHTML =
      '<button class="role-btn" data-act="menu" aria-haspopup="true" aria-expanded="' + S.menu + '">' +
      '<span class="role-text"><small>צפייה בתפקיד</small><strong>' + esc(r.name) + '</strong><span>' + esc(r.sub) + '</span></span>' + icon('chevron') + '</button>' +
      (S.menu ? '<div class="role-menu" role="menu">' + Sc.ROLES.map(function (x) {
        return '<button role="menuitem" class="role-opt' + (x.id === S.role ? ' is-on' : '') + '" data-act="role" data-arg="' + x.id + '">' +
          '<strong>' + esc(x.name) + '</strong><span>' + esc(x.sub) + '</span>' + (x.id === S.role ? icon('check') : '') + '</button>';
      }).join('') + '<p class="role-note">ההרשאות משתנות לפי התפקיד. הפירוט המלא במסך "תפקידים".</p></div>' : '');
  }

  function render() {
    var nav = NAV.filter(function (n) { return n.id === S.view; })[0];
    document.body.setAttribute('data-view', S.view);
    document.body.setAttribute('data-layout', nav.layout);
    renderShell();
    var panel = document.getElementById('panel'), page = document.getElementById('page');
    var html = Views[S.view]();
    if (nav.layout === 'page') { page.innerHTML = html; panel.innerHTML = ''; }
    else { panel.innerHTML = html; page.innerHTML = ''; }
    if (nav.layout === 'map') { MapView.resize(); syncMap(); }
    renderLegend();
  }

  /* partial refresh that keeps the panel's scroll position */
  function refresh() {
    var panel = document.getElementById('panel'), top = panel.scrollTop;
    render();
    panel.scrollTop = top;
  }

  function toast(text, kind) {
    var el = document.getElementById('toast');
    el.innerHTML = icon(kind === 'warn' ? 'alert' : 'check') + '<span>' + esc(text) + '</span>';
    el.className = 'toast is-on' + (kind ? ' toast--' + kind : '');
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { el.className = 'toast'; }, 4200);
  }

  /* ------------------------------------------------------------- map sync */

  function closureLayer(c, selectedId) {
    var imp = S.impacts[c.id];
    return {
      id: c.id, segs: c.segs, kind: c.kind, level: imp ? imp.level : 'warning',
      active: S.view !== 'night' || (c.start <= S.minute && S.minute < c.end),
      selected: c.id === selectedId, label: c.street + ', ' + c.city,
      badge: icon(imp && imp.level === 'critical' ? 'flag' : KIND_ICON[c.kind])
    };
  }

  function syncMap() {
    MapView.off('seg'); MapView.off('stop'); MapView.off('map');
    MapView.setCursor('');
    MapView.setSelection(null); MapView.setRoute(null); MapView.setDetour(null); MapView.setPins(null);
    MapView.on('closure', function (id) {
      var c = closureById(id);
      if (c && c.night) { S.view = 'night'; S.night.sel = id; S.night.line = null; S.night.form = null; render(); focusClosure(); }
    });
    if (S.view !== 'night') { stopPlaying(); MapView.setBuses(null); }
    MapSync[S.view]();
  }

  var MapSync = {
    night: function () {
      MapView.setTheme('night');
      var N = S.night, sel = N.sel && closureById(N.sel);
      MapView.setClosures(closures().map(function (c) { return closureLayer(c, N.sel); }));
      drawBuses();
      if (N.form) {
        MapView.setCursor('draw');
        MapView.setSelection(N.form.segs);
        MapView.setStops({ show: false });
        MapView.on('seg', function (seg) {
          var f = S.night.form, list = [seg];
          if (G.seg[seg].tw >= 0) list.push(G.seg[seg].tw);
          var has = f.segs.indexOf(seg) >= 0;
          list.forEach(function (x) {
            var at = f.segs.indexOf(x);
            if (has && at >= 0) f.segs.splice(at, 1);
            if (!has && at < 0) f.segs.push(x);
          });
          MapView.setSelection(f.segs);
          Views.refreshForm();
        });
        return;
      }
      if (!sel) { MapView.setStops({ show: false }); return; }
      var imp = S.impacts[sel.id];
      MapView.setStops({ show: false, cancelled: sel.kind === 'full' ? imp.stops : [], focus: sel.kind === 'full' ? [] : imp.stops });
      if (N.line) {
        var row = lineRows(imp).filter(function (r) { return r.key === N.line; })[0];
        if (row) {
          var d = row.line.detour, list = [{ context: row.pat.p }];
          if (d && !d.blocked && d.refs.length) {
            if (row.line.naturalDetour) list.push({ alt: row.line.naturalDetour.refs, color: '#E5383B', dashed: true });
            list.push({ original: d.original, alt: d.refs });
            MapView.setStops({ show: false, cancelled: d.skipped, added: d.served });
          }
          MapView.setDetour(list);
        }
      }
    },

    detours: function () {
      MapView.setTheme('day');
      var t = S.det.sel && Sc.TICKETS.filter(function (x) { return x.id === S.det.sel; })[0];
      if (!t) {
        var ids = uniq(tickets().map(function (x) { return x.closure; }));
        MapView.setClosures(ids.map(function (id) { return closureLayer(closureById(id), null); }));
        MapView.setStops({ show: false });
        return;
      }
      var info = ticketInfo(t), dir = info.dirs[Math.min(S.det.dir, info.dirs.length - 1)];
      var layers = [closureLayer(info.closure, info.closure.id)];
      if (dir && dir.clash) layers.push(closureLayer(dir.clash, null));
      MapView.setClosures(layers);
      if (dir) {
        MapView.setDetour([{ context: dir.pat.p }, { original: dir.detour.original, alt: dir.detour.refs }]);
        MapView.setStops({ show: false, cancelled: dir.detour.skipped, added: dir.detour.served });
      }
    },

    map: function () {
      MapView.setTheme('day');
      var X = S.mapx, works = [];
      if (X.layers.works) {
        works = Sc.ARRANGEMENTS.concat(closures()).filter(function (c) { return c.segs.length; }).map(function (c) {
          var layer = closureLayer(c, null);
          if (!c.night) { layer.level = 'warning'; layer.badge = icon(KIND_ICON[c.kind]); }
          return layer;
        });
      }
      MapView.setClosures(works);
      var pat = X.pat != null ? G.pat[X.pat] : null;
      if (pat) MapView.setRoute(pat.p);
      MapView.setStops({ show: X.layers.stops, focus: pat ? pat.st : [], selected: X.stop });
      var pins = [];
      if (X.layers.proposals) S.proposals.forEach(function (p) {
        pins.push({ at: p.at, kind: p.status === 'pending' ? 'proposal' : 'proposal-ok', html: icon('alert'), id: p.id });
      });
      if (X.propose && X.propose.at) pins.push({ at: X.propose.at, kind: 'draft', html: icon('pin') });
      MapView.setPins(pins);
      if (X.propose) {
        MapView.setCursor('draw');
        MapView.on('map', placeProposal); MapView.on('seg', function (seg, at) { placeProposal(at); });
      } else {
        MapView.on('stop', function (i) { X.stop = i; X.pat = null; X.q = ''; refresh(); });
      }
    },

    gtfs: function () {
      MapView.setTheme('day');
      var d = Sc.DELTAS.filter(function (x) { return x.id === S.gtfs.sel; })[0];
      var hl = closureById('HL-2611');
      MapView.setClosures([closureLayer(hl, null), closureLayer(closureById('HL-2618'), null)]);
      MapView.setStops({ show: false });
      if (!d) {
        MapView.setPins(Sc.DELTAS.filter(function (x) { return x.stopRef; }).map(function (x) {
          return { at: [x.stopRef.y, x.stopRef.x], kind: 'delta-' + x.level, html: icon('sync'), id: x.id };
        }));
        MapView.on('pin', function (id) { S.gtfs.sel = id; render(); focusDelta(); });
        return;
      }
      if (d.type === 'route') {
        var v = Views.deltaRoutes(d);
        if (v) MapView.setDetour([{ context: v.pat.p }, { alt: v.approved, color: '#5B6779', dashed: true }, { original: v.original, alt: v.reported, color: '#E5383B' }]);
      } else {
        var s = d.stopRef;
        if (d.type === 'moved') {
          var to = Views.movedTo(d);
          MapView.setStops({ show: false, cancelled: [s.i] });
          MapView.setPins([{ at: to, kind: 'newstop', html: icon('plus') }]);
        } else if (d.type === 'removed') MapView.setStops({ show: false, cancelled: [s.i] });
        else MapView.setStops({ show: false, added: [s.i] });
      }
    },

    overview: function () { },
    roles: function () { }
  };

  function placeProposal(at) {
    S.mapx.propose.at = at;
    var near = Engine.nearestSeg(G, at, 80);
    S.mapx.propose.where = near >= 0 && G.seg[near].street ? G.seg[near].street + ', ' + G.seg[near].city : 'נקודה על המפה';
    refresh();
  }

  /* --------------------------------------------------------------- buses */

  function drawBuses() {
    var closedNow = {};
    closures().forEach(function (c) {
      if (c.kind === 'full' && c.start <= S.minute && S.minute < c.end) c.segs.forEach(function (s) { closedNow[s] = 1; });
    });
    var buses = Engine.busesAt(G, S.minute), hit = 0;
    buses.forEach(function (b) { b.hit = !!closedNow[b.seg]; if (b.hit) hit++; });
    MapView.setBuses(buses);
    var el = document.getElementById('scrub');
    el.querySelector('.scrub-time').textContent = hm(S.minute);
    el.querySelector('.scrub-count').innerHTML = '<b>' + buses.length + '</b> אוטובוסים בתנועה' +
      (hit ? '<span class="scrub-hit">' + icon('alert') + plural(hit, 'אחד במקטע חסום', 'במקטע חסום') + '</span>' : '');
    el.querySelector('input').value = S.minute;
    el.querySelector('.scrub-play').innerHTML = icon(S.playing ? 'pause' : 'play');
    el.querySelector('.scrub-play').setAttribute('aria-label', S.playing ? 'עצירה' : 'הרצת הלילה');
  }

  function setMinute(m) {
    S.minute = Math.max(Sc.NIGHT.start, Math.min(Sc.NIGHT.end, m));
    MapView.setClosures(closures().map(function (c) { return closureLayer(c, S.night.sel); }));
    drawBuses();
  }
  function stopPlaying() { S.playing = false; clearInterval(stopPlaying.t); }
  function togglePlay() {
    if (S.playing) { stopPlaying(); drawBuses(); return; }
    if (S.minute >= Sc.NIGHT.end) S.minute = Sc.NIGHT.start;
    S.playing = true;
    stopPlaying.t = setInterval(function () {
      if (S.minute >= Sc.NIGHT.end) { stopPlaying(); drawBuses(); return; }
      setMinute(S.minute + 1);
    }, 70);
    drawBuses();
  }

  /* --------------------------------------------------------------- focus */

  var PAD = { left: 70, right: 70, top: 90, bottom: 150 };
  function focusClosure() {
    var c = closureById(S.night.sel); if (!c) return MapView.fitAll();
    var imp = S.impacts[c.id], segs = c.segs.slice();
    if (imp && imp.bypassBlockedBy) segs = segs.concat(imp.bypassBlockedBy.segs);
    MapView.fitSegs(segs, Object.assign({ maxZoom: 15.5 }, PAD));
  }
  function focusTicket() {
    var t = Sc.TICKETS.filter(function (x) { return x.id === S.det.sel; })[0];
    if (!t) return MapView.fitSegs([].concat.apply([], tickets().map(function (x) { return closureById(x.closure).segs; })), Object.assign({ maxZoom: 14.5 }, PAD));
    var info = ticketInfo(t), dir = info.dirs[Math.min(S.det.dir, info.dirs.length - 1)];
    var refs = dir ? dir.detour.refs.concat(dir.detour.original) : [];
    MapView.fitSegs(info.closure.segs.concat(refs.map(function (r) { return Math.abs(r) - 1; })), Object.assign({ maxZoom: 15.75 }, PAD));
  }
  function focusDelta() {
    var d = Sc.DELTAS.filter(function (x) { return x.id === S.gtfs.sel; })[0];
    if (!d) return MapView.fitSegs(closureById('HL-2611').segs.concat(closureById('HL-2618').segs), Object.assign({ maxZoom: 15 }, PAD));
    if (d.stopRef) return MapView.fitPoints([[d.stopRef.y + 0.0016, d.stopRef.x + 0.002], [d.stopRef.y - 0.0016, d.stopRef.x - 0.002]], PAD);
    var v = Views.deltaRoutes(d);
    if (v) MapView.fitRefs(v.reported.concat(v.approved), Object.assign({ maxZoom: 15.5 }, PAD));
  }
  function focusLine() {
    var p = G.pat[S.mapx.pat]; if (p) MapView.fitRefs(p.p, Object.assign({ maxZoom: 14.5 }, PAD));
  }
  function focusStop() {
    var s = G.stops[S.mapx.stop]; if (s) MapView.fitPoints([[s.y + 0.0022, s.x + 0.003], [s.y - 0.0022, s.x - 0.003]], PAD);
  }

  /* -------------------------------------------------------------- legend */

  var LEGENDS = {
    night: [['sw sw--full', 'חסימה מלאה'], ['sw sw--part', 'חסימה חלקית'], ['sw sw--crit', 'ציר עוקף חסום'], ['dot dot--bus', 'אוטובוס בתנועה'], ['dot dot--hit', 'אוטובוס במקטע חסום']],
    detours: [['sw sw--route', 'מסלול הקו'], ['sw sw--orig', 'מקטע שמבוטל'], ['sw sw--alt', 'מסלול חלופי'], ['pin pin--x', 'תחנה מבוטלת'], ['pin pin--plus', 'תחנה חלופית']],
    map: [['sw sw--route', 'מסלול הקו שנבחר'], ['sw sw--full', 'חסימה מלאה'], ['sw sw--part', 'הפרעה אחרת'], ['dot dot--stop', 'תחנה']],
    gtfs: [['sw sw--orig', 'ההסטה שבכרטיסייה'], ['sw sw--rep', 'המסלול שדווח ב-GTFS'], ['pin pin--x', 'תחנה שנגרעה או הוזזה'], ['pin pin--plus', 'תחנה חדשה']]
  };
  function renderLegend() {
    var items = LEGENDS[S.view] || [];
    document.getElementById('legend').innerHTML = items.map(function (i) {
      return '<span class="lg"><i class="' + i[0] + '"></i>' + i[1] + '</span>';
    }).join('');
  }

  /* -------------------------------------------------------------- actions */

  var Actions = {
    go: function (id) {
      S.view = id; S.menu = false;
      render();
      if (id === 'night') (S.night.sel ? focusClosure() : MapView.fitAll());
      if (id === 'detours') focusTicket();
      if (id === 'gtfs') focusDelta();
      if (id === 'map') (S.mapx.pat != null ? focusLine() : S.mapx.stop != null ? focusStop() : MapView.fitAll());
    },
    menu: function () { S.menu = !S.menu; renderShell(); },
    role: function (id) {
      S.role = id; S.menu = false;
      S.night.sel = null; S.night.form = null; S.night.line = null;
      if (S.det.sel && tickets().every(function (t) { return t.id !== S.det.sel; })) S.det.sel = null;
      render();
      toast('עברתם לתצוגת ' + role().name + ', ' + role().sub);
    },
    roleGo: function (id) { S.role = id; S.menu = false; Actions.go(role().home); toast('עברתם לתצוגת ' + role().name + ', ' + role().sub); },

    openClosure: function (id) { S.view = 'night'; S.night.sel = id; S.night.line = null; S.night.form = null; render(); focusClosure(); document.getElementById('panel').scrollTop = 0; },
    nightSel: function (id) { S.night.sel = id || null; S.night.line = null; render(); focusClosure(); document.getElementById('panel').scrollTop = 0; },
    nightFilter: function (f) { S.night.filter = f; refresh(); },
    nightLine: function (key) { S.night.line = S.night.line === key ? null : key; refresh(); },
    nightBoth: function () { focusClosure(); },
    nightForm: function () {
      if (!can('night')) return toast('הזנת הסדר לילה פתוחה לקבלן ולמתאם התח"צ של הפרויקט', 'warn');
      stopPlaying();
      S.night.sel = null; S.night.line = null;
      S.night.form = { project: 'blue', contractor: role().ownOnly ? 'קבלן מבצע, מקטע רחובות' : '', oncall: '', segs: [], start: '22:00', end: '05:00', mode: 'single', kind: 'full' };
      render(); document.getElementById('panel').scrollTop = 0;
    },
    formCancel: function () { S.night.form = null; render(); },
    formClear: function () { S.night.form.segs = []; MapView.setSelection([]); Views.refreshForm(); },
    formSubmit: function () {
      var f = S.night.form;
      if (!f.segs.length) return toast('סמנו במפה לפחות מקטע אחד', 'warn');
      var start = parseHm(f.start), end = parseHm(f.end, start);
      if (start == null || end == null) return toast('חלון השעות אינו תקין', 'warn');
      if (start < 12 * 60) { start += 1440; end += 1440; }
      var first = G.seg[f.segs[0]];
      var c = {
        id: 'HL-' + (2630 + Sc.CLOSURES.length), project: f.project, city: first.city || 'המרחב', street: first.street || 'מקטע שסומן במפה',
        between: Math.round(f.segs.reduce(function (n, s) { return n + G.seg[s].l; }, 0)) + ' מטר שסומנו במפה',
        kind: f.kind, start: start, end: end, segs: f.segs.slice(), night: true, mine: true, fresh: true,
        dates: f.mode === 'series' ? 'סדרת לילות עוקבים, החל מ-22.11' : 'עבודה חד-יומית, 22.11', series: f.mode === 'series',
        contractor: f.contractor || 'לא צוין', oncall: f.oncall || 'לא צוין', purpose: 'הוזן בהזנה מקוצרת'
      };
      Sc.CLOSURES.push(c);
      recompute();
      S.night.form = null; S.night.sel = c.id; S.night.filter = 'all';
      S.minute = Math.max(Sc.NIGHT.start, Math.min(Sc.NIGHT.end - 1, c.start + 30));
      render(); focusClosure();
      var imp = S.impacts[c.id];
      toast(imp.lines.length ? 'ההסדר נקלט. נמצאו ' + imp.trips + ' נסיעות ב-' + lineCount(imp) + ' קווים בחלון החסימה' : 'ההסדר נקלט. אין נסיעות תח"צ בחלון החסימה');
    },
    handling: function (arg) {
      var parts = arg.split('|'); closureById(parts[0]).handling = parts[1]; refresh();
      toast('סטטוס הטיפול עודכן: ' + parts[1]);
    },
    newTicket: function (arg) {
      var at = arg.indexOf('|'), t = Views.newTicket(arg.slice(0, at), arg.slice(at + 1));
      if (!t) return;
      Actions.openTicket(t.id);
      var n = Object.keys(t.approvals).length;
      toast('הבקשה נקלטה. נפתח' + (n > 1 ? 'ו ' + n + ' משימות אישור, אחת לכל מחוז' : 'ה משימת אישור אחת'));
    },
    notifyOps: function (id) {
      var ops = operatorsOf(S.impacts[id]);
      toast('התראה מוקדמת נשלחה ל-' + plural(ops.length, 'מפעיל אחד', 'מפעילים') + ': ' + ops.join(', '));
    },
    openTicket: function (id) { S.view = 'detours'; S.det.sel = id; S.det.dir = 0; render(); focusTicket(); document.getElementById('panel').scrollTop = 0; },
    play: function () { togglePlay(); },

    detSel: function (id) { S.det.sel = id || null; S.det.dir = 0; render(); focusTicket(); document.getElementById('panel').scrollTop = 0; },
    detDir: function (i) { S.det.dir = +i; refresh(); focusTicket(); },
    decide: function (arg) {
      var parts = arg.split('|'), t = Sc.TICKETS.filter(function (x) { return x.id === parts[0]; })[0];
      var d = role().district, a = t.approvals[d];
      var note = (document.getElementById('decide-note') || {}).value || '';
      if (parts[1] !== 'approved' && !note.trim()) return toast('כתבו נימוק קצר לפני השליחה', 'warn');
      a.status = parts[1]; a.at = Sc.NOW.date + ' ' + Sc.NOW.time; a.note = note.trim();
      var who = 'ממונה תח"צ, ' + Sc.DISTRICTS[d].name;
      t.audit.push({ at: a.at, who: who, what: parts[1] === 'approved' ? 'אישר את ההסטה' : parts[1] === 'reserved' ? 'רשם הסתייגות' : 'דחה את ההסטה', more: a.note, fresh: true });
      var info = ticketInfo(t);
      if (info.status === 'approved') {
        t.audit.push({ at: a.at, who: 'המערכת', what: 'שלחה חיווי "הסדר מאושר לתח"צ" לקבלן ולמפעיל', more: t.op, fresh: true });
        toast('כל המחוזות אישרו. החיווי "מאושר לתח"צ" נשלח לקבלן ולמפעיל');
      } else toast('ההחלטה נרשמה ביומן המעקב');
      refresh();
    },
    remind: function (arg) {
      var parts = arg.split('|'), t = Sc.TICKETS.filter(function (x) { return x.id === parts[0]; })[0], a = t.approvals[parts[1]];
      a.reminders = (a.reminders || 0) + 1;
      t.audit.push({ at: Sc.NOW.date + ' ' + Sc.NOW.time, who: role().name + ', ' + role().sub, what: 'שלח התראה דחופה לממונה תח"צ, ' + Sc.DISTRICTS[parts[1]].name, more: 'ההסטה מתחילה הלילה ב-22:00', fresh: true });
      refresh();
      toast('התראה דחופה נשלחה לממונה תח"צ, ' + Sc.DISTRICTS[parts[1]].name);
    },

    mapPat: function (i) { S.mapx.pat = +i; S.mapx.q = ''; render(); focusLine(); document.getElementById('panel').scrollTop = 0; },
    mapStop: function (i) { S.mapx.stop = +i; S.mapx.pat = null; S.mapx.q = ''; render(); focusStop(); },
    mapClear: function () { S.mapx.pat = null; S.mapx.stop = null; S.mapx.q = ''; render(); MapView.fitAll(); },
    mapBackToStop: function () { S.mapx.pat = null; render(); focusStop(); },
    layer: function (k) { S.mapx.layers[k] = !S.mapx.layers[k]; refresh(); },
    propose: function () {
      if (!can('propose')) return toast('הצעת קונפליקט פתוחה למתאמי התח"צ של הפרויקטים', 'warn');
      S.mapx.propose = { at: null, type: 'רדיוס סיבוב צר לאוטובוס', severity: 'בינונית', text: '' };
      S.mapx.pat = null; S.mapx.stop = null; render();
    },
    proposeCancel: function () { S.mapx.propose = null; render(); },
    proposeSubmit: function () {
      var p = S.mapx.propose;
      if (!p.at) return toast('סמנו את מקום הקונפליקט במפה', 'warn');
      if (!p.text.trim()) return toast('הוסיפו תיאור קצר', 'warn');
      S.proposals.push({ id: 'KP-' + (30 + S.proposals.length), at: p.at, where: p.where, type: p.type, severity: p.severity, text: p.text.trim(), status: 'pending', by: role().name + ', ' + role().sub, when: Sc.NOW.date + ' ' + Sc.NOW.time, fresh: true });
      S.mapx.propose = null; render();
      toast('ההצעה הועברה למנהל המערכת ותישמר במאגר לאחר אישור');
    },
    exportBy: function (k) { S.mapx.exportBy = k; refresh(); },
    exportXlsx: function () { Views.exportXlsx(); },

    gtfsSel: function (id) { S.gtfs.sel = id || null; render(); focusDelta(); document.getElementById('panel').scrollTop = 0; }
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) { if (S.menu) { S.menu = false; renderShell(); } return; }
    if (el.disabled) return;
    var fn = Actions[el.getAttribute('data-act')];
    if (fn) fn(el.getAttribute('data-arg'));
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && S.menu) { S.menu = false; renderShell(); }
  });

  /* form fields write straight into the state */
  document.addEventListener('input', function (e) {
    var el = e.target, bind = el.getAttribute && el.getAttribute('data-bind');
    if (el.id === 'scrub-range') { stopPlaying(); setMinute(+el.value); return; }
    if (!bind) return;
    var path = bind.split('.'), obj = S;
    for (var i = 0; i < path.length - 1; i++) obj = obj[path[i]];
    obj[path[path.length - 1]] = el.value;
    if (bind === 'mapx.q') Views.refreshSearch();
    if (bind.indexOf('night.form') === 0) Views.refreshForm(el.type === 'radio');
  });

  /* tooltips for chart marks */
  var tip = null;
  ['mouseover', 'focusin'].forEach(function (type) { document.addEventListener(type, showTip); });
  function showTip(e) {
    var el = e.target.closest && e.target.closest('[data-tip]');
    if (!tip) tip = document.getElementById('tip');
    if (!el) { tip.className = 'tip'; return; }
    tip.innerHTML = el.getAttribute('data-tip');
    tip.className = 'tip is-on';
    var r = el.getBoundingClientRect(), w = tip.offsetWidth;
    tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
    var above = r.top - tip.offsetHeight - 8;
    tip.style.top = (above < 8 ? r.bottom + 8 : above) + 'px';
  }
  document.addEventListener('focusout', function () { if (tip) tip.className = 'tip'; });

  /* ---------------------------------------------------------------- start */

  function start() {
    G = root.G = Engine.build(root.CORRIDOR);
    Sc.resolve(G, Engine);
    recompute();
    var seed = G.stops.filter(function (s) { return s.c === '34696'; })[0];
    if (seed) S.proposals.push({
      id: 'KP-27', at: [seed.y, seed.x], where: 'בנימין, רחובות', type: 'רדיוס סיבוב צר לאוטובוס', severity: 'גבוהה',
      text: 'בפנייה מבנימין למנוחה ונחלה אוטובוס מפרקי חוצה לנתיב הנגדי. הציר משמש כעוקף לחסימת הרצל.',
      status: 'pending', by: 'מתאם תח"צ בפרויקט, הקו הכחול', when: '21.11.2026 11:05'
    });
    MapView.init(document.getElementById('map'), G);
    document.getElementById('scrub').innerHTML =
      '<button class="scrub-play" data-act="play"></button>' +
      '<div class="scrub-now"><span class="scrub-time num"></span><span class="scrub-count"></span></div>' +
      '<div class="scrub-track" dir="ltr"><input id="scrub-range" type="range" min="' + Sc.NIGHT.start + '" max="' + Sc.NIGHT.end + '" step="5" aria-label="שעה בלילה">' +
      '<div class="scrub-ticks">' + [22, 23, 0, 1, 2, 3, 4, 5].map(function (h) { return '<span class="num">' + String(h).padStart(2, '0') + ':00</span>'; }).join('') + '</div></div>';
    document.getElementById('now').innerHTML = Sc.NOW.day + ' ' + ltr(Sc.NOW.date) + ', ' + ltr(Sc.NOW.time);
    window.addEventListener('resize', function () { MapView.resize(); });
    render();
    MapView.fitAll({ instant: true });
    document.body.classList.add('is-ready');
  }

  root.App = {
    S: S, esc: esc, ltr: ltr, hm: hm, km: km, plural: plural, uniq: uniq, icon: icon, levelChip: levelChip, lineBadge: lineBadge,
    role: role, can: can, parse: parseHm, render: render, refresh: refresh, closures: closures, closureById: closureById, tickets: tickets, lineCount: lineCount,
    operatorsOf: operatorsOf, lineRows: lineRows, ticketInfo: ticketInfo, streetsOf: streetsOf,
    LEVELS: LEVELS, KIND_ICON: KIND_ICON, TICKET_STATUS: TICKET_STATUS, APPROVAL: APPROVAL, toast: toast, start: start
  };
})(this);
