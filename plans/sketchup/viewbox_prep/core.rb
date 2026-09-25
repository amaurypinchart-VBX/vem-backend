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
        ['PIED', [/(\A|[^A-Z])PIED/, /VERIN/, /(\A|[^A-Z])JACK/]],
        ['TOIT', [/TOIT/, /ROOF/]],
        ['PLANCHER', [/PLANCHER/, /FLOOR[-_ ]?PANEL/]],
        ['STRUCTURE', [/STRUCTURE/, /CHASSIS/, /POTEAU/, /POUTRE/]],
        ['VITRE', [/(\A|[^A-Z])VITRE/, /VITRAGE/, /GLAZING/]]
      ].freeze
      CATEGORIES = CATEGORY_RULES.map(&:first).freeze
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

      def self.valid_category?(value)
        CATEGORIES.include?(value.to_s)
      end

      # Dimensions en plan d'un module (orientation quelconque), tolérance en mm.
      def self.plan_dims_ok?(a, b, tolerance = 30.0)
        long, short = [a, b].max, [a, b].min
        (long - MODULE_LONG).abs <= tolerance && (short - MODULE_SHORT).abs <= tolerance
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

      # Nom d'accessoire unique : "VBX-03|PORTE-SIMPLE|02|#7-230-044" (sans préfixe de module si la
      # définition du module est partagée par plusieurs Viewbox).
      def self.accessory_name(module_prefix, category, number, article = nil)
        name = "#{module_prefix}#{category}|#{format('%02d', number)}"
        article ? "#{name}|##{article}" : name
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

      # Zippe tout le contenu d'un dossier (chemins relatifs, avec sous-dossiers de textures).
      def self.zip_directory(dir, zip_path)
        files = Dir.glob(File.join(dir, '**', '*'), File::FNM_DOTMATCH).select { |f| File.file?(f) }.sort
        File.open(zip_path, 'wb') do |io|
          zip = ZipWriter.new(io)
          files.each { |f| zip.add(f.sub(%r{\A#{Regexp.escape(dir)}/?}, ''), File.binread(f)) }
          zip.close
        end
        files.size
      end
    end
  end
end
