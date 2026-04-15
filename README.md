# Visualisation des galliformes de montagne en France

Ce projet propose une exploration interactive des observations de galliformes de montagne en France métropolitaine, à partir de données issues du **GBIF**.

L’objectif est de :

* visualiser où les espèces ont été observées,
* visualiser l'impact d'évènements extérieurs,
* analyser les niches écologiques fréquentées par les espèces.

---

## Aperçu du projet

Le site web interactif permet :

* une **carte des observations**
* une analyse de la **distribution altitudinale**
* une exploration des **habitats occupés**
* une estimation de la **proportion d’observations en espaces protégés**

---

##  Reproduire les données

**Les données utilisées par le site sont déjà présentes dans `web/data/`**. 
Cependant, il est possible de les recréer sous réserve de télécharger les données brutes. Ces données étant lourdes (fichiers géospaciaux volumineux, et le fichier d'observations d'oiseaux est conséquent lui aussi), elles sont disponible depuis le lien suivant :

 https://drive.google.com/drive/folders/1TSqjK7_xvk-3ldsbeE-efL3uRLDtxA5M?usp=drive_link 

Si vous téléchargez les données, il faut les inclure dans le dépot comme suit : 

```
├── data
│   ├── raster
│   │   └── OCS_2024.tif
│   ├── raw
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
│       ├── mailles_10km.cpg
│       ├── mailles_10km.dbf
│       ├── mailles_10km.prj
│       ├── mailles_10km.qmd
│       ├── mailles_10km.shp
│       ├── mailles_10km.shx
│       ├── sig_metrop.cpg
│       ├── sig_metrop.dbf
│       ├── sig_metrop.prj
│       ├── sig_metrop.shp
│       └── sig_metrop.shx
```

Les données utilisées par le site web peuvent ensuite être générées automatiquement à partir des scripts du dossier `src/`.

```bash
python src/build_web_layers.py
python src/build_occurrence_data.py
```

Ces scripts produisent les fichiers nécessaires dans :

```text
web/data/
```

---

## Lancer le site en local

1. Ouvrir le dossier du projet dans VS Code
2. Installer l’extension **Live Server**
3. Cliquer sur **Go Live**

---

##  Structure du projet

```text
project/
├── src/                # Scripts de traitement des données
│   ├── build_web_layers.py
│   └── build_occurrence_data.py
│
├── data/
│   ├── raw/            # Données sources (GBIF, TAXREF, etc.)
│   ├── shp/            # Shapefiles
│   └── raster/         # Données raster (occupation du sol)
│
├── web/                # Application web
│   ├── index.html
│   ├── pages/
│   ├── js/
│   ├── css/
│   ├── data/           # Données utilisées par le site
│   └── images/
│
└── README.md
```

---

## Données

Les données proviennent principalement de :

* **GBIF** (Global Biodiversity Information Facility) — occurrences d’espèces
* **INPN / PatriNat** — structuration des données en France
* **OSO 2024** — occupation du sol
* **TAXREF** — taxonomie des espèces
* **aires protégées** — données SIG

---

