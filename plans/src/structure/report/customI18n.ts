// Textes du rapport propres aux types de structure personnalisés (S12), en français, allemand et anglais : documents,
// poids, réserve « type non couvert ». Une installation sans Viewbox ne cite ni le Prüfbuch TÜV, ni les notes statico,
// ni la pesée de la Viewbox (`neutralText` retire les dernières références de ses textes).
import type { Lang } from './i18n';

export interface CustomLabels {
  docs: (types: string[]) => string[];
  weightIntro: string;
  reserve: string;
  ballast: string;
  jacks: string;
  modelling: string;
  notVerifiedTitle: string;
}

export const CUSTOM_LABELS: Record<Lang, CustomLabels> = {
  fr: {
    docs: (types) => types.map((t) => `Type de structure « ${t} » : barres, sections, assemblages et appuis décrits dans la bibliothèque structure VEM (relevés sur le modèle SketchUp ou saisis).`),
    weightIntro: 'Poids propre de chaque type de structure : pesée saisie pour le type, sinon poids calculé (barres du type à 78,5 kN/m³ + plafond + sol, le plancher du type compris une seule fois).',
    reserve: 'Type de structure non couvert par une note de calcul de référence : pré-étude à faire confirmer par un ingénieur.',
    ballast: 'Le lest éventuel se pose dans les modules du rez-de-chaussée.',
    jacks: 'Pieds posés directement sur le calage.',
    modelling: 'Modélisation : barres sur leurs lignes de système (axes des profils recalés aux nœuds), excentricités d’assemblage ignorées, modèle des angles selon le type (soudé, boulonné semi-rigide ou articulé).',
    notVerifiedTitle: 'Type de structure personnalisé',
  },
  de: {
    docs: (types) => types.map((t) => `Tragwerkstyp „${t}“: Stäbe, Querschnitte, Verbindungen und Auflager aus der VEM-Tragwerksbibliothek (aus dem SketchUp-Modell übernommen oder eingegeben).`),
    weightIntro: 'Eigengewicht jedes Tragwerkstyps: eingegebenes gewogenes Gewicht, sonst berechnet (Stäbe des Typs mit 78,5 kN/m³ + Decke + Boden, der Boden des Typs nur einmal berücksichtigt).',
    reserve: 'Tragwerkstyp ohne Referenz-Typenstatik: Vorabzug, durch einen Tragwerksplaner zu bestätigen.',
    ballast: 'Eventueller Ballast wird in den Modulen des Erdgeschosses angeordnet.',
    jacks: 'Füße direkt auf der Unterpallung.',
    modelling: 'Modellierung: Stäbe auf ihren Systemlinien (Profilachsen in den Knoten zusammengeführt), Exzentrizitäten der Anschlüsse vernachlässigt, Eckmodell je nach Typ (geschweißt, geschraubt halbsteif oder gelenkig).',
    notVerifiedTitle: 'Benutzerdefinierter Tragwerkstyp',
  },
  en: {
    docs: (types) => types.map((t) => `Structure type “${t}”: members, sections, connections and supports described in the VEM structure library (taken from the SketchUp model or entered).`),
    weightIntro: 'Self-weight of each structure type: weighed weight entered for the type, otherwise calculated (members of the type at 78.5 kN/m³ + ceiling + floor, the floor of the type counted once).',
    reserve: 'Structure type not covered by a reference calculation: preliminary study to be confirmed by an engineer.',
    ballast: 'Any ballast is placed in the ground-floor modules.',
    jacks: 'Feet placed directly on the packing.',
    modelling: 'Modelling: members on their system lines (profile axes brought to the nodes), connection eccentricities ignored, corner model according to the type (welded, bolted semi-rigid or pinned).',
    notVerifiedTitle: 'Custom structure type',
  },
};

/**
 * Retire d'un texte les références aux notes statico, au Prüfbuch TÜV et à la Viewbox (installation sans Viewbox) :
 * parenthèses et renvois « statico 24-0571 § 3.5 », « méthode statico » → méthode décrite.
 */
export function neutralText(t: string): string {
  return t
    // méthode EC3 « statico » = longueurs de flambement nulles, Cm = 0,9 (2ᵉ ordre avec imperfections)
    .replace(/ et statico \(Cm/g, ' et du 2ᵉ ordre seul (Cm')
    .replace(/ und statico-Verfahren \(Cm/g, ' und Verfahren nach Theorie II. Ordnung allein (Cm')
    .replace(/ and of the statico method \(Cm/g, ' and of the second-order-only method (Cm')
    .replace(/\s*\((?:[^()]*?\b)?(?:statico|TÜV|Prüfbuch|ideaStatiCa)\b[^()]*\)/g, '')
    .replace(/(?:méthode|Methode|method|Verfahren) statico\s*\((porte-à-faux diagonal|diagonal cantilever|diagonale Auskragung)\)/gi, '$1')
    .replace(/\b(?:méthode|Methode|method|Verfahren) statico\b/gi, (m) => (/^m[ée]thode/i.test(m) ? 'méthode du porte-à-faux diagonal' : /^Methode|^Verfahren/.test(m) ? 'Verfahren der diagonalen Auskragung' : 'diagonal cantilever method'))
    .replace(/\s*[;,]\s*statico(?: \d{2}-\d{4}(?: Rev\. ?\d)?)?(?: (?:§|annexe|Anhang|annex) [\w.–-]+)?/g, '')
    .replace(/^statico(?: \d{2}-\d{4}(?: Rev\. ?\d)?)?(?: (?:§|annexe|Anhang|annex) [\w.–-]+)?\s*[;,]?\s*/g, '')
    .replace(/\b(?:des notes|der) statico\b/g, '')
    .replace(/ of the statico reports/g, '')
    .replace(/ der statico-Berechnungen/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
