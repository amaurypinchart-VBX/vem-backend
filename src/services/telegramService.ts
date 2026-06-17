// src/services/telegramService.ts
// ════════════════════════════════════════════════════════════════════════
// Service Telegram — envoie des messages via l'API Bot.
// Utilise les variables d'environnement :
//   TELEGRAM_BOT_TOKEN              — token du bot (depuis @BotFather)
//   TELEGRAM_WAREHOUSE_CHAT_ID      — chat_id où envoyer les notifs entrepôt
//   TELEGRAM_WAREHOUSE_TUBIZE_KEYWORD (optionnel, défaut "Tubize")
//   TELEGRAM_WAREHOUSE_ASSIGNEE      (optionnel, défaut "Oliver")
//
// Si TELEGRAM_BOT_TOKEN ou TELEGRAM_WAREHOUSE_CHAT_ID ne sont pas définis,
// les notifications sont silencieusement skippées (logs warning uniquement).
// Ainsi, l'app continue de fonctionner même si Telegram n'est pas configuré.
// ════════════════════════════════════════════════════════════════════════

import { logger } from '../utils/logger';

const TG_API = 'https://api.telegram.org';

function getConfig() {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_WAREHOUSE_CHAT_ID;
  const tubizeKw = process.env.TELEGRAM_WAREHOUSE_TUBIZE_KEYWORD || 'Tubize';
  const assignee = process.env.TELEGRAM_WAREHOUSE_ASSIGNEE || 'Oliver';
  return { token, chatId, tubizeKw, assignee };
}

/**
 * Envoie un message Telegram brut (HTML supporté).
 * Échoue silencieusement (warning log) si la config est manquante ou si
 * l'API Telegram renvoie une erreur — on ne veut pas planter VEM si Telegram
 * est down ou mal configuré.
 */
export async function sendTelegramMessage(text: string): Promise<boolean> {
  const { token, chatId } = getConfig();
  if (!token || !chatId) {
    logger.warn('[telegram] TELEGRAM_BOT_TOKEN ou TELEGRAM_WAREHOUSE_CHAT_ID non configuré — message ignoré');
    return false;
  }
  try {
    const r: any = await fetch(`${TG_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!r.ok) {
      const err = await r.text();
      logger.error(`[telegram] API a répondu ${r.status}: ${err.slice(0, 300)}`);
      return false;
    }
    logger.info('[telegram] Message envoyé OK');
    return true;
  } catch (e: any) {
    logger.error(`[telegram] Échec envoi : ${e.message || e}`);
    return false;
  }
}

/**
 * Détecte si une chaîne contient le mot-clé Tubize (insensible à la casse,
 * tolérant aux accents). Retourne true si "Tubize" apparaît n'importe où.
 */
function containsTubize(s?: string | null): boolean {
  if (!s) return false;
  const { tubizeKw } = getConfig();
  return s.toLowerCase().includes(tubizeKw.toLowerCase());
}

/**
 * Détermine si un camion concerne Tubize (entrepôt Viewbox).
 * Retourne : 'departure' (part de Tubize), 'arrival' (arrive à Tubize),
 * 'both' (les deux — rare), ou null (ne concerne pas Tubize).
 */
export function tubizeRoleForTruck(truck: { loadingLocation?: string | null; unloadingLocation?: string | null }): 'departure' | 'arrival' | 'both' | null {
  const fromTubize = containsTubize(truck.loadingLocation);
  const toTubize   = containsTubize(truck.unloadingLocation);
  if (fromTubize && toTubize) return 'both';
  if (fromTubize) return 'departure';
  if (toTubize)   return 'arrival';
  return null;
}

/**
 * Formatte une date+heure en français (lundi 24 juin 2026 à 08:30).
 */
function fmtDateTime(d?: Date | string | null): string {
  if (!d) return 'date non précisée';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return 'date invalide';
  const dateStr = date.toLocaleDateString('fr-FR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    timeZone: 'Europe/Brussels',
  });
  const timeStr = date.toLocaleTimeString('fr-FR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels',
  });
  return `${dateStr} à ${timeStr}`;
}

const VEHICLE_LABELS: Record<string, string> = {
  truck: 'Camion',
  tautliner: 'Tautliner',
  flatbed: 'Flatbed',
  van: 'Camionnette',
  crane: 'Grue',
  scissor: 'Nacelle ciseaux',
  manitou: 'Manitou',
  forklift: 'Chariot élévateur',
  generator: 'Groupe électrogène',
  machine: 'Machine',
  other: 'Véhicule',
};

/**
 * Construit et envoie un message Telegram pour un mouvement de camion lié à Tubize.
 * Appelée lors de la création (POST) ou modification (PATCH) d'un camion.
 *
 * @param truck   le camion (Prisma)
 * @param project le projet associé (avec name et internalNumber)
 * @param action  'created' (création) ou 'updated' (modification)
 */
export async function notifyTubizeTruckMovement(
  truck: any,
  project: { id: string; name: string; internalNumber?: string | null },
  action: 'created' | 'updated' = 'created'
): Promise<boolean> {
  const role = tubizeRoleForTruck(truck);
  if (!role) return false; // Pas concerné par Tubize → on ignore

  const { assignee } = getConfig();
  const vehicleLabel = VEHICLE_LABELS[truck.vehicleType || 'truck'] || 'Véhicule';
  const truckNum = truck.truckNumber ? ` ${truck.truckNumber}` : '';
  const projectRef = project.internalNumber ? ` (${project.internalNumber})` : '';

  // Trajet selon le rôle
  const from = truck.loadingLocation   || (role === 'departure' || role === 'both' ? 'Tubize' : '?');
  const to   = truck.unloadingLocation || (role === 'arrival'   || role === 'both' ? 'Tubize' : '?');

  // Date la plus pertinente : chargement pour un départ, arrivée pour une arrivée
  let dateLabel = 'Date de chargement';
  let dateValue: any = truck.loadingDate;
  if (role === 'arrival') {
    dateLabel = 'Date d\'arrivée';
    dateValue = truck.arrivalDate || truck.loadingDate;
  }

  const titleEmoji = action === 'created' ? '🆕' : '✏️';
  const titleVerb  = action === 'created' ? 'planifié' : 'modifié';
  const roleEmoji  = role === 'arrival' ? '📥' : role === 'departure' ? '📤' : '🔁';

  const lines = [
    `${titleEmoji} <b>Camion ${titleVerb}</b>`,
    '━━━━━━━━━━━━━━━━━━',
    `${roleEmoji} <b>Trajet :</b> ${escapeHtml(from)} → ${escapeHtml(to)}`,
    `📦 <b>Type :</b> ${escapeHtml(vehicleLabel)}${escapeHtml(truckNum)}`,
    `🏗️ <b>Projet :</b> ${escapeHtml(project.name)}${escapeHtml(projectRef)}`,
    `📅 <b>${dateLabel} :</b> ${fmtDateTime(dateValue)}`,
  ];
  if (truck.driverName) lines.push(`🚚 <b>Chauffeur :</b> ${escapeHtml(truck.driverName)}${truck.driverPhone ? ' — ' + escapeHtml(truck.driverPhone) : ''}`);
  lines.push(`👤 <b>À assigner :</b> ${escapeHtml(assignee)}`);
  if (truck.notes) lines.push(`📝 <i>${escapeHtml(truck.notes)}</i>`);

  return sendTelegramMessage(lines.join('\n'));
}

function escapeHtml(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}