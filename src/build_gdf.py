import geopandas as gpd
import pandas as pd
import rasterio
import numpy as np

# Charger dataset
df = pd.read_parquet("./data/raw/oiseaux-france.parquet")

# Option recommandé : commencer par une espèce
df_tetras = df[df["species"] == "Lyrurus tetrix"]

gdf = gpd.GeoDataFrame(
    df_tetras,
    geometry=gpd.points_from_xy(
        df_tetras.decimalLongitude,
        df_tetras.decimalLatitude
    ),
    crs="EPSG:4326"
)

# Charger raster OSO
oso_path = "./data/raster/OCS_2024.tif"

with rasterio.open(oso_path) as src:
    
    # Reprojection vers CRS raster
    gdf_proj = gdf.to_crs(src.crs)
    
    # Coordonnées des points
    coords = np.array(
        [(x, y) for x, y in zip(
            gdf_proj.geometry.x,
            gdf_proj.geometry.y
        )]
    )
    
    # Extraction des valeurs raster
    oso_values = [val[0] for val in src.sample(coords)]

# Ajouter colonne OSO
gdf["oso_2024"] = oso_values

print("Extraction OSO terminée.")
mapping_oso = pd.read_csv("./data/raw/oso_2024_mapping.csv", sep=";")

gdf = gdf.merge(
    mapping_oso,
    left_on="oso_2024",
    right_on="code",
    how="left"
)

gdf.to_csv("./data/processed/tetras_oso.csv", index=False)