# src/build_vernacular_mapping.py

import pandas as pd

# ----------------------------
# 1️⃣ Charger TAXREF (taxonomie)
# ----------------------------

taxref = pd.read_csv(
    "./data/raw/TAXREFv18.txt",
    sep="\t",
    low_memory=False
)

# Garder oiseaux espèces uniquement
taxref = taxref[
    (taxref["CLASSE"] == "Aves") &
    (taxref["RANG"] == "ES")
][["CD_NOM", "LB_NOM"]]

taxref["LB_NOM"] = taxref["LB_NOM"].str.strip()

# ----------------------------
# 2️⃣ Charger TAXVERN (vernaculaires)
# ----------------------------

vernac = pd.read_csv(
    "./data/raw/TAXVERNv18.txt",
    sep="\t",
    low_memory=False
)

# Garder seulement français
vernac = vernac[
    vernac["ISO639_3"] == "fra"
][["CD_NOM", "LB_VERN"]]

# ----------------------------
# 3️⃣ Merge via CD_NOM
# ----------------------------

mapping = taxref.merge(
    vernac,
    on="CD_NOM",
    how="left"
)

mapping = mapping[["LB_NOM", "LB_VERN"]]
mapping.columns = ["species", "vernacularName_fr"]

# Supprimer doublons
mapping = mapping.drop_duplicates(subset="species")

mapping.to_csv("./data/processed/taxref_species_vernacular_mapping.csv", index=False)

print("Mapping TAXREF créé.")
print("Nombre d'espèces :", len(mapping))

