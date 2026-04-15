from __future__ import annotations

import argparse
from pathlib import Path

import geopandas as gpd


def ensure_exists(*paths: Path) -> None:
    missing = [str(p) for p in paths if not p.exists()]
    if missing:
        raise FileNotFoundError("Missing required files:\n- " + "\n- ".join(missing))


def build_france_metropole(departments_shp: Path, out_geojson: Path) -> None:
    deps = gpd.read_file(departments_shp)

    if "code_insee" not in deps.columns:
        raise ValueError("Expected 'code_insee' column in departments shapefile.")

    deps["code_insee"] = deps["code_insee"].astype(str)

    # Exclude overseas departments/territories
    deps_metro = deps[~deps["code_insee"].str.startswith(("97", "98"))].copy()

    fr_metro = deps_metro.dissolve()
    fr_metro = fr_metro.to_crs(epsg=4326)

    out_geojson.parent.mkdir(parents=True, exist_ok=True)
    fr_metro.to_file(out_geojson, driver="GeoJSON")
    print(f"Wrote {out_geojson}")


def build_grid_10km(grid_shp: Path, out_geojson: Path) -> None:
    grid = gpd.read_file(grid_shp)

    if "territoire" not in grid.columns or "cd_sig" not in grid.columns:
        raise ValueError("Expected 'territoire' and 'cd_sig' columns in mailles shapefile.")

    grid = grid.loc[grid["territoire"] == "METROP", ["cd_sig", "geometry"]].copy()

    if grid.crs is None:
        grid = grid.set_crs("EPSG:4326")
    else:
        grid = grid.to_crs(epsg=4326)

    out_geojson.parent.mkdir(parents=True, exist_ok=True)
    grid.to_file(out_geojson, driver="GeoJSON")
    print(f"Wrote {out_geojson}")


def build_sig_metrop(sig_shp: Path, out_geojson: Path, simplify_tolerance_m: float = 300.0) -> None:
    gdf = gpd.read_file(sig_shp)
    gdf = gdf[["geometry"]].copy()

    # Metric CRS for simplification
    gdf = gdf.to_crs(epsg=2154)

    # Remove empty/null geometries
    gdf = gdf[~gdf.geometry.is_empty & gdf.geometry.notnull()].copy()

    # Repair
    gdf["geometry"] = gdf.geometry.make_valid()

    # Simplify
    gdf["geometry"] = gdf.geometry.simplify(simplify_tolerance_m, preserve_topology=True)

    # Repair again after simplification
    gdf["geometry"] = gdf.geometry.make_valid()
    gdf = gdf[~gdf.geometry.is_empty & gdf.geometry.notnull()].copy()

    # Merge to a single geometry
    geom = gdf.union_all()

    out = gpd.GeoDataFrame(geometry=[geom], crs="EPSG:2154").to_crs(epsg=4326)

    out_geojson.parent.mkdir(parents=True, exist_ok=True)
    out.to_file(out_geojson, driver="GeoJSON")
    print(f"Wrote {out_geojson}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build GeoJSON base layers used by the website.")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--simplify", type=float, default=300.0, help="Simplification tolerance in meters for sig_metrop.")
    args = parser.parse_args()

    root = args.root

    departments_shp = root / "data" / "shp" / "departements-20170102.shp"
    grid_shp = root / "data" / "shp" / "mailles_10km.shp"
    sig_shp = root / "data" / "shp" / "sig_metrop.shp"

    out_fr = root / "web" / "data" / "france_metropole.geojson"
    out_grid = root / "web" / "data" / "maille_10km_metrop.geojson"
    out_sig = root / "web" / "data" / "sig_metrop.geojson"

    ensure_exists(departments_shp, grid_shp, sig_shp)

    build_france_metropole(departments_shp, out_fr)
    build_grid_10km(grid_shp, out_grid)
    build_sig_metrop(sig_shp, out_sig, simplify_tolerance_m=args.simplify)

    print("All web layers built successfully.")


if __name__ == "__main__":
    main()



