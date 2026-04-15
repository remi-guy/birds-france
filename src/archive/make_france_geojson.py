# make_france_geojson.py

import geopandas as gpd

deps = gpd.read_file("./data/shp/departements-20170102.shp")
fr = deps.dissolve()  # merge all departments into one geometry
fr = fr.to_crs("EPSG:4326")
fr.to_file("./web/france.geojson", driver="GeoJSON")
print("Wrote ./web/france.geojson")