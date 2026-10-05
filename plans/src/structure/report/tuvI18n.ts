// Textes du rapport repris du calcul de type statico 18-0573 (Prüfbuch TÜV 190060 B) : exploitation du rez-de-chaussée,
// profils de vent de côte et d'îles, frottement, lest au rez-de-chaussée seulement, longueur > 30 m, domaine du calage,
// éléments de façade (§ 3.6 – 3.7) et éléments terrasse (§ 3.5). Français, allemand (termes statico), anglais.
import type { Terrain } from '../core/wind';
import type { Lang } from './i18n';

export interface TuvLabels {
  liveGround: string;
  liveUpper: string;
  imposedLevels: (ground: string, upper: string) => string;
  outOfService: Record<Terrain, string>;
  frictionNote: (mu: string, high: boolean) => string;
  ballastGroundOnly: string;
  beyond30m: (length: string) => string;
  groundRule: string;
  facadeTitle: string;
  facadeIntro: string;
  facadeNotes: string;
  terraceTitle: string;
  terraceIntro: string;
}

export const TUV_LABELS: Record<Lang, TuvLabels> = {
  fr: {
    liveGround: 'Exploitation du rez-de-chaussée (statico 18-0573 § 2.2.1, public sans foule dense)',
    liveUpper: 'Exploitation des étages (DIN EN 13814, accès limité, sans foule dense)',
    imposedLevels: (g, u) => `rez-de-chaussée ${g} kN/m², étages ${u} kN/m²`,
    outOfService: {
      inland: 'Pression de pointe du profil mixte des catégories de terrain II et III (intérieur des terres), abattue de 0,7 pour une construction temporaire.',
      coast: 'Pression de pointe du profil mixte des catégories de terrain I et II (côte, bande de 5 km, et îles de la Baltique), abattue de 0,7 pour une construction temporaire (comme statico 18-0573 § 2.4).',
      island: 'Pression de pointe des îles de la mer du Nord (DIN EN 1991-1-4/NA, NA.B.3.3), abattue de 0,7 pour une construction temporaire.',
      manual: 'Pression de pointe donnée pour le site (à justifier), abattue pour une construction temporaire.',
    },
    frictionNote: (mu, high) =>
      high
        ? `Glissement vérifié avec μ = ${mu} (DIN EN 13814 tab. 3) : calage en bois posé sur béton ou asphalte, couches de bois vissées entre elles et au pied. Bois sur bois ou acier sur bois non liés : μ = 0,4, lest à recalculer.`
        : `Glissement vérifié avec μ = ${mu} (bois sur bois, acier sur bois, couches non liées — DIN EN 13814 tab. 3).`,
    ballastGroundOnly: 'Le lest éventuel se pose uniquement dans les Viewbox du rez-de-chaussée (statico 18-0573 § 5.3) ; les charges permanentes réellement présentes peuvent en être déduites.',
    beyond30m: (l) =>
      `Longueur de l’installation ${l} m : au-delà des versions examinées par le calcul de type statico 18-0573 (côtés jusqu’à 30 m). L’installation est calculée ici dans son ensemble ; ce calcul est à faire valider par l’ingénieur.`,
    groundRule:
      'Calage valable sur un sol légèrement compressible (prairie carrossable). Sur un sol dur (béton, asphalte), seul le frottement entre les matériaux en contact est à vérifier ; sur un sol détrempé, une étude particulière est nécessaire (statico 18-0573 § 3.9).',
    facadeTitle: 'Éléments de façade et garde-corps',
    facadeIntro:
      'Rails des murs, vitrages fixes, verre feuilleté, panneaux sandwich et garde-corps des étages, d’après les justifications du calcul de type statico 18-0573 § 3.6 – 3.7 (vent sur une Viewbox ouverte : wk = 1,5 · q), ramenées à la pression du site.',
    facadeNotes: 'Points à vérifier',
    terraceTitle: 'Éléments terrasse',
    terraceIntro:
      'Éléments terrasse 5,9 × 2,5 m sans toiture : rives en U plié, solives bois 150 × 50 à 53 cm, platelage (statico 18-0573 § 3.5 ; 24-0571 § 3.7). Au rez-de-chaussée : appuis aux 4 angles et au milieu des grands côtés (poutre à deux travées). À l’étage : posé sur la toiture de la Viewbox du dessous, dont les rives reprennent la charge (calcul complet).',
  },
  de: {
    liveGround: 'Verkehrslast Erdgeschoss (statico 18-0573 § 2.2.1, ohne dichtes Gedränge)',
    liveUpper: 'Verkehrslast Obergeschosse (DIN EN 13814, Zutrittsbeschränkung, ohne dichtes Gedränge)',
    imposedLevels: (g, u) => `EG ${g} kN/m², OG ${u} kN/m²`,
    outOfService: {
      inland: 'Böengeschwindigkeitsdruck des Mischprofils der Geländekategorien II und III (Binnenland), abgemindert mit 0,7 für Fliegende Bauten.',
      coast: 'Böengeschwindigkeitsdruck des Mischprofils der Geländekategorien I und II (Küste, 5-km-Streifen, und Inseln der Ostsee), abgemindert mit 0,7 für Fliegende Bauten (wie statico 18-0573 § 2.4).',
      island: 'Böengeschwindigkeitsdruck der Inseln der Nordsee (DIN EN 1991-1-4/NA, NA.B.3.3), abgemindert mit 0,7 für Fliegende Bauten.',
      manual: 'Für den Standort vorgegebener Böengeschwindigkeitsdruck (nachzuweisen), abgemindert für Fliegende Bauten.',
    },
    frictionNote: (mu, high) =>
      high
        ? `Gleitsicherheit mit μ = ${mu} nachgewiesen (DIN EN 13814 Tab. 3): Holzunterpallung auf Beton oder Asphalt, Holzlagen untereinander und am Fußpunkt schubfest verbunden. Holz / Holz oder Stahl / Holz ohne Verbindung: μ = 0,4, Ballast neu ermitteln.`
        : `Gleitsicherheit mit μ = ${mu} nachgewiesen (Holz / Holz, Stahl / Holz, Lagen nicht verbunden — DIN EN 13814 Tab. 3).`,
    ballastGroundOnly: 'Ballast darf nur in den unteren Containern (EG) angeordnet werden (statico 18-0573 § 5.3); tatsächlich vorhandene ständige Lasten dürfen abgezogen werden.',
    beyond30m: (l) =>
      `Länge der Anlage ${l} m: über die in der Typenstatik statico 18-0573 untersuchten Versionen hinaus (Seitenlänge bis 30 m). Die Anlage ist hier insgesamt berechnet; die Berechnung ist vom Ingenieur zu bestätigen.`,
    groundRule:
      'Unterpallung gilt nur bei leicht nachgiebigem Untergrund (z. B. befahrbare Wiesen). Bei festem Untergrund ist lediglich auf die Werkstoffpaarung (Reibung) zu achten; bei aufgeweichten Untergründen sind gesonderte Betrachtungen erforderlich (statico 18-0573 § 3.9).',
    facadeTitle: 'Wandelemente und Geländer',
    facadeIntro:
      'Schienen der Wandelemente, Festverglasung, VSG, Sandwichelemente und Geländer der Obergeschosse nach den Nachweisen der Typenstatik statico 18-0573 § 3.6 – 3.7 (Wind bei offenem Container: wk = 1,5 · q), auf den Staudruck des Standorts umgerechnet.',
    facadeNotes: 'Zu prüfende Punkte',
    terraceTitle: 'Terrassenelemente',
    terraceIntro:
      'Terrassenelemente 5,9 × 2,5 m ohne Dach: umlaufendes gekantetes U-Profil, Holzbalken 150 × 50 im Raster 53 cm, Belag (statico 18-0573 § 3.5; 24-0571 § 3.7). Im EG: Unterpallung am Anfang, Ende und mittig (Zweifeldträger). Im OG: auf dem Dach des darunterliegenden Containers aufgelagert, dessen Randträger die Last aufnehmen (Gesamtberechnung).',
  },
  en: {
    liveGround: 'Imposed load of the ground floor (statico 18-0573 § 2.2.1, no dense crowd)',
    liveUpper: 'Imposed load of the upper floors (DIN EN 13814, restricted access, no dense crowd)',
    imposedLevels: (g, u) => `ground floor ${g} kN/m², upper floors ${u} kN/m²`,
    outOfService: {
      inland: 'Peak velocity pressure of the mixed profile of terrain categories II and III (inland), reduced by 0.7 for a temporary structure.',
      coast: 'Peak velocity pressure of the mixed profile of terrain categories I and II (coast, 5 km strip, and Baltic Sea islands), reduced by 0.7 for a temporary structure (as statico 18-0573 § 2.4).',
      island: 'Peak velocity pressure of the North Sea islands (DIN EN 1991-1-4/NA, NA.B.3.3), reduced by 0.7 for a temporary structure.',
      manual: 'Peak velocity pressure given for the site (to be justified), reduced for a temporary structure.',
    },
    frictionNote: (mu, high) =>
      high
        ? `Sliding checked with μ = ${mu} (DIN EN 13814 table 3): timber packing on concrete or asphalt, timber layers screwed to each other and at the foot. Timber on timber or steel on timber, not connected: μ = 0.4, ballast to be recalculated.`
        : `Sliding checked with μ = ${mu} (timber on timber, steel on timber, layers not connected — DIN EN 13814 table 3).`,
    ballastGroundOnly: 'Any ballast is placed only in the ground floor Viewbox (statico 18-0573 § 5.3); permanent loads actually present may be deducted.',
    beyond30m: (l) =>
      `Length of the installation ${l} m: beyond the versions examined by the statico 18-0573 type calculation (sides up to 30 m). The installation is calculated here as a whole; this calculation is to be confirmed by the engineer.`,
    groundRule:
      'Packing valid on slightly compressible ground (trafficable meadow). On hard ground (concrete, asphalt) only the friction between the materials in contact is to be checked; on soaked ground a specific study is required (statico 18-0573 § 3.9).',
    facadeTitle: 'Façade elements and railings',
    facadeIntro:
      'Wall rails, fixed glazing, laminated glass, sandwich panels and railings of the upper floors, from the justifications of the statico 18-0573 type calculation § 3.6 – 3.7 (wind on an open Viewbox: wk = 1.5 · q), scaled to the site pressure.',
    facadeNotes: 'Points to check',
    terraceTitle: 'Terrace elements',
    terraceIntro:
      'Terrace elements 5.9 × 2.5 m without roof: folded U edge beams, timber joists 150 × 50 at 53 cm, decking (statico 18-0573 § 3.5; 24-0571 § 3.7). On the ground floor: supports at the 4 corners and at mid-length of the long sides (two-span beam). On an upper floor: resting on the roof of the Viewbox below, whose edge beams carry the load (full calculation).',
  },
};
