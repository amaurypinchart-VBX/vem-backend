// Textes fixes des documents de calage (plan de calage A3, plan des appuis au sol, fiche de calage) en français,
// allemand et anglais, et références réglementaires du Prüfbuch TÜV 190060 B / calcul statico 18-0573 (§ 3.9
// Bodenpressung & Unterpallung), reprises mot pour mot du Prüfbuch et des notes statico. Fonctions pures.
import { TUV, TUV_PLATES } from '../core/tuv';
import type { Lang } from './i18n';
import { num } from './i18n';

export interface CalageDocLabels {
  // plan de calage A3 (colonne de texte de la planche)
  typesTitle: string;
  materialsTitle: string;
  layingTitle: string;
  legalTitle: string;
  pointsOf: (ids: string) => string;
  flushAll: string;
  centeredSome: (n: number, cm: string) => string;
  centeredAll: string;
  stacked: string;
  overhang: (cm: string) => string;
  tuvOk: string;
  tuvKo: (types: string) => string;
  tuvOff: string;
  /** références du Prüfbuch, une phrase par ligne */
  legal: (jacks: boolean) => string[];
  // plan des appuis au sol (A4)
  pointsTitle: string;
  planTitle: string;
  roadwayTitle: string;
  pointsTableTitle: (n: number) => string;
  pointsTableCont: string;
  coordsLegend: string;
  roadwayNote: string;
  footer: string;
  footerSheet: (fem: boolean) => string;
  roadwayRows: { area: string; areaValue: (m2: string) => string; load: string; loadValue: (kN: string, t: string) => string; plates: string; notCounted: string; mean: string; worst: string; bearing: string };
  verdictText: { ok: string; limit: string; fail: string; incomplete: string };
  cols: { point: string; type: string; modules: string; plate: string; calage: string };
  noPlate: string;
  roadwaySuffix: string;
  exceeded: string;
  limit: string;
  levels: (n: number) => string;
  level: (n: number) => string;
  // fiche de calage (A4)
  sheetTitle: string;
  s1: string;
  s2: (fem: boolean) => string;
  s3: string;
  s4: string;
  s5: string;
  s6: string;
  sheetCols: { type: string; count: string; solution: string; state: string; designation: string; dims: string; qty: string; mass: string };
  stateOk: string;
  stateLimit: string;
  stateOut: string;
  stateNone: string;
  none: string;
  longrineVariant: (s: string, eta: string) => string;
  femNote: string;
  estimateNote: string;
  platesNote: string;
  roadwayUsed: (kN: string, m2: string, q: string) => string;
  watermark: string;
  // rapport (§ 1.4 et § 3 sol et calage)
  timberRow: string;
  timberValue: string;
  placementRow: string;
  placementValue: (flush: number, centered: number, overCm: string) => string;
  tuvRow: string;
  tuvNone: string;
}

const tuvTable = (lang: Lang, sep: string) =>
  TUV_PLATES.map(
    (p, i) =>
      `${i ? `${p.containers}${lang === 'fr' ? ' :' : ':'} ` : ''}${num(lang, p.side / 10, 0)} × ${num(lang, p.side / 10, 0)}${i ? '' : ' cm'} (${p.t.map((t, k) => `${i ? '' : `${k + 1} × `}${num(lang, t / 10, 1)}`).join(' / ')}${i ? '' : ' cm'})`,
  ).join(sep);

