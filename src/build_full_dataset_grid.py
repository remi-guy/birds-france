from pathlib import Path
import os

import pandas as pd
import geopandas as gpd
from shapely import wkt


# =========================
# 1. Load points
# =========================
def _load_points(csv_path: Path) -> gpd.GeoDataFrame:
    print(f"[1/5] Loading points from: {csv_path}")
    df = pd.read_csv(csv_path)

    print("Point columns:", list(df.columns))

    # Case 1: geometry already stored as WKT
    if "geometry" in df.columns:
        df["geometry"] = df["geometry"].apply(wkt.loads)
        gdf = gpd.GeoDataFrame(df, geometry="geometry", crs="EPSG:4326")
        return gdf

    # Case 2: GBIF-style coordinates
    if {"decimalLongitude", "decimalLatitude"}.issubset(df.columns):
        gdf = gpd.GeoDataFrame(
            df,
            geometry=gpd.points_from_xy(df["decimalLongitude"], df["decimalLatitude"]),
            crs="EPSG:4326",
        )
        return gdf

    # Case 3: generic lon/lat
    if {"longitude", "latitude"}.issubset(df.columns):
        gdf = gpd.GeoDataFrame(
            df,
            geometry=gpd.points_from_xy(df["longitude"], df["latitude"]),
            crs="EPSG:4326",
        )
        return gdf

    raise ValueError(
        "Could not build point geometries. Expected either "
        "'geometry' (WKT), or ('decimalLongitude', 'decimalLatitude'), "
        "or ('longitude', 'latitude')."
    )


# =========================
# 2. Add protected areas
# =========================
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
    print("[2/5] Adding protected-area tags...")

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


# =========================
# 3. Add French names
# =========================
def _add_vernacular_names(gdf: gpd.GeoDataFrame, mapping_csv: Path) -> gpd.GeoDataFrame:
    print("[3/5] Adding French vernacular names...")

    mapping = pd.read_csv(mapping_csv)
    if "species" not in mapping.columns:
        raise ValueError("Expected 'species' column in vernacular mapping CSV.")

    return gdf.merge(mapping, on="species", how="left")


# =========================
# 4. Add 10km grid using the web geojson with cd_sig
# =========================
def _add_grid_10km(gdf: gpd.GeoDataFrame, grid_geojson: Path) -> gpd.GeoDataFrame:
    print("[4/5] Adding 10 km grid (METROP only)...")

    grid = gpd.read_file(grid_geojson)

    print("Grid columns:", list(grid.columns))
    print("Grid CRS:", grid.crs)
    print(grid.head())

    if "geometry" not in grid.columns:
        raise ValueError("No geometry column found in grid file.")

    if "cd_sig" not in grid.columns:
        raise ValueError("Expected 'cd_sig' column in grid GeoJSON.")

    if grid.crs is None:
        print("Grid CRS is missing. Assuming EPSG:4326.")
        grid = grid.set_crs("EPSG:4326")

    if gdf.crs != grid.crs:
        grid = grid.to_crs(gdf.crs)

    grid = grid[["cd_sig", "geometry"]].copy()

    out = gpd.sjoin(
        gdf,
        grid,
        how="left",
        predicate="intersects",
    )

    if "index_right" in out.columns:
        out = out.drop(columns=["index_right"])

    return out


# =========================
# 5. Aggregate
# =========================
def _aggregate_by_species_grid_year(gdf: gpd.GeoDataFrame) -> pd.DataFrame:
    print("[5/5] Aggregating data...")

    gdf = gdf.copy()
    gdf["year"] = pd.to_datetime(gdf["eventDate"], errors="coerce").dt.year.astype("Int64")

    summary = (
        gdf.dropna(subset=["species", "cd_sig", "year"])
        .groupby(["species", "cd_sig", "year"], as_index=False)
        .size()
        .rename(columns={"size": "n_obs"})
        .sort_values(["species", "cd_sig", "year"])
    )

    print("Aggregation done:", summary.shape)
    return summary


# =========================
# Save outputs
# =========================
def _save_outputs(gdf: gpd.GeoDataFrame, summary: pd.DataFrame, out_dir: Path) -> None:
    print("Saving outputs...")

    out_dir.mkdir(parents=True, exist_ok=True)

    detailed_parquet = out_dir / "phasianidae_full_grid.parquet"
    detailed_geojson = out_dir / "phasianidae_full_grid.geojson"
    summary_csv = out_dir / "phasianidae_by_species_grid_year.csv"
    summary_parquet = out_dir / "phasianidae_by_species_grid_year.parquet"

    print(f"Exporting detailed Parquet: {detailed_parquet}")
    gdf.drop(columns=["geometry"]).to_parquet(detailed_parquet, index=False)

    print(f"Exporting detailed GeoJSON: {detailed_geojson}")
    gdf.to_file(detailed_geojson, driver="GeoJSON")

    print(f"Exporting aggregated CSV: {summary_csv}")
    summary.to_csv(summary_csv, index=False)

    print(f"Exporting aggregated Parquet: {summary_parquet}")
    summary.to_parquet(summary_parquet, index=False)

    print("Done.")
    print(f"Detailed rows: {len(gdf):,}")
    print(f"Aggregated rows: {len(summary):,}")
    print(summary.head())


# =========================
# MAIN
# =========================
def main() -> None:
    root = Path(__file__).resolve().parents[1]

    input_csv = root / "data" / "processed" / "phasianidae_oso.csv"
    vernacular_csv = root / "data" / "processed" / "taxref_species_vernacular_mapping.csv"

    sig_shp = root / "data" / "shp" / "sig_metrop.shp"
    ep_site_csv = root / "data" / "raw" / "ep_site.csv"
    designations_csv = root / "data" / "raw" / "liste_designations.csv"

    grid_geojson = root / "web" / "maille_10km_metrop.geojson"

    out_dir = root / "data" / "processed"

    required_paths = [
        input_csv,
        vernacular_csv,
        sig_shp,
        ep_site_csv,
        designations_csv,
        grid_geojson,
    ]

    missing = [str(p) for p in required_paths if not p.exists()]
    if missing:
        raise FileNotFoundError("Missing required files:\n- " + "\n- ".join(missing))

    gdf = _load_points(input_csv)

    print("[2/5] Loading protected areas...")
    ep = _load_protected_areas(sig_shp, ep_site_csv, designations_csv)
    gdf = _add_protected_area_tags(gdf, ep)

    gdf = _add_vernacular_names(gdf, vernacular_csv)
    gdf = _add_grid_10km(gdf, grid_geojson)

    summary = _aggregate_by_species_grid_year(gdf)
    _save_outputs(gdf, summary, out_dir)


if __name__ == "__main__":
    main()