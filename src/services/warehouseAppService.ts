// src/services/warehouseAppService.ts
// ════════════════════════════════════════════════════════════════════════
// Service d'intégration avec l'application EntrepôtApp (Supabase).
// Quand un camion VEM est créé/modifié avec Tubize dans loadingLocation ou
// unloadingLocation, ce service crée une `task` directement dans la BD
// Supabase de l'app entrepôt — Oliver la voit alors apparaître dans son
// tableau de bord sans aucune action manuelle.
//
// Variables d'environnement requises :
//   WAREHOUSE_APP_SUPABASE_URL   — URL Supabase (ex: https://xxx.supabase.co)
//   WAREHOUSE_APP_SUPABASE_KEY   — clé anon publique de l'app entrepôt
//   WAREHOUSE_APP_ASSIGNEE_ID    — UUID de l'utilisateur à assigner (Oliver)
//   WAREHOUSE_APP_CREATOR_ID     — UUID du créateur de la task (admin Amaury)
//
// Si l'une de ces vars est absente, l'envoi est silencieusement skippé
// (log warning). L'app continue de fonctionner normalement.
// ════════════════════════════════════════════════════════════════════════

import { logger } from '../utils/logger';
import { tubizeRoleForTruck } from './telegramService';

function getConfig() {
  return {
    supabaseUrl:  process.env.WAREHOUSE_APP_SUPABASE_URL,
    supabaseKey:  process.env.WAREHOUSE_APP_SUPABASE_KEY,
    assigneeId:   process.env.WAREHOUSE_APP_ASSIGNEE_ID,
    creatorId:    process.env.WAREHOUSE_APP_CREATOR_ID,
  };
}

const VEHICLE_LABELS: Record<string, string> = {
  truck:     'Camion',
  tautliner: 'Tautliner',
  flatbed:   'Flatbed',
  van:       'Camionnette',
  crane:     'Grue',
  scissor:   'Nacelle ciseaux',
  manitou:   'Manitou',
  forklift:  'Chariot élévateur',
  generator: 'Groupe électrogène',
  machine:   'Machine',
  other:     'Véhicule',
};

type TaskPayload = {
  title: string;
  truckOpType: string;
  location: string;
  date_task: string | null;
  scheduled_time: string | null;
  description: string;
};

/**
 * Construit les champs de la task à partir du camion — partagé entre
 * la création et la mise à jour pour ne pas dupliquer la logique.
 * Retourne null si le camion ne concerne pas Tubize.
 */
function buildTaskPayload(
  truck: any,
  project: { name: string; internalNumber?: string | null }
): TaskPayload | null {
  const role = tubizeRoleForTruck(truck);
  if (!role) return null;

  // ── Construction du titre, type d'opération, lieu ──────────────────
  // Si Tubize est le point de chargement → c'est un CHARGEMENT (préparation du départ).
  // Si Tubize est le point de déchargement → c'est un DÉCHARGEMENT (retour à l'entrepôt).
  const isDeparture = (role === 'departure' || role === 'both');
  const truckOpType = isDeparture ? 'chargement' : 'dechargement';

  const vehicleLabel = VEHICLE_LABELS[truck.vehicleType || 'truck'] || 'Camion';
  const from = truck.loadingLocation   || (isDeparture ? 'Tubize' : '?');
  const to   = truck.unloadingLocation || (isDeparture ? '?' : 'Tubize');
  const arrow = '→';
  const emoji = isDeparture ? '📤' : '📥';
  const title = `${emoji} ${vehicleLabel} : ${from} ${arrow} ${to}`;

  // location = la destination du camion (ce que l'entrepôt doit savoir géographiquement)
  const location = isDeparture ? to : from;

  // Date et heure envoyées à l'entrepôt (en TZ Europe/Brussels).
  // Si le camion arrive à Tubize (retour d'un event) → date d'ARRIVÉE à Tubize (arrivalDate),
  // pas la date de chargement qui a eu lieu sur le chantier.
  // Si le camion part de Tubize (vers un event) → date de chargement à Tubize (loadingDate).
  const rawDate = role === 'arrival'
    ? (truck.arrivalDate || truck.loadingDate)
    : truck.loadingDate;
  const date = rawDate ? new Date(rawDate) : null;
  let date_task: string | null = null;
  let scheduled_time: string | null = null;
  if (date && !isNaN(date.getTime())) {
    // Format YYYY-MM-DD pour date_task (forcé en TZ Brussels)
    const brusselsDate = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/Brussels' }));
    date_task = brusselsDate.toISOString().slice(0, 10);
    // Format HH:MM pour scheduled_time
    scheduled_time = date.toLocaleTimeString('fr-FR', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels', hour12: false,
    });
  }

  // Description riche : projet + chauffeur + plaque + notes
  const descLines: string[] = [];
  descLines.push(`Projet VEM : ${project.name}${project.internalNumber ? ' (' + project.internalNumber + ')' : ''}`);
  if (truck.truckNumber)  descLines.push(`N° camion : ${truck.truckNumber}`);
  if (truck.licensePlate) descLines.push(`Plaque : ${truck.licensePlate}`);
  if (truck.driverName) {
    descLines.push(`Chauffeur : ${truck.driverName}${truck.driverPhone ? ' (' + truck.driverPhone + ')' : ''}`);
  }
  if (truck.notes) descLines.push('Notes : ' + truck.notes);
  descLines.push('— Créé automatiquement depuis VEM');

  return { title, truckOpType, location, date_task, scheduled_time, description: descLines.join('\n') };
}

