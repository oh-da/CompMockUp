"""Stage 2 of the mockup data build: turn the corridor GTFS extract into the
JavaScript data file the mockup loads (data/corridor.js).

Usage:  python tools/build_data.py <work_dir> <out_js>

What it produces
  seg       street network: the union of all bus shapes, de-duplicated and cut
            into junction-to-junction segments. It doubles as the basemap and
            as the routing graph for detours.
  stops     every stop in the corridor.
  patterns  one entry per line direction running on the demo day: its path
            over the network, stop sequence, time offsets, hourly profile and
            the trip start times of the demo night (22:00-05:00).
            Start times are minutes after midnight of the demo day; offsets
            along the path are seconds after the start.
  feed      headline numbers of the feed, shown on the GTFS screen.
"""
import collections
import json
import math
import sys

import numpy as np
import pandas as pd

S, N, W, E = 31.855, 31.995, 34.715, 34.875
DEMO_DAY, DEMO_COL = 20261122, "sunday"      # the evening the demo "happens"
NEXT_DAY, NEXT_COL = 20261123, "monday"      # early-morning trips after midnight
COSLAT = math.cos(math.radians((S + N) / 2))


def metres(a, b):
    """Distance between two (lat*1e5, lon*1e5) integer points."""
    return math.hypot((a[0] - b[0]) * 1.1132, (a[1] - b[1]) * 1.1132 * COSLAT)


def seconds(hms):
    h, m, s = hms.split(":")
    return int(h) * 3600 + int(m) * 60 + int(s)


