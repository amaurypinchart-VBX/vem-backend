# encoding: UTF-8
# Viewbox — préparation des modèles SketchUp pour VEM : logique pure (sans API SketchUp),
# testable hors SketchUp (voir plans/sketchup/test_core.rb). Les règles reprennent celles de
# VEM (plans/src/core/classification.ts) : garder les deux fichiers alignés.
require 'zlib'
require 'json'

module Viewbox
  module Prep
    module Core
      MM_PER_INCH = 25.4
      MODULE_LONG = 5900.0
      MODULE_SHORT = 2500.0

      # "VBX-03", "VBX 3 entrée" = module ; "VBX-03|PORTE-SIMPLE|02" (nom d'accessoire) n'en est pas un.
      MODULE_RE = /\AVBX[-_ ]?(\d+)\b(?!\s*\|)/i
      CONTEXT_RE = /\ACTX[-_ ]/i
      COMMON_RE = /\ACOMMUN[-_ ]/i
      ARTICLE_RE = /(?:\A|[^0-9])(\d-\d{3}-\d{3,5})(?![0-9])/

      # L'ordre compte : la première catégorie qui correspond gagne (les plus spécifiques d'abord).
      CATEGORY_RULES = [
        ['VITRE-SEAMLESS', [/VITRE[-_ ]?SEAMLESS/, /SEAMLESS/]],
        ['VITRE-CADRE', [/VITRE[-_ ]?CADRE/, /WINDOWS?[-_ ]?FRAME/, /FRAMED[-_ ]?(GLASS|WINDOW)/]],
        ['PORTE-COULISSANTE', [/PORTE[-_ ]?COULISSANTE/, /SLID+(E|ING)[-_ ]?DOOR/, /FULL[-_ ]?SLID/, /COULISSANT/]],
        ['PORTE-DOUBLE', [/PORTE[-_ ]?DOUBLE/, /DOUBLE[-_ ]?DOOR/]],
        ['PORTE-SIMPLE', [/PORTE[-_ ]?SIMPLE/, /SINGLE[-_ ]?DOOR/]],
        ['MUR-LEGER', [/MUR[-_ ]?LEGER/, /WALL[-_ ]?LIGHT/, /LIGHT[-_ ]?WALL/]],
        ['MUR-LOURD', [/MUR[-_ ]?LOURD/, /WALL[-_ ]?HEAVY/, /HEAVY[-_ ]?WALL/]],
        ['GARDE-CORPS', [/GARDE[-_ ]?CORPS/, /RAILING/, /HANDRAIL/, /BALUSTRADE/]],
        ['ESCALIER', [/ESCALIER/, /STAIR/]],
        # élément terrasse 5,9 × 2,5 m (« 7-632-029 TERRACE PLATFORM - VIEWBOX M16 ») : jamais une Viewbox
        ['TERRASSE', [/TERRASS/, /TERRACE/]],
        ['PIED', [/(\A|[^A-Z])PIED/, /VERIN/, /(\A|[^A-Z])JACK/, /LEVEL+ING/, /(\A|[^A-Z])FEET/, /(\A|[^A-Z])FOOT([^A-Z]|\z)/]],
        ['TOIT', [/TOIT/, /ROOF/]],
        ['PLANCHER', [/PLANCHER/, /FLOOR[-_ ]?(PANEL|MODULE)/]],
        ['STRUCTURE', [/STRUCTURE/, /CHASSIS/, /POTEAU/, /POUTRE/, /(\A|[^A-Z])POLES?([^A-Z]|\z)/, /COLUMN/, /(\A|[^A-Z])BEAM/, /UPN[-_ ]?\d/, /IPE[-_ ]?\d/, /HE[AB][-_ ]?\d/]],
        ['VITRE', [/(\A|[^A-Z])VITRE/, /VITRAGE/, /GLAZING/]]
      ].freeze
      CATEGORIES = CATEGORY_RULES.map(&:first).freeze
      # Choix "Ignorer à l'export" dans la fenêtre de révision : l'objet n'est pas exporté.
      IGNORE = 'IGNORER'.freeze
      EXPORT_PREFIX = 'VBXE-'.freeze
      ACCESSORY_CATEGORIES = %w[VITRE-SEAMLESS VITRE-CADRE VITRE MUR-LEGER MUR-LOURD PORTE-SIMPLE PORTE-DOUBLE PORTE-COULISSANTE].freeze

      # Majuscules, sans accents.
      def self.normalize(str)
        s = str.to_s.dup.force_encoding('UTF-8')
        s = s.scrub('') unless s.valid_encoding?
        s = s.unicode_normalize(:nfd) if s.respond_to?(:unicode_normalize)
        s.gsub(/\p{Mn}/, '').upcase.strip
      end

      # "VBX-3" → "VBX-03" ; nil si ce n'est pas un nom de module.
      def self.module_id(name)
        m = normalize(name).match(MODULE_RE)
        m ? format('VBX-%02d', m[1].to_i) : nil
      end

      def self.category(name)
        n = normalize(name)
        return nil if n.empty?
        CATEGORY_RULES.each { |key, res| return key if res.any? { |r| r.match?(n) } }
        nil
      end

      def self.article_ref(name)
        m = name.to_s.match(ARTICLE_RE)
        m ? m[1] : nil
      end

      def self.context?(name)
        CONTEXT_RE.match?(normalize(name))
      end

      def self.common?(name)
        COMMON_RE.match?(normalize(name))
      end

      # Clé de catégorie propre (catégories personnalisées) : "Porte orangerie" → "PORTE-ORANGERIE".
      def self.category_key(value)
        normalize(value).gsub(/[^A-Z0-9]+/, '-').gsub(/\A-+|-+\z/, '')
      end

      # Nom technique unique donné à un objet le temps de l'export .dae (sans caractère que SketchUp
      # réécrirait) : c'est la clé qui relie chaque objet du .dae à sa ligne du manifest.
      def self.export_name(number)
        "#{EXPORT_PREFIX}#{number}"
      end

      # Boîte (min, max en mm) : le centre est-il dans l'autre boîte agrandie de margin ?
      def self.center_inside?(min, max, bmin, bmax, margin = 50.0)
        (0..2).all? do |i|
          c = (min[i] + max[i]) / 2.0
          c >= bmin[i] - margin && c <= bmax[i] + margin
        end
      end

      # Dimensions en plan d'un module (orientation quelconque), tolérance en mm ; dimensions attendues en paramètres
      # (Viewbox 5900 × 2500 par défaut, ou dimensions nominales d'un autre type de structure).
      def self.plan_dims_ok?(a, b, tolerance = 30.0, long: MODULE_LONG, short: MODULE_SHORT)
        l, s = [a, b].max, [a, b].min
        (l - [long, short].max).abs <= tolerance && (s - [long, short].min).abs <= tolerance
      end

      # Regroupe des altitudes (mm) en niveaux (tolérance 200 mm) : retourne le niveau de chaque valeur.
      def self.group_levels(zs, tolerance = 200.0)
        order = zs.each_with_index.sort_by { |z, _| z }
        levels = Array.new(zs.size, 0)
        level = -1
        anchor = -Float::INFINITY
        order.each do |z, i|
          if z - anchor > tolerance
            level += 1
            anchor = z
          end
          levels[i] = level
        end
        levels
      end

      # Premiers numéros libres (1, 2, 3…) en évitant ceux déjà utilisés.
      def self.next_free_numbers(used, count)
        out = []
        n = 1
        while out.size < count
          out << n unless used.include?(n)
          n += 1
        end
        out
      end

      def self.safe_file_name(name)
        base = name.to_s.gsub(/[^\w\-]+/, '_').gsub(/_+/, '_').sub(/\A_/, '').sub(/_\z/, '')
        base.empty? ? 'modele' : base
      end

      # ─── Écriture d'un .zip (deflate) sans dépendance externe ───
      class ZipWriter
        Entry = Struct.new(:name, :crc, :csize, :usize, :offset, :time, :date)

        def initialize(io)
          @io = io
          @entries = []
          now = Time.now
          @time = (now.hour << 11) | (now.min << 5) | (now.sec / 2)
          @date = ((now.year - 1980) << 9) | (now.month << 5) | now.day
        end

        def add(name, data)
          data = data.to_s.b
          name_b = name.to_s.encode('UTF-8').b
          z = Zlib::Deflate.new(Zlib::BEST_COMPRESSION, -Zlib::MAX_WBITS)
          compressed = z.deflate(data, Zlib::FINISH)
          z.close
          entry = Entry.new(name_b, Zlib.crc32(data), compressed.bytesize, data.bytesize, @io.pos, @time, @date)
          @io.write([0x04034b50, 20, 0x0800, 8, @time, @date, entry.crc, entry.csize, entry.usize, name_b.bytesize, 0].pack('VvvvvvVVVvv'))
          @io.write(name_b)
          @io.write(compressed)
          @entries << entry
        end

        def close
          cd_offset = @io.pos
          @entries.each do |e|
            @io.write([0x02014b50, 20, 20, 0x0800, 8, e.time, e.date, e.crc, e.csize, e.usize, e.name.bytesize, 0, 0, 0, 0, 0, e.offset].pack('VvvvvvvVVVvvvvvVV'))
            @io.write(e.name)
          end
          cd_size = @io.pos - cd_offset
          @io.write([0x06054b50, 0, 0, @entries.size, @entries.size, cd_size, cd_offset, 0].pack('VvvvvVVv'))
        end
      end

      # ─── Structure d'une Viewbox modifiée (dialogue « Structure… », attribut d'instance) ───
      # Mêmes clés que l'étude structure de VEM (structure/core/mods.ts, core/manifest.ts StructParams).
      STRUCT_SLOTS = %w[rim-floor rim-roof secondary-floor secondary-roof column].freeze
      STRUCT_SLOT_LABELS = {
        'rim-floor' => 'Rives du plancher', 'rim-roof' => 'Rives de toiture',
        'secondary-floor' => 'Traverses / lisses du plancher', 'secondary-roof' => 'Traverses / lisses de toiture',
        'column' => 'Poteaux'
      }.freeze
      STANDARD = 'gabarit'.freeze
      STANDARD_TOP_Z = 3080
      STANDARD_PLYWOOD = 18
      GRADES = %w[S235 S275 S355].freeze
      # Sections proposées (catalogue du commerce de VEM : « UPN 160 » → clé « CAT-UPN160 ») ; texte libre accepté.
      STRUCT_CHOICES = {
        'rim' => ['UPN 120', 'UPN 140', 'UPN 160', 'UPN 180', 'UPN 200', 'UPN 220', 'UPN 240', 'UPN 260', 'UPN 280', 'UPN 300',
                  'IPE 160', 'IPE 180', 'IPE 200', 'IPE 220', 'IPE 240', 'IPE 270', 'IPE 300', 'HEA 160', 'HEA 180', 'HEA 200', 'HEA 220', 'HEA 240'],
        'secondary' => ['RHS 100x50x4', 'RHS 100x60x4', 'RHS 120x60x3', 'RHS 120x60x4', 'RHS 150x50x4', 'RHS 150x75x4', 'RHS 140x70x5', 'RHS 160x80x4', 'RHS 160x80x5', 'RHS 150x100x5'],
        'column' => ['SHS 80x80x5', 'SHS 100x100x4', 'SHS 100x100x5', 'SHS 100x100x8', 'SHS 100x100x10', 'SHS 120x120x5', 'SHS 120x120x6', 'SHS 120x120x8', 'SHS 140x140x5', 'SHS 150x150x5', 'SHS 150x150x6'],
        # profils de la structure dessinée (dialogue « Structure de la box ») : mêmes noms que le catalogue VEM
        # (catalogBE.data.ts) ; les profils pliés (C, U pliés) sont relevés et mesurés par VEM
        'frame' => ['UPN 80', 'UPN 100', 'UPN 120', 'UPN 140', 'UPN 160', 'UPN 180', 'UPN 200', 'UPN 220', 'UPN 240', 'UPN 260', 'UPN 280', 'UPN 300',
                    'IPE 80', 'IPE 100', 'IPE 120', 'IPE 140', 'IPE 160', 'IPE 180', 'IPE 200', 'IPE 220', 'IPE 240', 'IPE 270', 'IPE 300',
                    'HEA 100', 'HEA 120', 'HEA 140', 'HEA 160', 'HEA 180', 'HEA 200', 'HEA 220', 'HEA 240', 'HEB 100', 'HEB 120', 'HEB 140', 'HEB 160', 'HEB 180', 'HEB 200',
                    'SHS 50x50x3', 'SHS 60x60x3', 'SHS 60x60x4', 'SHS 80x80x3', 'SHS 80x80x4', 'SHS 80x80x5', 'SHS 100x100x4', 'SHS 100x100x5', 'SHS 100x100x8', 'SHS 120x120x5', 'SHS 120x120x6', 'SHS 150x150x5',
                    'RHS 60x40x3', 'RHS 80x40x3', 'RHS 100x50x3', 'RHS 100x50x4', 'RHS 100x60x4', 'RHS 120x60x3', 'RHS 120x60x4', 'RHS 150x50x4', 'RHS 150x75x4', 'RHS 160x80x4', 'RHS 160x80x5', 'RHS 200x100x4',
                    'L 50x50x5', 'L 60x60x6', 'L 80x80x8', 'L 100x100x10', 'PLAT 60x6', 'PLAT 80x8', 'PLAT 100x10', 'PLAT 130x15']
      }.freeze
      LIBRARY_SECTION_RE = /\A(UNP220|QHP100x5|RHP120x60x4|CAT-[\w.,x-]+|ETUDE-[\w.,x-]+|SEC-[\w.,x-]+)\z/

      def self.struct_choices(slot)
        STRUCT_CHOICES[slot.start_with?('rim') ? 'rim' : slot.start_with?('secondary') ? 'secondary' : 'column']
      end

      # « UPN 160 » → « CAT-UPN160 » ; clé de bibliothèque gardée telle quelle ; vide / « gabarit » → nil.
      def self.struct_section_key(text)
        t = text.to_s.strip
        return nil if t.empty? || t.casecmp?(STANDARD)
        return t if t =~ LIBRARY_SECTION_RE
        "CAT-#{t.gsub(/\s+/, '').gsub('×', 'x')}"
      end

      # Clé → texte du dialogue (« CAT-UPN160 » → « UPN 160 »).
      def self.struct_section_text(key)
        return STANDARD if key.nil? || key.to_s.empty?
        k = key.to_s.sub(/\ACAT-/, '')
        k.sub(/\A(UPN|IPE|HEA|HEB|HEM|SHS|RHS|CHS)(\d)/, '\\1 \\2')
      end

      # Valeurs du dialogue → paramètres (seulement ce qui diffère du standard), nil = Viewbox standard.
      # values : { 'topZ' => '5000', 'sections' => { slot => texte }, 'grades' => { slot => 'S355' | 'gabarit' }, 'plywood' => '21' }
      def self.struct_params(values)
        out = { 'v' => 1 }
        top = values['topZ'].to_s.tr(',', '.').to_f.round
        out['topZ'] = top if top > 0 && top != STANDARD_TOP_Z
        secs = {}
        (values['sections'] || {}).each do |slot, text|
          next unless STRUCT_SLOTS.include?(slot)
          k = struct_section_key(text)
          secs[slot] = k if k
        end
        out['sections'] = secs unless secs.empty?
        grades = {}
        (values['grades'] || {}).each { |slot, g| grades[slot] = g if STRUCT_SLOTS.include?(slot) && GRADES.include?(g.to_s) }
        out['grades'] = grades unless grades.empty?
        ply = values['plywood'].to_s.tr(',', '.').to_f.round
        out['plywood'] = ply if ply > 0 && ply != STANDARD_PLYWOOD
        out.size > 1 ? out : nil
      end

      # Nombre de paramètres modifiés : « Viewbox standard » / « Viewbox modifiée (3 paramètres) ».
      def self.struct_summary(params)
        return 'Viewbox standard' unless params
        n = (params['topZ'] ? 1 : 0) + (params['plywood'] ? 1 : 0) + (params['sections'] || {}).size + (params['grades'] || {}).size
        n.zero? ? 'Viewbox standard' : "Viewbox modifiée (#{n} paramètre#{n > 1 ? 's' : ''})"
      end

      # Attribut d'instance (texte JSON) → paramètres ; invalide = standard.
      def self.parse_struct(text)
        return nil if text.nil? || text.to_s.strip.empty?
        h = JSON.parse(text.to_s)
        h.is_a?(Hash) && h.size > 1 ? h : nil
      rescue JSON::ParserError
        nil
      end

      # ─── Structure dessinée dans le composant (relevé des profils, S12) ───
      # Rôles d'une barre : mêmes clés que FrameRole de VEM (structure/core/library.ts).
      STRUCT_ROLES = %w[rim-floor rim-roof transverse-floor transverse-roof stringer-floor stringer-roof column foot brace other none].freeze
      STRUCT_ROLE_LABELS = {
        'rim-floor' => 'Rive du plancher', 'rim-roof' => 'Rive de toiture',
        'transverse-floor' => 'Traverse du plancher', 'transverse-roof' => 'Traverse de toiture',
        'stringer-floor' => 'Lisse du plancher', 'stringer-roof' => 'Lisse de toiture',
        'column' => 'Poteau', 'foot' => 'Réception de pied', 'brace' => 'Diagonale',
        'other' => 'Autre barre porteuse', 'none' => 'Non porteur'
      }.freeze
      STRUCT_SOURCES = %w[template drawn].freeze
      STRUCT_SOURCE_LABELS = { 'template' => 'gabarit Viewbox standard', 'drawn' => 'dessinée dans ce composant' }.freeze

      # Rôle proposé par la géométrie (même règle que VEM, frameExtract.ts) : a, b = extrémités de l'axe (mm),
      # bmin / bmax = boîte du module dans le même repère (z vers le haut), width = largeur de la coupe.
      def self.role_guess(a, b, bmin, bmax, width = 60.0)
        d = (0..2).map { |i| b[i] - a[i] }
        len = Math.sqrt(d.sum { |x| x * x })
        return 'other' if len < 1e-6
        d = d.map { |x| x / len }
        w = [width.to_f, 60.0].max
        c = (0..2).map { |i| (a[i] + b[i]) / 2.0 - bmin[i] }
        size = (0..2).map { |i| bmax[i] - bmin[i] }
        # u = grand côté du module, v = petit côté
        ux = size[0] >= size[1]
        lu, lv = ux ? [size[0], size[1]] : [size[1], size[0]]
        du, dv = ux ? [d[0], d[1]] : [d[1], d[0]]
        cu, cv = ux ? [c[0], c[1]] : [c[1], c[0]]
        h = size[2]
        return 'column' if d[2].abs > 0.95
        return 'brace' if d[2].abs >= 0.1
        lvl = c[2] < h * 0.35 ? 'floor' : c[2] > h * 0.65 ? 'roof' : nil
        return 'other' unless lvl
        along_u = du.abs > 0.95
        along_v = dv.abs > 0.95
        role = if along_u && (cv.abs <= w + 60 || (cv - lv).abs <= w + 60) then "rim-#{lvl}"
               elsif along_v && (cu.abs <= w + 60 || (cu - lu).abs <= w + 60) then "rim-#{lvl}"
               elsif along_v then "transverse-#{lvl}"
               elsif along_u then "stringer-#{lvl}"
               else 'other'
               end
        role = 'foot' if lvl == 'floor' && c[2] < 0 && len < 600
        role
      end

      NUM = '(\d+(?:[.,]\d+)?)'.freeze
      SEP = '\s*[xX×*]\s*'.freeze

      # Section lue dans un nom (« UPN200 », « Tube 100x100x5 », « Plat 130x15 »…) → { 'text', 'key' } (clé VEM
      # « CAT-… » via struct_section_key) ; nil si le nom n'en contient pas.
      def self.section_from_name(name)
        n = normalize(name).tr(',', '.')
        num = ->(x) { f = x.to_f; f == f.round ? f.round.to_s : f.to_s }
        text =
          if (m = n.match(/(?:\A|[^A-Z])(UPN|UPE|IPE|HEA|HEB|HEM)[-_ ]?(\d{2,4})(?![0-9])/))
            "#{m[1]} #{m[2]}"
          elsif (m = n.match(/(?:\A|[^A-Z])(RHS|SHS|TUBE|CARRE|TUBO)[-_ ]?#{NUM}#{SEP}#{NUM}(?:#{SEP}#{NUM})?/o))
            a, b, t = m[2], m[3], m[4]
            if t.nil? && m[1] =~ /TUBE|TUBO/ # « Tube 60,3x2,9 » : rond ou carré ? ambigu
              nil
            elsif t.nil? # « SHS 100x5 » = carré 100 × 100 × 5
              "SHS #{num.(a)}x#{num.(a)}x#{num.(b)}"
            else
              "#{a.to_f == b.to_f ? 'SHS' : 'RHS'} #{num.(a)}x#{num.(b)}x#{num.(t)}"
            end
          elsif (m = n.match(/(?:\A|[^A-Z])CHS[-_ ]?#{NUM}#{SEP}#{NUM}/o))
            "CHS #{num.(m[1])}x#{num.(m[2])}"
          elsif (m = n.match(/(?:\A|[^A-Z])(?:PLAT|FLAT|FER PLAT)[-_ ]?#{NUM}#{SEP}#{NUM}/o))
            "PLAT #{num.(m[1])}x#{num.(m[2])}"
          elsif (m = n.match(/(?:\A|[^A-Z])(L|U|T|C)[-_ ]?#{NUM}#{SEP}#{NUM}#{SEP}#{NUM}/o))
            "#{m[1]} #{num.(m[2])}x#{num.(m[3])}x#{num.(m[4])}"
          end
        text ? { 'text' => text, 'key' => struct_section_key(text) } : nil
      end

      def self.polygon_area(pts)
        s = 0.0
        pts.each_with_index { |p, i| q = pts[(i + 1) % pts.size]; s += p[0] * q[1] - q[0] * p[1] }
        s / 2.0
      end

      def self.polygon_perimeter(pts)
        pts.each_with_index.sum { |p, i| q = pts[(i + 1) % pts.size]; Math.hypot(q[0] - p[0], q[1] - p[1]) }
      end

      # Dimensions d'une coupe (contour + trous, en mm dans le plan de coupe y, z) : h (selon z), b (selon y), aire,
      # épaisseur estimée et forme (tube / plein / plat / ouvert). VEM refait la classification exacte.
      def self.section_dims(polygon, holes = [])
        ys = polygon.map { |p| p[0] }
        zs = polygon.map { |p| p[1] }
        h = zs.max - zs.min
        b = ys.max - ys.min
        area = polygon_area(polygon).abs - holes.sum { |l| polygon_area(l).abs }
        shape, t =
          if holes.any?
            ['tube', area / ((polygon_perimeter(polygon) + holes.sum { |l| polygon_perimeter(l) }) / 2.0)]
          elsif area >= 0.85 * h * b
            [[h, b].min <= 40 ? 'flat' : 'solid', [h, b].min]
          else
            ['open', 2.0 * area / polygon_perimeter(polygon)]
          end
        { 'h' => h.round(1), 'b' => b.round(1), 'area' => area.round(1), 't' => t.round(1), 'shape' => shape }
      end

      # Segments d'une coupe ([[y, z], [y, z]]) chaînés en boucles fermées (extrémités confondues à tol près).
      def self.slice_segments_to_loops(segments, tol = 0.05)
        key = ->(p) { [(p[0] / tol).round, (p[1] / tol).round] }
        near = lambda do |p, q|
          (p[0] - q[0]).abs <= tol && (p[1] - q[1]).abs <= tol
        end
        rest = segments.reject { |a, b| near.(a, b) }.map(&:dup)
        loops = []
        until rest.empty?
          a, b = rest.shift
          loop_pts = [a, b]
          closed = false
          loop do
            last = loop_pts.last
            if near.(last, loop_pts.first) && loop_pts.size > 3
              loop_pts.pop
              closed = true
              break
            end
            i = rest.index { |s, e| near.(s, last) || near.(e, last) }
            break unless i
            s, e = rest.delete_at(i)
            loop_pts << (near.(s, last) ? e : s)
          end
          loops << loop_pts if closed && loop_pts.size >= 3
        end
        _ = key
        loops
      end

      # Simplification d'une boucle fermée (Douglas-Peucker, eps en mm).
      def self.simplify_loop(pts, eps = 0.2)
        return pts if pts.size <= 4
        dp = lambda do |list|
          return list if list.size <= 2
          a, b = list.first, list.last
          dx, dy = b[0] - a[0], b[1] - a[1]
          l = Math.hypot(dx, dy)
          dist = list[1..-2].map { |p| l < 1e-9 ? Math.hypot(p[0] - a[0], p[1] - a[1]) : ((p[0] - a[0]) * dy - (p[1] - a[1]) * dx).abs / l }
          i = dist.each_with_index.max_by { |d, _| d }[1] + 1
          return [a, b] if dist.max <= eps
          dp.(list[0..i])[0..-2] + dp.(list[i..-1])
        end
        # coupe au point le plus loin du premier pour garder une boucle fermée
        far = pts.each_with_index.max_by { |p, _| Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) }[1]
        out = dp.(pts[0..far])[0..-2] + dp.(pts[far..-1] + [pts[0]])[0..-2]
        out.size >= 3 ? out : pts
      end

      # Barres dont aucune extrémité ne touche une autre barre (distance > tol, mm) : barres « non reliées ».
      def self.unconnected(members, tol = 60.0)
        seg_dist = lambda do |p, a, b|
          ab = (0..2).map { |i| b[i] - a[i] }
          l2 = ab.sum { |x| x * x }
          t = l2 < 1e-9 ? 0.0 : [[(0..2).sum { |i| (p[i] - a[i]) * ab[i] } / l2, 0.0].max, 1.0].min
          Math.sqrt((0..2).sum { |i| (p[i] - (a[i] + t * ab[i]))**2 })
        end
        members.select do |m|
          others = members.reject { |o| o.equal?(m) }
          [m['a'], m['b']].none? { |p| others.any? { |o| seg_dist.(p, o['a'], o['b']) <= tol } } &&
            others.none? { |o| [o['a'], o['b']].any? { |p| seg_dist.(p, m['a'], m['b']) <= tol } }
        end
      end

      # Structure relevée → JSON du manifest : arrondis 0,1 mm, coupes simplifiées à 0,2 mm, ordre stable.
      def self.frame_json(members, warnings = [], bounds = nil)
        r1 = ->(v) { v.map { |x| x.to_f.round(1) } }
        list = members.map do |m|
          out = {
            'id' => m['id'].to_s, 'name' => m['name'].to_s, 'definition' => m['definition'].to_s,
            'a' => r1.(m['a']), 'b' => r1.(m['b']), 'yRef' => m['yRef'].map { |x| x.to_f.round(6) },
            'loops' => (m['loops'] || []).map { |l| simplify_loop(l, 0.2).map { |p| r1.(p) } }
          }
          %w[role section grade].each { |k| out[k] = m[k] if m[k] && !m[k].to_s.empty? }
          out['roleSource'] = m['roleSource'] if m['roleSource']
          out['materials'] = m['materials'] if m['materials'] && !m['materials'].empty?
          out
        end
        list.sort_by! { |m| [STRUCT_ROLES.index(m['role']) || 99, m['a'][2], m['a'][0], m['a'][1], m['id']] }
        h = { 'v' => 1, 'source' => 'sketchup', 'axes' => 'definition', 'members' => list, 'warnings' => warnings }
        h['bounds'] = { 'min' => r1.(bounds[0]), 'max' => r1.(bounds[1]) } if bounds
        h
      end

      # Zippe tout le contenu d'un dossier (chemins relatifs, avec sous-dossiers de textures).
      # (chemins relatifs obtenus par glob "base:" : sous Windows, le dossier temporaire peut s'écrire
      # de deux façons, C:/Users/NOM~1/… et C:/Users/Nom/…, ce qui cassait un simple retrait de préfixe)
      def self.zip_directory(dir, zip_path)
        files = Dir.glob('**/*', File::FNM_DOTMATCH, base: dir).reject { |f| f.end_with?('.') }.select { |f| File.file?(File.join(dir, f)) }.sort
        File.open(zip_path, 'wb') do |io|
          zip = ZipWriter.new(io)
          files.each { |f| zip.add(f, File.binread(File.join(dir, f))) }
          zip.close
        end
        files.size
      end
    end
  end
end
