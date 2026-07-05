---
name: Serene Design System
colors:
  surface: '#e8fff1'
  surface-dim: '#c9dfd2'
  surface-bright: '#e8fff1'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#e2f9eb'
  surface-container: '#ddf3e5'
  surface-container-high: '#d7eee0'
  surface-container-highest: '#d1e8da'
  on-surface: '#0c1f17'
  on-surface-variant: '#404943'
  inverse-surface: '#21342b'
  inverse-on-surface: '#e0f6e8'
  outline: '#707973'
  outline-variant: '#bfc9c1'
  surface-tint: '#2c694e'
  primary: '#0f5238'
  on-primary: '#ffffff'
  primary-container: '#2d6a4f'
  on-primary-container: '#a8e7c5'
  inverse-primary: '#95d4b3'
  secondary: '#4e653f'
  on-secondary: '#ffffff'
  secondary-container: '#d0ebbb'
  on-secondary-container: '#546b45'
  tertiary: '#484744'
  on-tertiary: '#ffffff'
  tertiary-container: '#605f5b'
  on-tertiary-container: '#dcd9d4'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#b1f0ce'
  primary-fixed-dim: '#95d4b3'
  on-primary-fixed: '#002114'
  on-primary-fixed-variant: '#0e5138'
  secondary-fixed: '#d0ebbb'
  secondary-fixed-dim: '#b5cea1'
  on-secondary-fixed: '#0d2003'
  on-secondary-fixed-variant: '#374d2a'
  tertiary-fixed: '#e5e2dd'
  tertiary-fixed-dim: '#c8c6c2'
  on-tertiary-fixed: '#1c1c19'
  on-tertiary-fixed-variant: '#474743'
  background: '#e8fff1'
  on-background: '#0c1f17'
  surface-variant: '#d1e8da'
typography:
  display-lg:
    fontFamily: Quicksand
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Quicksand
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Quicksand
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 32px
  title-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  unit: 8px
  container-padding-mobile: 24px
  container-padding-desktop: 48px
  gutter: 16px
  section-gap: 40px
---

## Style & Image de Marque
Le design de ce système repose sur l'empathie, la clarté et la sérénité. L'objectif est de transformer l'interaction avec une IA en une expérience humaine, chaleureuse et apaisante, loin de l'esthétique clinique ou purement technologique.

Le style adopté est un mélange de **Minimalisme Doux** et de **Tonalités Organiques**. Nous privilégions des espaces généreux (whitespace), une typographie arrondie et accueillante, et des transitions fluides. L'interface doit donner l'impression de respirer, offrant un refuge numérique contre l'anxiété quotidienne.

## Couleurs
La palette s'inspire de la nature pour favoriser la réduction du stress et l'ancrage.

- **Forêt Profonde (Primaire) :** Utilisé pour les actions principales, le texte important et les états actifs. Il apporte stabilité et autorité bienveillante.
- **Sauge Douce (Secondaire) :** Une teinte apaisante pour les composants secondaires, les illustrations et les accents légers.
- **Crème Solaire (Tertiaire/Fond) :** Remplace le blanc pur pour réduire la fatigue oculaire et créer une atmosphère plus chaleureuse et moins stérile.
- **Encre de Terre (Neutre) :** Un vert-noir profond utilisé pour la typographie de lecture afin de maintenir un contraste élevé sans l'agressivité du noir pur.

## Typographie
La hiérarchie typographique est conçue pour être lisible et amicale. 

Nous utilisons **Quicksand** pour les titres en raison de ses terminaisons arrondies qui évoquent la douceur. Pour le corps de texte, **Plus Jakarta Sans** assure une excellente lisibilité tout en conservant une géométrie moderne et ouverte. 

L'espacement entre les lignes est volontairement large (1.5x) pour éviter toute sensation d'encombrement visuel, facilitant ainsi la digestion de l'information par les utilisateurs en état de stress.

## Mise en page et Espacement
Le système utilise une **grille fluide** basée sur une unité modulaire de 8px. 

- **Marges :** Une marge de sécurité importante de 24px est appliquée sur mobile pour éviter que le contenu ne paraisse étriqué.
- **Rythme Vertical :** Les sections sont séparées par des espaces larges (40px+) pour renforcer la sensation de calme et de minimalisme.
- **Alignement :** Centré pour les écrans d'accueil et de succès, aligné à gauche pour les flux de conversation (Chat) afin de maintenir une structure naturelle de lecture.

## Élévation et Profondeur
Au lieu de l'ombre portée traditionnelle, ce design system utilise des **couches tonales** et des **ombres d'ambiance ultra-diffuses**.

L'élévation est suggérée par :
1.  **Variations de surface :** Utilisation de la Sauge Douce sur fond Crème pour les conteneurs.
2.  **Ombres "Soft Glow" :** Les cartes et boutons flottants utilisent des ombres très larges (30px-40px de flou) avec une opacité très faible (8-10%) teintée avec la couleur secondaire, créant un effet de lévitation naturelle plutôt qu'une ombre portée dure.
3.  **Flou d'arrière-plan :** Pour les modales, un léger flou (backdrop-filter) est appliqué pour isoler l'action tout en gardant un lien visuel avec le contexte.

## Formes
Les formes sont au cœur de l'identité de ce système. La rigueur des angles droits est proscrite au profit de **courbes généreuses**.

Les rayons de bordure standards commencent à **24px** pour les cartes et les conteneurs principaux. Les boutons adoptent une forme **pilule (full rounded)** pour inviter au toucher. Cette absence d'angles vifs vise à réduire inconsciemment le sentiment de menace ou de rigidité clinique.

## Composants

### Boutons
Les boutons principaux (Primary) sont en plein (Forêt Profonde) avec un texte Crème. Les boutons secondaires utilisent un contour (Border) léger ou un fond Sauge Douce. Toujours arrondis au maximum.

### Bulles de Chat
- **IA :** Fond Crème avec une bordure fine Sauge, texte Forêt Profonde.
- **Utilisateur :** Fond Forêt Profonde, texte Crème.
Les bulles ont un rayon de 20px, avec un angle spécifique pour indiquer l'émetteur.

### Cartes d'exercices
Utilisent un fond blanc pur sur la surface Crème pour créer un contraste doux. Elles incluent systématiquement une icône illustrative aux traits fins et arrondis.

### Champs de saisie
Les inputs sont de type "Pilule", avec une bordure douce qui s'épaissit et change de couleur (Sauge vers Forêt) lors du focus. Le texte d'aide (Placeholder) est écrit avec une tonalité encourageante.

### Indicateurs de progression
Utilisation de lignes organiques et de cercles plutôt que des barres de progression rigides. Les animations de chargement doivent être lentes et cycliques, simulant un rythme respiratoire.