# encoding: UTF-8
# Viewbox — préparation des modèles SketchUp pour VEM (partie qui utilise l'API SketchUp).
#
# Menu Extensions › Viewbox :
#   - Contrôler le modèle            : rapport seul, ne modifie rien.
#   - Préparer & exporter pour VEM…  : nomme les Viewbox (VBX-01…) et les accessoires, écrit leur
#     catégorie en attribut (dictionnaire "viewbox"), exporte le .dae aux bons réglages + textures +
#     manifest.json dans un .zip à déposer dans VEM.
#
# Pourquoi un manifest : l'export COLLADA (.dae) perd les balises (tags) SketchUp. Il ne garde que
# les noms et les matériaux. Le manifest transporte la catégorie de chaque accessoire.
require 'sketchup.rb'
require 'json'
require 'tmpdir'
require 'fileutils'
require File.join(__dir__, 'core')

module Viewbox
  module Prep
    VERSION = '1.0.0'.freeze
    DICT = 'viewbox'.freeze
    C = Core

    # Réglages d'export COLLADA (voir "Exporter Options" de l'API Ruby SketchUp).
    DAE_OPTIONS = {
      triangulated_faces: true,   # géométrie propre pour three.js
      doublesided_faces: false,   # sinon faces doublées → traits en double
      edges: true,                # garde les arêtes SketchUp
      hidden_geometry: false,     # pas d'objets masqués qui réapparaissent
      preserve_instancing: true,  # indispensable : hiérarchie des composants (Viewbox par Viewbox)
      texture_maps: true,
      selectionset_only: false,
      author_attribution: false,
      show_summary: false
    }.freeze

    # ─── Utilitaires ───

    def self.mm(length)
      length.to_f * C::MM_PER_INCH
    end

    def self.container?(e)
      e.is_a?(Sketchup::ComponentInstance) || e.is_a?(Sketchup::Group)
    end

    def self.definition_of(e)
      e.definition
    end

    def self.label(e)
      e.name.to_s.empty? ? definition_of(e).name.to_s : e.name.to_s
    end

    def self.tag_name(e)
      e.layer ? e.layer.name.to_s : ''
    end

    def self.scale_of(tr)
      a = tr.to_a
      [Math.sqrt(a[0]**2 + a[1]**2 + a[2]**2), Math.sqrt(a[4]**2 + a[5]**2 + a[6]**2)]
    end

    # Dimensions en plan (mm) d'une instance, dans son propre repère.
    def self.plan_dims(e)
      bb = definition_of(e).bounds
      sx, sy = scale_of(e.transformation)
      [mm(bb.width) * sx, mm(bb.height) * sy]
    end

    def self.bbox_json(bb)
      {
        'min' => [mm(bb.min.x).round(1), mm(bb.min.y).round(1), mm(bb.min.z).round(1)],
        'max' => [mm(bb.max.x).round(1), mm(bb.max.y).round(1), mm(bb.max.z).round(1)]
      }
    end

    # Boîte monde d'une entité dont le parent a la transformation monde parent_tr.
    def self.world_bbox(e, parent_tr)
      bb = Geom::BoundingBox.new
      local = e.bounds
      8.times { |i| bb.add(local.corner(i).transform(parent_tr)) }
      bb
    end

    def self.materials_of(e)
      names = []
      names << e.material.name if e.material
      definition_of(e).entities.grep(Sketchup::Face).first(500).each do |f|
        names << f.material.name if f.material
        names << f.back_material.name if f.back_material
      end
      names.uniq.first(20)
    end

    # Catégorie : attribut déjà posé > balise (tag) > nom d'instance > nom de définition.
    def self.category_for(e)
      attr = e.get_attribute(DICT, 'category')
      return [attr, 'attribut'] if C.valid_category?(attr)
      [[tag_name(e), 'balise'], [e.name.to_s, 'nom'], [definition_of(e).name.to_s, 'définition']].each do |name, source|
        c = C.category(name)
        return [c, source] if c
      end
      [nil, nil]
    end

    def self.article_for(e)
      e.get_attribute(DICT, 'articleRef') || C.article_ref(e.name) || C.article_ref(definition_of(e).name)
    end

    # ─── Analyse (ne modifie rien) ───

    Analysis = Struct.new(:named, :candidates, :groups_as_modules, :duplicates, :orphans, :context, :common, :others, :levels, keyword_init: true)

    def self.analyze(model)
      tops = model.entities.select { |e| container?(e) }
      context = tops.select { |e| C.context?(label(e)) }
      rest = tops - context
      named = rest.select { |e| C.module_id(e.name) }
      candidates = (rest - named).select do |e|
        !C.common?(label(e)) && C.category(label(e)).nil? && C.plan_dims_ok?(*plan_dims(e), 150.0)
      end
      modules = named + candidates
      ids = named.map { |e| C.module_id(e.name) }
      duplicates = ids.group_by { |x| x }.select { |_, v| v.size > 1 }.keys
      others = rest - modules
      common = others.select { |e| C.common?(label(e)) }
      orphans = (others - common).select { |e| C::ACCESSORY_CATEGORIES.include?(category_for(e).first) }
      zs = modules.map { |e| mm(e.bounds.min.z) }
      levels = modules.zip(C.group_levels(zs)).to_h
      Analysis.new(named: named, candidates: candidates, groups_as_modules: modules.select { |e| e.is_a?(Sketchup::Group) },
                   duplicates: duplicates, orphans: orphans, context: context, common: common,
                   others: others - common - orphans, levels: levels)
    end

    # Parcourt les accessoires d'un module : yield(entité, catégorie, source, transformation monde du parent, entités parentes).
    def self.each_item(entities, parent_tr, depth = 0, &block)
      entities.each do |e|
        next unless container?(e)
        cat, source = category_for(e)
        if cat
          yield(e, cat, source, parent_tr, entities)
        elsif depth < 4
          each_item(definition_of(e).entities, parent_tr * e.transformation, depth + 1, &block)
        else
          yield(e, nil, nil, parent_tr, entities)
        end
      end
    end

    def self.report_lines(a)
      lines = []
      lines << "Viewbox nommées (VBX-xx) : #{a.named.size}"
      lines << "Viewbox à nommer (reconnues à leurs dimensions 5900 × 2500) : #{a.candidates.size}" if a.candidates.any?
      lines << "Niveaux : #{a.levels.values.uniq.size}" if a.levels.any?
      lines << "⚠ Noms de Viewbox en double : #{a.duplicates.join(', ')}" if a.duplicates.any?
      if a.groups_as_modules.any?
        lines << "⚠ #{a.groups_as_modules.size} Viewbox sont des groupes (conseillé : composants — clic droit › Convertir en composant) : #{a.groups_as_modules.map { |e| label(e) }.first(10).join(', ')}"
      end
      lines << "⚠ Accessoires hors de toute Viewbox : #{a.orphans.map { |e| label(e) }.first(10).join(', ')}" if a.orphans.any?
      lines << "Éléments communs (COMMUN_) : #{a.common.size}"
      lines << "Contexte ignoré (CTX_) : #{a.context.size}"
      lines << "Autres objets au premier niveau : #{a.others.map { |e| label(e) }.first(10).join(', ')}" if a.others.any?
      lines << '✗ Aucune Viewbox trouvée : nomme chaque Viewbox VBX-01, VBX-02… (Infos sur l\'entité › Nom d\'instance).' if a.named.empty? && a.candidates.empty?
      lines
    end

    def self.control_only
      a = analyze(Sketchup.active_model)
      text = report_lines(a).join("\n")
      puts "[Viewbox] Contrôle du modèle\n#{text}"
      UI.messagebox("Viewbox — contrôle du modèle\n\n#{text}")
    rescue StandardError => e
      fail_with(e)
    end

    # ─── Préparation (modifie le modèle, annulable en une fois avec Ctrl+Z) ───

    def self.prepare(model, a)
      modules = a.named + a.candidates
      renamed_modules = 0
      renamed_items = 0
      model.start_operation('Viewbox : préparer pour VEM', true)
      begin
        # 1. Numérotation des Viewbox sans nom (triées par niveau, puis X, puis Y).
        used = a.named.map { |e| C.module_id(e.name)[/\d+/].to_i }
        sorted = a.candidates.sort_by { |e| [a.levels[e] || 0, e.bounds.min.x.to_f, e.bounds.min.y.to_f] }
        C.next_free_numbers(used, sorted.size).each_with_index do |n, i|
          sorted[i].name = format('VBX-%02d', n)
          renamed_modules += 1
        end
        # 2. Attributs + noms d'accessoires uniques (le nom est la seule chose que le .dae conserve).
        done_defs = {}
        modules.each do |m|
          mid = C.module_id(m.name)
          m.set_attribute(DICT, 'moduleId', mid)
          m.set_attribute(DICT, 'level', a.levels[m] || 0)
          defn = definition_of(m)
          next if done_defs[defn]
          done_defs[defn] = true
          prefix = defn.count_instances > 1 ? '' : "#{mid}|"
          counters = Hash.new(0)
          each_item(defn.entities, m.transformation) do |e, cat, _source, _tr, siblings|
            next unless cat
            e.set_attribute(DICT, 'category', cat)
            art = article_for(e)
            e.set_attribute(DICT, 'articleRef', art) if art
            same = siblings.count { |s| container?(s) && s.name.to_s == e.name.to_s }
            next unless e.name.to_s.empty? || same > 1
            counters[cat] += 1
            e.name = C.accessory_name(prefix, cat, counters[cat], art)
            renamed_items += 1
          end
        end
        model.commit_operation
      rescue StandardError
        model.abort_operation
        raise
      end
      [renamed_modules, renamed_items]
    end

    def self.build_manifest(model, a)
      modules = (a.named + a.candidates).select { |m| C.module_id(m.name) }
      {
        'schema' => 'viewbox-manifest/1',
        'source' => {
          'file' => File.basename(model.path.to_s),
          'sketchupVersion' => Sketchup.version,
          'extensionVersion' => VERSION,
          'exportedAt' => Time.now.utc.strftime('%Y-%m-%dT%H:%M:%SZ')
        },
        'units' => 'mm',
        'upAxis' => 'Z',
        'modules' => modules.map do |m|
          tr = m.transformation.to_a.each_with_index.map { |v, i| [12, 13, 14].include?(i) ? (v * C::MM_PER_INCH).round(3) : v.round(9) }
          items = []
          each_item(definition_of(m).entities, m.transformation) do |e, cat, _source, parent_tr, _siblings|
            items << {
              'name' => e.name.to_s, 'category' => cat, 'tag' => tag_name(e), 'definition' => definition_of(e).name.to_s,
              'articleRef' => article_for(e), 'materials' => materials_of(e), 'bboxWorld' => bbox_json(world_bbox(e, parent_tr))
            }
          end
          {
            'id' => C.module_id(m.name), 'definition' => definition_of(m).name.to_s, 'tag' => tag_name(m),
            'level' => a.levels[m] || 0, 'transform' => tr, 'bboxWorld' => bbox_json(m.bounds), 'accessories' => items
          }
        end,
        'common' => (a.common + a.orphans + a.others).map do |e|
          { 'name' => e.name.to_s.empty? ? '' : e.name.to_s, 'category' => category_for(e).first, 'tag' => tag_name(e),
            'definition' => definition_of(e).name.to_s, 'articleRef' => article_for(e), 'bboxWorld' => bbox_json(e.bounds) }
        end,
        'context' => a.context.map { |e| { 'name' => label(e) } }
      }
    end

    # Exporte le .dae (contexte CTX_ masqué le temps de l'export) + manifest dans un .zip.
    def self.export_zip(model, manifest, zip_path, base)
      tmp = Dir.mktmpdir('vbx_prep')
      dae = File.join(tmp, "#{base}.dae")
      ok = false
      model.start_operation('Viewbox : export', true)
      begin
        model.entities.each { |e| e.hidden = true if container?(e) && C.context?(label(e)) }
        ok = model.export(dae, DAE_OPTIONS)
      ensure
        model.abort_operation # rétablit la visibilité du contexte
      end
      raise "L'export .dae a échoué (#{dae})" unless ok && File.exist?(dae)
      File.write(File.join(tmp, 'manifest.json'), JSON.pretty_generate(manifest))
      C.zip_directory(tmp, zip_path)
    ensure
      FileUtils.rm_rf(tmp) if tmp && File.directory?(tmp)
    end

    def self.prepare_and_export
      model = Sketchup.active_model
      a = analyze(model)
      lines = report_lines(a)
      if a.named.empty? && a.candidates.empty?
        UI.messagebox("Viewbox — export impossible\n\n#{lines.join("\n")}")
        return
      end
      intro = "Viewbox — préparer & exporter pour VEM\n\n#{lines.join("\n")}\n\n" \
              "Le script va :\n• numéroter les Viewbox sans nom (VBX-xx)\n• nommer les accessoires sans nom ou en double\n" \
              "• écrire leur catégorie en attribut\n(annulable en une fois avec Ctrl+Z)\n\nContinuer ?"
      return unless UI.messagebox(intro, MB_YESNO) == IDYES

      if UI.messagebox("Purger les éléments inutilisés (composants, matériaux, balises) avant l'export ?\n(conseillé : fichier plus léger)", MB_YESNO) == IDYES
        model.definitions.purge_unused
        model.materials.purge_unused
        model.layers.purge_unused
      end

      renamed_modules, renamed_items = prepare(model, a)
      a = analyze(model) # recalcul après renommage

      start_dir = model.path.to_s.empty? ? Dir.home : File.dirname(model.path)
      dir = UI.select_directory(title: 'Dossier où enregistrer le .zip pour VEM', directory: start_dir)
      return unless dir

      title = model.title.to_s.empty? ? 'modele' : model.title
      base = "#{C.safe_file_name(title)}_VEM_#{Time.now.strftime('%Y%m%d-%H%M')}"
      zip_path = File.join(dir, "#{base}.zip")
      manifest = build_manifest(model, a)
      Sketchup.status_text = 'Viewbox : export .dae en cours…'
      count = export_zip(model, manifest, zip_path, base)
      report = ["Export VEM — #{Time.now.strftime('%d/%m/%Y %H:%M')}", "Fichier : #{zip_path} (#{count} fichiers)",
                "Viewbox numérotées : #{renamed_modules} · accessoires renommés : #{renamed_items}", '', *report_lines(a)].join("\n")
      File.write(File.join(dir, "#{base}_rapport.txt"), report)
      puts "[Viewbox] #{report}"
      UI.messagebox("✓ Export terminé\n\n#{zip_path}\n\nDépose ce .zip dans les fichiers du projet VEM, puis ouvre Plans Viewbox.\n\n" \
                    "Viewbox numérotées : #{renamed_modules} · accessoires renommés : #{renamed_items}")
    rescue StandardError => e
      fail_with(e)
    ensure
      Sketchup.status_text = ''
    end

    def self.fail_with(e)
      puts "[Viewbox] ERREUR : #{e.message}\n#{e.backtrace&.first(8)&.join("\n")}"
      UI.messagebox("Viewbox — erreur : #{e.message}\n\nDétails dans la console Ruby (Extensions › Developer › Ruby Console).")
    end

    unless file_loaded?(__FILE__)
      menu = UI.menu('Extensions').add_submenu('Viewbox')
      menu.add_item('Contrôler le modèle') { control_only }
      menu.add_item('Préparer & exporter pour VEM…') { prepare_and_export }
      file_loaded(__FILE__)
    end
  end
end
