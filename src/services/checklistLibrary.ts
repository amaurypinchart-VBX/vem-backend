// src/services/checklistLibrary.ts
// Bibliothèque Viewbox initiale de la check-list de montage, chargée par POST /checklists/templates/seed.
// Marques en fin de libellé : [P] photo obligatoire · [C] critique · [PERM] Viewbox permanente uniquement ·
// [opt] « si présent » (non pré-coché). Une catégorie `permanent: true` met tous ses points en [PERM].

export type ChecklistPhase = 'installation' | 'dismantling';

export interface LibraryCategory {
  phase: ChecklistPhase;
  name: string;
  permanent?: boolean;
  items: string[];
}

export interface LibraryItem {
  label: string;
  scope: 'all' | 'permanent';
  photoRequired: boolean;
  critical: boolean;
  optional: boolean;
}

/** Lit un libellé de la bibliothèque et ses marques [P] [C] [PERM] [opt]. */
export function parseLibraryItem(raw: string, categoryPermanent = false): LibraryItem {
  const marks = new Set<string>();
  const label = raw.replace(/\s*\[(P|C|PERM|opt)\]/g, (_m, mark: string) => { marks.add(mark); return ''; }).trim();
  return {
    label,
    scope: categoryPermanent || marks.has('PERM') ? 'permanent' : 'all',
    photoRequired: marks.has('P'),
    critical: marks.has('C'),
    optional: marks.has('opt'),
  };
}