const FR: CalageDocLabels = {
  typesTitle: 'TYPES D’APPUI ET PLAQUES',
  materialsTitle: 'MATÉRIEL À PRÉPARER',
  layingTitle: 'POSE DES PLAQUES',
  legalTitle: 'RÉFÉRENCES RÉGLEMENTAIRES (TÜV)',
  pointsOf: (ids) => `appuis ${ids}`,
  flushAll: 'Plaques posées à fleur de la Viewbox : elles ne dépassent pas de l’installation (calcul avec l’emprise efficace d’une plaque excentrée, B’ = B − 2 e).',
  centeredSome: (n, cm) => `${n} plaque${n > 1 ? 's' : ''} centrée${n > 1 ? 's' : ''} sous l’appui (▲) : à fleur, la charge est trop près du bord ; elle${n > 1 ? 's' : ''} dépasse${n > 1 ? 'nt' : ''} de ${cm} cm au plus.`,
  centeredAll: 'Plaques centrées sous chaque appui (méthode statico) : elles dépassent de l’installation.',
  stacked: 'Plaques empilées identiques, posées à plat les unes sur les autres ; un vérin ou un angle au centre de sa surface de contact.',
  overhang: (cm) => `▲ dépasse ${cm} cm`,
  tuvOk: 'Calage au moins égal aux plaques minimales du Prüfbuch.',
  tuvKo: (t) => `Calage inférieur aux plaques minimales du Prüfbuch pour : ${t}.`,
  tuvOff: 'Plaques minimales du Prüfbuch non appliquées (installation hors Allemagne / hors Prüfbuch).',
  legal: (jacks) => [
    `Prüfbuch n° ${TUV.prufbuch} — ${TUV.issuer}, Ausführungsgenehmigung du ${TUV.approvalDate} (§ 76 LBauO Rheinland-Pfalz), valable jusqu’au ${TUV.validUntil}, prolongeable de 3 ans au plus à chaque fois : vérifier la prolongation en cours.`,
    `Rapport d’examen ${TUV.report} du ${TUV.reportDate} ; calcul ${TUV.statics} (statico Ingenieurgesellschaft mbH).`,
    `Auflage 4.7 : calage selon le plan ${TUV.calagePlan} — contreplaqué F40/30 sous les appuis, une plaque ou plusieurs superposées.`,
    'Auflage 4.9 : portance admissible du sol au moins 200 kN/m².',
    `Plaques minimales (statico 18-0573 § 3.9.1, containers sur la même plaque) : 1 : ${tuvTable('fr', ' ; ')}.`,
    'Valable sur sol légèrement déformable (prairie carrossable) ; sol dur : seul le frottement est à vérifier ; sol détrempé : étude spécifique (statico 18-0573 § 3.9).',
    'Frottement (DIN EN 13814, tab. 3) : μ = 0,4 bois / bois et acier / bois, même avec plusieurs couches non liées ; μ = 0,6 bois / béton si les couches sont liées entre elles et au pied.',
    jacks
      ? 'Vérins : statico 24-0571 § 3.8 et 24-0569 § 3.6 : « les vérins de pied de la Viewbox ne doivent pas être utilisés » (réceptions surchargées) ; 24-0569 § 1.4.4 : sortie 5 cm au plus. Avec vérins, chaque tige est vérifiée par cette pré-étude.'
      : 'Vérins retirés : la Viewbox est posée avec ses angles directement sur le calage (statico 24-0571 § 3.12).',
  ],
  pointsTitle: 'PLAN DES APPUIS AU SOL',
  planTitle: '1. Plan d’implantation des appuis et des plaques (Rz,k caractéristique)',
  roadwayTitle: '2. Plaques de roulage — répartition uniforme',
  pointsTableTitle: (n) => `3. Points d’appui (${n})`,
  pointsTableCont: '3. Points d’appui (suite)',
  coordsLegend: 'Coordonnées depuis le coin bas gauche de l’installation (x vers la droite, y vers le haut, vue de dessus SketchUp). Plaques de calage dessinées à l’échelle à leur place (à fleur de la Viewbox, ▲ = centrée, dépasse). Teinte des emprises : pression sous plaques de roulage rapportée à la portance.',
  roadwayNote:
    'Répartition uniforme : plaques assez rigides, jointives et bien posées sur toute la surface ; si les plaques ne répartissent que sous chaque Viewbox, retenir l’emprise la plus chargée. La pression locale sous chaque platine et la flexion des plaques ne sont pas vérifiées ici.',
  footer: 'VEM · Plans Viewbox · Étude structure — appuis au sol et plaques de roulage (pré-étude, non vérifiée)',
  footerSheet: (fem) => `VEM · Plans Viewbox · Étude structure — ${fem ? 'calage' : 'estimation du calage'} (pré-étude, non vérifiée)`,
  roadwayRows: {
    area: 'Surface couverte',
    areaValue: (m2) => `${m2} m² (emprise des Viewbox posées au sol)`,
    load: 'Charge verticale totale',
    loadValue: (kN, t) => `${kN} kN (${t} t), combinaison caractéristique la plus lourde`,
    plates: 'Poids des plaques',
    notCounted: 'non compté',
    mean: 'Pression uniforme',
    worst: 'Emprise la plus chargée',
    bearing: 'portance',
  },
  verdictText: { ok: 'OK', limit: 'limite', fail: 'dépassé', incomplete: '—' },
  cols: { point: 'Point', type: 'Type', modules: 'Viewbox au sol', plate: 'Plaque', calage: 'Calage · pression au sol' },
  noPlate: 'sans plaque',
  roadwaySuffix: ' + roulage',
  exceeded: ' — DÉPASSÉ',
  limit: ' (limite)',
  levels: (n) => `${n} niveau${n > 1 ? 'x' : ''}`,
  level: (n) => `niveau ${n}`,
  sheetTitle: 'FICHE DE CALAGE',
  s1: '1. Installation et hypothèses',
  s2: (fem) => (fem ? '2. Plan des appuis (réactions caractéristiques du calcul complet)' : '2. Plan des appuis (réactions caractéristiques estimées)'),
  s3: '3. Calage par type d’appui',
  s4: '4. Matériel à préparer',
  s5: '5. Références réglementaires (TÜV)',
  s6: '6. Réserves',
  sheetCols: { type: 'Type', count: 'Nb', solution: 'Solution retenue', state: 'État', designation: 'Désignation', dims: 'Dimensions', qty: 'Quantité', mass: 'Masse totale' },
  stateOk: 'OK',
  stateLimit: 'limite',
  stateOut: 'hors standard',
  stateNone: 'aucune',
  none: 'aucune solution standard',
  longrineVariant: (s, eta) => `Variante longrines : ${s} (η = ${eta}).`,
  femNote: 'Réactions du calcul complet (modèle 3D, 2ᵉ ordre, combinaisons statico) : Rz,k maxi de chaque appui sur les combinaisons ELS.',
  estimateNote: 'Valeurs issues d’une estimation (surfaces tributaires et basculement en bloc rigide), à confirmer par le calcul complet de l’étude structure.',
  platesNote:
    'Plaques : pression uniforme sous l’emprise efficace (méthode statico ; une plaque trop mince ne compte que pour la partie qu’elle peut porter en flexion ; une plaque à fleur ne compte que sur l’emprise centrée sur la charge) ; bois kmod 0,9, γM 1,3.',
  roadwayUsed: (kN, m2, q) => `Plaques de roulage jointives sur toute la surface : ${kN} kN / ${m2} m² = ${q} kN/m² ; pression locale sur les plaques de roulage à vérifier avec leur fabricant.`,
  watermark: 'PRÉ-ÉTUDE INTERNE — NON VÉRIFIÉE PAR UN INGÉNIEUR',
  timberRow: 'Plaque bois',
  timberValue: 'contreplaqué F40/30 (ou multiplex bouleau, au moins aussi résistant) — durée de charge courte (KLED kurz), classe de service 2 (NKL 2), kmod = 0,9, γM = 1,3',
  placementRow: 'Pose des plaques',
  placementValue: (f, c, o) =>
    c ? `${f} à fleur de la Viewbox, ${c} centrée(s) sous l’appui (dépassent de ${o} cm au plus) : à fleur, la charge est trop près du bord` : `${f} à fleur de la Viewbox (emprise efficace centrée sur la charge, B’ = B − 2 e)`,
  tuvRow: 'Prüfbuch TÜV',
  tuvNone: 'non prévu (pied central)',
};

