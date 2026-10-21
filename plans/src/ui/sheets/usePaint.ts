// Peinture du projet dans l'onglet Planches : état local appliqué tout de suite, envoyé au serveur par opérations
// (fusion par id : deux personnes qui peignent en même temps ne s'écrasent pas), annuler / rétablir propres (50 pas).
import { useCallback, useEffect, useRef, useState } from 'react';
import { vem } from '../../api/vem';
import type { PaintOp, PaintSettings } from '../../core/paint/types';
import { applyOps, cleanPaint, inverseOps } from '../../core/paint/ops';

interface Step {
  label: string;
  ops: PaintOp[];
  inverse: PaintOp[];
}

export interface PaintState {
  paint: PaintSettings;
  /** incrémenté à chaque changement (clé de recalcul des vues) */
  version: number;
  apply: (ops: PaintOp[], label: string) => void;
  undo: () => void;
  redo: () => void;
  undoLabel: string | null;
  redoLabel: string | null;
  error: string;
  saving: boolean;
  /** pas de version enregistrée du modèle : la peinture ne peut pas être gardée */
  disabled: boolean;
}

const HISTORY = 50;

export function usePaint(modelId: string | undefined, initial: unknown, onSaved?: (p: PaintSettings) => void): PaintState {
  const [paint, setPaint] = useState<PaintSettings>(() => cleanPaint(initial));
  const [version, setVersion] = useState(0);
  const [past, setPast] = useState<Step[]>([]);
  const [future, setFuture] = useState<Step[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const ref = useRef(paint);
  ref.current = paint;
  const queue = useRef<Promise<void>>(Promise.resolve());
  /** opérations envoyées dont la réponse n'est pas encore là (gardées par-dessus la réponse du serveur) */
  const pending = useRef<PaintOp[][]>([]);
  const pastRef = useRef<Step[]>([]);
  const futureRef = useRef<Step[]>([]);
  const savedCb = useRef(onSaved);
  savedCb.current = onSaved;

  // autre version du modèle : on repart de sa peinture
  useEffect(() => {
    const p = cleanPaint(initial);
    setPaint(p);
    ref.current = p;
    pastRef.current = [];
    futureRef.current = [];
    setPast([]);
    setFuture([]);
    setVersion((v) => v + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId]);

  const send = useCallback(
    (ops: PaintOp[]) => {
      if (!modelId) return;
      setSaving(true);
      pending.current.push(ops);
      queue.current = queue.current.then(async () => {
        try {
          const fresh = cleanPaint(await vem.patchPaint(modelId, ops));
          pending.current.shift();
          setError('');
          savedCb.current?.(fresh);
          // ce que les autres ont peint entre-temps arrive avec la réponse ; nos opérations encore en route restent
          const merged = applyOps(fresh, pending.current.flat());
          ref.current = merged;
          setPaint(merged);
          setVersion((v) => v + 1);
        } catch (e) {
          pending.current.shift();
          setError(`Peinture non enregistrée : ${(e as Error).message}`);
        } finally {
          if (!pending.current.length) setSaving(false);
        }
      });
    },
    [modelId],
  );

  const run = useCallback(
    (ops: PaintOp[]) => {
      const next = applyOps(ref.current, ops);
      ref.current = next;
      setPaint(next);
      setVersion((v) => v + 1);
      send(ops);
    },
    [send],
  );

  const sync = () => {
    setPast(pastRef.current);
    setFuture(futureRef.current);
  };
  const apply = useCallback(
    (ops: PaintOp[], label: string) => {
      if (!ops.length) return;
      const inverse = inverseOps(ref.current, ops);
      pastRef.current = [...pastRef.current.slice(-(HISTORY - 1)), { label, ops, inverse }];
      futureRef.current = [];
      sync();
      run(ops);
    },
    [run],
  );
  const undo = useCallback(() => {
    const st = pastRef.current[pastRef.current.length - 1];
    if (!st) return;
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [...futureRef.current, st];
    sync();
    run(st.inverse);
  }, [run]);
  const redo = useCallback(() => {
    const st = futureRef.current[futureRef.current.length - 1];
    if (!st) return;
    futureRef.current = futureRef.current.slice(0, -1);
    pastRef.current = [...pastRef.current, st];
    sync();
    run(st.ops);
  }, [run]);

  return {
    paint,
    version,
    apply,
    undo,
    redo,
    undoLabel: past[past.length - 1]?.label ?? null,
    redoLabel: future[future.length - 1]?.label ?? null,
    error,
    saving,
    disabled: !modelId,
  };
}
