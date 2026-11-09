// Textes du rapport propres au référentiel France (Eurocodes avec annexes nationales françaises + arrêté du 25 juillet
// 2022 sur les structures provisoires et démontables), en français, allemand et anglais. Ils remplacent les textes du
// référentiel Allemagne (DIN EN 13814, MVV TB, Prüfbuch TÜV) ; les références aux notes statico restent celles des
// données du produit Viewbox (poids, capacités des assemblages).
import type { Labels, Lang } from './i18n';
import type { TuvLabels } from './tuvI18n';
import type { FrDuration, FrTerrain } from '../core/codeFR';

export interface FrCodeLabels {
  /** textes du rapport remplacés */
  labels: Partial<Labels>;
  tuv: Partial<TuvLabels>;
  /** référentiel (§ 1.1) */
  basis: string;
  horizontal: (pct: string, area: string) => string;
  legalTitle: string;
  legal: string[];
  snowRegion: (region: string, altitude: string) => string;
  windSite: (region: number, terrain: FrTerrain, duration: FrDuration) => string;
  terrain: Record<FrTerrain, string>;
  duration: Record<FrDuration, string>;
}

const norms = (t: [string, string, string, string, string, string, string]): Array<[string, string]> => [
  ['NF EN 1990/NA', t[0]],
  ['NF EN 1991-1-1/NA', t[1]],
  ['NF EN 1991-1-3/NA', t[2]],
  ['NF EN 1991-1-4/NA', t[3]],
  ['NF EN 1991-1-6/NA', t[4]],
  ['NF EN 1993-1-1/NA, 1993-1-8/NA', t[5]],
  ['NF EN 1995-1-1/NA', t[6]],
];