const DE: CalageDocLabels = {
  typesTitle: 'AUFLAGERTYPEN UND PLATTEN',
  materialsTitle: 'BENÖTIGTES MATERIAL',
  layingTitle: 'VERLEGUNG DER PLATTEN',
  legalTitle: 'BAURECHTLICHE GRUNDLAGEN (TÜV)',
  pointsOf: (ids) => `Auflager ${ids}`,
  flushAll: 'Platten bündig mit der Viewbox verlegt: sie stehen nicht über die Anlage über (Nachweis mit der wirksamen Fläche der ausmittig belasteten Platte, B’ = B − 2 e).',
  centeredSome: (n, cm) => `${n} Platte(n) mittig unter dem Auflager (▲): bündig liegt die Last zu nah am Rand; Überstand höchstens ${cm} cm.`,
  centeredAll: 'Platten mittig unter jedem Auflager (Methode statico): sie stehen über die Anlage über.',
  stacked: 'Gestapelte Platten gleicher Größe, flach übereinander; Spindel bzw. Ecke in der Mitte ihrer Aufstandsfläche.',
  overhang: (cm) => `▲ Überstand ${cm} cm`,
  tuvOk: 'Unterpallung mindestens gleich den Mindestplatten des Prüfbuchs.',
  tuvKo: (t) => `Unterpallung kleiner als die Mindestplatten des Prüfbuchs für: ${t}.`,
  tuvOff: 'Mindestplatten des Prüfbuchs nicht angesetzt (Aufstellung außerhalb Deutschlands / außerhalb des Prüfbuchs).',
  legal: (jacks) => [
    `Prüfbuch Nr. ${TUV.prufbuch} — ${TUV.issuer}, Ausführungsgenehmigung vom ${TUV.approvalDate} (§ 76 LBauO Rheinland-Pfalz), befristet bis ${TUV.validUntil}, auf Antrag jeweils um höchstens 3 Jahre verlängerbar: laufende Verlängerung prüfen.`,
    `Prüfbericht ${TUV.report} vom ${TUV.reportDate}; statische Berechnung ${TUV.statics} (statico Ingenieurgesellschaft mbH).`,
    `Auflage 4.7: Die Konstruktion ist gemäß Plan ${TUV.calagePlan} zu unterpallen — Sperrholzplatte F40/30 unter den Auflagern, alternativ mehrere Platten übereinander.`,
    'Auflage 4.9: Die zulässige Bodenpressung am Aufstellort muss mindestens 200 kN/m² betragen.',
    `Mindestplatten (statico 18-0573 Abschn. 3.9.1, Container auf derselben Platte): 1: ${tuvTable('de', '; ')}.`,
    'Gilt nur bei leicht nachgiebigem Untergrund (z. B. befahrbare Wiesen); bei festem Untergrund ist lediglich auf die Werkstoffpaarung (Reibung) zu achten; bei aufgeweichten Untergründen sind gesonderte Betrachtungen erforderlich (statico 18-0573 Abschn. 3.9).',
    'Reibbeiwerte (DIN EN 13814, Tab. 3): μ = 0,4 Holz-Holz und Stahl-Holz, auch mehrlagig ohne Verbindung; μ = 0,6 Holz-Beton, Holzlagen schubfest miteinander verbunden (auch der Fußpunkt).',
    jacks
      ? 'Spindelfüße: statico 24-0571 Abschn. 3.8 und 24-0569 Abschn. 3.6: „Die Fußspindeln der Viewbox dürfen nicht verwendet werden“ (Aufnahmen überlastet); 24-0569 Abschn. 1.4.4: höchstens 5 cm ausgespindelt. Mit Spindeln wird jede Gewindestange in dieser Vorbemessung nachgewiesen.'
      : 'Spindeln entfernt: die Viewbox liegt mit ihren Ecken direkt auf der Unterpallung (statico 24-0571 Abschn. 3.12).',
  ],
  pointsTitle: 'AUFLAGERPLAN',
  planTitle: '1. Lageplan der Auflager und Platten (charakteristische Auflagerkraft Rz,k)',
  roadwayTitle: '2. Fahrplatten — gleichmäßige Verteilung',
  pointsTableTitle: (n) => `3. Auflagerpunkte (${n})`,
  pointsTableCont: '3. Auflagerpunkte (Fortsetzung)',
  coordsLegend: 'Koordinaten ab der linken unteren Ecke der Anlage (x nach rechts, y nach oben, Draufsicht SketchUp). Unterpallungsplatten maßstäblich an ihrer Lage (bündig mit der Viewbox, ▲ = mittig, steht über). Färbung der Grundflächen: Pressung unter Fahrplatten bezogen auf die zulässige Bodenpressung.',
  roadwayNote:
    'Gleichmäßige Verteilung: ausreichend steife, dicht gestoßene und satt aufliegende Platten über die ganze Fläche; verteilen die Platten nur unter jeder Viewbox, ist die am stärksten belastete Grundfläche maßgebend. Die örtliche Pressung unter jeder Fußplatte und die Biegung der Platten sind hier nicht nachgewiesen.',
  footer: 'VEM · Plans Viewbox · Tragwerksstudie — Auflager und Fahrplatten (Vorbemessung, ungeprüft)',
  footerSheet: (fem) => `VEM · Plans Viewbox · Tragwerksstudie — ${fem ? 'Unterpallung' : 'Schätzung der Unterpallung'} (Vorbemessung, ungeprüft)`,
  roadwayRows: {
    area: 'Bedeckte Fläche',
    areaValue: (m2) => `${m2} m² (Grundfläche der Viewbox im EG)`,
    load: 'Gesamte Vertikallast',
    loadValue: (kN, t) => `${kN} kN (${t} t), schwerste charakteristische Kombination`,
    plates: 'Eigengewicht der Platten',
    notCounted: 'nicht angesetzt',
    mean: 'Gleichmäßige Pressung',
    worst: 'Am stärksten belastete Grundfläche',
    bearing: 'zul. Bodenpressung',
  },
  verdictText: { ok: 'OK', limit: 'Grenze', fail: 'überschritten', incomplete: '—' },
  cols: { point: 'Punkt', type: 'Typ', modules: 'Viewbox EG', plate: 'Platte', calage: 'Unterpallung · Bodenpressung' },
  noPlate: 'ohne Platte',
  roadwaySuffix: ' + Fahrplatten',
  exceeded: ' — ÜBERSCHRITTEN',
  limit: ' (Grenze)',
  levels: (n) => `${n} Ebene${n > 1 ? 'n' : ''}`,
  level: (n) => `Ebene ${n}`,
  sheetTitle: 'UNTERPALLUNGSBLATT',
  s1: '1. Anlage und Annahmen',
  s2: (fem) => (fem ? '2. Auflagerplan (charakteristische Auflagerkräfte der Gesamtberechnung)' : '2. Auflagerplan (geschätzte charakteristische Auflagerkräfte)'),
  s3: '3. Unterpallung je Auflagertyp',
  s4: '4. Benötigtes Material',
  s5: '5. Baurechtliche Grundlagen (TÜV)',
  s6: '6. Vorbehalte',
  sheetCols: { type: 'Typ', count: 'Anz.', solution: 'Gewählte Lösung', state: 'Status', designation: 'Bezeichnung', dims: 'Abmessungen', qty: 'Menge', mass: 'Gesamtmasse' },
  stateOk: 'OK',
  stateLimit: 'Grenze',
  stateOut: 'nicht standard',
  stateNone: 'keine',
  none: 'keine Standardlösung',
  longrineVariant: (s, eta) => `Variante Kanthölzer: ${s} (η = ${eta}).`,
  femNote: 'Auflagerkräfte der Gesamtberechnung (3D-Modell, Theorie II. Ordnung, Kombinationen wie statico): maximales Rz,k je Auflager aus den GZG-Kombinationen.',
  estimateNote: 'Werte aus einer Schätzung (Einzugsflächen, Kippen als starrer Block), durch die Gesamtberechnung der Tragwerksstudie zu bestätigen.',
  platesNote:
    'Platten: gleichmäßige Pressung unter der wirksamen Fläche (Methode statico; eine zu dünne Platte zählt nur mit dem Teil, den sie auf Biegung tragen kann; eine bündige Platte nur mit der zur Last zentrischen Fläche); Holz kmod 0,9, γM 1,3.',
  roadwayUsed: (kN, m2, q) => `Dicht gestoßene Fahrplatten über die ganze Fläche: ${kN} kN / ${m2} m² = ${q} kN/m²; örtliche Pressung auf den Fahrplatten beim Hersteller zu prüfen.`,
  watermark: 'VORABZUG – UNGEPRÜFT (INTERNE VORBEMESSUNG)',
  timberRow: 'Holzplatte',
  timberValue: 'Sperrholz Festigkeitsklasse F40/30 (oder Birken-Multiplex, mindestens gleich fest) — KLED kurz, NKL 2, kmod = 0,9, γM = 1,3',
  placementRow: 'Lage der Platten',
  placementValue: (f, c, o) =>
    c ? `${f} bündig mit der Viewbox, ${c} mittig unter dem Auflager (Überstand höchstens ${o} cm): bündig liegt die Last zu nah am Rand` : `${f} bündig mit der Viewbox (wirksame, zur Last zentrische Fläche, B’ = B − 2 e)`,
  tuvRow: 'Prüfbuch TÜV',
  tuvNone: 'nicht vorgesehen (Mittelfuß)',
};

