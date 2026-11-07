# L'agent proactif sur téléphone — spécification

7 novembre 2026. Ce qu'on reprend de Grok Bot, de Claude Duet et de leurs voisins, ce que Baarali a déjà, et les chantiers à mener. On n'a besoin ni de la société ni d'un compte marchand : tout se construit et se teste dès maintenant (simulateur, build Expo de développement, instance de test).

## 1. Ce que font les références

| | Grok Bot (SpaceXAI, bêta depuis le 11/08/2026) | Claude Duet (Anthropic, aperçu depuis le 21/10/2026) | Poke | Manus, Structured |
|---|---|---|---|---|
| Idée | Des « bots » qui exécutent. Chacun a un nom, un rôle et des limites | Un agent qui « vient à vous » | Un agent dans les messageries : iMessage, WhatsApp, SMS, Telegram | Des assistants de tâches |
| Où il travaille | Un ordinateur cloud, partagé par tous les bots du compte. Le travail continue téléphone et Mac fermés | Une machine virtuelle avec son navigateur. Le travail continue app fermée | Côté serveur | Côté serveur |
| Initiative | Routines planifiées ou déclenchées par un événement. Il apprend une procédure en vous regardant faire une fois | Un point du matin, puis un contrôle des comptes toutes les quelques heures (pas en continu, pour ménager le quota). Il n'écrit que si quelque chose le mérite. On règle de quoi et à quel rythme | Il écrit en premier dans votre messagerie | Onglet « Programmées » (Manus) |
| Interface | Une conversation par bot. Une animation sobre pendant le travail. Les résultats s'ouvrent dans l'app | **Un seul fil**, au clavier ou à la voix : la question rapide et le projet d'une semaine y cohabitent | Pas d'app : la messagerie est l'interface | Des cartes de proposition « Ajouter / Modifier / Écarter » et « Tout accepter » (Structured) |
| Accord | Défini bot par bot. Il ne revient vers vous que pour un accord | Il lit et rédige seul. Il montre l'action et attend avant d'envoyer, payer, signer ou supprimer. Certaines actions restent interdites même avec accord | — | Trois modes d'accord (ChatGPT Codex) : demander, approuver pour moi, accès complet |
| Connexions | Elles se font **dans la conversation** : un bouton « Autoriser » apparaît quand il en a besoin | Il reprend la mémoire, les compétences et les connecteurs du compte | — | — |

