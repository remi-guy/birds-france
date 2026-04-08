import json
from pathlib import Path

INPUT = Path("data/processed/phasianidae_full_grid.geojson")
OUTPUT = Path("data/processed/phasianidae_filtered.geojson")

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