# Convert a French departments shapefile to GeoJSON for Leaflet.
# Output is WGS84 (EPSG:4326) and simplified (optional).

from pathlib import Path
import geopandas as gpd

INPUT_SHP = Path("data/shp/departements-20170102.shp")
OUTPUT_GEOJSON = Path("web/departements.geojson")

def main():
    gdf = gpd.read_file(INPUT_SHP)

    # Reproject to WGS84 for Leaflet
    gdf = gdf.to_crs(epsg=4326)

    # Try to keep only useful columns (name/code may vary depending on source)
    keep_cols = []
    for c in ["code_insee", "CODE_DEPT", "code", "CODE", "nom", "NOM", "NOM_DEPT", "NAME"]:
        if c in gdf.columns:
            keep_cols.append(c)

    # If we didn't detect anything, keep all (safe fallback)
    if keep_cols:
        gdf = gdf[keep_cols + ["geometry"]]

    # Optional simplification to reduce file size (tweak tolerance if needed)
    # gdf["geometry"] = gdf["geometry"].simplify(tolerance=0.001, preserve_topology=True)

    OUTPUT_GEOJSON.parent.mkdir(parents=True, exist_ok=True)
    gdf.to_file(OUTPUT_GEOJSON, driver="GeoJSON")
    print(f"Wrote: {OUTPUT_GEOJSON.resolve()}")

if __name__ == "__main__":
    main()