Sources : [Cult of Mac](https://www.cultofmac.com/news/grok-bot-iphone-mac-ai-agents), [iGeeksBlog](https://www.igeeksblog.com/grok-bot-macos-ios-launch/), [AI Maker](https://aimaker.substack.com/p/grok-bot-ai-agent-team), [Anthropic](https://claude.com/resources/articles/claude-duet), [TechCrunch](https://techcrunch.com/2026/10/22/claude-duet-app-is-anthropics-bet-on-agents/), [Product Hunt (Poke)](https://www.producthunt.com/p/general/a-week-with-poke-review-a-promising-start-for-a-proactive-ai-assistant). Écrans consultés sur Mobbin : Structured, Manus, Tiimo, ChatGPT, Perplexity, Beside. Grok Bot et Duet n'y sont pas encore.

**Ce qu'on retient pour Baarali**
1. **Le travail se fait sur la machine cloud, pas sur le téléphone.** Le téléphone sert à recevoir, décider et parler.
2. **L'agent écrit en premier, mais rarement.** Un point du matin, puis seulement ce qui mérite votre attention. Le rythme et les sujets se règlent.
3. **Un seul fil avec Baarali**, au clavier ou à la voix. Les baarasseurs (les agents spécialisés) restent à côté, comme les bots de Grok.
4. **On approuve depuis la notification.** Il rédige seul, puis attend votre accord avant d'envoyer, payer, signer ou supprimer.
5. **On connecte une app au moment où l'agent en a besoin,** dans la conversation, et non dans un écran de réglages.
6. **Il apprend une procédure en vous regardant faire, puis la transforme en routine.**

## 2. Ce que Baarali a déjà

| Brique | Où | État |
|---|---|---|
| Une instance cloud par personne | `apps/baarali/packages/instance`, Fly ; `gate.ts` ouvre le même `rowboat-server` que sur l'ordinateur | En ligne |
| Le téléphone se connecte directement à son instance, sans ordinateur | `apps/x/apps/mobile/src/lib/baarali-sign-in.ts` (`connectInstance`) | Fait |
| La conversation et les accords dans le chat | `mobile/src/app/chat.tsx`, `respondToPermission` | Fait, mais seulement app ouverte, dans le chat |
| Les routines | `core/src/agent-schedule/`, `mobile/src/app/routines.tsx` (pause, « lancer maintenant ») | Fait, mais elles ne tournent **que si l'instance est éveillée** |
| Les tâches à faire, la boîte de réception, les réunions, l'e-mail, les Espaces | `mobile/src/app/` | Fait |
| La notification téléphone | Harbor : `notify.ts`, `push.ts`. Quand votre agent vous écrit dans un Espace, vous recevez la notification (CONTRACT.md, « Notifications ») | Fait côté Espaces ; jamais utilisé par l'agent principal |
| La voix | `core/src/voice/` : dictée, lecture, mode conversation (8a, livré sur ordinateur le 07/10) | Pas dans l'app |
| La langue et la marque | Onglets et textes en anglais, onglet « Rowboat » ; marque appliquée au build (`brand.mjs`) | À franciser |

Les deux trous de fond sont notés dans `ETAT_DES_LIEUX_2026-11-07.md` (phases 3 et 6) :
- **une instance suspendue ne déclenche rien** : pas de `scheduled_wakes` dans le plan de contrôle ;
- **pas d'accord à distance** : pas de table `approvals` ni de `@baarali/policy`.

## 3. Les chantiers, dans l'ordre

### A. Le réveil planifié (le socle)
**Fait (07/11/2026)** : `control/src/wakes.ts` (migration 15) et `instance/src/schedule.ts`. Le plan de contrôle reste allumé (`min_machines_running = 1`).
Sans lui, rien n'est proactif.
- Le plan de contrôle garde, pour chaque instance, la prochaine heure à laquelle elle doit travailler : point du matin, routine, contrôle périodique.
- À cette heure, il réveille la machine Fly, déclenche le travail, puis la laisse se rendormir.
- Il recalcule cette heure à partir des routines de l'instance.
- Contrôle périodique toutes les quelques heures, comme Duet, pour ménager le quota. Pas d'écoute permanente.
- Tests : le réveil est idempotent ; deux réveils rapprochés ne font qu'un passage ; une instance supprimée ne se réveille plus.

### B. L'agent écrit en premier
**Fait (07/11/2026)** : `apps/server/src/baarali-phone-push.ts`, routine « Point du matin » (`instance/src/morning-brief.ts`), rythme et heures de silence (`mobile/src/components/baarali-agent-notifications.tsx`).
- Un fil « Baarali », propre à chaque personne, sert de canal. On s'appuie sur ce que Harbor sait déjà faire : quand l'agent y écrit, la notification part toute seule.
- Le **point du matin**, à l'heure choisie : ce qui vous attend, ce qu'il a fait pendant la nuit, ce qu'il propose.
- Les **alertes** : seulement ce qui mérite votre attention (un mail urgent, un rendez-vous déplacé, une tâche terminée, une tâche bloquée).
- Les **réglages** :
  - l'heure du point du matin ;
  - des heures de silence ;
  - les sujets à suivre ;
  - le rythme : discret, normal ou attentif.
- Chaque message dit pourquoi il vous dérange. Un bouton « Moins de ce genre » ajuste les envois suivants.

### C. Les accords à distance
- **Fait (07/11/2026).** Quand un tour s'arrête pour attendre un accord (`turn_suspended`), l'instance envoie au téléphone une notification par action en attente (`apps/x/apps/server/src/baarali-approvals.ts`).
- La notification porte des boutons (catégorie `baarali-approval`) :
  - « Approuver » ;
  - « Refuser » ;
  - « Voir », qui ouvre la conversation.
- Le téléphone répond par `sessions:respondToPermission`, avec l'identifiant de l'action.
- **Pas de table d'accords à part** (première idée de cette spec) : une décision nomme son appel d'outil, et le contenu d'un appel est figé dès que le modèle l'a écrit. Un oui couvre donc toujours exactement ce qui a été montré. Un brouillon modifié est un nouvel appel, qui redemande l'accord.
- Toujours interdit, même avec accord : déplacer de l'argent et acheter. Ça viendra avec le paiement.

### D. L'accueil « Aujourd'hui »
**Fait (07/11/2026)** : `mobile/src/components/baarali-today.tsx`. Vérifié sur simulateur avec un serveur local.
Une seule page en haut de l'app :
1. **À valider** : les cartes d'accord. Elles s'approuvent d'un toucher, ou toutes ensemble comme le « Tout accepter » de Structured.
2. **Fait pour vous** depuis la dernière visite.
3. **En cours** : une animation sobre, comme Grok Bot, puis le détail si on le demande, comme Perplexity.
4. **Le fil Baarali** et un grand bouton micro.

Le reste (e-mail, réunions, Espaces, routines, tâches) reste accessible dans les onglets.

### E. La voix

Ce qui a guidé ce chantier : l'entretien du fondateur de Gradium (ex-Kyutai, Moshi). Son constat : le mode conversation du téléphone était un « talkie-walkie ». Il attendait 1,2 s de silence, envoyait le fichier entier, attendait la réponse complète, et on ne pouvait pas le couper.

**Fait (07/11/2026)**, quand le téléphone est connecté à Baarali (`lib/baarali-conversation.ts`). Relié à un Mac, l'ancienne boucle reste.

| Ce qu'il fallait | Comment |
|---|---|
| Garder l'agent entier au milieu | La chaîne reste : on transcrit, l'agent de la conversation répond, on lit. L'agent garde ses outils, sa mémoire et ses accords. Pas de modèle « voix à voix », qui perd de l'intelligence. |
| Écouter en continu, sans exiger de rythme | Le micro part au fil de l'eau (`useAudioStream`, PCM 16 kHz) vers Deepgram Flux, par le plan de contrôle (`/deepgram/v2/listen`, ouvert avec la session du téléphone). Flux reconnaît la fin de phrase par un modèle et attend jusqu'à 5 s une phrase laissée en suspens. Une phrase qui finit par « et », « euh » ou une virgule attend encore 1,5 s sa suite (`looksUnfinished`). |
| Parler tout de suite | Une phrase d'attente (« D'accord, je regarde. ») part si rien n'est dit après 0,9 s. Ces phrases sont synthétisées une fois et gardées. |
| Dire ce que fait l'agent | Chaque appel d'outil a ses mots (« Je regarde vos e-mails. »), au plus un toutes les 8 s (`progressPhrase`). |
| Lire en continu | La réponse est lue phrase par phrase pendant qu'elle s'écrit. La phrase suivante est synthétisée pendant la lecture de la précédente (`SpeechQueue`). On lit le résumé `<voice>` s'il y en a un, sinon le début de la réponse (600 caractères au plus). |
| Pouvoir couper la parole | Le début d'un tour Flux (`StartOfTurn`, son signal prévu pour ça) coupe la lecture s'il contient au moins deux vrais mots. Ce qui ne coupe pas : un « hm », un « oui », un « d'accord » (`isBackchannel`), et la propre voix de l'agent revenue par le haut-parleur (`isEcho` : 60 % de mots en commun avec ce qu'il dit). |
| Donner son accord à la voix | Un tour suspendu pose la question : « J'ai besoin de votre accord pour : … Je le fais ? ». « Oui », « vas-y », « envoie » valident ; « non », « attends », « annule » refusent. Sans réponse claire, la question est reposée une fois, puis l'action reste en attente dans la conversation. |
| Endroits bruyants | « Maintenir pour parler » : la fin de phrase du modèle est coupée (`eot_threshold` à 1.0), seul le relâchement envoie (`ForceEndTurn`). |

**Reste à faire**
1. **Essai sur un vrai téléphone.** Le simulateur ne capte pas un vrai micro, et l'essai demande la session d'un vrai compte et la clé Deepgram. À mesurer : le temps entre la fin de la phrase et le premier mot de l'agent, en Wi-Fi et en 4G, à Abidjan.
2. **Une couche de conversation rapide devant l'agent** (le système mixte de Gradium) :
   - un petit modèle temps réel gère les tours de parole, les « hm hm » et les phrases d'attente ;
   - il passe la main à l'agent par un outil (« demande à l'agent »), puis glisse la réponse dans la conversation.
   - C'est la base des appels entrant et sortant (8b, 8c). À décider après la mesure du point 1 : si la chaîne actuelle répond assez vite, elle suffit pour l'app.
