# src/filter_phasianidae.py

import json
from pathlib import Path
import csv

INPUT = Path("data/processed/phasianidae_full_grid.geojson")
OUTPUT = Path("data/processed/phasianidae_filtered.geojson")
CSV_OUTPUT = Path("data/processed/phasianidae_filtered.csv")

ANNEE_MIN = 1980
ANNEE_MAX = 2021

ESPECES_SCIENTIFIQUES = {
    "Lyrurus tetrix",
    "Tetrao urogallus",
    "Lagopus muta",
    "Tetrastes bonasia",
    "Alectoris graeca",
}

with INPUT.open("r", encoding="utf-8") as f:
    geo = json.load(f)

features_filtrees = []

for feature in geo["features"]:
    props = feature.get("properties", {})

    # année
    annee = props.get("year")
    try:
        annee = int(annee)
    except:
        continue

    if annee > ANNEE_MAX or annee < ANNEE_MIN:
        continue

    # espèce
    espece = props.get("species")
    if espece not in ESPECES_SCIENTIFIQUES:
        continue

    features_filtrees.append(feature)

geo_filtre = {
    "type": "FeatureCollection",
    "features": features_filtrees,
}

with OUTPUT.open("w", encoding="utf-8") as f:
    json.dump(geo_filtre, f, ensure_ascii=False)

print(f"{len(features_filtrees)} observations gardées")


# récupérer toutes les clés possibles (colonnes)
all_keys = set()
for f in features_filtrees:
    all_keys.update(f.get("properties", {}).keys())

all_keys = sorted(all_keys)

# écriture CSV
with CSV_OUTPUT.open("w", encoding="utf-8", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=all_keys)
    writer.writeheader()

    for feat in features_filtrees:
        writer.writerow(feat.get("properties", {}))

print(f"CSV écrit : {CSV_OUTPUT}")