// Règles en français clair, sur la base de départ réelle.
import { describe, expect, it } from 'vitest';
import { describeRule } from '../../src/loading/core/describe';
import { SEED_RULES } from '../../src/loading/library/seed';
import { SEED_CATALOGUE } from '../../src/loading/library/catalogue';

const cat = new Map(SEED_CATALOGUE.map((c) => [c.ref, c]));
const text = (key: string) => describeRule(SEED_RULES.find((r) => r.key === key)!, cat);

describe('règles en français', () => {
  it('base, condition et spare', () => {
    expect(text('acc:4-700-065@box[standalone]')).toBe('8 par box · si box seule (standalone) · + 20 % arrondi au-dessus');
    expect(text('acc:4-700-003@box')).toBe('1 par box · + 1 en spare');
  });
  it('kit de porte, vitrage, paliers, substitution, sous-bois', () => {
    expect(text('kit:7-632-017@7-199-067/produit')).toMatch(/^3 par 7-199-067 SINGLE DOOR/);
    expect(text('acc:4-700-060@10mm/jonction_verre')).toBe('1 par jonction verre-verre · si vitrage 10 mm présent');
    expect(text('aj:4-750-001@box')).toBe('1 de 1 à 7, 2 de 8 à 15 (box)');
    expect(text('sub:4-700-083@airco[nidaplast]')).toBe('1 par airco · si emplacement airco dessiné en nidaplast · remplace 1 × 7-636-008');
    expect(text('acc:4-740-001@sous_bois_etude')).toBe('2 selon l’étude structure');
    expect(text('acc:4-720-011@poteau')).toBe('2,53 m par poteau');
  });
  it('quantité en texte et appréciation', () => {
    expect(text('acc:4-710-001@box')).toBe('« ~10/jonction » — quantité à préciser');
    expect(text('app:4-700-027@job')).toBe('à apprécier (jamais calculé seul)');
  });
  it('toutes les règles se décrivent', () => {
    for (const r of SEED_RULES) expect(describeRule(r, cat).length).toBeGreaterThan(3);
  });
});

describe('vitrage par produit', () => {
  it('pas de répétition « si vitrage présent »', () => {
    expect(text('acc:4-700-075@4.4.2/produit')).toBe('1 par vitrage 4.4.2');
  });
});