3. **Des tests d'écoute à l'aveugle avec des voix d'ici.** Aucune mesure automatique ne juge bien une voix (entretien Gradium).
   - Un panel de cinq à dix personnes à Abidjan.
   - Chaque semaine, des paires d'extraits sans nom de fournisseur, et un seul choix : laquelle sonne le plus naturel en français d'ici, et laquelle a le mieux compris.
   - Les mêmes phrases dans les deux cas : numéros de téléphone, montants en francs CFA, noms de quartiers et de personnes.
4. **Les langues locales.**
   - Pour le wolof, Google Chirp 3 (en aperçu) et Gladia annoncent la reconnaissance, avec le mélange wolof-français. À tester, ce n'est pas vérifié.
   - Pour le bambara, un banc d'essai public de mars 2026 juge les modèles encore loin d'un usage réel. Kooma propose une API spécialisée.
   - Pour le dioula et le mooré, aucun grand fournisseur trouvé.
   - Tant que rien n'est fiable : le français, et les mots locaux tolérés dans une phrase française.
5. **Choisir le fournisseur de lecture** (tableau ci-dessous) après les tests d'écoute du point 3.

**Fournisseurs comparés** (07/11/2026 ; les chiffres viennent surtout des fournisseurs eux-mêmes)

| | Deepgram (en place) | ElevenLabs (en place, forfaits Pro) | Gradium |
|---|---|---|---|
| Écoute | Nova-3 en `multi` ; Flux `flux-general-multi` (français inclus) avec fin de phrase par modèle (environ 260 ms annoncés) | — | Écoute en continu avec fin de pensée « sémantique », 5 langues dont le français ; taux d'erreur de 3,3 % annoncé (Coval, mai 2026) |
| Lecture | Aura-2 : environ 30 $ par million de caractères, deux voix françaises seulement | Flash v2.5 : environ 40 à 50 $ par million de caractères, 32 langues | Environ 47 à 58 $ par million de caractères ; 258 ms annoncés jusqu'au premier son (332 ms mesurés par Vapi) ; 1 000 voix, dont le français québécois |
| Voix clonée | — | Oui | Oui, avec 10 s d'audio et un consentement exigé |
| Pour nous | Déjà branché, le moins cher, Flux suffit pour l'écoute | Meilleur choix de voix françaises aujourd'hui | Équipe parisienne, à tester en français d'Afrique de l'Ouest ; hébergement en UE à confirmer |

