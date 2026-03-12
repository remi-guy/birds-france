# src/build_full_dataset.py
from __future__ import annotations

import os
from pathlib import Path

import pandas as pd
import geopandas as gpd
from shapely import wkt


def _ensure_paths_exist(*paths: Path) -> None:
    missing = [str(p) for p in paths if not p.exists()]
    if missing:
        raise FileNotFoundError("Missing required files:\n- " + "\n- ".join(missing))


def _load_points_csv_with_wkt(csv_path: Path, crs: str = "EPSG:4326") -> gpd.GeoDataFrame:
    df = pd.read_csv(csv_path)
    if "geometry" not in df.columns:
        raise ValueError(
            f"'geometry' column not found in {csv_path}. "
            "Expected WKT geometry exported from a GeoDataFrame."
        )
    df["geometry"] = df["geometry"].apply(wkt.loads)
    return gpd.GeoDataFrame(df, geometry="geometry", crs=crs)


def _add_departments(gdf: gpd.GeoDataFrame, departments_shp: Path) -> gpd.GeoDataFrame:
    departments = gpd.read_file(departments_shp)
    if departments.crs != gdf.crs:
        departments = departments.to_crs(gdf.crs)

    keep_cols = [c for c in ["nom", "code_insee", "geometry"] if c in departments.columns]

    gdf_dep = gpd.sjoin(
        gdf,
        departments[keep_cols],
        how="left",
        predicate="within",
    )

    if "index_right" in gdf_dep.columns:
        gdf_dep = gdf_dep.drop(columns=["index_right"])

    return gdf_dep


def _load_protected_areas(sig_shp: Path, ep_site_csv: Path, designations_csv: Path) -> gpd.GeoDataFrame:
    os.environ["SHAPE_RESTORE_SHX"] = "YES"

    ep_sig = gpd.read_file(sig_shp)
    ep_site = pd.read_csv(ep_site_csv, sep=";", low_memory=False)
    designations = pd.read_csv(designations_csv, sep=";", low_memory=False)

    if "cd_sig" in ep_site.columns and "cd_sig" in ep_sig.columns:
        ep = ep_sig.merge(ep_site, on="cd_sig", how="left")
    else:
        ep = ep_sig.copy()

    if "id_designation" in ep.columns and "id_designation" in designations.columns:
        ep = ep.merge(designations, on="id_designation", how="left")

    return ep


def _add_protected_area_tags(
    gdf: gpd.GeoDataFrame,
    ep: gpd.GeoDataFrame,
) -> gpd.GeoDataFrame:
    if ep.crs != gdf.crs:
        ep = ep.to_crs(gdf.crs)

    wanted = ["cd_sig", "nom", "lb_designation", "abr_designation_sig", "categorie_uicn", "geometry"]
    ep_cols = [c for c in wanted if c in ep.columns]

    j = gpd.sjoin(
        gdf[["geometry"]],
        ep[ep_cols],
        how="left",
        predicate="within",
    )

    in_ep = j["index_right"].notna().groupby(level=0).any()

    gdf = gdf.copy()
    gdf["in_ep"] = gdf.index.to_series().map(in_ep).fillna(False)

    def agg_unique(series: pd.Series) -> str:
        vals = sorted(set(map(str, series.dropna().tolist())))
        return "; ".join(vals) if vals else ""

    if "nom" in j.columns:
        gdf["ep_names"] = gdf.index.to_series().map(
            j.groupby(level=0)["nom"].apply(agg_unique)
        ).fillna("")

    if "lb_designation" in j.columns:
        gdf["ep_types"] = gdf.index.to_series().map(
            j.groupby(level=0)["lb_designation"].apply(agg_unique)
        ).fillna("")

    if "abr_designation_sig" in j.columns:
        gdf["ep_types_abr"] = gdf.index.to_series().map(
            j.groupby(level=0)["abr_designation_sig"].apply(agg_unique)
        ).fillna("")

    if "categorie_uicn" in j.columns:
        gdf["ep_uicn_categories"] = gdf.index.to_series().map(
            j.groupby(level=0)["categorie_uicn"].apply(agg_unique)
        ).fillna("")

    return gdf


def _add_vernacular_names(gdf: gpd.GeoDataFrame, mapping_csv: Path) -> gpd.GeoDataFrame:
    mapping = pd.read_csv(mapping_csv)
    if "species" not in mapping.columns:
        raise ValueError("Expected 'species' column in vernacular mapping CSV.")
    return gdf.merge(mapping, on="species", how="left")


