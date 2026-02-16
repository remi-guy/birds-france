import pandas as pd
# import glob
# import os

# Colonnes utiles pour ton projet montagne
cols = [
    "scientificName",
    "class",
    "order",
    "family",
    "genus",
    "species",
    "speciesKey",
    "decimalLatitude",
    "decimalLongitude",
    "coordinateUncertaintyInMeters",
    "elevation",
    "year",
    "month",
    "eventDate",
    "recordedBy"
]

# Lecture par morceaux pour éviter surcharge RAM
chunksize = 500_000
reader = pd.read_csv(
    "./data/raw/oiseaux-france.csv",
    sep="\t",
    usecols=cols,
    chunksize=chunksize,
    low_memory=False
)

parts = []

for chunk in reader:
    # Nettoyage minimal
    chunk = chunk.dropna(subset=["decimalLatitude", "decimalLongitude"])
    chunk = chunk[chunk["coordinateUncertaintyInMeters"] < 1000]
    chunk = chunk[chunk["year"].notna()]
    chunk = chunk[chunk["year"] >= 1970]
    
    # Optimisation mémoire
    cat_cols = ["class", "order", "family", "genus", "species"]
    for col in cat_cols:
        chunk[col] = chunk[col].astype("category")
    
    parts.append(chunk)

# Concaténation finale
df2 = pd.concat(parts, ignore_index=True)

# Sauvegarde parquet
df2.to_parquet("./data/raw/oiseaux-france.parquet", index=False)

print("Conversion terminée.")
print("Nombre de lignes :", len(df2))
print("Taille en RAM (GB) :", df2.memory_usage(deep=True).sum() / 1e9)