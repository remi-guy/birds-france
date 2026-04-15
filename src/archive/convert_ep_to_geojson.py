# src/convert_ep_to_geojson.py

import geopandas as gpd

gdf = gpd.read_file("./data/shp/sig_metrop.shp")
gdf = gdf[["geometry"]].copy()

# projection métrique pour simplifier en mètres
gdf = gdf.to_crs(epsg=2154)

# enlever géométries vides
gdf = gdf[~gdf.geometry.is_empty & gdf.geometry.notnull()].copy()

# réparer les géométries invalides
gdf["geometry"] = gdf.geometry.make_valid()

# simplifier
gdf["geometry"] = gdf.geometry.simplify(300, preserve_topology=True)

# re-réparer après simplification
gdf["geometry"] = gdf.geometry.make_valid()

# enlever ce qui serait devenu vide
gdf = gdf[~gdf.geometry.is_empty & gdf.geometry.notnull()].copy()

# fusion
geom = gdf.union_all()

# sortie
gdf_out = gpd.GeoDataFrame(geometry=[geom], crs="EPSG:2154")
gdf_out = gdf_out.to_crs(epsg=4326)

gdf_out.to_file("./data/processed/sig_metrop.geojson", driver="GeoJSON")