/**
 * Crée une task dans la BD Supabase de l'app entrepôt si le camion concerne Tubize.
 * Échoue silencieusement (log warning) si la config est incomplète ou si l'API
 * Supabase renvoie une erreur — l'idée est de ne pas planter VEM si l'autre app
 * a un souci.
 *
 * @returns true si la task a été créée, false sinon
 */
export declare function createWarehouseTask(truck: any, project: {
    id: string;
    name: string;
    internalNumber?: string | null;
    address?: string | null;
}): Promise<boolean>;
