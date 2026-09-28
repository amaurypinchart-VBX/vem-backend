#!/usr/bin/env python3
"""Extrait un détail vectoriel d'un plan PDF (AutoCAD) → module TypeScript (src/sheets/details/<id>.ts).

    pip install pymupdf
    python3 scripts/extract-detail.py plan.pdf <id> "<titre>" x0 y0 x1 y1 <longueur_mm> <ax> <bx>

Zone x0 y0 x1 y1 en points PDF (page), sans le cadre du plan. Échelle : une cote connue, `longueur_mm` réels entre
les abscisses ax et bx (points PDF, pointes de flèche). Traits (épaisseur papier gardée), triangles pleins des
cotes et textes (numéros de cote ; « n » de la police AIGDT = Ø) ; coordonnées en mm réels, origine en haut à gauche.
"""
import json
import sys

import pymupdf

pdf, detail_id, title = sys.argv[1], sys.argv[2], sys.argv[3]
x0, y0, x1, y1, length_mm, ax, bx = map(float, sys.argv[4:11])
R = pymupdf.Rect(x0, y0, x1, y1)
MM_PER_PT = length_mm / abs(bx - ax)
page = pymupdf.open(pdf)[0]


def inside(pt):
    return R.contains(pt)


def points(items):
    out = []
    for it in items:
        for v in it[1:]:
            if hasattr(v, 'ul'):  # quadrilatère
                out += [v.ul, v.ur, v.ll, v.lr]
            elif hasattr(v, 'tl'):  # rectangle
                out += [v.tl, v.br]
            elif hasattr(v, 'x'):
                out.append(v)
    return out


strokes, fills = {}, []
for d in page.get_drawings():
    if d['type'] in ('f', 'fs'):
        pts = points(d['items'])
        if pts and all(inside(p) for p in pts):
            fills.append(d['items'])
        continue
    # un tracé peut couvrir toute la page (cadre + cotes) : on ne garde que ses segments dans la zone
    items = [it for it in d['items'] if all(inside(p) for p in points([it]))]
    if items:
        strokes.setdefault(round(d.get('width') or 0, 2), []).append(items)

allpts = [p for l in strokes.values() for items in l for p in points(items)] + [p for items in fills for p in points(items)]
ox, oy = min(p.x for p in allpts), min(p.y for p in allpts)


def f(v):
    s = f'{v:.1f}'.rstrip('0').rstrip('.')
    return '0' if s in ('', '-0') else s


def P(pt):
    return f((pt.x - ox) * MM_PER_PT) + ' ' + f((pt.y - oy) * MM_PER_PT)


def path(itemsets):
    out = []
    for items in itemsets:
        cur = None
        for it in items:
            k = it[0]
            if k in ('l', 'c'):
                a, b = it[1], it[-1]
                if cur is None or abs(cur.x - a.x) > 1e-3 or abs(cur.y - a.y) > 1e-3:
                    out.append('M' + P(a))
                out.append('L' + P(b) if k == 'l' else 'C' + P(it[2]) + ' ' + P(it[3]) + ' ' + P(b))
                cur = b
            elif k == 'qu':
                q = it[1]
                out.append('M' + P(q.ul) + 'L' + P(q.ur) + 'L' + P(q.lr) + 'L' + P(q.ll) + 'Z')
                cur = None
            elif k == 're':
                r = it[1]
                out.append('M' + P(r.tl) + 'L' + P(r.tr) + 'L' + P(r.br) + 'L' + P(r.bl) + 'Z')
                cur = None
    return ''.join(out)


texts = []
for block in page.get_text('dict', clip=R)['blocks']:
    for line in block.get('lines', []):
        spans = line['spans']
        text = ''.join('Ø' if s['font'] == 'AIGDT' and s['text'] == 'n' else s['text'] for s in spans).strip()
        if not text:
            continue
        o = spans[0]['origin']
        texts.append({
            'x': round((o[0] - ox) * MM_PER_PT, 1),
            'y': round((o[1] - oy) * MM_PER_PT, 1),
            'size': round(max(s['size'] for s in spans if s['font'] != 'AIGDT') * MM_PER_PT, 1),
            'rotate': 0 if line['dir'][0] > 0.5 else -90,
            'text': text,
        })

shape = {
    'id': detail_id,
    'title': title,
    'width': round((max(p.x for p in allpts) - ox) * MM_PER_PT, 1),
    'height': round((max(p.y for p in allpts) - oy) * MM_PER_PT, 1),
    # épaisseur papier d'origine (pt → mm), au moins 0,09 mm
    'strokes': [{'widthMm': max(0.09, round(w * 25.4 / 72, 3)), 'd': path(l)} for w, l in sorted(strokes.items(), reverse=True)],
    'fill': path(fills),
    'texts': texts,
}
out = f'src/sheets/details/{detail_id}.ts'
with open(out, 'w') as fh:
    fh.write(f'// Généré par scripts/extract-detail.py depuis le plan PDF de référence : ne pas modifier à la main.\n')
    fh.write("import type { DetailShape } from './types';\n\n")
    fh.write(f'const detail: DetailShape = {json.dumps(shape, ensure_ascii=False)};\n\nexport default detail;\n')
print(out, shape['width'], '×', shape['height'], 'mm,', sum(len(s['d']) for s in shape['strokes']) + len(shape['fill']), 'car. de tracés,', len(texts), 'textes')
