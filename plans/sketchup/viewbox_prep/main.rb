# encoding: UTF-8
# Viewbox — préparation des modèles SketchUp pour VEM (partie qui utilise l'API SketchUp).
#
# Menu Extensions › Viewbox :
#   - Contrôler le modèle            : rapport seul, ne modifie rien.
#   - Réviser les catégories…        : fenêtre où l'on corrige à la main la catégorie, la désignation
#     et la réf. article de chaque type de composant, et le type / les dimensions nominales des Viewbox.
#   - Préparer & exporter pour VEM…  : numérote les Viewbox sans nom (VBX-01…), exporte le .dae aux
#     bons réglages + textures + manifest.json dans un .zip à déposer dans VEM.
# Clic droit sur des groupes/composants › Viewbox › Catégorie / désignation… : même correction, sur la sélection.
#
# Pourquoi un manifest : l'export COLLADA (.dae) perd les balises (tags) et SketchUp y réécrit les noms
# (espaces, "#", ":"…). Pendant l'export, chaque objet reçoit un nom technique unique ("VBXE-12"), noté
# dans le manifest avec sa catégorie, sa désignation et son nom d'origine ; les noms du modèle sont
# ensuite rétablis (le modèle n'est pas modifié par l'export).
#
# Les choix manuels sont stockés en attributs (dictionnaire "viewbox") sur la définition du composant
# (valable pour tous les objets de ce type, y compris dans la bibliothèque de composants si on la
# réenregistre) ou sur un objet précis (prioritaire).
require 'sketchup.rb'
require 'json'
require 'tmpdir'
require 'fileutils'
require File.join(__dir__, 'core')

