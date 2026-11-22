"""Stage 1 of the mockup data build: cut the national GTFS feed down to the
Blue Line corridor (Rehovot - Ness Ziona - Rishon LeZion).

Usage:  python tools/extract_gtfs.py <israel-public-transportation.zip> <work_dir>

Writes pickled DataFrames to <work_dir>; tools/build_data.py turns them into
the JavaScript data files the mockup loads.
"""
import sys
import zipfile

import pandas as pd

# Corridor bounding box (WGS84): Bilu junction in the south to Moshe Dayan
# station in the north.
S, N, W, E = 31.855, 31.995, 34.715, 34.875
COLS = ["trip_id", "departure_time", "stop_id", "stop_sequence", "shape_dist_traveled"]


def main(zip_path, work):
    z = zipfile.ZipFile(zip_path)

    def read(name, **kw):
        return pd.read_csv(z.open(name), encoding="utf-8-sig", **kw)

    stops = read("stops.txt", dtype={"stop_code": str})
    in_box = stops.stop_lat.between(S, N) & stops.stop_lon.between(W, E)
    box_ids = set(stops.loc[in_box, "stop_id"])
    print("stops in corridor:", len(box_ids))

    # stop_times is ~500 MB: stream it and keep only rows at corridor stops.
    keep = []
    for chunk in read(
        "stop_times.txt",
        usecols=COLS,
        chunksize=2_000_000,
    ):
        keep.append(chunk[chunk.stop_id.isin(box_ids)])
    st = pd.concat(keep, ignore_index=True)
    print("stop_times rows in corridor:", len(st))

    # Second pass: the full stop sequence (also outside the corridor) of one
    # trip per route, so cross-district lines can be shown end to end.
    one_per_route = set(
        st.groupby("trip_id").size().rename("n").reset_index()
        .merge(read("trips.txt", usecols=["trip_id", "route_id"]))
        .sort_values("n").groupby("route_id").trip_id.last()
    )
    keep = []
    for chunk in read("stop_times.txt", usecols=COLS, chunksize=2_000_000):
        keep.append(chunk[chunk.trip_id.isin(one_per_route)])
    st_full = pd.concat(keep, ignore_index=True)

    trips = read("trips.txt")
    trips = trips[trips.trip_id.isin(set(st.trip_id))]
    routes = read("routes.txt")
    routes = routes[routes.route_id.isin(set(trips.route_id))]
    agency = read("agency.txt")
    calendar = read("calendar.txt")
    calendar = calendar[calendar.service_id.isin(set(trips.service_id))]

    shape_ids = set(trips.shape_id.dropna().astype(int))
    keep = []
    for chunk in read("shapes.txt", chunksize=3_000_000):
        keep.append(chunk[chunk.shape_id.isin(shape_ids)])
    shapes = pd.concat(keep, ignore_index=True)
    print("shapes:", shapes.shape_id.nunique(), "points:", len(shapes))

    for name, df in dict(
        stops=stops, st=st, st_full=st_full, trips=trips, routes=routes,
        agency=agency, calendar=calendar, shapes=shapes,
    ).items():
        df.to_pickle(f"{work}/{name}.pkl")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
