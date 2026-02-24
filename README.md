# 🐦 Analyse des données d'observation d'oiseaux en France

## 📌 Objectif

Ce projet vise à :

- Structurer et nettoyer des données d’occurrences d’oiseaux en France
- Associer chaque observation à une classe d’occupation du sol (OSO 2024)
- Produire un dataset enrichi pour analyse d’habitat

Cas d’étude actuel : **Tétras lyre (*Lyrurus tetrix*)** 
Autre proposition : la famille des Phasianidae

---

## 📂 Structure du projet


```text
.
├── README.md
├── data
│   ├── processed
│   │   ├── phasianidae_oso.csv
│   │   ├── taxref_species_vernacular_mapping.csv
│   │   └── tetras_oso.csv
│   ├── raster
│   │   └── OCS_2024.tif
│   ├── raw
│   │   ├── IUCN_red_list.csv
│   │   ├── TAXREFv18.txt
│   │   ├── TAXVERNv18.txt
│   │   ├── ep_site.csv
│   │   ├── liste_designations.csv
│   │   ├── oiseaux-france.csv
│   │   ├── oiseaux-france.parquet
│   │   └── oso_2024_mapping.csv
│   └── shp
│       ├── departements-20170102.dbf
│       ├── departements-20170102.prj
│       ├── departements-20170102.shp
│       ├── departements-20170102.shx
│       ├── sig_metrop.cpg
│       ├── sig_metrop.dbf
│       ├── sig_metrop.prj
│       ├── sig_metrop.shp
│       └── sig_metrop.shx
├── notebook
│   └── explo.ipynb
├── requirements.txt
└── src
    ├── build_gdf.py
    ├── build_vernacular_mapping.py
    └── df_to_parquet.py

8 directories, 28 files
```

---

## ⚙️ Installation

### 1️⃣ Cloner le dépôt

```bash
git clone <repo_url>
cd <repo_name>
```

### 2️⃣ Créer un environnement virtuel

python -m venv .venv
source .venv/bin/activate      # macOS / Linux

### 3️⃣ Installer les dépendances

pip install -r requirements.txt

---

## 📊 Données

### 🐦 Occurrences d’oiseaux

Format : CSV / Parquet
Champs principaux :

species

decimalLatitude

decimalLongitude

### Occupation du sol

Raster : OCS_2024.tif
Résolution : ~10 m
Nomenclature : 23 classes (voir oso_2024_mapping.csv)

---

## 🚀 Pipeline

### 1️⃣ Conversion en Parquet

Script : src/df_to_parquet.py
Objectif : optimiser la lecture des données volumineuses.

### 2️⃣ Construction du GeoDataFrame

Script : src/build_gdf.py

Filtrage par espèce

Création des points (EPSG:4326)

Reprojection vers le CRS du raster

Extraction de la valeur OSO

Export du CSV final

### 3️⃣ Enrichissement des classes

Extraction du nom vernaculaire pour chaque espèce 
Jointure avec oso_2024_mapping.csv pour obtenir la signification des codes.