const EN: CalageDocLabels = {
  typesTitle: 'SUPPORT TYPES AND PLATES',
  materialsTitle: 'MATERIAL TO PREPARE',
  layingTitle: 'LAYING THE PLATES',
  legalTitle: 'REGULATORY REFERENCES (TÜV)',
  pointsOf: (ids) => `supports ${ids}`,
  flushAll: 'Plates laid flush with the Viewbox: they do not protrude from the installation (checked with the effective area of an eccentrically loaded plate, B’ = B − 2 e).',
  centeredSome: (n, cm) => `${n} plate${n > 1 ? 's' : ''} centred under the support (▲): laid flush, the load is too close to the edge; overhang ${cm} cm at most.`,
  centeredAll: 'Plates centred under each support (statico method): they protrude from the installation.',
  stacked: 'Identical stacked plates laid flat on top of each other; jack or corner in the middle of its contact area.',
  overhang: (cm) => `▲ overhang ${cm} cm`,
  tuvOk: 'Packing at least equal to the minimum plates of the Prüfbuch.',
  tuvKo: (t) => `Packing smaller than the minimum plates of the Prüfbuch for: ${t}.`,
  tuvOff: 'Minimum plates of the Prüfbuch not applied (installation outside Germany / outside the Prüfbuch).',
  legal: (jacks) => [
    `Prüfbuch (inspection book) no. ${TUV.prufbuch} — ${TUV.issuer}, construction approval (Ausführungsgenehmigung) of ${TUV.approvalDate} (§ 76 LBauO Rhineland-Palatinate), valid until ${TUV.validUntil}, extendable by up to 3 years each time: check the current extension.`,
    `Inspection report ${TUV.report} of ${TUV.reportDate}; structural analysis ${TUV.statics} (statico Ingenieurgesellschaft mbH).`,
    `Condition 4.7: packing according to drawing ${TUV.calagePlan} — F40/30 plywood under the supports, one plate or several stacked.`,
    'Condition 4.9: allowable ground bearing pressure at least 200 kN/m².',
    `Minimum plates (statico 18-0573 § 3.9.1, containers on the same plate): 1: ${tuvTable('en', '; ')}.`,
    'Valid on slightly yielding ground (e.g. trafficable meadow); on firm ground only friction has to be checked; on soaked ground a specific study is required (statico 18-0573 § 3.9).',
    'Friction (DIN EN 13814, table 3): μ = 0.4 timber/timber and steel/timber, also with several unconnected layers; μ = 0.6 timber/concrete with the layers connected in shear (including the foot).',
    jacks
      ? 'Jacks: statico 24-0571 § 3.8 and 24-0569 § 3.6: “the Viewbox foot jacks must not be used” (foot receptions overloaded); 24-0569 § 1.4.4: 5 cm extension at most. With jacks, every rod is checked in this pre-study.'
      : 'Jacks removed: the Viewbox rests with its corners directly on the packing (statico 24-0571 § 3.12).',
  ],
  pointsTitle: 'GROUND SUPPORT PLAN',
  planTitle: '1. Setting-out plan of supports and plates (characteristic reaction Rz,k)',
  roadwayTitle: '2. Roadway plates — uniform distribution',
  pointsTableTitle: (n) => `3. Support points (${n})`,
  pointsTableCont: '3. Support points (continued)',
  coordsLegend: 'Coordinates from the bottom left corner of the installation (x to the right, y upwards, SketchUp top view). Packing plates drawn to scale in place (flush with the Viewbox, ▲ = centred, protrudes). Footprint shading: pressure under roadway plates relative to the bearing capacity.',
  roadwayNote:
    'Uniform distribution: plates stiff enough, butt-jointed and well bedded over the whole area; if the plates only spread under each Viewbox, use the most loaded footprint. The local pressure under each base plate and the bending of the plates are not checked here.',
  footer: 'VEM · Plans Viewbox · Structural study — ground supports and roadway plates (pre-study, not checked)',
  footerSheet: (fem) => `VEM · Plans Viewbox · Structural study — ${fem ? 'packing' : 'packing estimate'} (pre-study, not checked)`,
  roadwayRows: {
    area: 'Covered area',
    areaValue: (m2) => `${m2} m² (footprint of the ground-level Viewbox)`,
    load: 'Total vertical load',
    loadValue: (kN, t) => `${kN} kN (${t} t), heaviest characteristic combination`,
    plates: 'Plate self-weight',
    notCounted: 'not included',
    mean: 'Uniform pressure',
    worst: 'Most loaded footprint',
    bearing: 'bearing capacity',
  },
  verdictText: { ok: 'OK', limit: 'limit', fail: 'exceeded', incomplete: '—' },
  cols: { point: 'Point', type: 'Type', modules: 'Ground Viewbox', plate: 'Plate', calage: 'Packing · ground pressure' },
  noPlate: 'no plate',
  roadwaySuffix: ' + roadway',
  exceeded: ' — EXCEEDED',
  limit: ' (limit)',
  levels: (n) => `${n} level${n > 1 ? 's' : ''}`,
  level: (n) => `level ${n}`,
  sheetTitle: 'PACKING SHEET',
  s1: '1. Installation and assumptions',
  s2: (fem) => (fem ? '2. Support plan (characteristic reactions of the full calculation)' : '2. Support plan (estimated characteristic reactions)'),
  s3: '3. Packing per support type',
  s4: '4. Material to prepare',
  s5: '5. Regulatory references (TÜV)',
  s6: '6. Reservations',
  sheetCols: { type: 'Type', count: 'No.', solution: 'Chosen solution', state: 'Status', designation: 'Designation', dims: 'Dimensions', qty: 'Quantity', mass: 'Total mass' },
  stateOk: 'OK',
  stateLimit: 'limit',
  stateOut: 'non-standard',
  stateNone: 'none',
  none: 'no standard solution',
  longrineVariant: (s, eta) => `Sleeper variant: ${s} (η = ${eta}).`,
  femNote: 'Reactions of the full calculation (3D model, 2nd order, statico combinations): max. Rz,k of each support over the SLS combinations.',
  estimateNote: 'Values from an estimate (tributary areas, overturning as a rigid block), to be confirmed by the full calculation of the structural study.',
  platesNote:
    'Plates: uniform pressure under the effective area (statico method; a plate that is too thin only counts for the part it can carry in bending; a flush plate only for the area centred on the load); timber kmod 0.9, γM 1.3.',
  roadwayUsed: (kN, m2, q) => `Butt-jointed roadway plates over the whole area: ${kN} kN / ${m2} m² = ${q} kN/m²; local pressure on the roadway plates to be checked with their manufacturer.`,
  watermark: 'INTERNAL PRE-STUDY — NOT CHECKED BY AN ENGINEER',
  timberRow: 'Timber plate',
  timberValue: 'F40/30 plywood (or birch multiplex, at least as strong) — short-term load (KLED kurz), service class 2 (NKL 2), kmod = 0.9, γM = 1.3',
  placementRow: 'Plate laying',
  placementValue: (f, c, o) =>
    c ? `${f} flush with the Viewbox, ${c} centred under the support (overhang ${o} cm at most): laid flush, the load is too close to the edge` : `${f} flush with the Viewbox (effective area centred on the load, B’ = B − 2 e)`,
  tuvRow: 'TÜV Prüfbuch',
  tuvNone: 'not provided for (middle foot)',
};

export const CALAGE_LABELS: Record<Lang, CalageDocLabels> = { fr: FR, de: DE, en: EN };
