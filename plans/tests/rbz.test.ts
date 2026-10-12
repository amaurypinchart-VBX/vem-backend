// Le .rbz téléchargeable est construit par scripts/build-rbz.mjs à partir d'une liste de fichiers écrite en dur : un
// fichier de l'extension oublié dans cette liste fait planter l'extension au chargement dans SketchUp.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');

describe('paquet de l’extension SketchUp (.rbz)', () => {
  it('la liste de build-rbz.mjs contient tous les fichiers de sketchup/viewbox_prep (et rien d’autre)', () => {
    const src = readFileSync(join(root, 'scripts', 'build-rbz.mjs'), 'utf8');
    const list = JSON.parse(src.match(/const files = (\[[^\]]*\])/)![1].replace(/'/g, '"')) as string[];
    const onDisk = ['viewbox_prep.rb', ...readdirSync(join(root, 'sketchup', 'viewbox_prep')).map((f) => `viewbox_prep/${f}`)];
    expect([...list].sort()).toEqual(onDisk.sort());
  });

  it('chaque fichier Ruby chargé par main.rb est dans le paquet', () => {
    const main = readFileSync(join(root, 'sketchup', 'viewbox_prep', 'main.rb'), 'utf8');
    const required = [...main.matchAll(/require File\.join\(__dir__, '([a-z_]+)'\)/g)].map((m) => `viewbox_prep/${m[1]}.rb`);
    const src = readFileSync(join(root, 'scripts', 'build-rbz.mjs'), 'utf8');
    for (const f of required) expect(src).toContain(`'${f}'`);
    expect(required).toContain('viewbox_prep/frame.rb');
  });
});
