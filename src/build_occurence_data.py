from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
from shapely import wkt


ANNEE_MIN = 1980
ANNEE_MAX = 2021

ESPECES_SCIENTIFIQUES = {
    "Lyrurus tetrix",
    "Tetrao urogallus",
    "Lagopus muta",
    "Tetrastes bonasia",
    "Alectoris graeca",
}


def ensure_exists(*paths: Path) -> None:
    missing = [str(p) for p in paths if not p.exists()]
    if missing:
        raise FileNotFoundError("Missing required files:\n- " + "\n- ".join(missing))


def build_vernacular_mapping(taxref_path: Path, taxvern_path: Path) -> pd.DataFrame:
    taxref = pd.read_csv(taxref_path, sep="\t", low_memory=False)
    taxref = taxref[
        (taxref["CLASSE"] == "Aves") &
        (taxref["RANG"] == "ES")
    ][["CD_NOM", "LB_NOM"]].copy()
    taxref["LB_NOM"] = taxref["LB_NOM"].str.strip()

    vernac = pd.read_csv(taxvern_path, sep="\t", low_memory=False)
    vernac = vernac[vernac["ISO639_3"] == "fra"][["CD_NOM", "LB_VERN"]].copy()

    mapping = taxref.merge(vernac, on="CD_NOM", how="left")
    mapping = mapping[["LB_NOM", "LB_VERN"]].drop_duplicates(subset="LB_NOM")
    mapping.columns = ["species", "vernacularName_fr"]
    return mapping


