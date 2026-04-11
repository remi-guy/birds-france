
## Installation et lancement

### 1. Cloner le projet

```bash
git clone https://github.com/remi-guy/birds-france.git
cd birds-france
```

### 2. Créer un environnement virtuel

```bash
python -m venv venv
```

Activation :

- **Windows :** `venv\Scripts\activate`
- **Mac / Linux :** `source venv/bin/activate`

### 3. Installer les dépendances

```bash
pip install -r requirements.txt
```

### 4. Construire le dataset enrichi

Lancer les principaux scripts :

```bash
python src/build_full_dataset_grid.py
python src/filter_phasianidae.py
python src/convert_ep_to_geojson.py
```

Le premier script va :

- charger les observations
- enrichir les données (aires protégées, noms, etc.)
- associer les observations aux mailles 10 km
- générer les fichiers utilisés par le dashboard

Fichiers générés dans `data/processed/` :

- `phasianidae_full_grid.geojson`
- `phasianidae_by_species_grid_year.csv`

Le second script permet de se concentrer sur les 5 espèces de tétraonidés présentent en montagne, ce qui allège la visualisation.

Fichiers générés dans `data/processed` :
- `phasianidae_filtered.geojson`

Le troisième script va convertir les données d'espace protégés en un fichier geojson simplifié pour en faire un calque sur la visualisation principale.

Fichiers générés dans `data/processed` :
- `sig_metrop.geojson`



### 5. Lancer le dashboard

**Option 1 (Python)**

```bash
python3 -m http.server 8000 & explorer.exe http://localhost:8000/web/final_dashboard.html
```


**Option 2 (GoLive)**

Cliquer sur *GoLive* en bas à droite de l'écran



# Analyse des données d'observation d'oiseaux en France

## Objectif

Ce projet vise à :

- Structurer et nettoyer des données d’occurrences d’oiseaux en France  
- Associer chaque observation à une classe d’occupation du sol (OSO 2024)  
- Produire un dataset enrichi pour analyse spatiale et temporelle  
- Explorer l’évolution spatio-temporelle des observations  
- Mettre en évidence l’impact potentiel d’événements externes sur ces observations  
- Construire un dashboard interactif de data storytelling autour de la famille des Phasianidae  

**Cas d’étude principal : la famille des Phasianidae**

---

## Problématique

Quel est l’impact des événements externes (technologiques, sociétaux, écologiques) sur l’évolution des observations d’oiseaux en France ?

Plus précisément, le projet cherche à identifier si certaines ruptures visibles dans les données peuvent être mises en relation avec :

- l’essor des smartphones  
- le développement des applications mobiles  
- la montée des sciences participatives  
- certains événements écologiques ou sociétaux marquants  

L’objectif n’est pas de démontrer une causalité stricte, mais de proposer une analyse visuelle interprétative de ces alignements possibles.

---

## Approche

Le projet s’appuie sur une logique en quatre étapes :

1. **Constat**  
   Les observations d’oiseaux évoluent fortement dans le temps.

2. **Identification de ruptures**  
   Recherche de périodes de forte augmentation ou de changement dans les observations.

3. **Mise en relation avec des événements externes**  
   Comparaison avec des événements technologiques, sociétaux ou écologiques annotés sur la timeline.

4. **Interprétation**  
   Analyse du rôle potentiel de ces facteurs dans les tendances observées, avec prudence vis-à-vis de la causalité.

---

## Visualisation

### Dashboard interactif final

Le projet a été recentré sur une page finale unique :

- `web/final_dashboard.html`  
- `web/final_dashboard.js`  

Ce dashboard contient :

- une carte choroplèthe de la France métropolitaine par mailles 10 km  
- un slider temporel  
- un filtre par espèce  
- une barre de recherche et de tri  
- un mode année seule / cumulatif  
- une lecture automatique  
- une courbe temporelle du nombre d’observations  
- une box d’insights interprétatifs  

---

### Carte interactive

