/**
 * Envoie un message Telegram brut (HTML supporté).
 * Échoue silencieusement (warning log) si la config est manquante ou si
 * l'API Telegram renvoie une erreur — on ne veut pas planter VEM si Telegram
 * est down ou mal configuré.
 */
export declare function sendTelegramMessage(text: string): Promise<boolean>;
/**
 * Détermine si un camion concerne Tubize (entrepôt Viewbox).
 * Retourne : 'departure' (part de Tubize), 'arrival' (arrive à Tubize),
 * 'both' (les deux — rare), ou null (ne concerne pas Tubize).
 */
export declare function tubizeRoleForTruck(truck: {
    loadingLocation?: string | null;
    unloadingLocation?: string | null;
}): 'departure' | 'arrival' | 'both' | null;
/**
 * Construit et envoie un message Telegram pour un mouvement de camion lié à Tubize.
 * Appelée lors de la création (POST) ou modification (PATCH) d'un camion.
 *
 * @param truck   le camion (Prisma)
 * @param project le projet associé (avec name et internalNumber)
 * @param action  'created' (création) ou 'updated' (modification)
 */
export declare function notifyTubizeTruckMovement(truck: any, project: {
    id: string;
    name: string;
    internalNumber?: string | null;
}, action?: 'created' | 'updated'): Promise<boolean>;