def _add_grid_10km(gdf: gpd.GeoDataFrame, grid_shp: Path) -> gpd.GeoDataFrame:
    grid = gpd.read_file(grid_shp)

    required = {"cd_sig", "territoire", "geometry"}
    missing = required - set(grid.columns)
    if missing:
        raise ValueError(f"Missing columns in grid shapefile: {sorted(missing)}")

    grid = grid.loc[grid["territoire"] == "METROP", ["cd_sig", "geometry"]].copy()

    if grid.crs != gdf.crs:
        grid = grid.to_crs(gdf.crs)

    out = gpd.sjoin(
        gdf,
        grid,
        how="left",
        predicate="intersects",
    )

    out = out.rename(columns={"cd_sig": "grid_id"})

    if "index_right" in out.columns:
        out = out.drop(columns=["index_right"])

    return out


def _aggregate_by_species_grid_year(gdf: gpd.GeoDataFrame) -> pd.DataFrame:
    gdf = gdf.copy()
    gdf["year"] = pd.to_datetime(gdf["eventDate"], errors="coerce").dt.year.astype("Int64")

    summary = (
        gdf.dropna(subset=["species", "grid_id", "year"])
        .groupby(["species", "grid_id", "year"], as_index=False)
        .size()
        .rename(columns={"size": "n_obs"})
        .sort_values(["species", "grid_id", "year"])
    )

    return summary


def main() -> None:
    root = Path(".").resolve()

    input_csv = root / "data" / "processed" / "phasianidae_oso.csv"
    vernacular_csv = root / "data" / "processed" / "taxref_species_vernacular_mapping.csv"

    departments_shp = root / "data" / "shp" / "departements-20170102.shp"
    sig_shp = root / "data" / "shp" / "sig_metrop.shp"
    grid_10km_shp = root / "data" / "shp" / "mailles_10km.shp"

    ep_site_csv = root / "data" / "raw" / "ep_site.csv"
    designations_csv = root / "data" / "raw" / "liste_designations.csv"

    out_dir = root / "data" / "processed"
    out_dir.mkdir(parents=True, exist_ok=True)

    out_parquet = out_dir / "phasianidae_full_grid.parquet"
    out_geojson = out_dir / "phasianidae_full_grid.geojson"
    out_grid_year_csv = out_dir / "phasianidae_by_species_grid_year.csv"
    out_grid_year_parquet = out_dir / "phasianidae_by_species_grid_year.parquet"

    _ensure_paths_exist(
        input_csv,
        vernacular_csv,
        departments_shp,
        sig_shp,
        grid_10km_shp,
        ep_site_csv,
        designations_csv,
    )

    print(f"[1/7] Loading points from: {input_csv}")
    gdf = _load_points_csv_with_wkt(input_csv, crs="EPSG:4326")

    print("[2/7] Adding departments...")
    gdf = _add_departments(gdf, departments_shp)

    print("[3/7] Loading protected areas...")
    ep = _load_protected_areas(sig_shp, ep_site_csv, designations_csv)

    print("[4/7] Adding protected-area tags...")
    gdf = _add_protected_area_tags(gdf, ep)

    print("[5/7] Adding French vernacular names...")
    gdf = _add_vernacular_names(gdf, vernacular_csv)

    print("[6/7] Adding 10 km grid (METROP only)...")
    gdf = _add_grid_10km(gdf, grid_10km_shp)

    print("[7/7] Aggregating by species x grid x year...")
    summary = _aggregate_by_species_grid_year(gdf)

    print(f"Exporting detailed Parquet: {out_parquet}")
    gdf.drop(columns=["geometry"]).to_parquet(out_parquet, index=False)

    print(f"Exporting detailed GeoJSON: {out_geojson}")
    gdf.to_file(out_geojson, driver="GeoJSON")

    print(f"Exporting aggregated CSV: {out_grid_year_csv}")
    summary.to_csv(out_grid_year_csv, index=False)

    print(f"Exporting aggregated Parquet: {out_grid_year_parquet}")
    summary.to_parquet(out_grid_year_parquet, index=False)

    print("Done.")
    print(f"Detailed rows: {len(gdf):,}")
    print(f"Aggregated rows: {len(summary):,}")
    print(summary.head())


if __name__ == "__main__":
    main()