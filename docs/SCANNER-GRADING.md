# Scanner et pré-évaluation

## Décision actuelle

Le scanner public conserve une empreinte locale pHash/dHash et une confirmation humaine. Le parcours d'identification ne téléverse pas la photo de la carte. La détection estime maintenant quatre coins puis redresse la perspective avant de calculer l'empreinte. Si la détection automatique échoue, le cadrage manuel à quatre repères utilise le même redressement.

La route `/api/scan/pregrade`, distincte, reçoit temporairement deux photos recadrées, recto et verso, puis ne les conserve pas. Elle refuse les images trop petites, sombres, floues, surexposées ou mal cadrées. Elle mesure le centrage quand la bordure est exploitable et signale les zones blanches suspectes sur les coins et bords bleus du verso.

Le résultat présente une estimation de 0 à 10 par pas de 0,5 pour le centrage, les coins, les bords et la surface, ainsi qu'une estimation globale. Sans photographie en lumière rasante, la surface reste provisoire et la note globale est plafonnée à 9,5. Si le centrage n'est pas mesurable, le système s'abstient au lieu d'inventer une note.

Cette estimation n'est pas une certification PSA. L'API expose `engine: local-card-inspection-v1`. Aucun appel IA externe n'est activé sans clé, licence et jeu de validation.

## Pistes évaluées

- [the_tin](https://github.com/the-tin-app/the_tin): empreinte visuelle et OCR sur appareil mobile.
- [TCGScanner](https://github.com/Wraken/TCGScanner): webcam et modèles TensorFlow Lite, avec seuil d'abstention.
- [CardScope](https://github.com/rhanka/pokemon-cards): PWA, recherche manuelle de secours et inférence ONNX dans un worker.
- [Pokeum](https://github.com/TBLgGamin/pokeum): DINOv2, pHash, OCR et symbole de série en signaux combinés.
- [CollectorVision](https://github.com/HanClinto/CollectorVision): détection des coins et redressement avant comparaison.
- [Centering Analysis Tool](https://github.com/lorcanajustice-tcg/Centering-Analysis-Tool): métriques de centrage et refus des photos avec reflets ou cadrage faible.
- [Pregrader](https://github.com/bagel786/Pregrader): séparation centrage, coins, bords et surface.

La prochaine étape de fiabilisation reste un jeu de validation TrackMyDex avec recto/verso, holo, sleeve, rotations, fonds et plusieurs langues. Aucun modèle externe ne sera activé par défaut avant mesure de précision, licence vérifiée et seuil d'abstention.

## Référentiel de grade

Le vocabulaire utilisateur suit les dimensions PSA publiques : centrage, coins, bords, surface et défauts visibles. TrackMyDex doit parler de « pré-évaluation » tant qu'aucun modèle calibré et aucune source de prix gradés exploitable ne sont branchés.
