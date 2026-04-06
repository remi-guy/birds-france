# 🐦 Analyse des données d'observation d'oiseaux en France

## 📌 Objectif

Ce projet vise à :

- Structurer et nettoyer des données d’occurrences d’oiseaux en France  
- Associer chaque observation à une classe d’occupation du sol (OSO 2024)  
- Produire un dataset enrichi pour analyse d’habitat  
- Explorer l’évolution spatio-temporelle des observations  
- Mettre en évidence l’impact potentiel d’événements externes sur ces observations  

Cas d’étude actuel : **Tétras lyre (*Lyrurus tetrix*)**  
Autre proposition : la famille des **Phasianidae**

---

## 🎯 Problématique

**Quel est l’impact des événements externes (politiques publiques, développement des technologies comme les smartphones, essor des sciences participatives) sur l’évolution des observations d’oiseaux en France ?**

L’objectif est d’identifier si certaines ruptures dans les données peuvent être associées à :
- des changements réglementaires,
- des programmes environnementaux,
- ou des évolutions technologiques facilitant l’observation.

---

## 🧠 Approche

Le projet s’appuie sur une logique en quatre étapes :

1. **Constat**  
   Les observations d’oiseaux évoluent fortement dans le temps.

2. **Identification de ruptures**  
   Recherche de périodes de forte augmentation ou de changement.

3. **Mise en relation avec des événements externes**  
   Comparaison avec :
   - l’essor des smartphones,
   - le développement des plateformes participatives,
   - certaines politiques environnementales.

4. **Interprétation**  
   Analyse du rôle potentiel de ces facteurs dans les tendances observées.

---

## 🗺️ Visualisation

### Carte interactive (principale)

- Carte de la France avec maillage spatial (10 km × 10 km)  
- Densité d’observations par zone  
- Slider temporel  
- Sélection d’espèces  

**Objectif :**
- Observer l’évolution spatiale des observations  
- Identifier si les changements sont homogènes ou localisés  

---

### Évolution temporelle

- Graphique du nombre d’observations par année  
- Filtrage par espèce  

**Objectif :**
- Détecter des ruptures ou accélérations  
- Comparer les dynamiques entre espèces  

---

### Enrichissement analytique

Ajout d’événements externes sous forme de repères temporels :

- diffusion des smartphones  
- essor des sciences participatives  
- politiques environnementales  

Ces éléments permettent d’interpréter les changements observés.

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
│       ├── departements-20170102.*
│       ├── sig_metrop.*
├── notebook
│   └── explo.ipynb
├── requirements.txt
└── src
    ├── build_gdf.py
    ├── build_vernacular_mapping.py
    └── df_to_parquet.py