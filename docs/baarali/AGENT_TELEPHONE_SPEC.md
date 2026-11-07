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
Sans lui, rien n'est proactif.
- Le plan de contrôle garde, pour chaque instance, la prochaine heure à laquelle elle doit travailler : point du matin, routine, contrôle périodique.
- À cette heure, il réveille la machine Fly, déclenche le travail, puis la laisse se rendormir.
- Il recalcule cette heure à partir des routines de l'instance.
- Contrôle périodique toutes les quelques heures, comme Duet, pour ménager le quota. Pas d'écoute permanente.
- Tests : le réveil est idempotent ; deux réveils rapprochés ne font qu'un passage ; une instance supprimée ne se réveille plus.

### B. L'agent écrit en premier
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
- Le plan de contrôle enregistre chaque demande d'accord : l'action, une empreinte du contenu exact, une échéance, puis la décision.
- La notification porte des boutons, grâce aux catégories d'`expo-notifications` :
  - « Approuver » ;
  - « Refuser » ;
  - « Voir », qui ouvre le brouillon complet.
- Une approbation ne vaut que pour **ce contenu-là**. Si le brouillon change, il faut redonner son accord.
- Trois niveaux, comme ChatGPT Codex :
  - toujours demander ;
  - demander seulement pour ce qui engage (envoyer, payer, signer, supprimer) ;
  - autonome sur une liste d'actions choisie.
- Toujours interdit, même avec accord : déplacer de l'argent et acheter. Ça viendra avec le paiement.

### D. L'accueil « Aujourd'hui »
Une seule page en haut de l'app :
1. **À valider** : les cartes d'accord. Elles s'approuvent d'un toucher, ou toutes ensemble comme le « Tout accepter » de Structured.
2. **Fait pour vous** depuis la dernière visite.
3. **En cours** : une animation sobre, comme Grok Bot, puis le détail si on le demande, comme Perplexity.
4. **Le fil Baarali** et un grand bouton micro.

Le reste (e-mail, réunions, Espaces, routines, tâches) reste accessible dans les onglets.

### E. La voix
- Le mode conversation de l'ordinateur passe dans l'app : on appuie, on parle, il répond à voix haute, et la conversation peut s'enchaîner.
- Le point du matin peut s'écouter.
- Plus tard : l'appel entrant et l'appel sortant (8b et 8c).

### F. La finition
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
