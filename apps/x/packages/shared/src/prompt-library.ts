// BAARALI(03/10/2026, shared 06/10/2026): the Prompts page's library — the
// categories and the ready-made requests, in both languages — read by the
// desktop (renderer lib/prompt-library.ts) and the phone alike. Data, not
// interface: kept out of the apps' sources their translation checks read.
// [Brackets] mark what the person fills in.

export type PromptLang = "fr" | "en";
export type PromptWords = Record<PromptLang, string>;
export interface PromptCategoryData { id: string; name: PromptWords; icon: string }
export interface LibraryPromptData { id: string; category: string; name: PromptWords; text: PromptWords }

export const PROMPT_CATEGORIES: PromptCategoryData[] = [
    {
        "id": "clients",
        "name": {
            "fr": "E-mails et clients",
            "en": "Emails and clients"
        },
        "icon": "Mail"
    },
    {
        "id": "sales",
        "name": {
            "fr": "Ventes et marketing",
            "en": "Sales and marketing"
        },
        "icon": "Megaphone"
    },
    {
        "id": "social",
        "name": {
            "fr": "Réseaux sociaux",
            "en": "Social media"
        },
        "icon": "Share2"
    },
    {
        "id": "image",
        "name": {
            "fr": "Images",
            "en": "Images"
        },
        "icon": "Image"
    },
    {
        "id": "video",
        "name": {
            "fr": "Vidéo",
            "en": "Video"
        },
        "icon": "Clapperboard"
    },
    {
        "id": "voice",
        "name": {
            "fr": "Voix",
            "en": "Voice"
        },
        "icon": "Mic"
    },
    {
        "id": "docs",
        "name": {
            "fr": "Documents",
            "en": "Documents"
        },
        "icon": "FileText"
    },
    {
        "id": "tasks",
        "name": {
            "fr": "Routines",
            "en": "Routines"
        },
        "icon": "CalendarClock"
    }
];

