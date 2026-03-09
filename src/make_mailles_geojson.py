import geopandas as gpd

grid = gpd.read_file("data/shp/mailles_10km.shp")
grid = grid.loc[grid["territoire"] == "METROP", ["cd_sig", "geometry"]].copy()
grid.to_file("web/maille_10km_metrop.geojson", driver="GeoJSON")