Sources :
- Deepgram : [Flux](https://developers.deepgram.com/docs/flux/quickstart) et [ses états](https://developers.deepgram.com/docs/flux/state).
- Gradium : [sa comparaison avec Deepgram](https://gradium.ai/content/deepgram-alternative-gradium-voice-ai), à lire comme du discours de fournisseur, et l'[indice Vapi](https://humannessindex.vapi.ai/models/gradium-tts).
- Prix de la lecture : [Deepgram contre ElevenLabs](https://deepgram.com/compare/elevenlabs-vs-deepgram), page publiée par Deepgram.
- Langues locales : la [revue sur le bambara](https://aclanthology.org/2026.africanlp-main.26) et la [page wolof de Gladia](https://www.gladia.io/product/languages/wolof).

### F. La finition
**Fait pour le français (07/11/2026)** : tout est traduit (`i18n-extract --check`), et les notifications du cœur arrivent en français. Le nom « Baarali » est appliqué à la construction (`brand.mjs`).
- L'app en français d'abord, l'anglais ensuite.
- L'onglet « Rowboat » devient « Baarali ».
- Le compte App Store sera repris au nom d'OpenBaara à l'immatriculation. D'ici là : le simulateur et TestFlight interne sur le compte existant, si c'est possible.

### Plus tard
- **WhatsApp comme deuxième porte**, à la manière de Poke : en Afrique de l'Ouest, c'est là que les gens vivent. Il faut un compte WhatsApp Business, donc la société.
- **Apprendre en regardant faire**, comme Grok Bot.

## 4. Ce qui ne bouge pas
- Une seule app.
- Le cerveau reste dans l'instance : le téléphone n'exécute rien de sensible.
- Rien n'est envoyé, payé, signé ou supprimé sans un accord qui porte sur le contenu exact.
- Pas d'écoute permanente : l'agent consomme le quota de la personne, et il doit lui coûter peu.
