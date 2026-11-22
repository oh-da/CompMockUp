/* The demo scenario.
 *
 * Streets, stops, lines and timetables come from the real GTFS feed.
 * Everything in this file is invented for the demonstration: the projects'
 * closures, the detour requests, the approvals and the GTFS changes.
 */
(function (root) {
  'use strict';

  var NOW = { date: '22.11.2026', day: 'יום ראשון', time: '15:40', night: 'ליל ראשון, 22.11' };
  var NIGHT = { start: 22 * 60, end: 29 * 60 };

  var DISTRICTS = {
    tlv: { id: 'tlv', name: 'מחוז תל אביב והמרכז', short: 'ת"א והמרכז' },
    jer: { id: 'jer', name: 'מחוז ירושלים', short: 'ירושלים' },
    south: { id: 'south', name: 'מחוז דרום', short: 'דרום' }
  };
  var CITY_DISTRICT = {
    'ירושלים': 'jer', 'בית שמש': 'jer', 'מודיעין עילית': 'jer', 'מבשרת ציון': 'jer',
    'אשקלון': 'south', 'אשדוד': 'south', 'באר שבע': 'south', 'אילת': 'south',
    'קרית גת': 'south', 'קרית מלאכי': 'south', 'גן יבנה': 'south'
  };

  var PROJECTS = {
    blue: { name: 'הקו הכחול', owner: 'נתיבי איילון', coordinator: 'מתאם תח"צ, הקו הכחול' },
    brown: { name: 'הקו החום', owner: 'נתיבי איילון', coordinator: 'מתאם תח"צ, הקו החום' },
    drain: { name: 'שיקום קו ניקוז', owner: 'הרשות המקומית', coordinator: null },
    power: { name: 'הטמנת קו מתח', owner: 'חברת תשתית חשמל', coordinator: null },
    junction: { name: 'שדרוג צומת', owner: 'הרשות המקומית', coordinator: null }
  };

  var KINDS = {
    full: { label: 'חסימה מלאה', short: 'חסימה מלאה' },
    partial: { label: 'חסימה חלקית (צמצום נתיב)', short: 'צמצום נתיב' },
    buslane: { label: 'סגירת נת"צ בלבד', short: 'סגירת נת"צ' },
    turns: { label: 'ביטול פניות', short: 'ביטול פניות' }
  };

  /* Closures are anchored to two real stops (by stop code): the closed
     stretch is the piece of street a bus drives between them. */
  var CLOSURES = [
    {
      id: 'HL-2611', project: 'blue', city: 'רחובות', street: 'הרצל', between: 'מרחוב טלר עד רחוב ארלוזורוב',
      from: '35386', to: '32145', kind: 'full', start: 22 * 60, end: 29 * 60,
      dates: 'סדרת לילות עוקבים, 22.11 עד 3.12 (א׳ עד ה׳)', series: true,
      contractor: 'קבלן מבצע, מקטע רחובות', oncall: 'מנהל עבודה תורן, 050-555-0142',
      purpose: 'העתקת תשתיות והכנת מצע לנתיב המתע"ן', mine: true, handling: 'בטיפול'
    },
    {
      id: 'HL-2618', project: 'drain', city: 'רחובות', street: 'מנוחה ונחלה', between: 'מרחוב יעקב עד רחוב עזרא',
      from: '38875', to: '35674', kind: 'full', start: 23 * 60, end: 28 * 60,
      dates: 'עבודה חד-יומית, 22.11', series: false,
      contractor: 'קבלן תשתיות עירוני', oncall: 'מפקח תורן, 050-555-0177',
      purpose: 'החלפת קו ניקוז ראשי'
    },
    {
      id: 'HL-2609', project: 'blue', city: 'נס ציונה', street: 'ויצמן', between: 'מהתחנה המרכזית עד רחוב החרש',
      from: '35232', to: '38923', kind: 'partial', start: 22 * 60, end: 29 * 60,
      dates: 'סדרת לילות עוקבים, 22.11 עד 26.11', series: true,
      contractor: 'קבלן מבצע, מקטע נס ציונה', oncall: 'מנהל עבודה תורן, 050-555-0118',
      purpose: 'קרצוף וריבוד, נתיב אחד פתוח בכל כיוון', mine: true
    },
    {
      id: 'HL-2622', project: 'brown', city: 'רמלה', street: 'שדרות הרצל', between: 'מרחוב מבצע קדש עד רחוב אהרון בן יוסף',
      from: '33201', to: '35092', kind: 'buslane', start: 22 * 60, end: 29 * 60,
      dates: 'סדרת לילות עוקבים, 22.11 עד 30.11', series: true,
      contractor: 'קבלן מבצע, מקטע רמלה', oncall: 'מנהל עבודה תורן, 050-555-0163',
      purpose: 'התקנת עמודי רמזור בנתיב התח"צ'
    },
    {
      id: 'HL-2615', project: 'power', city: 'ראשון לציון', street: "ז'בוטינסקי", between: 'מרחוב שפינוזה עד היכל התרבות',
      from: '36048', to: '36062', kind: 'full', start: 25 * 60, end: 28 * 60 + 30,
      dates: 'עבודה חד-יומית, 22.11', series: false,
      contractor: 'קבלן חשמל', oncall: 'מהנדס ביצוע תורן, 050-555-0191',
      purpose: 'חציית כביש להטמנת קו מתח'
    },
    {
      id: 'HL-2620', project: 'junction', city: 'ראשון לציון', street: 'שדרות משה דיין', between: 'צומת הנחשול',
      from: '31610', to: '35534', kind: 'turns', start: 23 * 60, end: 29 * 60,
      dates: 'סדרת לילות עוקבים, 22.11 עד 24.11', series: true,
      contractor: 'קבלן סלילה', oncall: 'מנהל עבודה תורן, 050-555-0125',
      purpose: 'שינוי גיאומטריית צומת, ביטול פנייה שמאלה לרחוב הנחשול'
    }
  ];

  /* Longer arrangements (two weeks and more) already held by the system. */
  var ARRANGEMENTS = [
    {
      id: 'HS-1184', project: 'blue', city: 'רחובות', street: 'הרצל', between: 'ממכון ויצמן עד רחוב ויצמן',
      from: '34230', to: '32116', kind: 'partial', dates: '2.11.2026 עד 14.1.2027',
      note: 'צמצום לנתיב אחד לכיוון דרום, כל שעות היממה'
    },
    {
      id: 'HS-1190', project: 'blue', city: 'רחובות', street: 'הרצל', between: 'מרחוב עזרא עד רחוב אברבנאל',
      from: '31096', to: '31097', kind: 'buslane', dates: '15.11.2026 עד 20.12.2026',
      note: 'ביטול הנת"צ לכיוון צפון, התנועה משולבת בנתיב הכללי'
    },
    {
      id: 'HS-1202', project: 'blue', city: 'נס ציונה', street: 'ויצמן', between: 'צומת קניותר',
      from: '32253', to: '32254', kind: 'turns', dates: '8.11.2026 עד 31.12.2026',
      note: 'ביטול פנייה שמאלה מויצמן לכיוון מערב'
    },
    {
      id: 'HS-1175', project: 'brown', city: 'ראשון לציון', street: 'הרצל', between: 'מרחוב ינובסקי עד שדרות תש"ח',
      from: '37625', to: '37634', kind: 'partial', dates: '25.10.2026 עד 28.2.2027',
      note: 'צמצום לנתיב אחד בכל כיוון'
    }
  ];

  /* Detour requests. The alternative route itself is computed by the
     engine from the closure the request belongs to. */
  var TICKETS = [
    {
      id: 'DT-0418', closure: 'HL-2611', line: '439', op: 'אגד', mine: true,
      title: 'הסטת קו 439 מרחוב הרצל, רחובות',
      schedule: { from: '22.11.2026', to: '3.12.2026', days: 'א׳ עד ה׳', hours: '22:00 עד 05:00' },
      drawing: 'HL-2611-TNU-03.dwg, גרסה 3',
      approvals: {
        tlv: { status: 'approved', at: '19.11.2026 14:20', note: '' },
        jer: { status: 'pending', asked: '18.11.2026 09:15', reminders: 1 }
      },
      audit: [
        { at: '18.11.2026 09:12', who: 'קבלן מבצע, מקטע רחובות', what: 'הגיש בקשת הסטה', more: 'צורף שרטוט HL-2611-TNU-02.dwg, גרסה 2' },
        { at: '18.11.2026 09:12', who: 'המערכת', what: 'זיהתה שני מחוזות על מסלול הקו ופתחה משימת אישור לכל אחד', more: 'מחוז תל אביב והמרכז, מחוז ירושלים' },
        { at: '18.11.2026 16:40', who: 'ממונה תח"צ, מחוז תל אביב והמרכז', what: 'ביקש תיקון', more: 'להוסיף תחנה חלופית ברחוב מנוחה ונחלה' },
        { at: '19.11.2026 08:05', who: 'קבלן מבצע, מקטע רחובות', what: 'העלה שרטוט מתוקן', more: 'HL-2611-TNU-03.dwg, גרסה 3' },
        { at: '19.11.2026 14:20', who: 'ממונה תח"צ, מחוז תל אביב והמרכז', what: 'אישר את ההסטה', more: '' },
        { at: '20.11.2026 10:00', who: 'המערכת', what: 'שלחה תזכורת לממונה תח"צ, מחוז ירושלים', more: 'המשימה פתוחה 48 שעות' }
      ]
    },
    {
      id: 'DT-0421', closure: 'HL-2611', line: '301', op: 'אגד', mine: true,
      title: 'הסטת קו 301 מרחוב הרצל, רחובות',
      schedule: { from: '22.11.2026', to: '3.12.2026', days: 'א׳ עד ה׳', hours: '22:00 עד 05:00' },
      drawing: 'HL-2611-TNU-03.dwg, גרסה 3',
      approvals: {
        tlv: { status: 'approved', at: '19.11.2026 14:22', note: '' },
        south: { status: 'reserved', at: '20.11.2026 11:30', note: 'האישור מותנה בשילוט תחנה חלופית בשדרות הקיבוצים' }
      },
      audit: [
        { at: '18.11.2026 09:14', who: 'קבלן מבצע, מקטע רחובות', what: 'הגיש בקשת הסטה', more: '' },
        { at: '18.11.2026 09:14', who: 'המערכת', what: 'זיהתה שני מחוזות על מסלול הקו ופתחה משימת אישור לכל אחד', more: 'מחוז תל אביב והמרכז, מחוז דרום' },
        { at: '19.11.2026 14:22', who: 'ממונה תח"צ, מחוז תל אביב והמרכז', what: 'אישר את ההסטה', more: '' },
        { at: '20.11.2026 11:30', who: 'ממונה תח"צ, מחוז דרום', what: 'רשם הסתייגות', more: 'האישור מותנה בשילוט תחנה חלופית בשדרות הקיבוצים' }
      ]
    },
    {
      id: 'DT-0415', closure: 'HL-2611', line: '274', op: 'אגד', mine: true,
      title: 'הסטת קו 274 מרחוב הרצל, רחובות',
      schedule: { from: '22.11.2026', to: '3.12.2026', days: 'א׳ עד ה׳', hours: '22:00 עד 05:00' },
      drawing: 'HL-2611-TNU-03.dwg, גרסה 3',
      approvals: { tlv: { status: 'approved', at: '19.11.2026 14:18', note: '' } },
      audit: [
        { at: '17.11.2026 13:02', who: 'קבלן מבצע, מקטע רחובות', what: 'הגיש בקשת הסטה', more: '' },
        { at: '17.11.2026 13:02', who: 'המערכת', what: 'זיהתה מחוז אחד על מסלול הקו ופתחה משימת אישור', more: 'מחוז תל אביב והמרכז' },
        { at: '19.11.2026 14:18', who: 'ממונה תח"צ, מחוז תל אביב והמרכז', what: 'אישר את ההסטה', more: '' },
        { at: '19.11.2026 14:18', who: 'המערכת', what: 'שלחה חיווי "הסדר מאושר לתח"צ" לקבלן ולמפעיל', more: 'אגד' }
      ]
    },
    {
      id: 'DT-0425', closure: 'HL-2611', line: '883', op: 'קווים', mine: true,
      title: 'הסטת קו 883 מרחוב הרצל, רחובות',
      schedule: { from: '22.11.2026', to: '3.12.2026', days: 'א׳ עד ה׳', hours: '22:00 עד 05:00' },
      drawing: 'HL-2611-TNU-03.dwg, גרסה 3',
      approvals: {
        tlv: { status: 'pending', asked: '21.11.2026 17:45', reminders: 0 },
        jer: { status: 'pending', asked: '21.11.2026 17:45', reminders: 0 }
      },
      audit: [
        { at: '21.11.2026 17:45', who: 'קבלן מבצע, מקטע רחובות', what: 'הגיש בקשת הסטה', more: 'הקו נוסף לבקשה לאחר בדיקת הקונפליקטים' },
        { at: '21.11.2026 17:45', who: 'המערכת', what: 'זיהתה שני מחוזות על מסלול הקו ופתחה משימת אישור לכל אחד', more: 'מחוז תל אביב והמרכז, מחוז ירושלים' }
      ]
    }
  ];

  /* Changes the nightly GTFS comparison "found" (invented, placed on real stops). */
  var DELTAS = [
    {
      id: 'GD-1', type: 'route', level: 'serious', line: '439', op: 'אגד', ticket: 'DT-0418',
      title: 'קו 439 מדווח מסלול שונה מההסטה שבכרטיסייה',
      text: 'ב-GTFS של הלילה הקו עוקף דרך שאול טשרניחובסקי. ההסטה שהוגשה ב-DT-0418 עוברת דרך מנוחה ונחלה, והיא עדיין באישור חלקי.'
    },
    {
      id: 'GD-2', type: 'moved', level: 'warning', stop: '34737', metres: 38,
      title: 'תחנה הוזזה 38 מטר בתוך תחום הסדר פעיל',
      text: 'התחנה הוזזה דרומה. המיקום החדש נמצא בתוך המקטע שנחסם בלילות לפי HL-2611.'
    },
    {
      id: 'GD-3', type: 'removed', level: 'warning', stop: '32145',
      title: 'תחנה נגרעה מהקובץ בתחום הסדר פעיל',
      text: 'התחנה אינה מופיעה ב-GTFS של הלילה. בהסדר HL-2611 היא מסומנת כתחנה פעילה בשעות היום.'
    },
    {
      id: 'GD-4', type: 'added', level: 'good', stop: '35674',
      title: 'תחנה זמנית נוספה לקו 274',
      text: 'התחנה נוספה למסלול הקו ותואמת את התחנה החלופית שאושרה ב-DT-0415.'
    }
  ];

  var RUNS = [
    { date: '22.11', changes: 4, flagged: 3, minutes: 4.2 },
    { date: '21.11', changes: 0, flagged: 0, minutes: 4.0 },
    { date: '20.11', changes: 2, flagged: 0, minutes: 4.1 },
    { date: '19.11', changes: 7, flagged: 2, minutes: 4.4 },
    { date: '18.11', changes: 1, flagged: 0, minutes: 3.9 },
    { date: '17.11', changes: 3, flagged: 1, minutes: 4.1 },
    { date: '16.11', changes: 0, flagged: 0, minutes: 4.0 }
  ];

  var ROLES = [
    {
      id: 'mgmt', name: 'הנהלת הרשות לתח"צ', sub: 'מבט מטרופוליני', home: 'overview',
      view: 'כלל-ארצי ומטרופוליני, דשבורד מנהלים', edit: 'אין', approve: 'צפייה בסטטוסי אישור ובמדדי שירות',
      can: {}
    },
    {
      id: 'dist_tlv', name: 'ממונה תח"צ מחוזי', sub: 'מחוז תל אביב והמרכז', home: 'night', district: 'tlv',
      view: 'תחום המחוז וקווים חוצי מחוזות', edit: 'הזנת הערות ודרישות תיקון להסדר', approve: 'אישור או דחייה רשמיים של הסטת מסלול',
      can: { approve: true, comment: true }
    },
    {
      id: 'dist_jer', name: 'ממונה תח"צ מחוזי', sub: 'מחוז ירושלים', home: 'detours', district: 'jer',
      view: 'תחום המחוז וקווים חוצי מחוזות', edit: 'הזנת הערות ודרישות תיקון להסדר', approve: 'אישור או דחייה רשמיים של הסטת מסלול',
      can: { approve: true, comment: true }, hidden: true
    },
    {
      id: 'coord', name: 'מתאם תח"צ בפרויקט', sub: 'הקו הכחול', home: 'night',
      view: 'גזרת הפרויקט וצירי המעטפת הסמוכים', edit: 'הזנת הצעות לקונפליקטים, עדכון סטטוס טיפול', approve: 'בדיקת התאמת הסדרי הקבלן בשטח',
      can: { propose: true, status: true, night: true }
    },
    {
      id: 'contractor', name: 'קבלן או יוזם תוכנית', sub: 'הקו הכחול, מקטע רחובות', home: 'night',
      view: 'ההסדרים שלו בלבד', edit: 'העלאת שרטוטים, הזנת בקשת הסטה והסדרי לילה', approve: 'קבלת חיווי והתראות קונפליקט',
      can: { night: true, request: true }, ownOnly: true
    }
  ];

  function districtOfCity(city) { return CITY_DISTRICT[city] || 'tlv'; }

  /* Tie the scenario to the network: resolve stop codes to segments. */
  function resolve(G, Engine) {
    var byCode = {};
    G.stops.forEach(function (s) { byCode[s.c] = s; });

    function segsBetween(fromCode, toCode) {
      var a = byCode[fromCode], b = byCode[toCode];
      if (!a || !b) return [];
      var best = null;
      G.pat.forEach(function (p) {
        var ia = p.st.indexOf(a.i), ib = p.st.indexOf(b.i);
        if (ia < 0 || ib < 0 || ia === ib) return;
        var span = Math.abs(p.sp[ib] - p.sp[ia]);
        if (span > 30) return;
        if (!best || span < best.span || (span === best.span && p.n > best.p.n)) best = { p: p, span: span };
      });
      return best ? Engine.stretch(G, best.p, a.i, b.i) : [];
    }

    CLOSURES.forEach(function (c) { c.segs = segsBetween(c.from, c.to); c.night = true; });
    ARRANGEMENTS.forEach(function (a) {
      a.segs = segsBetween(a.from, a.to); a.start = 0; a.end = 48 * 60;
    });
    DELTAS.forEach(function (d) { if (d.stop) d.stopRef = byCode[d.stop]; });
    return byCode;
  }

  root.Scenario = {
    NOW: NOW, NIGHT: NIGHT, DISTRICTS: DISTRICTS, PROJECTS: PROJECTS, KINDS: KINDS,
    CLOSURES: CLOSURES, ARRANGEMENTS: ARRANGEMENTS, TICKETS: TICKETS, DELTAS: DELTAS,
    RUNS: RUNS, ROLES: ROLES, districtOfCity: districtOfCity, resolve: resolve
  };
})(this);
