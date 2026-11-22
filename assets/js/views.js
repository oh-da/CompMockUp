/* The panels of each view. Every function returns an HTML string. */
(function (root) {
  'use strict';

  var A = root.App, Sc = root.Scenario, S = A.S;
  var esc = A.esc, ltr = A.ltr, hm = A.hm, icon = A.icon, plural = A.plural, uniq = A.uniq, lb = A.lineBadge;
  function G() { return root.G; }

  function project(c) { return Sc.PROJECTS[c.project] || { name: '', owner: '' }; }
  function windowText(c) { return hm(c.start) + ' עד ' + hm(c.end); }
  function stopChips(list, cls) {
    return '<ul class="stops ' + (cls || '') + '">' + list.map(function (i) {
      return '<li>' + esc(G().stops[i].n) + '</li>';
    }).join('') + '</ul>';
  }
  function dateRange(s) { return s.from === s.to ? ltr(s.from) : ltr(s.from) + ' עד ' + ltr(s.to); }
  function daysSince(stamp) {
    var p = /^(\d+)\.(\d+)\.(\d+)/.exec(stamp), n = /^(\d+)\.(\d+)\.(\d+)/.exec(Sc.NOW.date);
    return Math.round((new Date(+n[3], n[2] - 1, +n[1]) - new Date(+p[3], p[2] - 1, +p[1])) / 864e5);
  }
  function patDistricts(p) {
    var list;
    if (p.full) list = p.full.map(function (s) { return s[3] > 34.97 && s[2] < 31.95 ? 'jer' : Sc.districtOfCity(s[1]); });
    else list = [Sc.districtOfCity(p.fc), Sc.districtOfCity(p.tc)];
    var runs = [];
    list.forEach(function (d) {
      if (runs.length && runs[runs.length - 1].id === d) runs[runs.length - 1].n++;
      else runs.push({ id: d, n: 1 });
    });
    return runs;
  }

  /* ----------------------------------------------------------------- charts */

  /* Passes through a closed stretch, in half-hour bins, 21:00 to 06:00. */
  function passChart(passes, c) {
    var from = 21 * 60, to = 30 * 60, step = 30, bins = [], i;
    for (i = from; i < to; i += step) bins.push(0);
    passes.forEach(function (t) { if (t >= from && t < to) bins[Math.floor((t - from) / step)]++; });
    var max = Math.max(4, Math.max.apply(null, bins));
    var W = 392, H = 118, padL = 22, padB = 22, padT = 8, plotW = W - padL - 4, plotH = H - padB - padT;
    var bw = plotW / bins.length;
    var x = function (t) { return padL + (t - from) / (to - from) * plotW; };
    var svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="נסיעות שעוברות במקטע לפי חצי שעה">';
    svg += '<rect class="ch-window" x="' + x(c.start) + '" y="' + padT + '" width="' + (x(c.end) - x(c.start)) + '" height="' + plotH + '" rx="3"/>';
    [0, max / 2, max].forEach(function (v) {
      var y = padT + plotH - v / max * plotH;
      svg += '<line class="ch-grid" x1="' + padL + '" x2="' + (W - 4) + '" y1="' + y + '" y2="' + y + '"/>' +
        '<text class="ch-axis" x="' + (padL - 5) + '" y="' + (y + 3.5) + '" text-anchor="end">' + Math.round(v) + '</text>';
    });
    bins.forEach(function (n, k) {
      var t = from + k * step, inside = t >= c.start && t < c.end;
      var h = n / max * plotH, bx = padL + k * bw + 1.5, y = padT + plotH - h;
      var tipText = hm(t) + ' עד ' + hm(t + step) + ': <b>' + plural(n, 'נסיעה אחת', 'נסיעות') + '</b>' + (inside && n ? '<br>בתוך חלון החסימה' : '');
      if (n) svg += '<path class="ch-bar' + (inside ? ' ch-bar--in' : '') + '" d="' + roundTop(bx, y, bw - 3, h, 3) + '"/>';
      svg += '<rect class="ch-hit" x="' + (padL + k * bw) + '" y="' + padT + '" width="' + bw + '" height="' + plotH + '" data-tip="' + esc(tipText) + '"/>';
    });
    for (i = from; i <= to; i += 60) {
      svg += '<text class="ch-axis" x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + String(Math.floor(i / 60) % 24).padStart(2, '0') + '</text>';
    }
    return svg + '</svg>';
  }

  function roundTop(x, y, w, h, r) {
    r = Math.min(r, h, w / 2);
    return 'M' + x + ' ' + (y + h) + 'V' + (y + r) + 'Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ' ' + y + ' ' + (x + w) + ' ' + (y + r) + 'V' + (y + h) + 'Z';
  }

  /* 24 bars: trips by hour of the day. */
  function dayChart(hours, label) {
    var max = Math.max(4, Math.max.apply(null, hours));
    var W = 392, H = 108, padL = 22, padB = 22, padT = 8, plotW = W - padL - 4, plotH = H - padB - padT, bw = plotW / 24;
    var svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(label) + '">';
    [0, max / 2, max].forEach(function (v) {
      var y = padT + plotH - v / max * plotH;
      svg += '<line class="ch-grid" x1="' + padL + '" x2="' + (W - 4) + '" y1="' + y + '" y2="' + y + '"/>' +
        '<text class="ch-axis" x="' + (padL - 5) + '" y="' + (y + 3.5) + '" text-anchor="end">' + Math.round(v) + '</text>';
    });
    hours.forEach(function (n, hr) {
      var h = n / max * plotH, bx = padL + hr * bw + 1.5, y = padT + plotH - h;
      if (n) svg += '<path class="ch-bar ch-bar--line" d="' + roundTop(bx, y, bw - 3, h, 3) + '"/>';
      svg += '<rect class="ch-hit" x="' + (padL + hr * bw) + '" y="' + padT + '" width="' + bw + '" height="' + plotH +
        '" data-tip="' + esc(String(hr).padStart(2, '0') + ':00 עד ' + String((hr + 1) % 24).padStart(2, '0') + ':00: <b>' + plural(n, 'נסיעה אחת', 'נסיעות') + '</b>') + '"/>';
      if (hr % 3 === 0) svg += '<text class="ch-axis" x="' + (padL + hr * bw + bw / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + String(hr).padStart(2, '0') + '</text>';
    });
    return svg + '</svg>';
  }

  /* Horizontal bars with a direct value label. rows: [{label, value, tip}] */
  function barList(rows, cls) {
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([1]));
    return '<div class="hbars ' + (cls || '') + '">' + rows.map(function (r) {
      return '<div class="hbar" data-tip="' + esc(r.tip || (r.label + ': <b>' + r.value + '</b>')) + '"><span class="hbar-l">' + esc(r.label) + '</span>' +
        '<span class="hbar-t"><i style="width:' + Math.max(1.5, r.value / max * 100) + '%"></i></span><span class="hbar-v num">' + r.value + '</span></div>';
    }).join('') + '</div>';
  }

  /* ================================================================ NIGHT */

  function nightSummary(list) {
    var hit = list.filter(function (c) { return S.impacts[c.id].lines.length; }).length;
    var crit = list.filter(function (c) { return S.impacts[c.id].level === 'critical'; }).length;
    var text = plural(list.length, 'חסימה אחת מתוכננת', 'חסימות מתוכננות') + ' במרחב. ';
    text += hit ? plural(hit, 'אחת פוגעת', 'פוגעות') + ' בנסיעות תח"צ' : 'אף אחת אינה פוגעת בנסיעות תח"צ';
    if (crit) text += ', וב' + (crit === 1 ? 'אחת מהן' : '-' + crit + ' מהן') + ' גם הציר העוקף חסום באותן שעות';
    return text + '.';
  }

  function nightItem(c) {
    var imp = S.impacts[c.id], lines = A.lineCount(imp);
    var summary = imp.lines.length
      ? '<b class="num">' + imp.trips + '</b> נסיעות ב-<b class="num">' + lines + '</b> קווים' + (c.kind === 'full' && imp.stops.length ? ', ' + plural(imp.stops.length, 'תחנה אחת', 'תחנות') + ' לא ישורתו' : '')
      : 'אין נסיעות תח"צ בחלון החסימה';
    return '<li><button class="card card--' + imp.level + (c.fresh ? ' card--fresh' : '') + '" data-act="nightSel" data-arg="' + c.id + '">' +
      '<span class="card-top"><span class="card-title">' + esc(c.street) + ', ' + esc(c.city) + '</span><span class="card-time num ltr">' + hm(c.start) + '–' + hm(c.end) + '</span></span>' +
      '<span class="card-sub">' + esc(c.between) + '. ' + esc(project(c).name) + '</span>' +
      '<span class="card-row">' + A.levelChip(imp.level) + '<span class="tag">' + icon(A.KIND_ICON[c.kind]) + Sc.KINDS[c.kind].short + '</span></span>' +
      '<span class="card-sum">' + summary + '</span>' +
      (imp.bypassBlockedBy ? '<span class="card-flag">' + icon('flag') + 'העוקף דרך ' + esc(imp.bypassBlockedBy.street) + ' חסום במקביל</span>' : '') +
      '</button></li>';
  }

  function nightList() {
    var all = A.closures(), N = S.night;
    var attention = all.filter(function (c) { var l = S.impacts[c.id].level; return l === 'critical' || l === 'serious'; });
    var list = (N.filter === 'attention' ? attention : all).slice().sort(function (a, b) {
      var rank = { critical: 0, serious: 1, warning: 2, none: 3 };
      return rank[S.impacts[a.id].level] - rank[S.impacts[b.id].level] || S.impacts[b.id].trips - S.impacts[a.id].trips;
    });
    return '<header class="ph"><h1>הלילה הקרוב</h1><p class="ph-sub">' + Sc.NOW.night + ', מ-22:00 עד 05:00</p></header>' +
      '<p class="lede">' + nightSummary(all) + '</p>' +
      '<div class="toolbar"><div class="seg" role="group" aria-label="סינון">' +
      '<button class="' + (N.filter === 'all' ? 'is-on' : '') + '" data-act="nightFilter" data-arg="all">הכול <span class="num">' + all.length + '</span></button>' +
      '<button class="' + (N.filter === 'attention' ? 'is-on' : '') + '" data-act="nightFilter" data-arg="attention">דורש טיפול <span class="num">' + attention.length + '</span></button></div>' +
      '<button class="btn btn--primary' + (A.can('night') ? '' : ' is-soft') + '" data-act="nightForm">' + icon('plus') + 'הזנת הסדר לילה</button></div>' +
      (list.length ? '<ul class="cards">' + list.map(nightItem).join('') + '</ul>'
        : '<p class="empty">אין הלילה חסימות שדורשות טיפול.</p>') +
      (A.role().ownOnly ? '<p class="note">' + icon('eye') + 'בתפקיד קבלן מוצגים ההסדרים שלכם בלבד.</p>' : '');
  }

  function bypassAlert(c, imp) {
    var b = imp.bypassBlockedBy;
    var caught = imp.lines.filter(function (l) { return l.bypassBlockedBy; });
    var trips = 0, extra = 0, n = 0;
    caught.forEach(function (l) {
      trips += l.hit.filter(function (t) { return t >= l.bypassWindow.start && t < l.bypassWindow.end; }).length;
      if (l.detour && !l.detour.blocked && l.naturalDetour) { extra += l.detour.extra - l.naturalDetour.extra; n++; }
    });
    var lines = uniq(caught.map(function (l) { return l.pat.no; }));
    var ov = caught[0].bypassWindow;
    return '<div class="alert alert--critical">' + icon('flag') + '<div><strong>ציר עוקף חסום במקביל</strong>' +
      '<p>בין ' + hm(ov.start) + ' ל-' + hm(ov.end) + ' חסום גם רחוב ' + esc(b.street) + ' (' + esc(project(b).name) + ', ' + b.id + '), שהוא העוקף הקצר של ' +
      plural(lines.length, 'קו אחד', 'קווים') + '. ' + plural(trips, 'נסיעה אחת נשארת', 'נסיעות נשארות') + ' בלי עוקף קצר' +
      (n && extra / n > 50 ? ', והעוקף שנותר ארוך בעוד ' + (extra / n / 1000).toFixed(1) + ' ק"מ בממוצע' : '') + '.</p>' +
      '<div class="alert-lines">' + lines.map(function (x) { return lb(x); }).join('') + '</div>' +
      '<button class="btn btn--ghost" data-act="nightBoth">' + icon('map') + 'הצגת שתי החסימות במפה</button></div></div>';
  }

  var HANDLING = ['חדש', 'בטיפול', 'תואם מול הקבלן', 'נסגר'];
  function handling(c) {
    var cur = c.handling || 'חדש';
    if (!A.can('status')) return '<p class="handling">סטטוס טיפול של מתאם התח"צ: <b>' + esc(cur) + '</b></p>';
    return '<div class="handling"><span>סטטוס טיפול</span><div class="seg" role="group" aria-label="סטטוס טיפול">' + HANDLING.map(function (h) {
      return '<button class="' + (h === cur ? 'is-on' : '') + '" data-act="handling" data-arg="' + c.id + '|' + h + '">' + h + '</button>';
    }).join('') + '</div></div>';
  }

  function nightDetail(c) {
    var imp = S.impacts[c.id], rows = A.lineRows(imp), N = S.night, pr = project(c);
    var tix = Sc.TICKETS.filter(function (t) { return t.closure === c.id; });
    var html = '<button class="back" data-act="nightSel" data-arg="">' + icon('back') + 'כל חסימות הלילה</button>' +
      '<header class="ph"><h1>' + esc(c.street) + ', ' + esc(c.city) + '</h1><p class="ph-sub">' + esc(c.between) + '</p>' +
      '<div class="chips">' + A.levelChip(imp.level) + '<span class="tag">' + icon(A.KIND_ICON[c.kind]) + Sc.KINDS[c.kind].short + '</span><span class="tag tag--id num">' + c.id + '</span></div></header>';

    html += handling(c);
    if (imp.bypassBlockedBy) html += bypassAlert(c, imp);
    else if (!imp.lines.length) html += '<div class="alert alert--good">' + icon('check') + '<div><strong>אין קונפליקט עם תח"צ</strong><p>בחלון החסימה לא עוברת במקטע אף נסיעה. בדיקה לפי תאריך בלבד הייתה מסמנת כאן קונפליקט.</p></div></div>';
    else if (c.kind !== 'full') html += '<div class="alert alert--warning">' + icon('clock') + '<div><strong>המסלולים נשארים, צפוי עיכוב</strong><p>' + esc(Sc.KINDS[c.kind].label) + '. הקווים ממשיכים במסלולם ואין צורך בהסטה.</p></div></div>';

    html += '<div class="figs"><div><b class="num">' + imp.trips + '</b><span>נסיעות בחלון החסימה</span></div>' +
      '<div><b class="num">' + A.lineCount(imp) + '</b><span>קווים</span></div>' +
      '<div><b class="num">' + imp.stops.length + '</b><span>' + (c.kind === 'full' ? 'תחנות שלא ישורתו' : 'תחנות במקטע') + '</span></div></div>';

    html += '<section class="sec"><h2>נסיעות שעוברות במקטע, לפי חצי שעה</h2>' + passChart(imp.passes, c) +
      '<p class="cap"><i class="key key--in"></i>בתוך חלון החסימה<i class="key key--out"></i>לפניו ואחריו</p></section>';

    html += '<section class="sec"><h2>פרטי ההסדר</h2><dl class="facts">' +
      '<dt>פרויקט וקבלן</dt><dd>' + esc(pr.name) + ', ' + esc(pr.owner) + '<br>' + esc(c.contractor) + '</dd>' +
      '<dt>איש קשר תורן</dt><dd>' + esc(c.oncall) + '</dd>' +
      '<dt>חלון שעות</dt><dd class="num">' + windowText(c) + '</dd>' +
      '<dt>תאריכי ביצוע</dt><dd>' + esc(c.dates) + '</dd>' +
      '<dt>סיווג השפעה</dt><dd>' + esc(Sc.KINDS[c.kind].label) + '</dd>' +
      '<dt>מהות העבודה</dt><dd>' + esc(c.purpose) + '</dd></dl></section>';

    if (rows.length) {
      html += '<section class="sec"><h2>קווים שנפגעים, לפי כיוון <span class="count num">' + A.lineCount(imp) + '</span></h2>' +
        (c.kind === 'full' ? '<p class="hint">לחיצה על קו מציגה במפה את מסלולו ואת העוקף הקצר ביותר.</p>' : '') +
        '<ul class="lines">' + rows.map(function (r) {
          var d = r.line.detour, side = '';
          if (c.kind === 'full') {
            side = r.blocked ? '<span class="lvl lvl--critical">' + icon('flag') + 'עוקף חסום</span>'
              : d && !d.blocked && d.refs.length ? '<span class="extra num">' + A.km(d.extra) + '</span>'
                : '<span class="extra">קיצור מסלול</span>';
          }
          return '<li><button class="line' + (N.line === r.key ? ' is-on' : '') + '" data-act="nightLine" data-arg="' + esc(r.key) + '">' + lb(r.pat.no) +
            '<span class="line-main"><span>לכיוון ' + esc(r.pat.tc) + '</span><small>' + esc(r.pat.op) + '</small></span>' +
            '<span class="line-n"><b class="num">' + r.hit.length + '</b><small class="num ltr">' + hm(r.hit[0]) + (r.hit.length > 1 ? '–' + hm(r.hit[r.hit.length - 1]) : '') + '</small></span>' + side + '</button>' +
            (N.line === r.key && d && !d.blocked && d.refs.length ? '<div class="line-more">' +
              (r.blocked ? '<p>העוקף הקצר (מקווקו באדום) עובר ברחוב חסום. העוקף שנותר: דרך ' + esc(A.streetsOf(d.refs).join(', ')) + '.</p>' : '<p>עוקף דרך ' + esc(A.streetsOf(d.refs).join(', ')) + '.</p>') +
              (d.skipped.length ? '<p class="hint">תחנות שמדולגות: ' + esc(d.skipped.map(function (i) { return G().stops[i].n; }).join(', ')) + '</p>' : '') +
              ticketButton(c, r) + '</div>' : '') + '</li>';
        }).join('') + '</ul></section>';
    }

    if (imp.stops.length) {
      html += '<section class="sec"><h2>' + (c.kind === 'full' ? 'תחנות שלא ישורתו' : 'תחנות במקטע') + ' <span class="count num">' + imp.stops.length + '</span></h2>' + stopChips(imp.stops, c.kind === 'full' ? 'stops--x' : '') + '</section>';
    }

    if (tix.length) {
      html += '<section class="sec"><h2>כרטיסיות הסטה להסדר</h2><ul class="mini">' + tix.map(function (t) {
        var st = A.TICKET_STATUS[A.ticketInfo(t).status];
        return '<li><button data-act="openTicket" data-arg="' + t.id + '">' + lb(t.line) + '<span>' + t.id + '</span><span class="lvl lvl--' + st.level + '">' + icon(st.icon) + st.label + '</span>' + icon('back', 'ic--go') + '</button></li>';
      }).join('') + '</ul></section>';
    }
    if (imp.lines.length && !A.role().ownOnly) {
      html += '<div class="actions"><button class="btn" data-act="notifyOps" data-arg="' + c.id + '">' + icon('send') + 'התראה מוקדמת למפעילים</button></div>';
    }
    return html;
  }

  function ticketButton(c, r) {
    var has = Sc.TICKETS.filter(function (t) { return t.closure === c.id && t.line === r.pat.no && t.op === r.pat.op; })[0];
    if (has) return '<button class="link" data-act="openTicket" data-arg="' + has.id + '">' + icon('detour') + 'כרטיסיית הסטה ' + has.id + '</button>';
    if (!(A.can('request') || A.can('propose'))) return '';
    return '<button class="btn" data-act="newTicket" data-arg="' + esc(c.id + '|' + r.key) + '">' + icon('plus') + 'הגשת בקשת הסטה לקו ' + esc(r.pat.no) + '</button>';
  }

  /* A new detour request: the districts on the line's route are detected
     and each gets its own approval task. */
  function newTicket(closureId, key) {
    var c = A.closureById(closureId), row = A.lineRows(S.impacts[c.id]).filter(function (r) { return r.key === key; })[0];
    if (!row) return null;
    var stamp = Sc.NOW.date + ' ' + Sc.NOW.time, who = A.role().name + ', ' + A.role().sub;
    var ds = uniq(patDistricts(row.pat).map(function (x) { return x.id; })), approvals = {};
    ds.forEach(function (d) { approvals[d] = { status: 'pending', asked: stamp, reminders: 0 }; });
    var t = {
      id: 'DT-0' + (426 + Sc.TICKETS.length), closure: c.id, line: row.pat.no, op: row.pat.op, mine: true,
      title: 'הסטת קו ' + row.pat.no + ' מרחוב ' + c.street + ', ' + c.city,
      schedule: { from: Sc.NOW.date, to: Sc.NOW.date, days: c.series ? 'סדרת לילות' : 'לילה אחד', hours: hm(c.start) + ' עד ' + hm(c.end) },
      drawing: 'טרם צורף שרטוט', approvals: approvals,
      audit: [
        { at: stamp, who: who, what: 'הגיש בקשת הסטה', more: 'המסלול החלופי חושב מתוך ההסדר ' + c.id, fresh: true },
        { at: stamp, who: 'המערכת', what: ds.length > 1 ? 'זיהתה ' + ds.length + ' מחוזות על מסלול הקו ופתחה משימת אישור לכל אחד' : 'זיהתה מחוז אחד על מסלול הקו ופתחה משימת אישור',
          more: ds.map(function (d) { return Sc.DISTRICTS[d].name; }).join(', '), fresh: true }
      ]
    };
    Sc.TICKETS.push(t);
    return t;
  }

  function formResult(f) {
    if (!f.segs.length) return '<p class="hint">הבדיקה תרוץ ברגע שיסומן מקטע.</p>';
    var start = A.parse(f.start), end = A.parse(f.end, start);
    if (start == null || end == null) return '<p class="hint">הזינו חלון שעות תקין.</p>';
    if (start < 12 * 60) { start += 1440; end += 1440; }
    var imp = Engine.impact(G(), { segs: f.segs, start: start, end: end, kind: f.kind }, Sc.CLOSURES);
    if (!imp.lines.length) return '<div class="result result--none">' + A.levelChip('none') + '<p>בחלון ' + hm(start) + ' עד ' + hm(end) + ' לא עוברת במקטע אף נסיעת תח"צ.</p></div>';
    return '<div class="result result--' + imp.level + '">' + A.levelChip(imp.level) +
      '<p><b class="num">' + imp.trips + '</b> נסיעות ב-<b class="num">' + A.lineCount(imp) + '</b> קווים, ' + plural(imp.stops.length, 'תחנה אחת', 'תחנות') + ' במקטע.</p>' +
      '<div class="alert-lines">' + uniq(imp.lines.map(function (l) { return l.pat.no; })).slice(0, 14).map(function (x) { return lb(x); }).join('') + '</div>' +
      (imp.bypassBlockedBy ? '<p class="result-flag">' + icon('flag') + 'העוקף הקצר עובר ב' + esc(imp.bypassBlockedBy.street) + ', שחסום באותן שעות (' + imp.bypassBlockedBy.id + ').</p>' : '') + '</div>';
  }

  function formSegs(f) {
    if (!f.segs.length) return '<p class="pick">' + icon('pin') + 'לחצו על רחוב במפה כדי לסמן מקטע חסום. לחיצה נוספת מבטלת.</p>';
    var by = {}, total = 0;
    f.segs.forEach(function (i) {
      var s = G().seg[i], key = (s.street || 'מקטע ללא שם') + (s.city ? ', ' + s.city : '');
      by[key] = (by[key] || 0) + s.l; total += s.l;
    });
    return '<ul class="picked">' + Object.keys(by).map(function (k) {
      return '<li><span>' + esc(k) + '</span><span class="num">' + Math.round(by[k]) + ' מ׳</span></li>';
    }).join('') + '</ul><button class="link" data-act="formClear">ניקוי הסימון</button>';
  }

  function radios(name, bind, value, options) {
    return '<div class="radios">' + options.map(function (o) {
      return '<label class="radio' + (value === o[0] ? ' is-on' : '') + '"><input type="radio" name="' + name + '" value="' + o[0] + '" data-bind="' + bind + '"' + (value === o[0] ? ' checked' : '') + '>' + (o[2] ? icon(o[2]) : '') + esc(o[1]) + '</label>';
    }).join('') + '</div>';
  }

  function nightForm(f) {
    return '<button class="back" data-act="formCancel">' + icon('back') + 'ביטול וחזרה לרשימה</button>' +
      '<header class="ph"><h1>הזנת הסדר לילה</h1><p class="ph-sub">חמישה שדות חובה. בדיקת הקונפליקטים רצה תוך כדי ההזנה.</p></header>' +
      '<form class="form" onsubmit="return false">' +
      '<fieldset><legend>פרויקט, קבלן ואיש קשר תורן</legend>' +
      '<label class="field"><span>פרויקט</span><select data-bind="night.form.project">' + Object.keys(Sc.PROJECTS).map(function (k) {
        return '<option value="' + k + '"' + (f.project === k ? ' selected' : '') + '>' + esc(Sc.PROJECTS[k].name + ', ' + Sc.PROJECTS[k].owner) + '</option>';
      }).join('') + '</select></label>' +
      '<div class="field-row"><label class="field"><span>קבלן מבצע</span><input type="text" data-bind="night.form.contractor" value="' + esc(f.contractor) + '" placeholder="שם הקבלן"></label>' +
      '<label class="field"><span>איש קשר תורן לילה</span><input type="text" data-bind="night.form.oncall" value="' + esc(f.oncall) + '" placeholder="שם וטלפון"></label></div></fieldset>' +
      '<fieldset><legend>מקטע חסום</legend><div id="form-segs">' + formSegs(f) + '</div></fieldset>' +
      '<fieldset><legend>חלון שעות</legend><div class="field-row field-row--time"><label class="field"><span>משעה</span><input type="text" class="time" inputmode="numeric" maxlength="5" placeholder="22:00" data-bind="night.form.start" value="' + esc(f.start) + '"></label>' +
      '<label class="field"><span>עד שעה</span><input type="text" class="time" inputmode="numeric" maxlength="5" placeholder="05:00" data-bind="night.form.end" value="' + esc(f.end) + '"></label></div></fieldset>' +
      '<fieldset><legend>תאריכי ביצוע</legend>' + radios('mode', 'night.form.mode', f.mode, [['single', 'עבודה חד-יומית, הלילה'], ['series', 'סדרת לילות עוקבים']]) + '</fieldset>' +
      '<fieldset><legend>סיווג ההשפעה על התח"צ</legend>' + radios('kind', 'night.form.kind', f.kind, Object.keys(Sc.KINDS).map(function (k) { return [k, Sc.KINDS[k].label, A.KIND_ICON[k]]; })) + '</fieldset>' +
      '<div class="form-foot"><h2>בדיקת קונפליקטים מול התח"צ</h2><div id="form-result">' + formResult(f) + '</div>' +
      '<div class="actions"><button class="btn btn--primary" data-act="formSubmit">' + icon('check') + 'קליטת ההסדר</button><button class="btn" data-act="formCancel">ביטול</button></div></div></form>';
  }

  function night() {
    var N = S.night;
    if (N.form) return nightForm(N.form);
    var c = N.sel && A.closureById(N.sel);
    return c ? nightDetail(c) : nightList();
  }

  function refreshForm(full) {
    var f = S.night.form; if (!f) return;
    if (full) return A.refresh();
    var a = document.getElementById('form-segs'), b = document.getElementById('form-result');
    if (a) a.innerHTML = formSegs(f);
    if (b) b.innerHTML = formResult(f);
  }

  /* ============================================================== DETOURS */

  function districtDots(t) {
    return '<span class="ddots">' + Object.keys(t.approvals).map(function (k) {
      var a = A.APPROVAL[t.approvals[k].status];
      return '<span class="ddot ddot--' + a.level + '">' + icon(a.icon) + Sc.DISTRICTS[k].short + '</span>';
    }).join('') + '</span>';
  }

  function detourList() {
    var list = A.tickets().slice().sort(function (a, b) {
      var rank = { partial: 0, rejected: 0, pending: 1, approved: 2 };
      return rank[A.ticketInfo(a).status] - rank[A.ticketInfo(b).status];
    });
    var d = A.role().district;
    var mine = d ? list.filter(function (t) { return t.approvals[d] && t.approvals[d].status === 'pending'; }).length : 0;
    var partial = list.filter(function (t) { return A.ticketInfo(t).status === 'partial'; }).length;
    var lede = d
      ? (mine ? plural(mine, 'הסטה אחת ממתינה', 'הסטות ממתינות') + ' להחלטה שלכם ב' + Sc.DISTRICTS[d].name + '.' : 'אין הסטות שממתינות להחלטה שלכם.')
      : (partial ? plural(partial, 'הסטה אחת נמצאת', 'הסטות נמצאות') + ' באישור חלקי, ולכן אינן מאושרות לביצוע.' : 'אין הסטות באישור חלקי.');
    return '<header class="ph"><h1>הסטות מסלול</h1><p class="ph-sub">כל הסטה נשלחת לאישור כל המחוזות שעל מסלול הקו</p></header>' +
      '<p class="lede">' + lede + '</p>' +
      '<ul class="cards">' + list.map(function (t) {
        var info = A.ticketInfo(t), st = A.TICKET_STATUS[info.status];
        var need = d && t.approvals[d] && t.approvals[d].status === 'pending';
        return '<li><button class="card card--' + st.level + '" data-act="detSel" data-arg="' + t.id + '">' +
          '<span class="card-top"><span class="card-title">' + lb(t.line) + esc(t.title.replace('הסטת קו ' + t.line + ' ', '')) + '</span></span>' +
          '<span class="card-sub">' + esc(t.op) + ', ' + ltr(t.id) + ', ' + dateRange(t.schedule) + '</span>' +
          '<span class="card-row"><span class="lvl lvl--' + st.level + '">' + icon(st.icon) + st.label + '</span>' + districtDots(t) + '</span>' +
          (need ? '<span class="card-flag card-flag--todo">' + icon('clock') + 'ממתין להחלטה שלכם</span>' : '') + '</button></li>';
      }).join('') + '</ul>';
  }

  function districtStrip(pat) {
    var runs = patDistricts(pat), total = runs.reduce(function (n, r) { return n + r.n; }, 0);
    return '<div class="strip"><div class="strip-ends"><span>' + esc(pat.fc) + '</span><span>' + esc(pat.tc) + '</span></div>' +
      '<div class="strip-bar">' + runs.map(function (r) {
        return '<span class="strip-part strip-part--' + r.id + '" style="flex:' + Math.max(r.n / total, 0.22) + '">' + esc(Sc.DISTRICTS[r.id].short) +
          (pat.full ? '<small class="num">' + plural(r.n, 'תחנה אחת', 'תחנות') + '</small>' : '') + '</span>';
      }).join('') + '</div></div>';
  }

  function approvalCard(t, key, info) {
    var a = t.approvals[key], meta = A.APPROVAL[a.status], r = A.role(), mine = r.district === key;
    var html = '<li class="appr appr--' + meta.level + '"><div class="appr-head"><div><strong>' + esc(Sc.DISTRICTS[key].name) + '</strong><span>ממונה תח"צ מחוזי</span></div>' +
      '<span class="lvl lvl--' + meta.level + '">' + icon(meta.icon) + meta.label + '</span></div>';
    if (a.status === 'pending') {
      var days = daysSince(a.asked);
      html += '<p class="appr-meta">המשימה נפתחה ב-' + ltr(a.asked) + (days ? ', לפני ' + plural(days, 'יום', 'ימים') : ', היום') +
        (a.reminders ? '. ' + plural(a.reminders, 'נשלחה תזכורת אחת', 'נשלחו תזכורות') : '') + '.</p>';
      if (mine && A.can('approve')) {
        html += '<div class="decide"><label class="field"><span>הערה או נימוק (חובה בהסתייגות ובדחייה)</span><textarea id="decide-note" rows="2" placeholder="למשל: נדרשת תחנה חלופית מונגשת"></textarea></label>' +
          '<div class="actions"><button class="btn btn--approve" data-act="decide" data-arg="' + t.id + '|approved">' + icon('check') + 'אישור ההסטה</button>' +
          '<button class="btn" data-act="decide" data-arg="' + t.id + '|reserved">הסתייגות</button>' +
          '<button class="btn btn--danger" data-act="decide" data-arg="' + t.id + '|rejected">דחייה</button></div></div>';
      } else if (!r.ownOnly) {
        html += '<div class="actions"><button class="btn" data-act="remind" data-arg="' + t.id + '|' + key + '">' + icon('send') + 'שליחת התראה דחופה</button></div>';
      }
    } else {
      html += '<p class="appr-meta">' + ltr(a.at) + (a.note ? '</p><p class="appr-note">' + esc(a.note) : '') + '</p>';
    }
    return html + '</li>';
  }

  function ticketBanner(t, info) {
    var keys = info.districts, D = Sc.DISTRICTS;
    var done = keys.filter(function (k) { return t.approvals[k].status === 'approved'; });
    var open = keys.filter(function (k) { return t.approvals[k].status !== 'approved'; });
    if (info.status === 'approved') {
      return '<div class="alert alert--good">' + icon('check') + '<div><strong>הסדר מאושר לתח"צ</strong><p>' +
        (keys.length > 1 ? 'כל ' + keys.length + ' המחוזות שעל מסלול הקו אישרו.' : 'המחוז היחיד שעל מסלול הקו אישר.') + ' החיווי נשלח לקבלן ולמפעיל.</p></div></div>';
    }
    if (info.status === 'partial') {
      return '<div class="alert alert--critical">' + icon('alert') + '<div><strong>הסטה באישור חלקי. לא מאושרת לביצוע</strong><p>' +
        (done.length ? esc(done.map(function (k) { return D[k].name; }).join(', ')) + ' אישר. ' : '') +
        open.map(function (k) {
          var a = t.approvals[k];
          return esc(D[k].name) + (a.status === 'pending' ? ' טרם הגיב' : a.status === 'reserved' ? ' רשם הסתייגות' : ' דחה');
        }).join(', ') + '. הקבלן והמפעיל לא יקבלו חיווי "מאושר לתח"צ" עד שכל המחוזות יאשרו.</p></div></div>';
    }
    if (info.status === 'rejected') return '<div class="alert alert--critical">' + icon('x') + '<div><strong>ההסטה נדחתה</strong><p>נדרשת הגשה מתוקנת מצד הקבלן.</p></div></div>';
    return '<div class="alert alert--warning">' + icon('clock') + '<div><strong>ממתין לאישור ' + plural(keys.length, 'מחוז אחד', 'מחוזות') + '</strong><p>אף מחוז עדיין לא הגיב. ההסטה אינה מאושרת לביצוע.</p></div></div>';
  }

  function detourDetail(t) {
    var info = A.ticketInfo(t), c = info.closure;
    var di = Math.min(S.det.dir, info.dirs.length - 1), dir = info.dirs[di];
    var html = '<button class="back" data-act="detSel" data-arg="">' + icon('back') + 'כל ההסטות</button>' +
      '<header class="ph"><h1>' + lb(t.line, true) + esc(t.title.replace('הסטת קו ' + t.line + ' ', 'הסטה ')) + '</h1>' +
      '<p class="ph-sub">' + t.id + ', ' + esc(t.op) + '. מקושרת להסדר ' + c.id + ' (' + esc(Sc.PROJECTS[c.project].name) + ')</p></header>' + ticketBanner(t, info);

    if (dir) {
      html += '<section class="sec"><h2>המחוזות שעל מסלול הקו</h2>' + districtStrip(dir.pat) +
        '<p class="hint">המערכת זיהתה את המחוזות לפי תחנות הקו ופתחה משימת אישור נפרדת לכל אחד.</p></section>';
    }
    html += '<section class="sec"><h2>משימות אישור <span class="count num">' + info.districts.length + '</span></h2><ul class="apprs">' +
      info.districts.map(function (k) { return approvalCard(t, k, info); }).join('') + '</ul></section>';

    if (dir) {
      var d = dir.detour;
      html += '<section class="sec"><h2>מסלול מקורי מול חלופי</h2>';
      if (info.dirs.length > 1) {
        html += '<div class="seg seg--wide" role="group" aria-label="כיוון">' + info.dirs.map(function (x, i) {
          return '<button class="' + (i === di ? 'is-on' : '') + '" data-act="detDir" data-arg="' + i + '">לכיוון ' + esc(x.pat.tc) + '</button>';
        }).join('') + '</div>';
      }
      html += '<p class="route-line">עוקף דרך <b>' + esc(A.streetsOf(d.refs, 4).join(', ')) + '</b>. אורך העוקף <b class="num">' + (d.length / 1000).toFixed(1) + ' ק"מ</b>, ' +
        (d.extra >= 0 ? 'תוספת של' : 'קיצור של') + ' <b class="num">' + (Math.abs(d.extra) / 1000).toFixed(1) + ' ק"מ</b> למסלול.</p>';
      if (dir.clash) {
        html += '<div class="alert alert--serious">' + icon('alert') + '<div><strong>המסלול החלופי חסום הלילה</strong><p>העוקף עובר ב' + esc(dir.clash.street) + ', שנחסם בין ' + hm(dir.clash.start) + ' ל-' + hm(dir.clash.end) + ' (' + dir.clash.id + ', ' + esc(Sc.PROJECTS[dir.clash.project].name) + ').</p></div></div>';
      }
      html += '<div class="two"><div><h3>תחנות מבוטלות <span class="count num">' + d.skipped.length + '</span></h3>' + (d.skipped.length ? stopChips(d.skipped, 'stops--x') : '<p class="hint">אין</p>') + '</div>' +
        '<div><h3>תחנות חלופיות <span class="count num">' + d.served.length + '</span></h3>' + (d.served.length ? stopChips(d.served, 'stops--plus') : '<p class="hint">אין תחנות קיימות על העוקף</p>') + '</div></div></section>';
    }

    html += '<section class="sec"><h2>לוח זמנים ושרטוט</h2><dl class="facts">' +
      '<dt>תאריכים</dt><dd class="num">' + dateRange(t.schedule) + '</dd>' +
      '<dt>ימים</dt><dd>' + esc(t.schedule.days) + '</dd><dt>חלון יומי</dt><dd class="num">' + esc(t.schedule.hours) + '</dd>' +
      '<dt>שרטוט מצורף</dt><dd>' + icon('file') + esc(t.drawing) + '</dd></dl></section>';

    html += '<section class="sec"><h2>חיווי לקבלן ולמפעיל</h2><div class="signal signal--' + (info.status === 'approved' ? 'on' : 'off') + '">' +
      icon(info.status === 'approved' ? 'check' : 'lock') + '<div><strong>' + (info.status === 'approved' ? 'הסדר מאושר לתח"צ' : 'לא מאושר לביצוע') + '</strong><span>' +
      (info.status === 'approved' ? 'נשלח לקבלן ול' + esc(t.op) : 'החיווי נעול עד לאישור כל המחוזות') + '</span></div></div></section>';

    html += '<section class="sec"><h2>יומן מעקב <span class="count num">' + t.audit.length + '</span></h2>' +
      '<p class="hint">' + icon('lock') + 'היומן נשמר לצמיתות. אי אפשר לערוך או למחוק רשומות.</p><ol class="audit">' +
      t.audit.slice().reverse().map(function (e) {
        return '<li class="' + (e.fresh ? 'is-fresh' : '') + '"><time class="num">' + ltr(e.at) + '</time><p><b>' + esc(e.who) + '</b> ' + esc(e.what) + '</p>' + (e.more ? '<small>' + esc(e.more) + '</small>' : '') + '</li>';
      }).join('') + '</ol></section>';
    return html;
  }

  function detours() {
    var t = S.det.sel && Sc.TICKETS.filter(function (x) { return x.id === S.det.sel; })[0];
    return t ? detourDetail(t) : detourList();
  }

  /* ================================================================== MAP */

  function searchResults() {
    var q = S.mapx.q.trim(), g = G();
    if (!q) return '';
    var seen = {}, lines = [], stops = [];
    g.pat.forEach(function (p) {
      if (p.no.indexOf(q) !== 0) return;
      var key = p.op + '|' + p.no + '|' + p.tc;
      if (seen[key]) return; seen[key] = 1; lines.push(p);
    });
    lines.sort(function (a, b) { return a.no.length - b.no.length || b.n - a.n; });
    if (q.length >= 2) g.stops.forEach(function (s) { if (s.n.indexOf(q) >= 0 || s.c === q) stops.push(s); });
    if (!lines.length && !stops.length) return '<p class="empty">לא נמצאו קו או תחנה שמתאימים ל"' + esc(q) + '". נסו מספר קו או חלק משם תחנה.</p>';
    return (lines.length ? '<h3>קווים</h3><ul class="lines">' + lines.slice(0, 7).map(function (p) {
      return '<li><button class="line" data-act="mapPat" data-arg="' + p.i + '">' + lb(p.no) + '<span class="line-main"><span>לכיוון ' + esc(p.tc) + '</span><small>' + esc(p.op) + '</small></span></button></li>';
    }).join('') + '</ul>' : '') +
      (stops.length ? '<h3>תחנות</h3><ul class="lines">' + stops.slice(0, 6).map(function (s) {
        return '<li><button class="line" data-act="mapStop" data-arg="' + s.i + '"><span class="stopdot"></span><span class="line-main"><span>' + esc(s.n) + '</span><small>' + esc(s.t) + ', קוד ' + s.c + '</small></span></button></li>';
      }).join('') + '</ul>' : '');
  }
  function refreshSearch() {
    var el = document.getElementById('search-results');
    if (el) el.innerHTML = searchResults();
    var rest = document.getElementById('map-rest');
    if (rest) rest.hidden = !!S.mapx.q.trim();
  }

  function disruptions(pat) {
    var onPath = {};
    pat.p.forEach(function (r) { onPath[Math.abs(r) - 1] = 1; });
    return Sc.ARRANGEMENTS.concat(Sc.CLOSURES).filter(function (c) {
      return c.segs.some(function (s) { return onPath[s]; });
    });
  }

  function lineDetail(pat) {
    var g = G(), other = g.pat.filter(function (p) { return p.no === pat.no && p.op === pat.op && p.tc !== pat.tc; })
      .sort(function (a, b) { return b.n - a.n; })[0];
    var dis = disruptions(pat);
    var html = '<button class="back" data-act="' + (S.mapx.stop != null ? 'mapBackToStop' : 'mapClear') + '">' + icon('back') + (S.mapx.stop != null ? 'חזרה לתחנה' : 'חזרה לחיפוש') + '</button>' +
      '<header class="ph"><h1>' + lb(pat.no, true) + 'לכיוון ' + esc(pat.tc) + '</h1><p class="ph-sub">' + esc(pat.op) + '. מ' + esc(pat.fn) + ', ' + esc(pat.fc) + ' אל ' + esc(pat.tn) + ', ' + esc(pat.tc) + '</p>' +
      (other ? '<button class="link" data-act="mapPat" data-arg="' + other.i + '">' + icon('sync') + 'הכיוון ההפוך, ל' + esc(other.tc) + '</button>' : '') + '</header>';

    html += '<section class="sec"><h2>הפרעות לאורך המסלול <span class="count num">' + dis.length + '</span></h2>';
    if (!dis.length) html += '<p class="hint">אין הסדרי תנועה פעילים על מסלול הקו במרחב.</p>';
    else html += '<ul class="dis">' + dis.map(function (c) {
      var imp = c.night ? S.impacts[c.id] : null, crit = imp && imp.level === 'critical';
      return '<li class="' + (crit ? 'is-crit' : '') + '">' + icon(A.KIND_ICON[c.kind]) + '<div><strong>' + esc(Sc.KINDS[c.kind].short) + ', ' + esc(c.street) + ' ' + esc(c.city) + '</strong>' +
        '<span>' + esc(c.between) + '</span><small>' + (c.night ? 'הלילה, ' + windowText(c) : esc(c.dates) + '. ' + esc(c.note)) + ' (' + c.id + ')</small>' +
        (crit ? '<small class="dis-flag">' + icon('flag') + 'הציר המקביל, ' + esc(imp.bypassBlockedBy.street) + ', חסום באותן שעות</small>' : '') + '</div></li>';
    }).join('') + '</ul>';
    html += '</section>';

    html += '<section class="sec"><h2>נסיעות לפי שעת יציאה, יום ראשון</h2>' + dayChart(pat.h, 'נסיעות לפי שעה') +
      '<p class="cap">' + plural(pat.n, 'נסיעה אחת', 'נסיעות') + ' ביום בכיוון זה, לפי ה-GTFS של הלילה.</p></section>';

    html += '<section class="sec"><h2>תחנות במרחב <span class="count num">' + pat.st.length + '</span></h2><ol class="seq">' + pat.st.map(function (i, k) {
      var s = g.stops[i];
      return '<li><button data-act="mapStop" data-arg="' + i + '"><span>' + esc(s.n) + '</span><small class="num">' + (k ? '+' + Math.round(pat.so[k] / 60) + ' דק׳' : esc(s.t)) + '</small></button></li>';
    }).join('') + '</ol></section>';
    return html;
  }

  function stopDetail(s) {
    var g = G(), groups = {}, order = [];
    s.pats.forEach(function (pi) {
      var p = g.pat[pi], key = p.op + '|' + p.no;
      if (!groups[key]) { groups[key] = []; order.push(key); }
      if (!groups[key].some(function (x) { return x.tc === p.tc; })) groups[key].push(p);
    });
    order.sort(function (a, b) { return parseInt(a.split('|')[1], 10) - parseInt(b.split('|')[1], 10); });
    return '<button class="back" data-act="mapClear">' + icon('back') + 'חזרה לחיפוש</button>' +
      '<header class="ph"><h1>' + esc(s.n) + '</h1><p class="ph-sub">' + (s.a ? esc(s.a) + ', ' : '') + esc(s.t) + '. קוד תחנה <span class="num">' + s.c + '</span></p></header>' +
      '<section class="sec"><h2>קווים בתחנה <span class="count num">' + order.length + '</span></h2><p class="hint">לחיצה על קו מדגישה את מסלולו המלא במפה.</p><ul class="lines">' +
      order.map(function (key) {
        return groups[key].map(function (p) {
          return '<li><button class="line" data-act="mapPat" data-arg="' + p.i + '">' + lb(p.no) + '<span class="line-main"><span>לכיוון ' + esc(p.tc) + '</span><small>' + esc(p.op) + '</small></span>' +
            '<span class="line-n"><b class="num">' + p.n + '</b><small>נסיעות ביום</small></span></button></li>';
        }).join('');
      }).join('') + '</ul></section>';
  }

  function proposeForm(p) {
    var types = ['רדיוס סיבוב צר לאוטובוס', 'עומס צפוי מהסטת תנועה כללית', 'תחנה חלופית לא נגישה', 'אחר'];
    return '<button class="back" data-act="proposeCancel">' + icon('back') + 'ביטול</button>' +
      '<header class="ph"><h1>הצעת קונפליקט</h1><p class="ph-sub">לקונפליקט תפעולי שהבדיקה הגיאומטרית אינה תופסת</p></header>' +
      '<form class="form" onsubmit="return false">' +
      '<fieldset><legend>מקום הקונפליקט</legend>' + (p.at ? '<ul class="picked"><li><span>' + esc(p.where) + '</span><span class="num ltr">' + p.at[0].toFixed(5) + ', ' + p.at[1].toFixed(5) + '</span></li></ul><p class="hint">לחיצה נוספת במפה מזיזה את הסימון.</p>'
        : '<p class="pick">' + icon('pin') + 'לחצו במפה על המקום שבו מתרחש הקונפליקט.</p>') + '</fieldset>' +
      '<fieldset><legend>סוג הקונפליקט</legend><label class="field"><select data-bind="mapx.propose.type">' + types.map(function (t) { return '<option' + (p.type === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></label></fieldset>' +
      '<fieldset><legend>דרגת חומרה</legend>' + radios('sev', 'mapx.propose.severity', p.severity, [['נמוכה', 'נמוכה'], ['בינונית', 'בינונית'], ['גבוהה', 'גבוהה']]) + '</fieldset>' +
      '<fieldset><legend>תיאור</legend><label class="field"><textarea rows="3" data-bind="mapx.propose.text" placeholder="מה קורה בשטח, ובאילו קווים או שעות">' + esc(p.text) + '</textarea></label></fieldset>' +
      '<div class="actions actions--sticky"><button class="btn btn--primary" data-act="proposeSubmit">' + icon('send') + 'העברה למנהל המערכת</button><button class="btn" data-act="proposeCancel">ביטול</button></div></form>';
  }

  function mapHome() {
    var g = G(), X = S.mapx, seen = {};
    var busy = g.pat.slice().sort(function (a, b) { return b.n - a.n; }).filter(function (p) {
      var k = p.op + '|' + p.no; if (seen[k]) return false; seen[k] = 1; return true;
    }).slice(0, 6);
    var layer = function (k, label, n) {
      return '<button class="toggle' + (X.layers[k] ? ' is-on' : '') + '" data-act="layer" data-arg="' + k + '" aria-pressed="' + X.layers[k] + '"><i></i>' + label + (n != null ? '<span class="num">' + n + '</span>' : '') + '</button>';
    };
    return '<section class="sec sec--first"><h2>שכבות</h2><div class="toggles">' +
      layer('works', 'הסדרי תנועה וחסימות', Sc.ARRANGEMENTS.length + A.closures().length) + layer('stops', 'תחנות', g.stops.length) + layer('proposals', 'הצעות קונפליקט', S.proposals.length) + '</div>' +
      '<p class="hint">התחנות מופיעות בהתקרבות. לחיצה על תחנה מציגה את הקווים שעוברים בה.</p></section>' +

      '<section class="sec"><h2>הקווים העמוסים במרחב</h2><ul class="lines">' + busy.map(function (p) {
        return '<li><button class="line" data-act="mapPat" data-arg="' + p.i + '">' + lb(p.no) + '<span class="line-main"><span>' + esc(p.fc) + ' – ' + esc(p.tc) + '</span><small>' + esc(p.op) + '</small></span>' +
          '<span class="line-n"><b class="num">' + p.n + '</b><small>נסיעות ביום</small></span></button></li>';
      }).join('') + '</ul></section>' +

      '<section class="sec"><h2>הצעות קונפליקט <span class="count num">' + S.proposals.length + '</span></h2>' +
      '<p class="hint">קונפליקט תפעולי שהבדיקה הגיאומטרית אינה תופסת, כמו רדיוס סיבוב צר לאוטובוס מפרקי.</p>' +
      '<ul class="props">' + S.proposals.map(function (p) {
        return '<li class="' + (p.fresh ? 'is-fresh' : '') + '"><div class="props-top"><strong>' + esc(p.type) + '</strong><span class="lvl lvl--warning">' + icon('clock') + 'ממתין לאישור מנהל המערכת</span></div>' +
          '<p>' + esc(p.text) + '</p><small>' + esc(p.where) + '. חומרה ' + esc(p.severity) + '. ' + esc(p.by) + ', ' + ltr(p.when) + '</small></li>';
      }).join('') + '</ul>' +
      '<div class="actions"><button class="btn' + (A.can('propose') ? ' btn--primary' : ' is-soft') + '" data-act="propose">' + icon('plus') + 'הצעת קונפליקט חדש</button></div></section>' +

      '<section class="sec"><h2>ייצוא לאקסל</h2><p class="hint">כל ההסדרים והקונפליקטים שמשפיעים על קווי אוטובוס, גיליון לכל קבוצה.</p>' +
      '<div class="seg seg--wide" role="group" aria-label="פילוח">' + [['op', 'לפי מפעיל'], ['city', 'לפי רשות מקומית'], ['district', 'לפי מחוז']].map(function (o) {
        return '<button class="' + (X.exportBy === o[0] ? 'is-on' : '') + '" data-act="exportBy" data-arg="' + o[0] + '">' + o[1] + '</button>';
      }).join('') + '</div><div class="actions"><button class="btn" data-act="exportXlsx">' + icon('download') + 'הורדת קובץ אקסל</button></div></section>';
  }

  function map() {
    var X = S.mapx, g = G();
    if (X.propose) return proposeForm(X.propose);
    if (X.pat != null) return lineDetail(g.pat[X.pat]);
    if (X.stop != null) return stopDetail(g.stops[X.stop]);
    return '<header class="ph"><h1>מפת תח"צ</h1><p class="ph-sub">' + g.C.feed.lines + ' קווים ו-' + g.stops.length.toLocaleString('en') + ' תחנות במרחב, מעודכנים מה-GTFS של הלילה</p></header>' +
      '<label class="search">' + icon('search') + '<input type="search" data-bind="mapx.q" value="' + esc(X.q) + '" placeholder="מספר קו או שם תחנה" aria-label="חיפוש קו או תחנה" autocomplete="off"></label>' +
      '<div id="search-results">' + searchResults() + '</div><div id="map-rest"' + (X.q.trim() ? ' hidden' : '') + '>' + mapHome() + '</div>';
  }

  function exportXlsx() {
    var g = G(), by = S.mapx.exportBy, groups = {}, all = [];
    var header = ['מזהה הסדר', 'סוג', 'פרויקט', 'רשות מקומית', 'רחוב', 'מקטע', 'סיווג השפעה', 'מועד', 'קו', 'מפעיל', 'כיוון', 'מחוזות על מסלול הקו', 'נסיעות מושפעות', 'בסיס הספירה', 'רמת קונפליקט'];
    Sc.ARRANGEMENTS.concat(A.closures()).forEach(function (c) {
      var rows;
      if (c.night) rows = A.lineRows(S.impacts[c.id]).map(function (r) { return { pat: r.pat, n: r.hit.length, level: r.blocked ? 'דגל אדום' : A.LEVELS[S.impacts[c.id].level].label }; });
      else {
        var seen = {};
        rows = [];
        c.segs.forEach(function (s) { g.seg[s].pats.forEach(function (pi) { if (!seen[pi]) { seen[pi] = 1; rows.push({ pat: g.pat[pi], n: g.pat[pi].n, level: 'עיכוב צפוי' }); } }); });
      }
      rows.forEach(function (r) {
        var ds = uniq(patDistricts(r.pat).map(function (x) { return Sc.DISTRICTS[x.id].name; }));
        var row = [c.id, c.night ? 'הסדר לילה נקודתי' : 'הסדר ארוך טווח', Sc.PROJECTS[c.project].name, c.city, c.street, c.between, Sc.KINDS[c.kind].label,
          c.night ? 'הלילה ' + windowText(c) : c.dates, r.pat.no, r.pat.op, r.pat.tc, ds.join(', '), r.n, c.night ? 'נסיעות בחלון החסימה הלילה' : 'נסיעות ביום', r.level];
        all.push(row);
        var keys = by === 'op' ? [r.pat.op] : by === 'city' ? [c.city] : ds;
        keys.forEach(function (k) { (groups[k] = groups[k] || []).push(row); });
      });
    });
    var names = Object.keys(groups).sort(function (a, b) { return groups[b].length - groups[a].length; });
    var sheets = [{
      name: 'סיכום', header: [by === 'op' ? 'מפעיל' : by === 'city' ? 'רשות מקומית' : 'מחוז', 'הסדרים', 'קווים', 'נסיעות מושפעות'],
      rows: names.map(function (k) {
        return [k, uniq(groups[k].map(function (r) { return r[0]; })).length, uniq(groups[k].map(function (r) { return r[8] + r[9]; })).length, groups[k].reduce(function (n, r) { return n + r[12]; }, 0)];
      })
    }].concat(names.map(function (k) { return { name: k, header: header, rows: groups[k] }; }));
    root.Xlsx.download(root.Xlsx.workbook(sheets), 'compilation-transit-' + Sc.NOW.date.replace(/\./g, '-') + '.xlsx').then(function () {
      A.toast('קובץ האקסל מוכן: ' + all.length + ' שורות ב-' + names.length + ' גיליונות, ' + (by === 'op' ? 'לפי מפעיל' : by === 'city' ? 'לפי רשות מקומית' : 'לפי מחוז'));
    }, function (err) {
      A.toast(err && err.code === 'declined' ? 'ההורדה בוטלה' : 'אי אפשר להוריד קובץ בתצוגה הזו. פתחו את index.html מהמאגר', 'warn');
    });
    return sheets;
  }

  /* ================================================================= GTFS */

  var DELTA_KIND = { route: 'סטיית מסלול', moved: 'תחנה הוזזה', removed: 'תחנה נגרעה', added: 'תחנה נוספה' };
  var DELTA_ICON = { serious: 'alert', warning: 'clock', good: 'check' };

  function deltaRoutes(d) {
    var t = Sc.TICKETS.filter(function (x) { return x.id === d.ticket; })[0]; if (!t) return null;
    var info = A.ticketInfo(t), dir = info.dirs[0]; if (!dir) return null;
    var both = Engine.closedSet(info.closure);
    if (dir.clash) dir.clash.segs.forEach(function (s) { both[s] = 1; });
    var rep = Engine.detour(G(), dir.pat, both);
    if (!rep || rep.blocked) return null;
    return { pat: dir.pat, approved: dir.detour.refs, reported: rep.refs, original: rep.original, ticket: t };
  }
  function movedTo(d) { return [d.stopRef.y - d.metres / 111320, d.stopRef.x + 0.00008]; }

  function deltaText(d) {
    if (d.type !== 'route') return d.text;
    var v = deltaRoutes(d); if (!v) return d.text;
    return 'ב-GTFS של הלילה הקו עוקף דרך ' + A.streetsOf(v.reported, 3).join(', ') + '. ההסטה שהוגשה ב-' + d.ticket + ' עוברת דרך ' + A.streetsOf(v.approved, 3).join(', ') + ', והיא עדיין באישור חלקי.';
  }

  function gtfsDetail(d) {
    var s = d.stopRef;
    return '<button class="back" data-act="gtfsSel" data-arg="">' + icon('back') + 'כל השינויים</button>' +
      '<header class="ph"><h1>' + esc(d.title) + '</h1><div class="chips"><span class="lvl lvl--' + d.level + '">' + icon(DELTA_ICON[d.level]) + DELTA_KIND[d.type] + '</span><span class="tag tag--id num">' + d.id + '</span></div></header>' +
      '<p class="lede">' + esc(deltaText(d)) + '</p>' +
      '<section class="sec"><h2>מה השתנה</h2><dl class="facts">' +
      (s ? '<dt>תחנה</dt><dd>' + esc(s.n) + ', קוד <span class="num">' + s.c + '</span></dd><dt>כתובת</dt><dd>' + esc(s.a) + ', ' + esc(s.t) + '</dd>' : '') +
      (d.line ? '<dt>קו</dt><dd>' + lb(d.line) + ' ' + esc(d.op) + '</dd>' : '') +
      (d.metres ? '<dt>מרחק ההזזה</dt><dd class="num">' + d.metres + ' מ׳</dd>' : '') +
      '<dt>זוהה בריצה</dt><dd class="num">' + ltr(Sc.NOW.date + ' 03:00') + '</dd>' +
      '<dt>הסדר קשור</dt><dd class="num">HL-2611</dd></dl></section>' +
      '<div class="actions">' + (d.ticket ? '<button class="btn btn--primary" data-act="openTicket" data-arg="' + d.ticket + '">' + icon('detour') + 'לכרטיסיית ההסטה ' + d.ticket + '</button>' : '') + '</div>';
  }

  function gtfs() {
    var d = Sc.DELTAS.filter(function (x) { return x.id === S.gtfs.sel; })[0];
    if (d) return gtfsDetail(d);
    var f = G().C.feed, max = Math.max.apply(null, Sc.RUNS.map(function (r) { return r.changes; }).concat([1]));
    var steps = ['הורדה', 'אימות', 'עיבוד', 'השוואה לאתמול', 'הצלבה מול הסדרים'];
    return '<header class="ph"><h1>עדכון GTFS יומי</h1><p class="ph-sub">הריצה האחרונה: היום ב-03:00, נמשכה 4.2 דקות</p></header>' +
      '<ol class="steps">' + steps.map(function (s) { return '<li>' + icon('check') + '<span>' + s + '</span></li>'; }).join('') + '</ol>' +
      '<p class="lede">בריצת הלילה זוהו ' + Sc.DELTAS.length + ' שינויים בתחומי הסדרים פעילים. ' + Sc.DELTAS.filter(function (x) { return x.level !== 'good'; }).length + ' מהם דורשים בדיקה.</p>' +
      '<ul class="cards">' + Sc.DELTAS.map(function (x) {
        return '<li><button class="card card--' + x.level + '" data-act="gtfsSel" data-arg="' + x.id + '"><span class="card-top"><span class="card-title">' + esc(x.title) + '</span></span>' +
          '<span class="card-row"><span class="lvl lvl--' + x.level + '">' + icon(DELTA_ICON[x.level]) + DELTA_KIND[x.type] + '</span>' +
          (x.line ? lb(x.line) : '') + (x.stopRef ? '<span class="tag">' + esc(x.stopRef.n) + '</span>' : '') + '</span></button></li>';
      }).join('') + '</ul>' +
      '<section class="sec"><h2>מה נקלט הלילה</h2><dl class="facts facts--num">' +
      '<dt>קובץ המקור</dt><dd>משרד התחבורה<br><small>' + ltr('israel-public-transportation.zip') + '<br>עודכן ' + ltr('21.11.2026 17:30') + ', 135 מ"ב</small></dd>' +
      '<dt>תחנות</dt><dd><b class="num">' + f.stopsNational.toLocaleString('en') + '</b> בארץ, <b class="num">' + f.stops.toLocaleString('en') + '</b> במרחב</dd>' +
      '<dt>קווים ומסלולים</dt><dd><b class="num">' + f.lines + '</b> קווים, <b class="num">' + f.routes + '</b> מסלולים וגיאומטריות</dd>' +
      '<dt>נסיעות היום</dt><dd><b class="num">' + f.tripsToday.toLocaleString('en') + '</b> במרחב, עם תדירות לפי שעה</dd>' +
      '<dt>רשת הקווים</dt><dd><b class="num">' + f.networkKm + '</b> ק"מ של צירי אוטובוס</dd></dl></section>' +
      '<section class="sec"><h2>שינויים שזוהו בשבוע האחרון</h2><div class="runs" dir="ltr">' + Sc.RUNS.slice().reverse().map(function (r) {
        return '<div class="run" data-tip="' + esc(r.date + ': <b>' + plural(r.changes, 'שינוי אחד', 'שינויים') + '</b>' + (r.flagged ? '<br>' + r.flagged + ' בתחומי הסדרים פעילים' : '')) + '">' +
          '<span class="run-n num">' + r.changes + '</span><span class="run-bar"><i style="height:' + (r.changes / max * 100) + '%"></i></span><span class="run-d num">' + r.date + '</span></div>';
      }).join('') + '</div><p class="cap">מספר השינויים בתחנות ובמסלולים בכל ריצה לילית.</p></section>';
  }

  /* ============================================================= OVERVIEW */

  function overview() {
    var cl = Sc.CLOSURES, trips = {}, lines = {}, stops = {}, byOp = {}, byHour = {};
    cl.forEach(function (c) {
      var imp = S.impacts[c.id];
      imp.lines.forEach(function (l) {
        lines[l.pat.op + '|' + l.pat.no] = 1;
        l.keys.forEach(function (k, n) {
          if (trips[k]) return; trips[k] = 1;
          byOp[l.pat.op] = (byOp[l.pat.op] || 0) + 1;
          var h = Math.floor(l.hit[n] / 60) % 24; byHour[h] = (byHour[h] || 0) + 1;
        });
      });
      if (c.kind === 'full') imp.stops.forEach(function (s) { stops[s] = 1; });
    });
    var crit = cl.filter(function (c) { return S.impacts[c.id].level === 'critical'; });
    var infos = Sc.TICKETS.map(function (t) { return { t: t, info: A.ticketInfo(t) }; });
    var partial = infos.filter(function (x) { return x.info.status === 'partial'; });
    var open = infos.filter(function (x) { return x.info.status !== 'approved'; });
    var deltas = Sc.DELTAS.filter(function (x) { return x.level !== 'good'; });

    var todo = [];
    if (crit.length) {
      var c0 = crit[0], imp0 = S.impacts[c0.id];
      todo.push('<li class="todo todo--critical">' + icon('flag') + '<div><strong>ציר עוקף חסום במקביל: ' + esc(c0.street) + ' ו' + esc(imp0.bypassBlockedBy.street) + ', ' + esc(c0.city) + '</strong>' +
        '<p>שני פרויקטים סוגרים הלילה צירים מקבילים באותן שעות. ' + imp0.trips + ' נסיעות עוברות בהרצל בחלון החסימה.</p></div>' +
        '<button class="btn" data-act="openClosure" data-arg="' + c0.id + '">לתמונת הלילה</button></li>');
    }
    partial.forEach(function (x) {
      var pend = x.info.districts.filter(function (k) { return x.t.approvals[k].status !== 'approved'; })[0], a = x.t.approvals[pend];
      todo.push('<li class="todo todo--serious">' + icon('alert') + '<div><strong>' + lb(x.t.line) + 'הסטה באישור חלקי, ' + esc(Sc.DISTRICTS[pend].name) + '</strong>' +
        '<p>' + (a.status === 'pending' ? 'המחוז טרם הגיב, ' + plural(daysSince(a.asked), 'יום', 'ימים') + ' מאז הפנייה. ' : 'המחוז רשם הסתייגות. ') + 'ההסטה מתחילה הלילה ב-22:00.</p></div>' +
        '<button class="btn" data-act="openTicket" data-arg="' + x.t.id + '">לכרטיסייה</button></li>');
    });
    if (deltas.length) {
      todo.push('<li class="todo todo--warning">' + icon('sync') + '<div><strong>' + deltas.length + ' שינויים ב-GTFS בתחומי הסדרים פעילים</strong>' +
        '<p>בהם קו שמדווח מסלול שונה מההסטה שהוגשה לאישור.</p></div><button class="btn" data-act="go" data-arg="gtfs">לעדכון GTFS</button></li>');
    }

    var ops = Object.keys(byOp).sort(function (a, b) { return byOp[b] - byOp[a]; });
    var hours = [22, 23, 0, 1, 2, 3, 4];
    var perDistrict = Object.keys(Sc.DISTRICTS).map(function (k) {
      var row = { id: k, pending: 0, approved: 0, reserved: 0, oldest: 0 };
      Sc.TICKETS.forEach(function (t) {
        var a = t.approvals[k]; if (!a) return;
        if (a.status === 'pending') { row.pending++; row.oldest = Math.max(row.oldest, daysSince(a.asked)); }
        else if (a.status === 'approved') row.approved++; else row.reserved++;
      });
      return row;
    });

    return '<div class="pg"><header class="pg-head"><div><h1>תמונת מצב</h1><p>' + Sc.NOW.day + ' ' + Sc.NOW.date + '. מרחב הקו הכחול: רחובות, נס ציונה, ראשון לציון והסביבה</p></div></header>' +
      '<section class="pg-todo"><h2>דורש טיפול לפני הלילה</h2><ul class="todos">' + todo.join('') + '</ul></section>' +
      '<section class="pg-figs">' +
      '<div class="fig"><b class="num">' + Object.keys(trips).length + '</b><span>נסיעות תח"צ בחלונות החסימה של הלילה</span></div>' +
      '<div class="fig"><b class="num">' + Object.keys(lines).length + '</b><span>קווים מושפעים, מתוך ' + G().C.feed.lines + ' במרחב</span></div>' +
      '<div class="fig"><b class="num">' + Object.keys(stops).length + '</b><span>תחנות שלא ישורתו בחסימות מלאות</span></div>' +
      '<div class="fig"><b class="num">' + open.length + '</b><span>הסטות שעדיין אינן מאושרות, מתוך ' + Sc.TICKETS.length + '</span></div></section>' +
      '<div class="pg-grid">' +
      '<section class="pane"><h2>נסיעות מושפעות הלילה, לפי מפעיל</h2>' + barList(ops.map(function (o) { return { label: o, value: byOp[o], tip: esc(o) + ': <b>' + byOp[o] + ' נסיעות</b> בחלונות חסימה' }; })) +
      '<p class="cap">המפעילים מקבלים התראה מוקדמת לתכנון סידורי עבודה ותדרוך נהגים.</p></section>' +
      '<section class="pane"><h2>נסיעות מושפעות לפי שעה</h2>' + barList(hours.map(function (h) {
        var l = String(h).padStart(2, '0') + ':00'; return { label: l, value: byHour[h] || 0, tip: l + ': <b>' + (byHour[h] || 0) + ' נסיעות</b>' };
      }), 'hbars--time') + '<p class="cap">רוב הפגיעה מתרכזת עד חצות. אחרי 01:00 כמעט אין נסיעות.</p></section>' +
      '<section class="pane pane--wide"><h2>משימות אישור לפי מחוז</h2><table class="tbl"><thead><tr><th>מחוז</th><th>ממתינות</th><th>אושרו</th><th>הסתייגות או דחייה</th><th>ההמתנה הארוכה ביותר</th></tr></thead><tbody>' +
      perDistrict.map(function (r) {
        return '<tr><th>' + esc(Sc.DISTRICTS[r.id].name) + '</th><td class="num">' + (r.pending ? '<span class="lvl lvl--warning">' + icon('clock') + r.pending + '</span>' : '0') + '</td><td class="num">' + r.approved + '</td><td class="num">' + r.reserved + '</td><td>' + (r.pending ? plural(r.oldest, 'יום', 'ימים') : 'אין') + '</td></tr>';
      }).join('') + '</tbody></table></section></div>' +
      '<p class="pg-note">הרחובות, התחנות, הקווים ולוחות הזמנים נלקחו מקובץ ה-GTFS של משרד התחבורה מיום 21.11.2026. החסימות, בקשות ההסטה, האישורים ושינויי ה-GTFS שמוצגים כאן נכתבו לצורך ההדגמה.</p></div>';
  }

  /* ================================================================ ROLES */

  function roles() {
    var list = Sc.ROLES.filter(function (r) { return !r.hidden; }), cur = A.role();
    var coords = [['הקו הכחול', 'נתיבי איילון', 'פעיל במערכת'], ['הקו החום', 'נתיבי איילון', 'פעיל במערכת'], ['פרויקטי נת"ע', 'נת"ע', 'בתהליך צירוף'], ['פרויקטי נת"י', 'נתיבי ישראל', 'בתהליך צירוף']];
    return '<div class="pg"><header class="pg-head"><div><h1>תפקידים והרשאות</h1><p>כל משתמש רואה ועושה רק את מה ששייך לתפקידו. לחצו על "צפייה בתפקיד" כדי לראות את המערכת בעיניו.</p></div></header>' +
      '<section class="pane pane--flush"><table class="tbl tbl--roles"><thead><tr><th>סוג משתמש</th><th>צפייה</th><th>עריכה והזנה</th><th>אישור ובקרה</th><th></th></tr></thead><tbody>' +
      list.map(function (r) {
        var on = r.id === cur.id || (r.id === 'dist_tlv' && cur.id === 'dist_jer');
        return '<tr class="' + (on ? 'is-on' : '') + '"><th><strong>' + esc(r.name) + '</strong>' + (on ? '<span class="tag tag--on">התפקיד הנוכחי</span>' : '') + '</th><td>' + esc(r.view) + '</td><td>' + esc(r.edit) + '</td><td>' + esc(r.approve) + '</td>' +
          '<td>' + (on ? '' : '<button class="btn" data-act="roleGo" data-arg="' + r.id + '">' + icon('eye') + 'צפייה בתפקיד</button>') + '</td></tr>';
      }).join('') + '</tbody></table></section>' +
      '<div class="pg-grid"><section class="pane"><h2>מתאמי תח"צ בפרויקטי התשתית</h2><p class="hint">המתאמים עוקבים אחרי הממשק בין קבלני התשתית לחברות ההפעלה, מציעים קונפליקטים ומעדכנים סטטוס טיפול.</p><ul class="coords">' +
      coords.map(function (c) { return '<li><div><strong>' + c[0] + '</strong><span>' + c[1] + '</span></div><span class="lvl lvl--' + (c[2] === 'פעיל במערכת' ? 'good' : 'warning') + '">' + icon(c[2] === 'פעיל במערכת' ? 'check' : 'clock') + c[2] + '</span></li>'; }).join('') + '</ul></section>' +
      '<section class="pane"><h2>מי מקבל התראות מוקדמות</h2><p class="hint">חברות ההפעלה מקבלות התראה על כל חסימה שפוגעת בקווים שלהן, לטובת סידורי עבודה, תדרוך נהגים ועדכון המידע לנוסע.</p><ul class="coords">' +
      G().C.feed.operators.map(function (o) {
        var n = uniq(G().pat.filter(function (p) { return p.op === o; }).map(function (p) { return p.no; })).length;
        return '<li><div><strong>' + esc(o) + '</strong></div><span class="num">' + plural(n, 'קו אחד', 'קווים') + ' במרחב</span></li>';
      }).join('') + '</ul></section></div></div>';
  }

  root.Views = {
    overview: overview, night: night, detours: detours, map: map, gtfs: gtfs, roles: roles,
    refreshForm: refreshForm, refreshSearch: refreshSearch, newTicket: newTicket, deltaRoutes: deltaRoutes, movedTo: movedTo, exportXlsx: exportXlsx
  };
})(this);
