# CadQuery dans Motion Studio

Le volet 3D paramétrique utilise le fork [benewende-dev/cadquery](https://github.com/benewende-dev/cadquery), au commit `62d2e72fd2285102b029d35391f2bf37bb44658d`. Le moteur Python tourne sur l’instance du compte, dans un environnement dédié. Les appareils lisent les projets et les fichiers ; ils n’installent pas CadQuery. Les droits et les quotas restent ceux de Work et Motion, décrits dans [l’architecture](TARGET_AGENTIC_ARCHITECTURE.md).

## Parcours

Le serveur MCP `baarali-motion` expose `cad_status`, `cad_project`, `cad_scene` et `cad_parameters` (`instance/src/cad-mcp.ts`). Le skill Motion installé dans l’instance décrit ce parcours (`cad-skill.ts`).

1. `cad_status` vérifie la présence du moteur.
2. L’agent écrit un script Python dans le workspace. Il dispose de `cq` et du dictionnaire `parameters` ; il affecte un `Workplane`, un `Shape` ou un `Assembly` à `result`. Les dimensions sont en millimètres.
3. `cad_project` exécute ce script, valide la forme et crée une nouvelle variante sous `motion/`. Le résultat contient `index.html`, `model.py`, `parameters.json`, `cad.json` et quatre fichiers dans `exports/` : STEP, STL, GLB et SVG.
4. Le Mac ouvre le projet dans Motion Studio et enregistre les fichiers exportés. Le mobile ouvre le même lecteur et propose « Fichiers 3D » pour enregistrer ou partager un format.
5. L’aperçu animé est une projection du maillage réel, avec une rotation de 360° puis deux secondes sur la pose finale. La timeline HyperFrames pilote le dessin à un temps précis, y compris en revenant en arrière. Les outils habituels `check`, `preview`, `render`, `poster`, `captions` et `mix` utilisent cette composition.

## Modeleur interactif

« Nouveau modèle 3D » ouvre le modeleur depuis le Studio Mac ou sa bibliothèque mobile. Il ajoute des boîtes, cylindres et sphères ; chaque forme a des dimensions en millimètres, une position et une rotation autour de ses trois axes. Les boîtes et cylindres acceptent des bords arrondis. Les opérations ordonnées ajoutent ou retirent de la matière ; la première forme doit en ajouter. Dupliquer, supprimer, annuler et rétablir modifient le brouillon. La vue tourne à la souris ou au toucher ; la molette ou le pincement change le zoom.

L’aperçu du brouillon montre les primitives et indique les retraits en rouge. « Créer une variante » lance le calcul CadQuery réel (`cad_scene`) : fusion, découpe et arrondis sont recalculés puis exportés ensemble. Le Studio ouvre la nouvelle variante seulement après sa validation, sans remplacer l’ancienne. En cas d’échec, les modifications restent dans le modeleur. Chaque variante conserve `scene.json` pour rouvrir ses formes, et `cad-preview.json` pour sa géométrie réelle. L’interface n’apparaît jamais dans le rendu vidéo.

Les projets issus d’un script Python gardent leur source : « Modifier le modèle 3D » ouvre leur maillage réel et leurs paramètres simples (nombres, textes, booléens). `cad_parameters` régénère une variante avec le même script et les paramètres ajustés. Un script sans paramètres modifiables doit d’abord en exposer avec l’agent. Le modeleur ne convertit pas un script arbitraire en primitives et ne modifie pas individuellement les sommets. Les sous-titres, pistes audio et exports de la variante précédente restent dans cette variante ; la nouvelle composition peut ensuite recevoir son propre montage.

Le GLB conserve les couleurs de l’assemblage ; l’aperçu utilise la couleur d’accent du kit de marque. Un autre ratio se produit avec `cad_scene` ou `cad_project` ; `reformat` utilise les modèles Motion classiques.

## Exécution et construction

`requirements-cad.txt` épingle la source du moteur. L’image d’instance l’installe dans `/opt/baarali-cad` et vérifie son import pendant la construction. `BAARALI_CAD_PYTHON` indique l’exécutable au serveur MCP ; le Python du système n’est pas modifié.

Un seul calcul CAD tourne à la fois par serveur MCP. Le script est limité à 64 Ko, les paramètres à 8 Ko, la durée du processus à 45 secondes et le temps CPU à 40 secondes quand le système permet cette limite. Le maillage d’aperçu contient au plus 20 000 triangles. Les projets ne sont publiés qu’une fois leurs fichiers validés ; une erreur supprime les sorties temporaires. Les variantes précédentes restent intactes. Ces limites ne constituent pas un bac à sable de sécurité : comme le shell Work, le script est du code du compte exécuté dans son instance.

Les tests portables vérifient les contrats et le lecteur. Le test du moteur réel se lance en indiquant son Python :

```sh
BAARALI_TEST_CAD_PYTHON=/opt/baarali-cad/bin/python pnpm --filter @baarali/instance test
```

Il construit un modèle, relit son STEP pour vérifier les dimensions et le volume, et vérifie les exports GLB et les règles Motion. La validation de livraison doit aussi rendre une vidéo avec le producteur HyperFrames et FFmpeg.