- Carte de la France métropolitaine avec maillage spatial 10 km × 10 km  
- Couleur représentant le nombre d’observations dans chaque maille  
- Filtrage temporel et par espèce  

**Objectifs :**

- Observer la diffusion spatiale des observations  
- Identifier des zones plus ou moins denses  
- Détecter des évolutions spatiales dans le temps  

---

### Évolution temporelle

- Graphique du nombre d’observations par année  
- Filtrage par espèce  
- Annotation d’événements externes  

**Objectifs :**

- Détecter des ruptures ou accélérations  
- Comparer les dynamiques entre espèces  
- Mettre en relation les évolutions avec des événements externes plausibles  

---

### Enrichissement analytique

Le graphique temporel intègre des événements annotés, par exemple :

- Canicule de 2003  
- Essor des smartphones  
- Boom des applications mobiles  
- Plateformes participatives  
- Boom des sciences participatives  
- COVID / confinements  

Ces repères permettent d’interpréter visuellement les changements observés.

---



## Structure du projet

```text
.
├── README.md
├── data
│   ├── processed
│   │   ├── phasianidae_oso.csv
│   │   ├── phasianidae_full_grid.geojson
│   │   ├── phasianidae_full_grid.parquet
│   │   ├── phasianidae_by_species_grid_year.csv
│   │   ├── phasianidae_by_species_grid_year.parquet
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
│       └── sig_metrop.*
├── notebook
│   └── explo.ipynb
├── requirements.txt
├── src
│   ├── build_full_dataset_grid.py
│   ├── build_full_dataset.py
│   ├── build_gdf.py
│   ├── build_vernacular_mapping.py
│   ├── df_to_parquet.py
│   ├── make_departements_geojson.py
│   ├── make_france_geojson.py
│   ├── make_france_metropole_geojson.py
│   └── make_mailles_geojson.py
└── web
    ├── final_dashboard.html
    ├── final_dashboard.js
    ├── maille_10km_metrop.geojson
    ├── france_metropole.geojson
    ├── style.css
    └── autres prototypes 
    
``` 



## Pipeline de données

### 1. Préparation des observations

Les observations proviennent de `phasianidae_oso.csv`.

Elles contiennent notamment :

- la date d’observation  
- l’espèce observée  
- les coordonnées géographiques  
- la classe d’occupation du sol  

---

### 2. Enrichissement des observations

**Script principal :**

`src/build_full_dataset_grid.py`

Ce script permet de :

- charger les observations  
- ajouter les tags d’aires protégées  
- ajouter les noms vernaculaires  
- effectuer la jointure avec la grille 10 km  
- produire un dataset enrichi final  

---

### 3. Jointure spatiale

La jointure est réalisée avec :

`web/maille_10km_metrop.geojson`

en utilisant la clé réelle :

`cd_sig`

Cette étape corrige le problème initial de carte vide lié à un mauvais identifiant.

---

### 4. Fichiers produits

Le pipeline produit :

- `phasianidae_full_grid.geojson`  
- `phasianidae_full_grid.parquet`  
- `phasianidae_by_species_grid_year.csv`  
- `phasianidae_by_species_grid_year.parquet`  

---

## Idée clé

Les données d’observation ne reflètent pas uniquement la biodiversité réelle.

Elles dépendent aussi :

- des comportements des observateurs  
- des outils disponibles  
- de la diffusion des technologies  
- du contexte sociétal  
- de certains événements externes  

Le projet propose donc une lecture critique et visuelle des données, distinguant :

- les évolutions potentielles des espèces  
- les effets liés aux pratiques d’observation  

---

## Résultat actuel

Le projet aboutit à un dashboard interactif permettant :

- d’explorer les observations dans le temps et l’espace  
- de filtrer par espèce  
- de visualiser des ruptures temporelles  
- d’annoter des événements externes  
- d’accompagner l’analyse par des insights interprétatifs  

L’ensemble constitue une base de data storytelling sur l’impact possible d’événements externes sur les observations d’oiseaux en France.