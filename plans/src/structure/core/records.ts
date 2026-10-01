// Enregistrement de calcul (CalcRecord) : chaque vérification garde sa formule littérale, la même formule avec les
// valeurs, le résultat, la limite et le taux η. Le rapport imprime ces enregistrements (style statico).

export type Verdict = 'ok' | 'limit' | 'fail' | 'incomplete';

export interface CalcRecord {
  key: string;
  title: string;
  /** norme / paragraphe, ou « méthode statico » */
  clause: string;
  /** formule littérale : « σB = Rz,k / A » */
  formula: string;
  /** même formule avec les valeurs : « σB = 103,70 kN / 0,5625 m² = 184 kN/m² » */
  withValues: string;
  /** valeur calculée et limite, en unités internes (η = result / limit si les deux sont donnés) */
  result?: number;
  limit?: number;
  eta?: number;
  /** combinaison déterminante, éléments concernés */
  combination?: string;
  elements?: string[];
}

/** Seuils du verdict (§10.5) : η ≤ 0,90 passe, ≤ 1,00 limite, au-delà ne passe pas. */
export function verdictOf(eta: number | undefined): Verdict {
  if (eta === undefined || !Number.isFinite(eta)) return 'incomplete';
  if (eta <= 0.9 + 1e-9) return 'ok';
  if (eta <= 1 + 1e-9) return 'limit';
  return 'fail';
}

/** Verdict d'un ensemble : le pire, « incomplet » l'emporte (jamais « passe » s'il manque une donnée). */
export function worstVerdict(vs: Verdict[]): Verdict {
  const order: Verdict[] = ['ok', 'limit', 'fail', 'incomplete'];
  return vs.reduce<Verdict>((w, v) => (order.indexOf(v) > order.indexOf(w) ? v : w), 'ok');
}

export const VERDICT_LABEL: Record<Verdict, string> = { ok: '✅ passe', limit: '⚠️ limite', fail: '❌ ne passe pas', incomplete: '⛔ incomplet' };
