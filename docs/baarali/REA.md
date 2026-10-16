# Analyse et rétro-ingénierie dans Work

Décision du 15/10/2026 : exposer aux agents Baarali le catalogue complet de
[REA](https://rea.tools/), du comportement d'une application aux binaires natifs.
L'entrée est le serveur MCP `baarali-rea`, découvert par le skill « Reverse
engineering ». Il est utilisable par l'agent principal et transmis aux sessions
Code créées ou rechargées. La simple consultation des modèles Code ne le lance
pas. L'accès aux outils reste soumis aux droits Work existants ; la fermeture
`close_binary` sans écriture de snapshot reste autorisée après une baisse de
forfait pour libérer les ressources.

## Périmètre et disponibilité

Le catalogue de REA couvre JavaScript/Electron/ASAR, pages et observations web,
binaires natifs, .NET, Android/Flutter, WASM, firmware, ressources empaquetées,
bases et captures enregistrées. Ses capacités de traçage, comparaison de versions,
diagnostic et reconstruction restent accessibles par découverte MCP, sans liste
de fonctions réduite maintenue dans Baarali. La présence d'un outil n'établit pas
que son fournisseur est disponible : `binary_session` expose les disponibilités
et l'identité réelle du serveur ; les autres appels rendent leurs diagnostics.

La découverte destinée au modèle conserve tous les noms, descriptions et schémas
d'entrée, avec leur pagination. Elle omet les `outputSchema` de REA, qui sont des
validateurs de résultats volumineux, sans modifier le catalogue du moteur ni ses
réponses d'exécution. Les autres serveurs MCP conservent leurs métadonnées.

L'image d'instance comprend Ghidra et un JDK pour l'analyse native, ainsi que le
bridge headless JADX attendu par cette version de REA pour les APK. Chromium
permet les scénarios web headless dans un profil temporaire appartenant à
l'enquête, fermé à la fin de la capture. Aucun navigateur du Mac n'est requis
pour ce parcours. Les versions,
URLs et SHA-256 sont dans `apps/baarali/engines/rea/providers.json`. Le programme
d'installation vérifie les empreintes avant extraction et conserve les arbres
complets, dont les licences. Les moteurs commerciaux (Hopper, IDA, JEB) ne sont
pas fournis ; leur usage nécessite une installation et les droits appropriés.
Les autres fournisseurs optionnels dépendent de leurs exécutables, bibliothèques,
appareils et plateformes. Voir les
[prérequis REA](https://github.com/morluto/rea/blob/main/README.md#what-you-can-analyze)
et les [notices tierces](https://github.com/morluto/rea/blob/main/THIRD_PARTY_NOTICES.md).

Le processus opère dans l'instance du compte. Un exécutable importé peut y être
analysé statiquement ; une application en cours sur le Mac, son navigateur et un
téléphone branché au Mac ne deviennent pas accessibles depuis Fly. L'observation
de leur exécution exige un fournisseur sur cet hôte ou un environnement de test
compatible. Une capture ou un binaire ne révèle pas nécessairement un serveur
inaccessible, les données privées ou le code source original complet.

## Isolation et cycle de vie

`apps/baarali/engines/rea/` est une installation npm indépendante des workspaces
pnpm. Le lockfile fixe le paquet et ses dépendances avec leurs empreintes. La
construction utilise `npm ci --ignore-scripts` ; certains fournisseurs natifs
optionnels peuvent donc rester indisponibles s'ils exigent un script de
construction supplémentaire. Aucun téléchargement, installation globale,
`setup`, `rea update` ou sélection `latest` n'est fait au démarrage d'un compte.

Le moteur utilise son propre Node 24 dans `/opt/baarali-rea/bin/node`, notamment
pour les API SQLite que Node 22 ne fournit pas dans la version attendue. Le
serveur Baarali garde son Node 22 et ses dépendances. Les images Node et Java
sont épinglées par digest dans le Dockerfile. Chromium provient des paquets de
sécurité de Debian lors de la construction ; il change avec une nouvelle image
validée, jamais par une mise à jour lancée dans le compte. Le lanceur vérifie le nom et la
version du paquet avant de démarrer le serveur MCP ; une absence ou divergence
fait échouer cette connexion, sans empêcher le démarrage du compte. Une absence
de l'exécutable optionnel laisse les sessions Code s'ouvrir sans REA.

Le moteur démarre à la connexion MCP, à la demande. Les fournisseurs natifs sont
acquis par leurs opérations. Le processus reçoit un environnement sélectionné,
sans clés Fly, modèles, facturation, jeton d'instance ou `NODE_OPTIONS`. Il reste
un outil puissant de l'instance du compte, pas une sandbox pour exécuter des
logiciels inconnus.

Budgets de tas : serveur REA 640 MiB, worker d'analyse JavaScript 256 MiB,
Ghidra/JADX 512 MiB ; ce ne sont pas des plafonds de mémoire résidente totale.
La couche de transport complète explicitement les paramètres du worker dans les
requêtes et refuse leur dépassement avant exécution. Le délai par source est
limité à 300 secondes ; le client MCP Baarali accorde 600 secondes à une
opération REA. Les contraintes rencontrées sont des erreurs à expliquer, pas une
autorisation d'augmenter les ressources automatiquement. Les gros travaux et
les usages simultanés nécessitent une mesure avant changement de capacité.
Le serveur réserve une partie de son tas au transfert et à la validation des
résultats : augmenter seulement le worker ne résout pas un budget parent épuisé.
Le contrôle Linux exécute la découverte des fournisseurs avant un petit projet
Electron comprenant une fenêtre, un preload et un canal IPC ; il vérifie que
les deux sources sont analysées et leurs relations conservées.

Avant fermeture, l'agent exporte le bundle Evidence et un rapport dans le
projet, avec les empreintes des cibles, emplacements, observations, inférences et
inconnues. Les identifiants retenus appartiennent à leur connexion, pas au projet.
Les appels de l'agent principal conservent une connexion par discussion, deux
enquêtes retenues au plus par instance ; une ouverture simultanée dans la même
discussion partage sa tentative. Sans discussion, le tour headless constitue la
portée. Deux discussions ne peuvent donc pas se remplacer leur cible native.
Après `close_binary`, ce client est fermé et libère aussi ses autres fournisseurs,
dont le bridge Android. Les sessions Code possèdent chacune leur connexion ACP.
Il n'y a pas d'arrêt automatique
sur inactivité susceptible d'effacer silencieusement des preuves retenues.

## Mise à jour, désactivation et retour arrière

1. Mettre à jour le paquet exact, son lockfile et `REA_VERSION` dans `rea.ts`,
   puis les images et fournisseurs seulement quand leur compatibilité l'exige.
2. Relire les changements de catalogue, de schémas, de provenance, de plateformes
   et de licences. Le code de la branche du fork n'est pas une preuve de
   l'identité du paquet npm : valider les octets effectivement installés.
3. Exécuter les tests Baarali, les tests de branding, puis le contrôle réel
   `packages/instance/scripts/check-rea-runtime.mjs` dans l'image Linux. Celui-ci
   vérifie découverte du catalogue, limites, traçage Electron, export, fermeture,
   parcours web avec le Chromium fourni, et décompilation native si
   `BAARALI_REA_NATIVE_TARGET` désigne la fixture. La CI exécute aussi
   `check-rea-sdk.mjs` avec le SDK et les schémas partagés de Baarali contre le
   moteur réel ; un changement incompatible doit échouer avant publication.
4. Publier une image versionnée après validation selon le circuit existant des
   [instances](../../apps/baarali/AGENTS.md#déployer-sur-flyio). Conserver l'image
   précédente ; ne pas modifier les dépendances d'une instance en cours.

`BAARALI_REA_ENABLED=0` retire l'entrée et le skill gérés au prochain démarrage,
sans supprimer les autres connexions, les projets ou les preuves exportées.
Fermer les sessions existantes ou redémarrer le runtime pour arrêter leurs
connexions déjà établies. Revenir à l'image précédente restaure son moteur et ses
fournisseurs ; les preuves restent exportées en fichiers séparés, sans migration
des projets de l'utilisateur vers un format propre à REA.

Pour un contrôle local après compilation de `@baarali/instance`, définir
`BAARALI_REA_ROOT` vers une installation isolée issue de ce lockfile et
`BAARALI_REA_NODE` vers son Node 24, puis lancer le script de contrôle. Ce test
utilise un dossier temporaire, un HOME temporaire et aucune clé de modèle.