export const FR_CODE_LABELS: Record<Lang, FrCodeLabels> = {
  fr: {
    labels: {
      coverSubtitle: 'Construction temporaire modulaire Viewbox (structure provisoire et démontable)',
      shutdown: (v, s) => `Arrêt de l’exploitation et évacuation ${s} au plus tard à ${v} m/s (rafale) : vent de service de l’arrêté du 25 juillet 2022.`,
      windConditions: (qp, v) => `Hors service (structure évacuée), la construction est justifiée pour une pression dynamique de pointe qp = ${qp} kN/m² (NF EN 1991-1-4/NA, période de retour selon la durée de l’installation), soit une rafale de ${v} m/s.`,
      windInService: (q, v, s) =>
        `En service, la construction est justifiée pour le vent de service de ${v} m/s (q = ${q} kN/m², arrêté du 25 juillet 2022, art. 10) : l’exploitation est arrêtée et l’évacuation ${s} achevée au plus tard à cette vitesse de vent (rafale). La vitesse du vent sur la construction est surveillée en continu.`,
      norms: [
        ...norms([
          'Bases de calcul (combinaisons, coefficients partiels et ψ)',
          'Poids propres et charges d’exploitation',
          'Charges de neige',
          'Actions du vent',
          'Actions en cours d’exécution (périodes de retour des situations temporaires)',
          'Calcul des structures en acier, assemblages',
          'Calcul des structures en bois',
        ]),
        ['Arrêté du 25 juillet 2022', 'Règles de sécurité et dispositions techniques applicables aux structures provisoires et démontables (modifié le 13 mai 2025)'],
      ],
      liveText: 'Exploitation des planchers (arrêté du 25 juillet 2022, ensembles accessibles au public)',
      handrail: 'Garde-corps et mains courantes : charges de l’arrêté du 25 juillet 2022 — non vérifiés par cette pré-étude.',
      inServiceTitle: 'En service (vent de service, arrêté du 25 juillet 2022)',
      outOfServiceTitle: 'Hors service (NF EN 1991-1-4/NA, structure évacuée)',
      outOfServiceText: 'Pression dynamique de pointe à la hauteur de l’installation, vitesse de référence de la région de vent réduite selon la durée de l’installation (coefficient de probabilité), relief plat.',
      roofSuction: 'La succion des toitures est prise avec le vent hors service pour l’équilibre statique (combinaisons COB) et le soulèvement (G favorable 1,0).',
      combosText:
        'Combinaisons de NF EN 1990/NA (bâtiments) : ELU 1,35 G + 1,5 Q avec les valeurs d’accompagnement ψ0 (public 0,7, vent 0,6, neige 0,5), G favorable 1,0 sous le vent hors service ; équilibre statique (EQU) 0,9 G + 1,5 W ; combinaisons caractéristiques pour les réactions au sol. Hors service, la structure est évacuée : pas de public.',
      stabilityBasis: 'Coefficients des actions (NF EN 1990/NA, équilibre statique EQU) :',
      stabilityFactors: [
        ['charges permanentes favorables', 'γG,inf = 0,9 (*)'],
        ['vent défavorable', 'γQ = 1,5'],
      ],
      stabilityFootnote: '(*) Logos non pris en compte (côté de la sécurité).',
      reserve: 'Pré-étude interne réalisée avec l’outil VEM, non vérifiée par un ingénieur : elle ne remplace pas la note de calcul et les contrôles prévus par l’arrêté du 25 juillet 2022 (bureau d’études, organisme de contrôle) avant exploitation.',
    },
    tuv: {
      liveGround: 'Exploitation du rez-de-chaussée (arrêté du 25 juillet 2022, ensembles accessibles au public)',
      liveUpper: 'Exploitation des étages (arrêté du 25 juillet 2022, ensembles accessibles au public)',
      frictionNote: (mu, high) =>
        high
          ? `Glissement vérifié avec μ = ${mu} : calage en bois posé sur béton ou asphalte, couches de bois vissées entre elles et au pied (valeur à justifier pour d’autres matériaux). Bois sur bois ou acier sur bois non liés : μ = 0,4, lest à recalculer.`
          : `Glissement vérifié avec μ = ${mu} (bois sur bois, acier sur bois, couches non liées).`,
    },
    basis:
      'Référentiel de calcul : France — Eurocodes avec les annexes nationales françaises et arrêté du 25 juillet 2022 fixant les règles de sécurité et les dispositions techniques applicables aux structures provisoires et démontables. Les capacités des assemblages et le poids de la Viewbox sont repris des documents du produit.',
    horizontal: (pct, area) => `Charge horizontale dynamique simultanée à l’exploitation verticale, au niveau du plancher, dans les 4 directions (arrêté du 25 juillet 2022) : H = ${pct} % de V (${area} m² de planchers ouverts au public ; 6 % jusqu’à 500 m², 10 % au-delà).`,
    legalTitle: 'Références réglementaires (France)',
    legal: [
      'Structure provisoire et démontable au sens de l’arrêté du 25 juillet 2022 (modifié le 13 mai 2025) : la classer et organiser les contrôles avec le bureau de contrôle ou la commission de sécurité.',
      'Notice technique du fabricant : charges admissibles, vent de service et consignes de montage ; note de calcul justifiant le dimensionnement (art. 10).',
      'Évacuation du public dès que le vent atteint le vent de service ; anémomètre sur place.',
      'Pas de Prüfbuch TÜV (livre d’examen allemand) : les plaques de calage sont dimensionnées par le calcul, appui par appui.',
      'Valeurs des annexes nationales relevées hors des textes AFNOR : à confirmer sur les normes avant exploitation.',
    ],
    snowRegion: (r, a) => `région ${r}, altitude ${a} m, NF EN 1991-1-3/NA`,
    windSite: (r, t, d) => `région de vent ${r}, catégorie de terrain ${t}, durée ${FR_CODE_LABELS.fr.duration[d]}`,
    terrain: { '0': '0 (mer, côte exposée)', II: 'II (rase campagne)', IIIa: 'IIIa (campagne avec haies)', IIIb: 'IIIb (zone urbanisée)', IV: 'IV (ville dense, forêt)' },
    duration: { '3d': '3 jours au plus (tempête sur 2 ans)', '3m': '3 mois au plus (tempête sur 5 ans)', '1y': '1 an au plus (tempête sur 10 ans)', long: 'plus d’un an (tempête sur 50 ans)' },
  },
  de: {
    labels: {
      coverSubtitle: 'Modularer vorübergehender, demontierbarer Bau aus Viewbox-Containermodulen',
      shutdown: (v, s) => `Einstellen des Betriebs und Räumung ${s} spätestens bei Böengeschwindigkeiten von ${v} m/s: Betriebswind nach dem französischen Erlass vom 25. Juli 2022.`,
      windConditions: (qp, v) => `Außer Betrieb (geräumt) ist die Konstruktion für einen Böengeschwindigkeitsdruck qp = ${qp} kN/m² nachgewiesen (NF EN 1991-1-4/NA, Wiederkehrperiode nach Standdauer), entsprechend einer Böe von ${v} m/s.`,
      windInService: (q, v, s) =>
        `In Betrieb ist die Konstruktion für den Betriebswind von ${v} m/s nachgewiesen (q = ${q} kN/m², französischer Erlass vom 25. Juli 2022, Art. 10): der Betrieb ist einzustellen und die Räumung ${s} spätestens bei dieser Böengeschwindigkeit abzuschließen. Eine geeignete Überwachung der Windgeschwindigkeit ist durchzuführen.`,
      norms: [
        ...norms([
          'Grundlagen der Tragwerksplanung (Kombinationen, Teilsicherheits- und ψ-Beiwerte)',
          'Eigengewichte und Nutzlasten',
          'Schneelasten',
          'Windlasten',
          'Einwirkungen während der Bauausführung (Wiederkehrperioden vorübergehender Situationen)',
          'Bemessung von Stahlbauten, Anschlüsse',
          'Bemessung von Holzbauten',
        ]),
        ['Erlass vom 25. Juli 2022', 'Französische Sicherheitsregeln und technische Bestimmungen für vorübergehende, demontierbare Bauten (geändert am 13. Mai 2025)'],
      ],
      liveText: 'Verkehrslast (französischer Erlass vom 25. Juli 2022, öffentlich zugängliche Anlagen)',
      handrail: 'Geländer und Handläufe: Lasten des französischen Erlasses vom 25. Juli 2022 — in dieser Vorbemessung nicht nachgewiesen.',
      inServiceTitle: 'In Betrieb (Betriebswind, französischer Erlass vom 25. Juli 2022)',
      outOfServiceTitle: 'Außer Betrieb (NF EN 1991-1-4/NA, Anlage geräumt)',
      outOfServiceText: 'Böengeschwindigkeitsdruck in Höhe der Anlage, Basiswindgeschwindigkeit der Windzone abgemindert nach Standdauer (Wahrscheinlichkeitsbeiwert), ebenes Gelände.',
      roofSuction: 'Der Dachsog wird mit dem Wind außer Betrieb für die Lagesicherheit (Kombinationen COB) und das Abheben (ständige Lasten günstig 1,0) angesetzt.',
      combosText:
        'Kombinationen nach NF EN 1990/NA (Hochbau): GZT 1,35 G + 1,5 Q mit den Kombinationsbeiwerten ψ0 (Personen 0,7, Wind 0,6, Schnee 0,5), ständige Lasten günstig 1,0 unter Wind außer Betrieb; Lagesicherheit (EQU) 0,9 G + 1,5 W; charakteristische Kombinationen für die Auflagerreaktionen. Außer Betrieb ist die Anlage geräumt: keine Personenlast.',
      stabilityBasis: 'Teilsicherheitsbeiwerte (NF EN 1990/NA, Lagesicherheit EQU):',
      stabilityFactors: [
        ['günstige ständige Lasten', 'γG,inf = 0,9 (*)'],
        ['ungünstiger Wind', 'γQ = 1,5'],
      ],
      stabilityFootnote: '(*) Logos werden auf der sicheren Seite nicht angesetzt.',
      reserve: 'Interne Vorbemessung mit dem VEM-Werkzeug, nicht von einem Ingenieur geprüft: sie ersetzt nicht die statische Berechnung und die Prüfungen nach dem französischen Erlass vom 25. Juli 2022 (Tragwerksplaner, Prüfstelle) vor der Inbetriebnahme.',
    },
    tuv: {
      liveGround: 'Verkehrslast Erdgeschoss (französischer Erlass vom 25. Juli 2022, öffentlich zugängliche Anlagen)',
      liveUpper: 'Verkehrslast Obergeschosse (französischer Erlass vom 25. Juli 2022, öffentlich zugängliche Anlagen)',
      frictionNote: (mu, high) =>
        high
          ? `Gleiten nachgewiesen mit μ = ${mu}: Holzunterpallung auf Beton oder Asphalt, Holzlagen untereinander und mit dem Fuß verschraubt (für andere Materialien nachzuweisen). Holz auf Holz oder Stahl auf Holz ohne Verbindung: μ = 0,4, Ballast neu zu berechnen.`
          : `Gleiten nachgewiesen mit μ = ${mu} (Holz auf Holz, Stahl auf Holz, Lagen nicht verbunden).`,
    },
    basis:
      'Berechnungsgrundlage: Frankreich — Eurocodes mit den französischen nationalen Anhängen und Erlass vom 25. Juli 2022 über die Sicherheitsregeln und technischen Bestimmungen für vorübergehende, demontierbare Bauten. Die Tragfähigkeiten der Anschlüsse und das Gewicht der Viewbox sind den Produktunterlagen entnommen.',
    horizontal: (pct, area) => `Dynamische Horizontallast gleichzeitig mit der vertikalen Verkehrslast in Höhe der Bodenebene, in den 4 Richtungen (französischer Erlass vom 25. Juli 2022): H = ${pct} % von V (${area} m² öffentlich zugängliche Böden; 6 % bis 500 m², darüber 10 %).`,
    legalTitle: 'Rechtliche Grundlagen (Frankreich)',
    legal: [
      'Vorübergehender, demontierbarer Bau im Sinne des Erlasses vom 25. Juli 2022 (geändert am 13. Mai 2025): Einstufung und Prüfungen mit der Prüfstelle oder der Sicherheitskommission abzustimmen.',
      'Technisches Merkblatt des Herstellers: zulässige Lasten, Betriebswind und Aufbauanweisungen; statische Berechnung des Tragwerks (Art. 10).',
      'Räumung, sobald der Wind den Betriebswind erreicht; Anemometer vor Ort.',
      'Kein TÜV-Prüfbuch (deutsches Prüfbuch): die Unterpallungsplatten werden je Auflager rechnerisch bemessen.',
      'Werte der nationalen Anhänge nicht aus den AFNOR-Texten entnommen: vor der Inbetriebnahme an den Normen zu prüfen.',
    ],
    snowRegion: (r, a) => `Zone ${r}, Höhe ${a} m, NF EN 1991-1-3/NA`,
    windSite: (r, t, d) => `Windzone ${r}, Geländekategorie ${t}, Standdauer ${FR_CODE_LABELS.de.duration[d]}`,
    terrain: { '0': '0 (See, exponierte Küste)', II: 'II (offenes Gelände)', IIIa: 'IIIa (Gelände mit Hecken)', IIIb: 'IIIb (bebautes Gebiet)', IV: 'IV (Stadt, Wald)' },
    duration: { '3d': 'höchstens 3 Tage (Sturm in 2 Jahren)', '3m': 'höchstens 3 Monate (Sturm in 5 Jahren)', '1y': 'höchstens 1 Jahr (Sturm in 10 Jahren)', long: 'mehr als 1 Jahr (Sturm in 50 Jahren)' },
  },
  en: {
    labels: {
      coverSubtitle: 'Modular temporary structure made of Viewbox units (temporary demountable structure)',
      shutdown: (v, s) => `Stop operation and clear ${s} at the latest at gusts of ${v} m/s: service wind of the French order of 25 July 2022.`,
      windConditions: (qp, v) => `Out of service (structure cleared), the structure is verified for a peak velocity pressure qp = ${qp} kN/m² (NF EN 1991-1-4/NA, return period according to the duration of the installation), i.e. a gust of ${v} m/s.`,
      windInService: (q, v, s) =>
        `In service, the structure is verified for the service wind of ${v} m/s (q = ${q} kN/m², French order of 25 July 2022, art. 10): operation is stopped and ${s} cleared at the latest at this wind speed (gust). The wind speed on the structure is monitored continuously.`,
      norms: [
        ...norms([
          'Basis of design (combinations, partial and ψ factors)',
          'Self-weight and imposed loads',
          'Snow loads',
          'Wind actions',
          'Actions during execution (return periods of temporary situations)',
          'Design of steel structures, joints',
          'Design of timber structures',
        ]),
        ['Order of 25 July 2022', 'French safety rules and technical provisions for temporary demountable structures (amended on 13 May 2025)'],
      ],
      liveText: 'Imposed floor load (French order of 25 July 2022, structures open to the public)',
      handrail: 'Railings and handrails: loads of the French order of 25 July 2022 — not verified by this preliminary study.',
      inServiceTitle: 'In service (service wind, French order of 25 July 2022)',
      outOfServiceTitle: 'Out of service (NF EN 1991-1-4/NA, structure cleared)',
      outOfServiceText: 'Peak velocity pressure at the height of the installation, basic wind velocity of the wind region reduced according to the duration of the installation (probability factor), flat terrain.',
      roofSuction: 'Roof suction is applied with the out-of-service wind for static equilibrium (COB combinations) and uplift (favourable permanent loads 1.0).',
      combosText:
        'Combinations of NF EN 1990/NA (buildings): ULS 1.35 G + 1.5 Q with the accompanying ψ0 values (public 0.7, wind 0.6, snow 0.5), favourable permanent loads 1.0 under the out-of-service wind; static equilibrium (EQU) 0.9 G + 1.5 W; characteristic combinations for the ground reactions. Out of service the structure is cleared: no public.',
      stabilityBasis: 'Partial factors on actions (NF EN 1990/NA, static equilibrium EQU):',
      stabilityFactors: [
        ['favourable permanent loads', 'γG,inf = 0.9 (*)'],
        ['unfavourable wind', 'γQ = 1.5'],
      ],
      stabilityFootnote: '(*) Logos are ignored (on the safe side).',
      reserve: 'Internal preliminary study made with the VEM tool, not checked by an engineer: it does not replace the structural calculation and the checks required by the French order of 25 July 2022 (design office, inspection body) before operation.',
    },
    tuv: {
      liveGround: 'Imposed load, ground floor (French order of 25 July 2022, structures open to the public)',
      liveUpper: 'Imposed load, upper floors (French order of 25 July 2022, structures open to the public)',
      frictionNote: (mu, high) =>
        high
          ? `Sliding verified with μ = ${mu}: timber packing on concrete or asphalt, timber layers screwed together and to the foot (to be justified for other materials). Timber on timber or steel on timber not fixed: μ = 0.4, ballast to be recalculated.`
          : `Sliding verified with μ = ${mu} (timber on timber, steel on timber, layers not fixed).`,
    },
    basis:
      'Design basis: France — Eurocodes with the French national annexes and order of 25 July 2022 on the safety rules and technical provisions for temporary demountable structures. The connection capacities and the weight of the Viewbox are taken from the product documents.',
    horizontal: (pct, area) => `Dynamic horizontal load acting with the vertical imposed load, at floor level, in the 4 directions (French order of 25 July 2022): H = ${pct} % of V (${area} m² of floors open to the public; 6 % up to 500 m², 10 % above).`,
    legalTitle: 'Regulatory references (France)',
    legal: [
      'Temporary demountable structure within the meaning of the order of 25 July 2022 (amended on 13 May 2025): its category and checks are to be agreed with the inspection body or the safety commission.',
      'Manufacturer’s technical notice: allowable loads, service wind and erection instructions; structural calculation justifying the design (art. 10).',
      'Clear the public as soon as the wind reaches the service wind; anemometer on site.',
      'No TÜV Prüfbuch (German inspection book): the packing plates are sized by calculation, support by support.',
      'Values of the national annexes not taken from the AFNOR texts: to be confirmed against the standards before operation.',
    ],
    snowRegion: (r, a) => `region ${r}, altitude ${a} m, NF EN 1991-1-3/NA`,
    windSite: (r, t, d) => `wind region ${r}, terrain category ${t}, duration ${FR_CODE_LABELS.en.duration[d]}`,
    terrain: { '0': '0 (sea, exposed coast)', II: 'II (open country)', IIIa: 'IIIa (country with hedges)', IIIb: 'IIIb (built-up area)', IV: 'IV (dense town, forest)' },
    duration: { '3d': 'up to 3 days (2-year storm)', '3m': 'up to 3 months (5-year storm)', '1y': 'up to 1 year (10-year storm)', long: 'more than 1 year (50-year storm)' },
  },
};