module Viewbox
  module Prep
    VERSION = '1.1.0'.freeze
    DICT = 'viewbox'.freeze
    C = Core

    # Réglages d'export COLLADA (voir "Exporter Options" de l'API Ruby SketchUp).
    DAE_OPTIONS = {
      triangulated_faces: true,   # géométrie propre pour three.js
      doublesided_faces: false,   # sinon faces doublées → traits en double
      edges: true,                # garde les arêtes SketchUp
      hidden_geometry: false,     # pas d'objets masqués (ni ceux marqués "Ignorer") dans l'export
      preserve_instancing: true,  # indispensable : hiérarchie des composants (Viewbox par Viewbox)
      texture_maps: true,
      selectionset_only: false,
      author_attribution: false,
      show_summary: false
    }.freeze

    # Tailles standard de Viewbox en plan (mm), pour reconnaître une Viewbox sans nom.
    STANDARD_SIZES = [[5900.0, 2500.0], [8400.0, 2500.0]].freeze

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

    def self.blank?(v)
      v.nil? || v.to_s.strip.empty?
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

    def self.bbox_mm(bb)
      [[mm(bb.min.x), mm(bb.min.y), mm(bb.min.z)], [mm(bb.max.x), mm(bb.max.y), mm(bb.max.z)]]
    end

    def self.bbox_json(bb)
      min, max = bbox_mm(bb)
      { 'min' => min.map { |v| v.round(1) }, 'max' => max.map { |v| v.round(1) } }
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

    # ─── Choix manuels (fenêtre de révision, clic droit) ───

    # Valeur saisie à la main : sur l'objet (prioritaire), sinon sur sa définition.
    def self.user_value(e, key)
      v = e.get_attribute(DICT, key)
      v = definition_of(e).get_attribute(DICT, key) if blank?(v)
      blank?(v) ? nil : v.to_s
    end

    # Catégorie déduite automatiquement : balise (tag) > nom d'instance > nom de définition.
    def self.auto_category(e)
      [[tag_name(e), 'balise'], [e.name.to_s, 'nom'], [definition_of(e).name.to_s, 'définition']].each do |name, source|
        c = C.category(name)
        return [c, source] if c
      end
      [nil, nil]
    end

    def self.category_for(e)
      user = user_value(e, 'userCategory')
      return [C.category_key(user) == C::IGNORE ? C::IGNORE : C.category_key(user), 'manuel'] if user
      auto_category(e)
    end

    def self.label_for(e)
      user_value(e, 'userLabel')
    end

    def self.article_for(e)
      user_value(e, 'userArticleRef') || C.article_ref(e.name) || C.article_ref(definition_of(e).name)
    end

    def self.ignored?(e)
      category_for(e).first == C::IGNORE
    end

    def self.module_type(defn)
      v = defn.get_attribute(DICT, 'moduleType')
      blank?(v) ? nil : v.to_s
    end

    def self.nominal_dims(defn)
      l = defn.get_attribute(DICT, 'nominalLong').to_f
      s = defn.get_attribute(DICT, 'nominalShort').to_f
      l > 0 && s > 0 ? [[l, s].max, [l, s].min] : nil
    end

    # ─── Analyse (ne modifie rien) ───

    Analysis = Struct.new(:named, :candidates, :groups_as_modules, :duplicates, :attached, :orphans, :context,
                          :common, :others, :levels, keyword_init: true)

    def self.standard_size?(e)
      a, b = plan_dims(e)
      nominal = nominal_dims(definition_of(e))
      sizes = nominal ? [nominal] : STANDARD_SIZES
      sizes.any? { |l, s| (([a, b].max - l).abs <= 150) && (([a, b].min - s).abs <= 150) }
    end

    def self.analyze(model)
      tops = model.entities.select { |e| container?(e) }
      context = tops.select { |e| C.context?(label(e)) || ignored?(e) }
      rest = tops - context
      named = rest.select { |e| C.module_id(e.name) }
      candidates = (rest - named).select do |e|
        !C.common?(label(e)) && (module_type(definition_of(e)) || (category_for(e).first.nil? && standard_size?(e)))
      end
      modules = named + candidates
      ids = named.map { |e| C.module_id(e.name) }
      duplicates = ids.group_by { |x| x }.select { |_, v| v.size > 1 }.keys
      others = rest - modules
      common = others.select { |e| C.common?(label(e)) }
      boxes = modules.map { |m| bbox_mm(m.bounds) }
      free = others - common
      attached = free.select do |e|
        min, max = bbox_mm(e.bounds)
        boxes.any? { |bmin, bmax| C.center_inside?(min, max, bmin, bmax) }
      end
      orphans = (free - attached).select { |e| C::ACCESSORY_CATEGORIES.include?(category_for(e).first) }
      zs = modules.map { |e| mm(e.bounds.min.z) }
      levels = modules.zip(C.group_levels(zs)).to_h
      Analysis.new(named: named, candidates: candidates, groups_as_modules: modules.select { |e| e.is_a?(Sketchup::Group) },
                   duplicates: duplicates, attached: attached, orphans: orphans, context: context, common: common,
                   others: free - attached - orphans, levels: levels)
    end

    def self.classified_inside?(defn)
      defn.entities.any? { |c| container?(c) && !category_for(c).first.nil? }
    end

    # Parcourt les objets d'un module : yield(entité, catégorie, source, transformation monde du parent).
    # Un groupe non classé qui contient des objets classés est "ouvert" ; les objets ignorés sont sautés.
    def self.each_item(entities, parent_tr, depth = 0, &block)
      entities.each do |e|
        next unless container?(e)
        cat, source = category_for(e)
        next if cat == C::IGNORE
        if cat
          yield(e, cat, source, parent_tr)
        elsif depth < 3 && classified_inside?(definition_of(e))
          each_item(definition_of(e).entities, parent_tr * e.transformation, depth + 1, &block)
        else
          yield(e, nil, nil, parent_tr)
        end
      end
    end

    def self.unclassified_types(model, a)
      types = {}
      (a.named + a.candidates).map { |m| definition_of(m) }.uniq.each do |d|
        each_item(d.entities, IDENTITY) { |e, cat, _s, _t| types[definition_of(e)] = true if cat.nil? }
      end
      (a.attached + a.others).each { |e| types[definition_of(e)] = true if category_for(e).first.nil? }
      types.size
    end

    IDENTITY = Geom::Transformation.new

    def self.report_lines(a)
      lines = []
      lines << "Viewbox nommées (VBX-xx) : #{a.named.size}"
      lines << "Viewbox à nommer (reconnues à leur taille ou à leur type) : #{a.candidates.size}" if a.candidates.any?
      lines << "Niveaux : #{a.levels.values.uniq.size}" if a.levels.any?
      lines << "⚠ Noms de Viewbox en double : #{a.duplicates.join(', ')}" if a.duplicates.any?
      if a.groups_as_modules.any?
        lines << "⚠ #{a.groups_as_modules.size} Viewbox sont des groupes (conseillé : composants — clic droit › Convertir en composant) : #{a.groups_as_modules.map { |e| label(e) }.first(10).join(', ')}"
      end
      lines << "Objets posés sur une Viewbox (rattachés par leur position) : #{a.attached.size}" if a.attached.any?
      lines << "⚠ Accessoires hors de toute Viewbox : #{a.orphans.map { |e| label(e) }.uniq.first(10).join(', ')}" if a.orphans.any?
      lines << "Éléments communs (COMMUN_) : #{a.common.size}"
      lines << "Contexte / ignorés (non exportés) : #{a.context.size}"
      lines << "Autres objets libres : #{a.others.map { |e| label(e) }.uniq.first(10).join(', ')}" if a.others.any?
      lines << '✗ Aucune Viewbox trouvée : nomme chaque Viewbox VBX-01, VBX-02… (Infos sur l\'entité › Nom d\'instance).' if a.named.empty? && a.candidates.empty?
      lines
    end

    def self.control_only
      model = Sketchup.active_model
      a = analyze(model)
      n = unclassified_types(model, a)
      text = report_lines(a).join("\n")
      text += "\n\nTypes de composants non classés : #{n} (Extensions › Viewbox › Réviser les catégories…)" if n > 0
      puts "[Viewbox] Contrôle du modèle\n#{text}"
      UI.messagebox("Viewbox #{VERSION} — contrôle du modèle\n\n#{text}")
    rescue StandardError => e
      fail_with(e)
    end

    # ─── Préparation (modifie le modèle, annulable en une fois avec Ctrl+Z) ───

    # Numérote les Viewbox sans nom (triées par niveau, puis X, puis Y) et note leur n° et niveau en attribut.
    def self.prepare(model, a)
      renamed = 0
      model.start_operation('Viewbox : préparer pour VEM', true)
      begin
        used = a.named.map { |e| C.module_id(e.name)[/\d+/].to_i }
        sorted = a.candidates.sort_by { |e| [a.levels[e] || 0, e.bounds.min.x.to_f, e.bounds.min.y.to_f] }
        C.next_free_numbers(used, sorted.size).each_with_index do |n, i|
          sorted[i].name = format('VBX-%02d', n)
          renamed += 1
        end
        (a.named + a.candidates).each do |m|
          m.set_attribute(DICT, 'moduleId', C.module_id(m.name))
          m.set_attribute(DICT, 'level', a.levels[m] || 0)
        end
        model.commit_operation
      rescue StandardError
        model.abort_operation
        raise
      end
      renamed
    end

    # Manifest ; namer.call(e) donne à e son nom technique d'export et retourne [nom technique, nom d'origine].
    def self.build_manifest(model, a, namer)
      entry = lambda do |e, cat, source, parent_tr|
        export_name, original = namer.call(e)
        {
          'exportName' => export_name, 'name' => original, 'category' => cat, 'categorySource' => source,
          'label' => label_for(e), 'tag' => tag_name(e), 'definition' => definition_of(e).name.to_s,
          'articleRef' => article_for(e), 'materials' => materials_of(e), 'bboxWorld' => bbox_json(world_bbox(e, parent_tr))
        }
      end
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
          defn = definition_of(m)
          tr = m.transformation.to_a.each_with_index.map { |v, i| [12, 13, 14].include?(i) ? (v * C::MM_PER_INCH).round(3) : v.round(9) }
          items = []
          each_item(defn.entities, m.transformation) { |e, cat, source, parent_tr| items << entry.call(e, cat, source, parent_tr) }
          {
            'id' => C.module_id(m.name), 'definition' => defn.name.to_s, 'tag' => tag_name(m), 'level' => a.levels[m] || 0,
            'type' => module_type(defn), 'nominalPlanMm' => nominal_dims(defn),
            'transform' => tr, 'bboxWorld' => bbox_json(m.bounds), 'accessories' => items
          }
        end,
        'common' => (a.common + a.attached + a.orphans + a.others).map do |e|
          cat, source = category_for(e)
          entry.call(e, cat, source, IDENTITY)
        end,
        'context' => a.context.map { |e| { 'name' => label(e), 'ignored' => ignored?(e) } }
      }
    end

    # Exporte le .dae + manifest dans un .zip. Pendant l'export (opération annulée ensuite) : contexte et
    # objets ignorés masqués, objets renommés avec leur nom technique. Le modèle ressort inchangé.
    def self.export_zip(model, a, zip_path, base)
      tmp = Dir.mktmpdir('vbx_prep')
      dae = File.join(tmp, "#{base}.dae")
      ok = false
      manifest = nil
      model.start_operation('Viewbox : export', true)
      begin
        a.context.each { |e| e.hidden = true }
        (a.named + a.candidates).map { |m| definition_of(m) }.uniq.each do |d|
          d.entities.each { |e| e.hidden = true if container?(e) && ignored?(e) }
        end
        names = {}
        counter = [0]
        namer = lambda do |e|
          names[e] ||= begin
            original = e.name.to_s
            counter[0] += 1
            e.name = C.export_name(counter[0])
            [e.name, original]
          end
        end
        manifest = build_manifest(model, a, namer)
        ok = model.export(dae, DAE_OPTIONS)
      ensure
        model.abort_operation # rétablit les noms et la visibilité
      end
      raise "L'export .dae a échoué (#{dae})" unless ok && File.exist?(dae)
      File.write(File.join(tmp, 'manifest.json'), JSON.pretty_generate(manifest))
      [C.zip_directory(tmp, zip_path), manifest]
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
      todo = unclassified_types(model, a)
      if todo > 0
        msg = "#{todo} type(s) de composants ne sont pas classés (VEM les affichera « non classés »).\n\n" \
              'Ouvrir la fenêtre de révision pour les classer d\'abord ?'
        if UI.messagebox(msg, MB_YESNO) == IDYES
          show_review_dialog
          return
        end
      end
      intro = "Viewbox — préparer & exporter pour VEM\n\n#{lines.join("\n")}\n\n" \
              "Le script va numéroter les Viewbox sans nom (VBX-xx) — annulable avec Ctrl+Z —\n" \
              "puis exporter le .dae, les textures et le manifest dans un .zip.\n\nContinuer ?"
      return unless UI.messagebox(intro, MB_YESNO) == IDYES

      if UI.messagebox("Purger les éléments inutilisés (composants, matériaux, balises) avant l'export ?\n(conseillé : fichier plus léger)", MB_YESNO) == IDYES
        model.definitions.purge_unused
        model.materials.purge_unused
        model.layers.purge_unused
      end

      renamed_modules = prepare(model, a)
      a = analyze(model) # recalcul après numérotation

      start_dir = model.path.to_s.empty? ? Dir.home : File.dirname(model.path)
      dir = UI.select_directory(title: 'Dossier où enregistrer le .zip pour VEM', directory: start_dir)
      return unless dir

      title = model.title.to_s.empty? ? 'modele' : model.title
      base = "#{C.safe_file_name(title)}_VEM_#{Time.now.strftime('%Y%m%d-%H%M')}"
      zip_path = File.join(dir, "#{base}.zip")
      Sketchup.status_text = 'Viewbox : export .dae en cours…'
      count, manifest = export_zip(model, a, zip_path, base)
      manual = (manifest['modules'].flat_map { |m| m['accessories'] } + manifest['common']).count { |x| x['categorySource'] == 'manuel' }
      report = ["Export VEM — #{Time.now.strftime('%d/%m/%Y %H:%M')}", "Fichier : #{zip_path} (#{count} fichiers)",
                "Viewbox numérotées : #{renamed_modules} · objets avec un choix manuel : #{manual}", '', *report_lines(a)].join("\n")
      File.write(File.join(dir, "#{base}_rapport.txt"), report)
      puts "[Viewbox] #{report}"
      UI.messagebox("✓ Export terminé (extension Viewbox #{VERSION})\n\n#{zip_path}\n\nDépose ce .zip (et lui seul) dans les fichiers du projet VEM, puis ouvre Plans Viewbox.\n\n" \
                    "Viewbox numérotées : #{renamed_modules} · objets avec un choix manuel : #{manual}")
    rescue StandardError => e
      fail_with(e)
    ensure
      Sketchup.status_text = ''
    end

    # ─── Clic droit : catégorie / désignation de la sélection ───

    AUTO_CHOICE = '(automatique)'.freeze
    OTHER_CHOICE = 'Autre… (saisir ci-dessous)'.freeze
    IGNORE_CHOICE = "IGNORER (ne pas exporter)".freeze

    def self.custom_categories(model)
      found = []
      model.definitions.each do |d|
        v = d.get_attribute(DICT, 'userCategory')
        found << C.category_key(v) unless blank?(v)
      end
      (found.uniq - C::CATEGORIES - [C::IGNORE]).sort
    end

    def self.set_or_clear(entity, key, value)
      if blank?(value)
        entity.delete_attribute(DICT, key) if entity.get_attribute(DICT, key)
      else
        entity.set_attribute(DICT, key, value.to_s.strip)
      end
    end

    def self.edit_selection(model, selection)
      first = selection.first
      if selection.all? { |e| C.module_id(e.name) }
        d = definition_of(first)
        nominal = nominal_dims(d) || plan_dims(first).map(&:round)
        res = UI.inputbox(['Type de Viewbox', 'Dimension nominale longue (mm)', 'Dimension nominale courte (mm)'],
                          [module_type(d).to_s, nominal[0].to_s, nominal[1].to_s], 'Viewbox — type (tous les objets de ce type)')
        return unless res
        model.start_operation('Viewbox : type de Viewbox', true)
        selection.map { |e| definition_of(e) }.uniq.each do |defn|
          set_or_clear(defn, 'moduleType', res[0])
          set_or_clear(defn, 'nominalLong', res[1].to_f > 0 ? res[1].to_f.round.to_s : nil)
          set_or_clear(defn, 'nominalShort', res[2].to_f > 0 ? res[2].to_f.round.to_s : nil)
        end
        model.commit_operation
        return
      end
      current = user_value(first, 'userCategory')
      choices = [AUTO_CHOICE] + C::CATEGORIES + custom_categories(model) + [OTHER_CHOICE, IGNORE_CHOICE]
      auto = auto_category(first).first
      res = UI.inputbox(
        ["Catégorie (auto : #{auto || 'non classé'})", 'Nouvelle catégorie (si « Autre »)', 'Désignation (ex. Porte orangerie 1800)', 'Réf. article', 'Appliquer à'],
        [current ? (C.category_key(current) == C::IGNORE ? IGNORE_CHOICE : C.category_key(current)) : AUTO_CHOICE, '', label_for(first).to_s, user_value(first, 'userArticleRef').to_s, 'Tous les objets de ce type'],
        [choices.join('|'), '', '', '', 'Tous les objets de ce type|La sélection seulement'],
        "Viewbox — #{selection.size} objet(s) sélectionné(s)"
      )
      return unless res
      cat = case res[0]
            when AUTO_CHOICE then nil
            when IGNORE_CHOICE then C::IGNORE
            when OTHER_CHOICE then blank?(res[1]) ? nil : C.category_key(res[1])
            else res[0]
            end
      targets = res[4] == 'La sélection seulement' ? selection : selection.map { |e| definition_of(e) }.uniq
      model.start_operation('Viewbox : catégorie', true)
      targets.each do |t|
        set_or_clear(t, 'userCategory', cat)
        set_or_clear(t, 'userLabel', res[2])
        set_or_clear(t, 'userArticleRef', res[3])
      end
      model.commit_operation
    rescue StandardError => e
      fail_with(e)
    end

    def self.fail_with(e)
      puts "[Viewbox] ERREUR : #{e.message}\n#{e.backtrace&.first(8)&.join("\n")}"
      UI.messagebox("Viewbox — erreur : #{e.message}\n\nDétails dans la console Ruby (Extensions › Developer › Ruby Console).")
    end
  end
end

require File.join(__dir__, 'review')

module Viewbox
  module Prep
    unless file_loaded?(__FILE__)
      menu = UI.menu('Extensions').add_submenu('Viewbox')
      menu.add_item('Contrôler le modèle') { control_only }
      menu.add_item('Réviser les catégories…') { show_review_dialog }
      menu.add_item('Préparer & exporter pour VEM…') { prepare_and_export }
      UI.add_context_menu_handler do |context_menu|
        model = Sketchup.active_model
        sel = model.selection.select { |e| container?(e) }
        next if sel.empty?
        context_menu.add_submenu('Viewbox').add_item('Catégorie / désignation…') { edit_selection(model, sel) }
      end
      file_loaded(__FILE__)
    end
  end
end