export const PROMPT_LIBRARY: LibraryPromptData[] = [
    {
        "id": "complaint",
        "category": "clients",
        "name": {
            "fr": "Répondre à une réclamation",
            "en": "Answer a complaint"
        },
        "text": {
            "fr": "Réponds à ce client mécontent : [colle son message]. Reconnais le problème sans te justifier, explique ce que nous faisons pour le régler et quand, propose [geste commercial]. Ton calme et chaleureux, six lignes au plus, signé [mon nom].",
            "en": "Answer this unhappy client: [paste their message]. Acknowledge the problem without excuses, explain what we are doing to fix it and when, offer [goodwill gesture]. Calm, warm tone, six lines at most, signed [my name]."
        }
    },
    {
        "id": "quote-chase",
        "category": "clients",
        "name": {
            "fr": "Relancer un devis",
            "en": "Chase a quote"
        },
        "text": {
            "fr": "Écris une relance pour [client] au sujet du devis envoyé le [date], d’un montant de [montant]. Rappel court et poli, une question qui fait avancer (« avez-vous pu le regarder ? »), et propose un appel de dix minutes cette semaine.",
            "en": "Write a follow-up to [client] about the quote sent on [date] for [amount]. Short and polite reminder, one question that moves things forward, and offer a ten-minute call this week."
        }
    },
    {
        "id": "late-payment",
        "category": "clients",
        "name": {
            "fr": "Relancer une facture impayée",
            "en": "Chase an unpaid invoice"
        },
        "text": {
            "fr": "Rédige une relance pour la facture n° [numéro] de [montant], échue le [date], adressée à [client]. Première relance : aimable, rappelle les moyens de paiement ([Orange Money, virement…]). Ajoute une version plus ferme pour une deuxième relance.",
            "en": "Write a reminder for invoice no. [number] of [amount], due on [date], to [client]. First reminder: friendly, recall the ways to pay. Add a firmer version for a second reminder."
        }
    },
    {
        "id": "welcome-client",
        "category": "clients",
        "name": {
            "fr": "Accueillir un nouveau client",
            "en": "Welcome a new client"
        },
        "text": {
            "fr": "Écris un message de bienvenue pour [client] qui vient de commander [produit ou service]. Remercie, rappelle ce qui va se passer et quand, donne le contact à joindre ([numéro WhatsApp]). Chaleureux, cinq lignes.",
            "en": "Write a welcome message for [client] who just ordered [product or service]. Thank them, say what happens next and when, give the contact to reach. Warm, five lines."
        }
    },
    {
        "id": "supplier",
        "category": "clients",
        "name": {
            "fr": "Négocier avec un fournisseur",
            "en": "Negotiate with a supplier"
        },
        "text": {
            "fr": "Prépare un message à [fournisseur] pour obtenir [une remise de X % / un délai de paiement] sur ma commande de [produits]. Arguments : [volume, fidélité, paiement rapide]. Ton respectueux et ferme, avec une proposition précise.",
            "en": "Prepare a message to [supplier] to get [an X% discount / longer payment terms] on my order of [products]. Arguments: [volume, loyalty, quick payment]. Respectful, firm, with a precise offer."
        }
    },
    {
        "id": "product-sheet",
        "category": "sales",
        "name": {
            "fr": "Fiche produit qui vend",
            "en": "A product page that sells"
        },
        "text": {
            "fr": "Écris la fiche de [produit] pour ma boutique. Le bénéfice principal en une phrase, quatre points forts concrets, le prix [prix], la livraison [délai et zone], et un appel à commander sur WhatsApp au [numéro].",
            "en": "Write the page for [product] in my shop. The main benefit in one sentence, four concrete strengths, the price [price], delivery [time and area], and a call to order on WhatsApp."
        }
    },
    {
        "id": "promo",
        "category": "sales",
        "name": {
            "fr": "Promo du mois",
            "en": "This month’s promotion"
        },
        "text": {
            "fr": "Prépare une promotion pour [mois] dans mon activité de [activité] à [ville]. Donne l’idée de l’offre, le message court à diffuser, l’affiche à créer, où la diffuser (WhatsApp, Facebook, affichage) et un budget réaliste de [budget].",
            "en": "Prepare a promotion for [month] for my [business] in [city]. Give the offer idea, the short message, the poster to create, where to post it and a realistic budget of [budget]."
        }
    },
    {
        "id": "pitch",
        "category": "sales",
        "name": {
            "fr": "Présenter mon entreprise en 30 secondes",
            "en": "My business in 30 seconds"
        },
        "text": {
            "fr": "Écris une présentation de 30 secondes de [mon entreprise] pour [un salon / un investisseur / un client]. Ce que nous faisons, pour qui, ce qui nous rend différents, un chiffre qui le prouve, et une phrase pour finir.",
            "en": "Write a 30-second pitch of [my business] for [a fair / an investor / a client]. What we do, for whom, what sets us apart, one figure that proves it, and a closing line."
        }
    },
    {
        "id": "prices",
        "category": "sales",
        "name": {
            "fr": "Fixer mes prix",
            "en": "Set my prices"
        },
        "text": {
            "fr": "Aide-moi à fixer le prix de [produit ou service]. Mon coût est de [coût], mes concurrents vendent entre [prix bas] et [prix haut], mes clients sont [qui]. Propose trois niveaux de prix avec ce que chacun comprend, et dis lequel tu choisirais et pourquoi.",
            "en": "Help me price [product or service]. My cost is [cost], competitors sell between [low] and [high], my clients are [who]. Suggest three price tiers with what each includes, and say which you would pick and why."
        }
    },
    {
        "id": "week-posts",
        "category": "social",
        "name": {
            "fr": "Calendrier d’une semaine",
            "en": "A week of posts"
        },
        "text": {
            "fr": "Planifie cinq publications pour Facebook et WhatsApp pour [activité] la semaine prochaine : un thème par jour, le texte prêt à publier, l’image à créer et la meilleure heure pour publier à [ville].",
            "en": "Plan five posts for Facebook and WhatsApp for [business] next week: one theme a day, the text ready to post, the picture to create and the best time to post."
        }
    },
    {
        "id": "status",
        "category": "social",
        "name": {
            "fr": "Statut WhatsApp du jour",
            "en": "Today’s WhatsApp status"
        },
        "text": {
            "fr": "Écris trois statuts WhatsApp courts pour annoncer [nouveauté ou arrivage] chez [boutique]. Une phrase chacun, un emoji au plus, le prix [prix] et « Écrivez-nous pour commander ».",
            "en": "Write three short WhatsApp statuses announcing [new arrival] at [shop]. One sentence each, one emoji at most, the price and a call to order."
        }
    },
    {
        "id": "review-reply",
        "category": "social",
        "name": {
            "fr": "Répondre à un avis",
            "en": "Reply to a review"
        },
        "text": {
            "fr": "Réponds publiquement à cet avis client : [colle l’avis]. S’il est positif, remercie avec un détail personnel. S’il est négatif, reconnais, propose de régler en privé ([numéro]). Trois phrases.",
            "en": "Reply publicly to this review: [paste it]. If positive, thank with a personal touch. If negative, acknowledge and offer to settle it in private. Three sentences."
        }
    },
    {
        "id": "shop-poster",
        "category": "image",
        "name": {
            "fr": "Affiche de boutique",
            "en": "Shop poster"
        },
        "text": {
            "fr": "Affiche verticale pour [boutique] à [ville] : [produit] au centre, titre en grandes lettres « [texte] », prix [prix], adresse et numéro WhatsApp en bas, couleurs chaudes, style photo réaliste, fond uni.",
            "en": "Vertical poster for [shop]: [product] in the centre, big title \"[text]\", price, address and WhatsApp number at the bottom, warm colours, realistic photo style, plain background."
        }
    },
    {
        "id": "logo",
        "category": "image",
        "name": {
            "fr": "Logo simple",
            "en": "A simple logo"
        },
        "text": {
            "fr": "Logo pour [nom de l’entreprise], activité [activité]. Un symbole simple lié à [idée], deux couleurs ([couleurs]), lisible en petit sur WhatsApp, fond blanc, style plat et moderne.",
            "en": "Logo for [business name], [activity]. One simple symbol about [idea], two colours, readable when small, white background, flat modern style."
        }
    },
    {
        "id": "product-photo",
        "category": "image",
        "name": {
            "fr": "Photo produit propre",
            "en": "A clean product photo"
        },
        "text": {
            "fr": "Photo de [produit] posé sur [support], lumière douce de fenêtre, fond [couleur] uni, cadrage carré, net et appétissant, sans texte.",
            "en": "Photo of [product] on [surface], soft window light, plain [colour] background, square framing, sharp, no text."
        }
    },
    {
        "id": "ad-15s",
        "category": "video",
        "name": {
            "fr": "Pub de 15 secondes",
            "en": "A 15-second ad"
        },
        "text": {
            "fr": "Vidéo verticale de 15 secondes pour [produit] : un plan d’ouverture qui accroche, trois plans courts qui montrent [avantage], et un plan final avec le prix [prix] et « Commandez sur WhatsApp ». Rythme rapide, musique entraînante.",
            "en": "Vertical 15-second video for [product]: an opening shot that hooks, three short shots showing [benefit], and a final shot with the price and a call to order. Fast pace, upbeat music."
        }
    },
    {
        "id": "tutorial",
        "category": "video",
        "name": {
            "fr": "Tutoriel court",
            "en": "A short how-to"
        },
        "text": {
            "fr": "Écris le script d’une vidéo de 45 secondes qui montre comment [utiliser / entretenir] [produit] : trois étapes, une phrase à dire par plan, ce qu’on voit à l’écran, et un conseil final.",
            "en": "Write the script of a 45-second video showing how to [use] [product]: three steps, one line per shot, what is on screen, and a final tip."
        }
    },
    {
        "id": "voice-msg",
        "category": "voice",
        "name": {
            "fr": "Message vocal WhatsApp",
            "en": "WhatsApp voice message"
        },
        "text": {
            "fr": "Écris puis lis un message vocal de 30 secondes pour annoncer [nouveauté] à mes clients. Ton souriant, français simple, termine par « Passez nous voir à [adresse] ».",
            "en": "Write and read a 30-second voice message announcing [news] to my clients. Smiling tone, simple words, end with where to find us."
        }
    },
    {
        "id": "phone-greeting",
        "category": "voice",
        "name": {
            "fr": "Accueil téléphonique",
            "en": "Phone greeting"
        },
        "text": {
            "fr": "Écris et lis l’annonce d’accueil de [entreprise] pour quand nous ne pouvons pas répondre : qui nous sommes, nos horaires [horaires], et comment nous joindre sur WhatsApp. Vingt secondes au plus.",
            "en": "Write and read the greeting of [business] for when we cannot answer: who we are, our hours, and how to reach us on WhatsApp. Twenty seconds at most."
        }
    },
    {
        "id": "quote",
        "category": "docs",
        "name": {
            "fr": "Devis propre",
            "en": "A clean quote"
        },
        "text": {
            "fr": "Mets en forme un devis pour [client] : [colle les lignes]. Une ligne par article avec quantité et prix unitaire, le total hors taxes, la TVA de [taux] et le total TTC, la validité ([30 jours]) et les conditions de paiement [conditions].",
            "en": "Lay out a quote for [client]: [paste the lines]. One line per item with quantity and unit price, the subtotal, tax at [rate] and the total, validity and payment terms."
        }
    },
    {
        "id": "contract",
        "category": "docs",
        "name": {
            "fr": "Contrat de prestation simple",
            "en": "A simple service agreement"
        },
        "text": {
            "fr": "Rédige un contrat de prestation simple entre [mon entreprise] et [client] pour [prestation] : objet, durée, prix et paiement, obligations de chacun, résiliation. Langage clair. Ajoute à la fin ce qu’un juriste devrait relire.",
            "en": "Draft a simple service agreement between [my business] and [client] for [service]: purpose, duration, price and payment, duties, termination. Plain language, and list what a lawyer should check."
        }
    },
    {
        "id": "report",
        "category": "docs",
        "name": {
            "fr": "Compte rendu de réunion",
            "en": "Meeting minutes"
        },
        "text": {
            "fr": "Transforme ces notes en compte rendu : [colle les notes]. En haut, l’objet et la conclusion en deux phrases ; puis les décisions ; puis qui fait quoi et pour quand.",
            "en": "Turn these notes into minutes: [paste notes]. At the top, the purpose and outcome in two sentences; then the decisions; then who does what by when."
        }
    },
    {
        "id": "morning",
        "category": "tasks",
        "name": {
            "fr": "Point du matin",
            "en": "Morning brief"
        },
        "text": {
            "fr": "Chaque matin à 7 h, résume mes e-mails non lus et mes réunions du jour, puis donne les trois choses à faire en premier, dans l’ordre.",
            "en": "Every morning at 7, sum up my unread emails and today’s meetings, then give the three things to do first, in order."
        }
    },
    {
        "id": "watch",
        "category": "tasks",
        "name": {
            "fr": "Veille concurrents",
            "en": "Competitor watch"
        },
        "text": {
            "fr": "Chaque vendredi à 9 h, cherche sur le web ce que [concurrents] ont annoncé cette semaine (prix, produits, promos) et résume en cinq points avec les sources.",
            "en": "Every Friday at 9, search the web for what [competitors] announced this week (prices, products, promotions) and sum it up in five points with sources."
        }
    }
];