def load_phasianidae_points_from_parquet(parquet_path: Path) -> gpd.GeoDataFrame:
    df = pd.read_parquet(parquet_path)

    required = {"family", "decimalLongitude", "decimalLatitude"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing columns in parquet: {missing}")

    df = df[df["family"] == "Phasianidae"].copy()

    gdf = gpd.GeoDataFrame(
        df,
        geometry=gpd.points_from_xy(df["decimalLongitude"], df["decimalLatitude"]),
        crs="EPSG:4326",
    )
    return gdf


def add_oso_values(gdf: gpd.GeoDataFrame, oso_raster_path: Path, oso_mapping_path: Path) -> gpd.GeoDataFrame:
    with rasterio.open(oso_raster_path) as src:
        gdf_proj = gdf.to_crs(src.crs)
        coords = np.array([(x, y) for x, y in zip(gdf_proj.geometry.x, gdf_proj.geometry.y)])
        oso_values = [val[0] for val in src.sample(coords)]

    gdf = gdf.copy()
    gdf["oso_2024"] = oso_values

    mapping_oso = pd.read_csv(oso_mapping_path, sep=";")
    if "code" in mapping_oso.columns:
        gdf = gdf.merge(mapping_oso, left_on="oso_2024", right_on="code", how="left")

    return gdf


def load_protected_areas(sig_shp: Path, ep_site_csv: Path, designations_csv: Path) -> gpd.GeoDataFrame:
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


def add_protected_area_tags(gdf: gpd.GeoDataFrame, ep: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    if ep.crs != gdf.crs:
        ep = ep.to_crs(gdf.crs)

    wanted = ["cd_sig", "nom", "lb_designation", "abr_designation_sig", "categorie_uicn", "geometry"]
    ep_cols = [c for c in wanted if c in ep.columns]
    if "geometry" not in ep_cols:
        ep_cols.append("geometry")

    joined = gpd.sjoin(
        gdf[["geometry"]],
        ep[ep_cols],
        how="left",
        predicate="within",
    )

    out = gdf.copy()
    in_ep = joined["index_right"].notna().groupby(level=0).any()
    out["in_ep"] = out.index.to_series().map(in_ep).fillna(False)

    def agg_unique(series: pd.Series) -> str:
        vals = sorted(set(map(str, series.dropna().tolist())))
        return "; ".join(vals) if vals else ""

    if "nom" in joined.columns:
        names = joined.groupby(level=0)["nom"].apply(agg_unique)
        out["ep_names"] = out.index.to_series().map(names).fillna("")

    if "lb_designation" in joined.columns:
        types_full = joined.groupby(level=0)["lb_designation"].apply(agg_unique)
        out["ep_types"] = out.index.to_series().map(types_full).fillna("")

    if "abr_designation_sig" in joined.columns:
        types_abr = joined.groupby(level=0)["abr_designation_sig"].apply(agg_unique)
        out["ep_types_abr"] = out.index.to_series().map(types_abr).fillna("")

    if "categorie_uicn" in joined.columns:
        uicn = joined.groupby(level=0)["categorie_uicn"].apply(agg_unique)
        out["ep_uicn_categories"] = out.index.to_series().map(uicn).fillna("")

    return out


def add_grid_10km(gdf: gpd.GeoDataFrame, grid_geojson: Path) -> gpd.GeoDataFrame:
    grid = gpd.read_file(grid_geojson)

    if "cd_sig" not in grid.columns:
        raise ValueError("Expected 'cd_sig' column in grid GeoJSON.")

    if grid.crs is None:
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


def filter_for_web(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    out = gdf.copy()

    # Harmonise year
    if "year" not in out.columns:
        if "eventDate" in out.columns:
            out["year"] = pd.to_datetime(out["eventDate"], errors="coerce").dt.year
        else:
            raise ValueError("Expected either 'year' or 'eventDate' column.")

    out["year"] = pd.to_numeric(out["year"], errors="coerce").astype("Int64")

    out = out[
        out["year"].between(ANNEE_MIN, ANNEE_MAX, inclusive="both") &
        out["species"].isin(ESPECES_SCIENTIFIQUES)
    ].copy()

    return out


def export_outputs(gdf: gpd.GeoDataFrame, geojson_out: Path, csv_out: Path) -> None:
    geojson_out.parent.mkdir(parents=True, exist_ok=True)
    csv_out.parent.mkdir(parents=True, exist_ok=True)

    gdf.to_file(geojson_out, driver="GeoJSON")
    print(f"Wrote {geojson_out}")

    df_csv = gdf.drop(columns=["geometry"]).copy()
    df_csv.to_csv(csv_out, index=False)
    print(f"Wrote {csv_out}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build filtered Phasianidae datasets used by the website.")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()

    root = args.root

    parquet_path = root / "data" / "raw" / "oiseaux-france.parquet"
    oso_raster_path = root / "data" / "raster" / "OCS_2024.tif"
    oso_mapping_path = root / "data" / "raw" / "oso_2024_mapping.csv"

    taxref_path = root / "data" / "raw" / "TAXREFv18.txt"
    taxvern_path = root / "data" / "raw" / "TAXVERNv18.txt"

    sig_shp = root / "data" / "shp" / "sig_metrop.shp"
    ep_site_csv = root / "data" / "raw" / "ep_site.csv"
    designations_csv = root / "data" / "raw" / "liste_designations.csv"

    grid_geojson = root / "web" / "data" / "maille_10km_metrop.geojson"

    out_geojson = root / "web" / "data" / "phasianidae_filtered.geojson"
    out_csv = root / "web" / "data" / "phasianidae_filtered.csv"

    ensure_exists(
        parquet_path,
        oso_raster_path,
        oso_mapping_path,
        taxref_path,
        taxvern_path,
        sig_shp,
        ep_site_csv,
        designations_csv,
        grid_geojson,
    )

    print("[1/6] Loading Phasianidae points from parquet...")
    gdf = load_phasianidae_points_from_parquet(parquet_path)

    print("[2/6] Adding OSO values...")
    gdf = add_oso_values(gdf, oso_raster_path, oso_mapping_path)

    print("[3/6] Building and adding vernacular mapping...")
    vernacular = build_vernacular_mapping(taxref_path, taxvern_path)
    gdf = gdf.merge(vernacular, on="species", how="left")

    print("[4/6] Loading protected areas and adding tags...")
    ep = load_protected_areas(sig_shp, ep_site_csv, designations_csv)
    gdf = add_protected_area_tags(gdf, ep)

    print("[5/6] Adding 10 km grid...")
    gdf = add_grid_10km(gdf, grid_geojson)

    print("[6/6] Filtering dataset for web export...")
    gdf = filter_for_web(gdf)

    export_outputs(gdf, out_geojson, out_csv)

    print("Done.")
    print(f"Rows exported: {len(gdf):,}")
    print(f"Columns exported: {len(gdf.columns)}")


if __name__ == "__main__":
    main()