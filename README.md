# CompMockUp

A clickable mockup of the public-transport view of the national compilation
system (מערכת הקומפילציה): how the transit authority keeps hold of bus service
while infrastructure works close streets. The interface is in Hebrew,
right to left.

It covers the five modules of the functional spec:

| Screen | Module in the spec |
| --- | --- |
| הלילה הקרוב | Night works and short closures: fast entry, hour-by-hour conflict check, tonight's map |
| הסטות מסלול | Detour approval across districts, partial-approval block, audit log |
| עדכון GTFS | Daily GTFS pipeline and change detection |
| מפת תח"צ | Transit map layer: line and stop lookup, disruptions, proposed conflicts, Excel export |
| תפקידים, and the role switcher in the top bar | Roles and permissions |
| תמונת מצב | Management overview |

## Opening it

Open `index.html` in a browser. Nothing to install or build, and it works
offline: the map, fonts and data are all in the repository.

## What is real and what is invented

Real, taken from the Ministry of Transport GTFS feed dated 21.11.2026 for the
Blue Line corridor (Rehovot, Ness Ziona, Rishon LeZion and surroundings):
streets, 1,551 stops, 224 lines, route geometry and timetables. The map itself
is drawn from the bus route shapes, so it shows the streets buses run on.

Invented for the demonstration: every closure and traffic arrangement, the
detour requests, the approvals and audit entries, the proposed conflict, and
the GTFS changes on the GTFS screen. District boundaries are approximated from
stop cities.

Computed live in the browser from the real data: which trips, lines and stops
a closure hits in its time window, the shortest drivable detour, and whether
that detour is closed by another project at the same hours.

## A five-minute walkthrough

1. **הלילה הקרוב.** Press play on the night clock: buses move along their
   real timetable, and turn red on a closed stretch.
2. Open **הרצל, רחובות**. It is a red flag because the short bypass, Menucha
   VeNachala, is closed by another project at the same hours. Click a line to
   see its route and detour.
3. Open **ז'בוטינסקי, ראשון לציון**: a full closure with one trip in its
   window. A date-only check would have shown a conflict for every line there.
4. **הסטות מסלול**, ticket for line 439: one district approved, Jerusalem has
   not answered, so the detour is blocked. Switch role to
   ממונה תח"צ מחוזי, מחוז ירושלים, approve, and watch the status and audit log.
5. Switch role to קבלן or מתאם תח"צ and use **הזנת הסדר לילה**: click a street
   on the map and the conflict check updates as you go.
6. **עדכון GTFS**: line 439 reports a route that differs from the submitted
   detour.
7. **מפת תח"צ**: search a line number, click a stop, export to Excel.

## Rebuilding the data

Needs Python 3 with pandas and numpy, and the national GTFS zip
(`israel-public-transportation.zip` from gtfs.mot.gov.il).

```bash
python tools/extract_gtfs.py israel-public-transportation.zip work/
```

```bash
python tools/build_data.py work/ data/corridor.js
```

The demo date is set at the top of `tools/build_data.py`. The scenario in
`assets/js/scenario.js` anchors closures to stop codes, so after a rebuild
with a much newer feed check that those stops still exist.

## Layout

```
index.html
data/corridor.js          generated: network, stops, lines, night timetable
assets/js/engine.js       conflict and detour engine (no DOM, also runs in Node)
assets/js/scenario.js     the invented scenario
assets/js/map.js          map drawing
assets/js/app.js          state, navigation, actions
assets/js/views.js        the screens
assets/js/xlsx.js         small Excel writer
assets/css/app.css
assets/vendor/leaflet     Leaflet 1.9.4 (BSD-2-Clause)
assets/fonts              IBM Plex Sans Hebrew and Condensed (OFL)
tools/                    Python data build
```