/**
 * Crée une task dans la BD Supabase de l'app entrepôt si le camion concerne Tubize.
 * Échoue silencieusement (log warning) si la config est incomplète ou si l'API
 * Supabase renvoie une erreur — l'idée est de ne pas planter VEM si l'autre app
 * a un souci.
 *
 * @returns l'id de la task Supabase créée, ou null si non créée
 */
export async function createWarehouseTask(
  truck: any,
  project: { id: string; name: string; internalNumber?: string | null; address?: string | null }
): Promise<string | null> {
  const payload = buildTaskPayload(truck, project);
  if (!payload) return null; // Pas concerné par Tubize

  const { supabaseUrl, supabaseKey, assigneeId, creatorId } = getConfig();
  if (!supabaseUrl || !supabaseKey || !creatorId) {
    logger.warn('[warehouseApp] Config Supabase incomplète (URL/KEY/CREATOR_ID) — task ignorée');
    return null;
  }

  const body = {
    title: payload.title,
    type: 'camion',
    status: 'a_faire',
    date_task: payload.date_task,
    scheduled_time: payload.scheduled_time,
    truck_operation_type: payload.truckOpType,
    location: payload.location,
    description: payload.description,
    assigned_to: assigneeId || null,
    created_by:  creatorId,
  };

  try {
    const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/tasks`;
    const r: any = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey':        supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=representation',
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const errText = await r.text();
      logger.error(`[warehouseApp] Supabase a répondu ${r.status}: ${errText.slice(0, 300)}`);
      return null;
    }
    const rows: any = await r.json();
    const id = Array.isArray(rows) && rows[0] ? rows[0].id : null;
    logger.info(`[warehouseApp] Task créée dans EntrepôtApp : "${payload.title}"`);
    return id;
  } catch (e: any) {
    logger.error(`[warehouseApp] Échec création task : ${e.message || e}`);
    return null;
  }
}

/**
 * Met à jour une task existante dans l'app entrepôt (titre, date, lieu, type,
 * description) suite à une modification du camion côté VEM. Ne touche pas au
 * statut ni à l'assignation — si Oliver a déjà traité/réassigné la task dans
 * l'app entrepôt, on ne veut pas écraser ça depuis VEM.
 *
 * @returns true si la mise à jour a réussi, false sinon
 */
export async function updateWarehouseTask(
  taskId: string,
  truck: any,
  project: { id: string; name: string; internalNumber?: string | null; address?: string | null }
): Promise<boolean> {
  const payload = buildTaskPayload(truck, project);
  if (!payload) return false; // Ne concerne plus Tubize

  const { supabaseUrl, supabaseKey } = getConfig();
  if (!supabaseUrl || !supabaseKey) {
    logger.warn('[warehouseApp] Config Supabase incomplète (URL/KEY) — mise à jour ignorée');
    return false;
  }

  const body = {
    title: payload.title,
    date_task: payload.date_task,
    scheduled_time: payload.scheduled_time,
    truck_operation_type: payload.truckOpType,
    location: payload.location,
    description: payload.description,
  };

  try {
    const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/tasks?id=eq.${encodeURIComponent(taskId)}`;
    const r: any = await fetch(url, {
      method: 'PATCH',
      headers: {
        'apikey':        supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const errText = await r.text();
      logger.error(`[warehouseApp] Supabase (update) a répondu ${r.status}: ${errText.slice(0, 300)}`);
      return false;
    }
    logger.info(`[warehouseApp] Task mise à jour dans EntrepôtApp : "${payload.title}"`);
    return true;
  } catch (e: any) {
    logger.error(`[warehouseApp] Échec mise à jour task : ${e.message || e}`);
    return false;
  }
}