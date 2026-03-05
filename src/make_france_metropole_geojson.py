import geopandas as gpd

deps = gpd.read_file("./data/shp/departements-20170102.shp")

# Keep metropolitan departments only:
# - exclude overseas: 971-976 (Guadeloupe, Martinique, Guyane, Réunion, Mayotte)
# - optionally exclude Corsica special handling: 2A/2B are still metro -> keep them
outre_mer_prefixes = ("97", "98")  # covers 971-989
deps["code_insee"] = deps["code_insee"].astype(str)

deps_metro = deps[~deps["code_insee"].str.startswith(outre_mer_prefixes)].copy()

# Dissolve into a single geometry
fr_metro = deps_metro.dissolve()
fr_metro = fr_metro.to_crs("EPSG:4326")

fr_metro.to_file("./web/france_metropole.geojson", driver="GeoJSON")
print("Wrote ./web/france_metropole.geojson")
print("Bounds:", fr_metro.total_bounds)