export const CHECKLIST_LIBRARY: LibraryCategory[] = [
  // ─── Installation ───
  { phase: 'installation', name: 'Préparation et réception du site', items: [
    'Plan d\'implantation sur site = dernière version validée par le client [C]',
    'État des lieux du terrain / bâtiment client photographié avant le début des travaux [P]',
    'Support (sol, dalle, terrain) plan, portant et conforme au calage prévu [C]',
    'Accès camions / grue et zone de déchargement dégagés, périmètre de chantier balisé',
    'Matériel reçu contrôlé par rapport à la liste de chargement ; manquants signalés',
    'Implantation (traçage, axes, niveaux de référence) contrôlée avant la pose de la première box [C]',
  ]},
  { phase: 'installation', name: 'Position et assemblage', items: [
    'Boxes placées dans le bon ordre et au bon endroit selon le plan [C]',
    'Niveaux, alignement des façades et hauteur des sols vérifiés [C]',
    'Appuis, sous-bois et pieds correctement positionnés et stables [C][P]',
    'Boxes correctement rapprochées ; écart régulier aux jonctions',
    'Connexions entre les sols installées et serrées [C]',
    'Connexions entre poteaux et entre toitures installées et serrées [C]',
    'Connexions verticales entre boxes superposées verrouillées [C][P][opt]',
    'Ancrage / lestage / contreventement anti-vent réalisé selon l\'étude [C][P]',
    'Boulons et pièces de liaison manquants ou provisoires remplacés [C]',
    'Trappes de connexion refermées après vérification',
  ]},
  { phase: 'installation', name: 'Joints et étanchéité entre boxes', items: [
    'Caoutchouc entre les boxes et entre les poteaux posé sur toute la longueur prévue [P]',
    'Caoutchouc supérieur entre les toitures posé sans pli ni interruption [P]',
    'Bandes de toiture Rooftec / Rooftape posées sur toutes les jonctions prévues [C][P]',
    'Bandes croisées aux intersections entre boxes ; bords bien collés [P]',
    'Profils en U supérieurs siliconés sur toute leur longueur',
    'Profils en U latéraux siliconés sur toute leur hauteur',
    'Raccords et extrémités des U siliconés',
    'Jonctions des poteaux et raccords poteau / toiture siliconés',
    'Traversées de toiture (câbles, airco, évacuations) étanchées [P]',
    'Pourtours extérieurs des portes, châssis et passages techniques étanchés',
    'Aucun trou, coupure de joint ou ouverture visible au tour extérieur [C]',
    'Évacuations d\'eau de toiture libres et dirigées hors des zones de passage',
  ]},
  { phase: 'installation', name: 'Sols', items: [
    'Jonctions de sol entre boxes fermées, fixées et sans ressaut [C]',
    'Découpes et sorties électriques dans les sols placées selon le plan client',
    'Aucune ouverture inutilisée laissée dans le sol',
    'Revêtement de sol (moquette, vinyle, parquet) posé, joints et bords finis [opt]',
    'Plinthes / habillages bas posés [opt]',
  ]},
  { phase: 'installation', name: 'Électricité', items: [
    'Raccordement à l\'alimentation client / groupe réalisé, câble et protection adaptés [C]',
    'Pontages électriques entre toutes les boxes concernées réalisés [C]',
    'Chaque box reliée à la terre selon le schéma d\'installation [C][P]',
    'Continuité des liaisons de terre contrôlée (valeur notée en commentaire) [C][P]',
    'Différentiels testés (bouton test) sur chaque coffret [C]',
    'Circuits repérés / étiquetés dans les coffrets',
    'Coffrets fermés ; aucun câble ou raccord provisoire apparent',
    'Câbles extérieurs protégés (passe-câbles), aucun risque de trébuchement',
    'Prises, interrupteurs, rails et spots installés et fonctionnels',
    'Test sous charge (éclairage + airco allumés) sans déclenchement',
    'Éclairage de secours testé [opt]',
  ]},
  { phase: 'installation', name: 'Airco et équipements', items: [
    'Unités d\'airco fixées aux emplacements prévus',
    'Liaisons frigorifiques et alimentation terminées et protégées',
    'Évacuation des condensats raccordée, testée et dirigée hors passage',
    'Airco mis en marche, mode et température réglés, fonctionnement vérifié [C]',
    'Unités extérieures protégées et accessibles pour la maintenance',
    'Alimentation en eau et évacuations raccordées et testées, sans fuite [opt]',
    'Chauffe-eau / sanitaires testés [opt]',
    'Autres équipements prévus au plan installés et testés [opt]',
  ]},
  { phase: 'installation', name: 'Portes, vitrages et accès', items: [
    'Portes réglées : ouverture, fermeture et verrouillage corrects',
    'Chaque clé testée sur sa serrure ; nombre de clés noté en commentaire',
    'Joints et caoutchoucs en bas des portes posés',
    'Portes coulissantes ou automatiques testées sur toute leur course [opt]',
    'Issues de secours dégagées, barres anti-panique fonctionnelles [C][opt]',
    'Vitrages, joints de vitrage et parcloses vérifiés',
    'Escaliers, rampes, paliers et seuils fixés et stables [C][opt]',
    'Garde-corps et mains courantes fixés [C][opt]',
    'Rampe PMR conforme (pente, fixation) [opt]',
    'Nez de marche / antidérapants posés [opt]',
  ]},
  { phase: 'installation', name: 'Finitions', items: [
    'Panneaux et habillages remis en place et correctement fixés',
    'Peinture et retouches terminées sur les zones abîmées pendant le montage',
    'Rayures, coups et dommages sur boxes, châssis, portes et sols corrigés ou signalés [P]',
    'Plafonds tendus installés et correctement tendus [opt]',
    'Spots, rails, visuels et finitions client installés selon le plan',
    'Mobilier / aménagement client installé selon le plan [opt]',
    'Résidus de silicone, traces de peinture, protections et déchets retirés',
    'Sols, vitrages et boxes nettoyés avant présentation au client',
  ]},
  { phase: 'installation', name: 'Sécurité', items: [
    'Aucun outil, vis, chute ou matériel de chantier laissé dans les boxes [C]',
    'Toitures libres de tout matériel ; accès toiture condamné [C]',
    'Extincteurs placés et signalés [opt]',
    'Pictogrammes d\'évacuation / sortie de secours en place [opt]',
  ]},
  { phase: 'installation', name: 'Remise au client', items: [
    'Tour final effectué avec le client',
    'Fonctionnement expliqué au client (airco, électricité, portes, verrouillage)',
    'Clés, badges et télécommandes remis ; quantités notées en commentaire [C]',
    'Relevés de compteurs (électricité, eau) photographiés [P][opt]',
    'Remarques des visites client traitées ou planifiées',
  ]},
  { phase: 'installation', name: 'Matériel et logistique', items: [
    'Matériel non utilisé listé et préparé pour le retour',
    'Boîtes à outils complètes et récupérées',
    'Pièces de réserve laissées au client listées (silicone, caoutchouc, visserie) [opt]',
    'Déchets évacués, conteneur enlevé, abords propres',
  ]},
  { phase: 'installation', name: 'Isolation et fermeture des profils', permanent: true, items: [
    'Trous et vides prévus dans les sols remplis de laine de roche [P]',
    'Trous et vides prévus dans la toiture remplis de laine de roche [P]',
    'Profils autour des châssis remplis de laine de roche [P]',
    'Profils autour des panneaux sandwich remplis de laine de roche [P]',
    'Profils de toiture, notamment les NDCS, remplis de laine de roche [P]',
    'Profil bas fermé sur tout le pourtour prévu (pas d\'entrée d\'air) [C]',
    'Aucun vide oublié aux angles ou aux jonctions entre boxes [C]',
    'Pieds ancrés définitivement sur fondations / plots [C][P]',
  ]},
  { phase: 'installation', name: 'Pare-vapeur et joints intérieurs', permanent: true, items: [
    'Pare-vapeur posé aux endroits prévus, sans trou ni déchirure [C][P]',
    'Raccords du pare-vapeur réalisés entre boxes, autour des châssis et aux passages techniques [P]',
    'Fentes verticales entre panneaux sandwich siliconées côté intérieur',
    'Fentes horizontales entre panneaux sandwich siliconées côté intérieur',
    'Croisements des fentes horizontales et verticales traités',
    'Bas et côtés des panneaux siliconés sur tout leur pourtour prévu',
    'Jonctions panneaux / poteaux / sol / toiture fermées et siliconées',
    'Pourtours intérieurs des portes et châssis terminés, y compris sous les seuils',
    'Tous les passages ajoutés après la pose du pare-vapeur refermés [C]',
    'Ventilation / VMC installée et testée [opt]',
  ]},
  { phase: 'installation', name: 'Contrôle final de l\'enveloppe', permanent: true, items: [
    'Aucun jour visible autour des panneaux, châssis, portes ou jonctions [C]',
    'Joints de silicone continus, adhérents, sans section oubliée',
    'Toiture et traversées terminées avant fermeture des finitions intérieures [C]',
    'Toutes les zones cachées photographiées avant fermeture [C][P]',
  ]},

  // ─── Démontage ───
  { phase: 'dismantling', name: 'Avant démontage', items: [
    'État des lieux du site photographié avant démontage [P]',
    'Dommages sur les boxes constatés et photographiés [P]',
    'Dommages éventuels au site client constatés, photographiés et signalés au client [C][P]',
    'Clés, badges et télécommandes récupérés ; quantités vérifiées [C]',
  ]},
  { phase: 'dismantling', name: 'Démontage et rechargement', items: [
    'Coupure et déconnexion électrique réalisées avant intervention [C]',
    'Pièces de liaison, caoutchoucs et profils récupérés',
    'Matériel rechargé conforme à la liste de chargement ; manquants signalés [C]',
    'Boîtes à outils complètes et récupérées',
  ]},
  { phase: 'dismantling', name: 'Remise en état du site', items: [
    'Terrain / sol remis en état, aucun reste de silicone, vis ou lest',
    'Déchets évacués, conteneur enlevé',
    'Tour final avec le client ou le gestionnaire du site effectué [P]',
  ]},
];