def simplify(pts, tol):
    """Douglas-Peucker on integer points, tolerance in metres."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        ax, ay = pts[i][1] * COSLAT, pts[i][0]
        bx, by = pts[j][1] * COSLAT, pts[j][0]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy) or 1e-9
        best, at = 0.0, -1
        for k in range(i + 1, j):
            px, py = pts[k][1] * COSLAT, pts[k][0]
            d = abs(dx * (ay - py) - (ax - px) * dy) / norm * 1.1132
            if d > best:
                best, at = d, k
        if best > tol:
            keep[at] = True
            stack += [(i, at), (at, j)]
    return [p for p, k in zip(pts, keep) if k]


def encode(pts):
    """Google polyline encoding (precision 5) of integer points."""
    out, prev = [], (0, 0)
    for p in pts:
        for v in (p[0] - prev[0], p[1] - prev[1]):
            v = ~(v << 1) if v < 0 else v << 1
            while v >= 0x20:
                out.append(chr((0x20 | (v & 0x1F)) + 63))
                v >>= 5
            out.append(chr(v + 63))
        prev = p
    return "".join(out)


def split_place(text):
    name, _, city = text.rpartition("-")
    return name.strip(), city.strip()


def main(work, out_js):
    load = lambda n: pd.read_pickle(f"{work}/{n}.pkl")
    stops, st, st_full, trips, routes, agency, cal, shapes = map(
        load, "stops st st_full trips routes agency calendar shapes".split())

    # ---------------------------------------------------------------- services
    def running(day, col):
        ok = (cal[col] == 1) & (cal.start_date <= day) & (cal.end_date >= day)
        return set(cal.loc[ok, "service_id"])

    bus_routes = routes[routes.route_type == 3]
    trips = trips[trips.route_id.isin(bus_routes.route_id)].copy()
    trips["shape_id"] = trips.shape_id.astype(int)
    today = trips[trips.service_id.isin(running(DEMO_DAY, DEMO_COL))]
    tomorrow = trips[trips.service_id.isin(running(NEXT_DAY, NEXT_COL))]

    st = st.sort_values(["trip_id", "stop_sequence"])
    st["sec"] = st.departure_time.map(seconds)
    # entry time into the corridor, in minutes after midnight
    first = st.groupby("trip_id").sec.first() // 60

    # ------------------------------------------------------------- the network
    sh = shapes[shapes.shape_id.isin(set(trips.shape_id))].sort_values(
        ["shape_id", "shape_pt_sequence"])
    sh = sh.assign(la=(sh.shape_pt_lat * 1e5).round().astype(int),
                   lo=(sh.shape_pt_lon * 1e5).round().astype(int))
    inside = sh.shape_pt_lat.between(S, N) & sh.shape_pt_lon.between(W, E)

    shape_runs = {}                # shape_id -> list of runs of points inside the box
    directed = set()
    breaks = set()                 # nodes where a segment must end
    for sid, g in sh[inside].groupby("shape_id"):
        pts = list(zip(g.la, g.lo))
        seq = list(g.shape_pt_sequence)
        runs, run = [], [pts[0]]
        for i in range(1, len(pts)):
            if seq[i] - seq[i - 1] != 1:
                runs.append(run)
                run = [pts[i]]
            elif pts[i] != run[-1]:
                run.append(pts[i])
        runs.append(run)
        runs = [r for r in runs if len(r) > 1]
        shape_runs[sid] = runs
        for r in runs:
            breaks.update((r[0], r[-1]))
            directed.update(zip(r, r[1:]))

    nbrs = collections.defaultdict(set)
    for a, b in directed:
        nbrs[a].add(b)
        nbrs[b].add(a)
    breaks |= {n for n, v in nbrs.items() if len(v) != 2}

    seg_nodes, edge_seg = [], {}   # edge_seg: undirected edge -> (segment, forward?)
    for start in breaks:
        for nxt in nbrs[start]:
            if tuple(sorted((start, nxt))) in edge_seg:
                continue
            chain = [start, nxt]
            while chain[-1] not in breaks:
                a, b = nbrs[chain[-1]]
                chain.append(b if a == chain[-2] else a)
            sid = len(seg_nodes)
            seg_nodes.append(chain)
            for a, b in zip(chain, chain[1:]):
                edge_seg[tuple(sorted((a, b)))] = (sid, a < b)
    # closed loops without any break node are ignored (none in practice)

    node_id = {}
    segs = []
    for chain in seg_nodes:
        fwd = all((a, b) in directed for a, b in zip(chain, chain[1:]))
        bwd = all((b, a) in directed for a, b in zip(chain, chain[1:]))
        length = sum(metres(a, b) for a, b in zip(chain, chain[1:]))
        segs.append(dict(
            a=node_id.setdefault(chain[0], len(node_id)),
            b=node_id.setdefault(chain[-1], len(node_id)),
            d=(1 if fwd else 0) | (2 if bwd else 0),
            l=round(length),
            g=encode(simplify(chain, 1.5)),
            n=0, _chain=chain,
        ))

    def path_of(run):
        """A run of shape points as a list of signed segment refs (+fwd / -bwd)."""
        out = []
        for a, b in zip(run, run[1:]):
            sid, low_first = edge_seg[tuple(sorted((a, b)))]
            chain = seg_nodes[sid]
            i = chain.index(a)
            forward = i + 1 < len(chain) and chain[i + 1] == b
            ref = (sid + 1) if forward else -(sid + 1)
            if not out or out[-1] != ref:
                out.append(ref)
        return out

    # --------------------------------------------------------------- patterns
    stop_idx = {}
    box = stops[stops.stop_lat.between(S, N) & stops.stop_lon.between(W, E)]
    desc = box.stop_desc.str.extract(r"רחוב:\s*(.*?)\s*עיר:\s*(.*?)\s*רציף:").fillna("")
    stop_rows = []
    for (_, r), (_, d) in zip(box.iterrows(), desc.iterrows()):
        stop_idx[r.stop_id] = len(stop_rows)
        street = (d[0] or "").strip()
        stop_rows.append(dict(
            c=r.stop_code, n=r.stop_name.replace("''", '"'),
            s=street.rstrip("0123456789 ").strip(), a=street,
            t=(d[1] or "").strip(), y=round(r.stop_lat, 5), x=round(r.stop_lon, 5)))

    ag_name = dict(zip(agency.agency_id, agency.agency_name))
    all_city = stops.set_index("stop_id").stop_desc.str.extract(r"עיר:\s*(.*?)\s*רציף:")[0].fillna("")
    all_name = stops.set_index("stop_id").stop_name
    all_xy = stops.set_index("stop_id")[["stop_lat", "stop_lon"]]

    week_first = first.to_frame("m").join(trips.set_index("trip_id")[["route_id"]], how="inner")
    patterns = []
    for rid, g in today.groupby("route_id"):
        shape_id = g.shape_id.value_counts().index[0]
        if shape_id not in shape_runs:
            continue
        g = g[g.shape_id == shape_id]
        rows = st[st.trip_id.isin(set(g.trip_id))]
        if rows.empty:
            continue
        rep_id = rows.groupby("trip_id").size().idxmax()
        rep = rows[rows.trip_id == rep_id]
        t0 = int(rep.sec.iloc[0])

        # path over the network and cumulative distance of each path element
        full = sh[sh.shape_id == shape_id]
        cum = np.concatenate([[0], np.cumsum([
            metres(a, b) for a, b in zip(zip(full.la, full.lo), list(zip(full.la, full.lo))[1:])])])
        at = {}
        for p, c in zip(zip(full.la, full.lo), cum):
            at.setdefault(p, c)
        path, mids = [], []
        for run in shape_runs[shape_id]:
            for ref in path_of(run):
                chain = seg_nodes[abs(ref) - 1]
                mid = chain[len(chain) // 2]
                path.append(ref)
                mids.append(at.get(mid, at.get(chain[0], 0.0)))
        dist = rep.shape_dist_traveled.to_numpy(float)
        offs = (rep.sec.to_numpy() - t0).astype(float)   # seconds after entry
        if len(dist) > 1 and dist[-1] > dist[0]:
            seg_off = np.maximum.accumulate(np.interp(mids, dist, offs))
        else:
            seg_off = np.zeros(len(mids))
        stop_path = [int(np.argmin(np.abs(np.array(mids) - d))) for d in dist]

        r = bus_routes[bus_routes.route_id == rid].iloc[0]
        left, _, right = r.route_long_name.partition("<->")
        right = right.rsplit("-", 1)[0]
        (fn, fc), (tn, tc) = split_place(left), split_place(right)

        day_first = first.reindex(g.trip_id).dropna()
        hours = np.bincount((day_first.to_numpy(int) // 60) % 24, minlength=24)
        night = sorted(int(m) for m in day_first if m >= 20 * 60)
        early = tomorrow[(tomorrow.route_id == rid)]
        night += sorted(int(m) + 1440 for m in first.reindex(early.trip_id).dropna() if m < 6 * 60)
        wk = week_first[week_first.route_id == rid].m % 1440
        night_share = float(((wk >= 23 * 60) | (wk < 5 * 60)).mean()) if len(wk) else 0

        seq = st_full[st_full.trip_id.isin(set(trips[trips.route_id == rid].trip_id))]
        seq = seq.sort_values("stop_sequence")
        patterns.append(dict(
            id=int(rid), no=str(r.route_short_name), op=ag_name[r.agency_id],
            mk=str(r.route_desc), fn=fn, fc=fc, tn=tn, tc=tc,
            hs=str(g.trip_headsign.fillna("").iloc[0]).replace("_", ", "),
            p=path, o=[int(round(v)) for v in seg_off],
            st=[stop_idx[s] for s in rep.stop_id],
            so=[int(v) for v in offs], sp=stop_path,
            h=[int(v) for v in hours], nt=night, nl=night_share > 0.8,
            n=int(len(g)),
        ))
        # Lines that leave the corridor towards Jerusalem keep their full stop
        # list, so the cross-district approval flow can show them end to end.
        if (all_xy.stop_lon.reindex(seq.stop_id) > 34.97).any():
            patterns[-1]["full"] = [
                [all_name.get(s, "").replace("''", '"'), all_city.get(s, ""),
                 round(float(all_xy.stop_lat.get(s, 0)), 4),
                 round(float(all_xy.stop_lon.get(s, 0)), 4)]
                for s in seq.stop_id]
        for ref in path:
            segs[abs(ref) - 1]["n"] += len(g)

    # rail stations in the corridor (the feed has no rail shapes)
    rail_trips = set(load("trips")[lambda t: t.route_id.isin(
        routes[routes.route_type == 2].route_id)].trip_id)
    rail_stops = {stop_idx[s] for s in st[st.trip_id.isin(rail_trips)].stop_id.unique()}
    used = {i for p in patterns for i in p["st"]} | rail_stops
    remap, kept = {}, []
    for i, row in enumerate(stop_rows):
        if i in used:
            remap[i] = len(kept)
            if i in rail_stops:
                row["r"] = 1
            kept.append(row)
    for p in patterns:
        p["st"] = [remap[i] for i in p["st"]]

    for s in segs:
        del s["_chain"]

    data = dict(
        bbox=[S, W, N, E],
        demoDay=DEMO_DAY,
        seg=segs, nodes=len(node_id), stops=kept, patterns=patterns,
        feed=dict(
            stops=len(kept), stopsNational=int(len(stops)),
            routes=int(bus_routes.route_id.nunique()),
            lines=len({(p["op"], p["no"]) for p in patterns}),
            tripsToday=int(len(today)), shapes=len(shape_runs),
            operators=sorted({p["op"] for p in patterns}),
            networkKm=round(sum(s["l"] for s in segs) / 1000),
        ),
    )
    with open(out_js, "w", encoding="utf-8") as f:
        f.write("// Generated by tools/build_data.py from the national GTFS feed. Do not edit.\n")
        f.write("window.CORRIDOR = ")
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print({k: (len(v) if hasattr(v, "__len__") else v) for k, v in data.items()})
    print(data["feed"])


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
