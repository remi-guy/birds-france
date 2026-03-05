# src/build_full_dataset.py
"""
Build a fully enriched dataset for storytelling:
- Load processed observations (e.g., phasianidae_oso.csv) containing a geometry column (WKT).
- Convert to GeoDataFrame.
- Spatially join French departments.
- Spatially join protected areas (sig_metrop).
- Add vernacular French names (TAXREF mapping).
- Export:
    - Parquet (fast, typed) without geometry
    - GeoJSON (web-friendly) with geometry
"""

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
    gdf = gpd.GeoDataFrame(df, geometry="geometry", crs=crs)
    return gdf


def _add_departments(gdf: gpd.GeoDataFrame, departments_shp: Path) -> gpd.GeoDataFrame:
    departments = gpd.read_file(departments_shp)
    # Ensure same CRS
    if departments.crs != gdf.crs:
        departments = departments.to_crs(gdf.crs)

    keep_cols = [c for c in ["nom", "code_insee", "geometry"] if c in departments.columns]
    if "geometry" not in keep_cols:
        keep_cols.append("geometry")

    gdf_dep = gpd.sjoin(
        gdf,
        departments[keep_cols],
        how="left",
        predicate="within",
    )
    return gdf_dep


def _load_protected_areas(sig_shp: Path, ep_site_csv: Path, designations_csv: Path) -> gpd.GeoDataFrame:
    # If .shx issues ever happen again, GDAL can rebuild it.
    os.environ["SHAPE_RESTORE_SHX"] = "YES"

    ep_sig = gpd.read_file(sig_shp)

    ep_site = pd.read_csv(ep_site_csv, sep=";", low_memory=False)
    designations = pd.read_csv(designations_csv, sep=";", low_memory=False)

    # Merge attributes onto geometry layer
    # NOTE: columns like 'cd_sig' / 'id_designation' must exist; adjust if your schema differs.
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
    # Ensure same CRS
    if ep.crs != gdf.crs:
        ep = ep.to_crs(gdf.crs)

    # Select useful columns if present
    wanted = ["cd_sig", "nom", "lb_designation", "abr_designation_sig", "categorie_uicn", "geometry"]
    ep_cols = [c for c in wanted if c in ep.columns]
    if "geometry" not in ep_cols:
        ep_cols.append("geometry")

    j = gpd.sjoin(
        gdf[["geometry"]],
        ep[ep_cols],
        how="left",
        predicate="within",
    )

    # Boolean: point inside at least one protected area
    in_ep = j["index_right"].notna().groupby(level=0).any()
    gdf = gdf.copy()
    gdf["in_ep"] = gdf.index.to_series().map(in_ep).fillna(False)

    # Aggregate names/types per point (handle multiple overlaps)
    def agg_unique(series: pd.Series) -> str:
        vals = sorted(set(map(str, series.dropna().tolist())))
        return "; ".join(vals) if vals else ""

    if "nom" in j.columns:
        names = j.groupby(level=0)["nom"].apply(agg_unique)
        gdf["ep_names"] = gdf.index.to_series().map(names).fillna("")

    if "lb_designation" in j.columns:
        types_full = j.groupby(level=0)["lb_designation"].apply(agg_unique)
        gdf["ep_types"] = gdf.index.to_series().map(types_full).fillna("")

    if "abr_designation_sig" in j.columns:
        types_abr = j.groupby(level=0)["abr_designation_sig"].apply(agg_unique)
        gdf["ep_types_abr"] = gdf.index.to_series().map(types_abr).fillna("")

    if "categorie_uicn" in j.columns:
        uicn = j.groupby(level=0)["categorie_uicn"].apply(agg_unique)
        gdf["ep_uicn_categories"] = gdf.index.to_series().map(uicn).fillna("")

    return gdf


def _add_vernacular_names(gdf: gpd.GeoDataFrame, mapping_csv: Path) -> gpd.GeoDataFrame:
    mapping = pd.read_csv(mapping_csv)
    if "species" not in mapping.columns:
        raise ValueError("Expected 'species' column in vernacular mapping CSV.")
    gdf = gdf.merge(mapping, on="species", how="left")
    return gdf


def main() -> None:
    root = Path(".").resolve()

    input_csv = root / "data" / "processed" / "phasianidae_oso.csv"
    vernacular_csv = root / "data" / "processed" / "taxref_species_vernacular_mapping.csv"

    departments_shp = root / "data" / "shp" / "departements-20170102.shp"

    sig_shp = root / "data" / "shp" / "sig_metrop.shp"
    ep_site_csv = root / "data" / "raw" / "ep_site.csv"
    designations_csv = root / "data" / "raw" / "liste_designations.csv"

    out_dir = root / "data" / "processed"
    out_dir.mkdir(parents=True, exist_ok=True)

    out_parquet = out_dir / "phasianidae_full_enriched.parquet"
    out_geojson = out_dir / "phasianidae_full_enriched.geojson"

    _ensure_paths_exist(
        input_csv,
        vernacular_csv,
        departments_shp,
        sig_shp,
        ep_site_csv,
        designations_csv,
    )

    print(f"[1/5] Loading points from: {input_csv}")
    gdf = _load_points_csv_with_wkt(input_csv, crs="EPSG:4326")

    print("[2/5] Adding departments (spatial join)...")
    gdf = _add_departments(gdf, departments_shp)

    print("[3/5] Loading protected areas + attributes...")
    ep = _load_protected_areas(sig_shp, ep_site_csv, designations_csv)

    print("[4/5] Adding protected-area tags (spatial join + aggregation)...")
    gdf = _add_protected_area_tags(gdf, ep)

    print("[5/5] Adding French vernacular names...")
    gdf = _add_vernacular_names(gdf, vernacular_csv)

    # Export: Parquet (no geometry) + GeoJSON (keep geometry)
    print(f"Exporting Parquet (no geometry): {out_parquet}")
    gdf.drop(columns=["geometry"]).to_parquet(out_parquet, index=False)

    print(f"Exporting GeoJSON (with geometry): {out_geojson}")
    gdf.to_file(out_geojson, driver="GeoJSON")

    print("Done.")
    print(f"Rows: {len(gdf):,}")
    print(f"Columns: {len(gdf.columns)}")
    print("Sample columns:", list(gdf.columns)[:12])


if __name__ == "__main__":
    main()