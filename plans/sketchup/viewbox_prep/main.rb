# encoding: UTF-8
# Viewbox — préparation des modèles SketchUp pour VEM (partie qui utilise l'API SketchUp).
#
# Menu Extensions › Viewbox :
#   - Contrôler le modèle            : rapport seul, ne modifie rien.
#   - Réviser les catégories…        : fenêtre où l'on corrige à la main la catégorie, la désignation
#     et la réf. article de chaque type de composant, et le type / les dimensions nominales des Viewbox.
#   - Structure de la box (profils)… : profils relevés dans le composant de la box sélectionnée (rôle, section,
#     nuance à confirmer) ; exportés dans le manifest (« structures ») pour l'étude structure de VEM.
#   - Cadres textile (F1, F2…)…      : objets marqués « cadre textile » (tissu tendu), un repère F1, F2… et un visuel
#     par cadre, repris par VEM (nomenclature, planches cotées, repères sur les plans).
#   - Préparer & exporter pour VEM…  : numérote les Viewbox sans nom (VBX-01…), exporte le .dae aux
#     bons réglages + textures + manifest.json dans un .zip à déposer dans VEM.
# Clic droit sur des groupes/composants › Viewbox › Catégorie / désignation… : même correction, sur la sélection.
# Clic droit › Viewbox › C'est une Viewbox (1.5.0) : catégorie VIEWBOX, l'objet est une Viewbox quel que soit son nom ;
#   s'il contient plusieurs Viewbox (ex. un « Escalier intérieur » fait de deux Viewbox), c'est un ensemble : chacune
#   est numérotée et calculée comme une Viewbox, et toutes gardent la désignation de l'ensemble. Ce qu'elle contient
#   sans catégorie (lampes, plancher bois, escalier…) fait partie de la Viewbox (1.5.1) : rien à classer.
# Extensions › Viewbox › Retirer les catégories… (1.5.1, aussi au clic droit) : remet en automatique les catégories
#   choisies à la main, sur tout le modèle ou sur la sélection et ce qu'elle contient.
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
    VERSION = '1.5.1'.freeze
    DICT = 'viewbox'.freeze
    C = Core
    # Source de la catégorie d'un objet sans catégorie dans une Viewbox marquée « C'est une Viewbox » : il en fait partie.
    PART_SOURCE = 'partie de la Viewbox'.freeze

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

    # Catégorie déduite automatiquement : balise (tag) > nom d'instance > nom de définition ; un objet marqué
    # « cadre textile » sans autre catégorie est un « Frame extérieur » (sinon l'export le disait « non classé »).
    def self.auto_category(e)
      [[tag_name(e), 'balise'], [e.name.to_s, 'nom'], [definition_of(e).name.to_s, 'définition']].each do |name, source|
        c = C.category(name)
        return [c, source] if c
      end
      return [C::DEFAULT_FRAME_CATEGORY, 'cadre textile'] if textile_flag?(e)
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

    # Analyse du modèle. Une Viewbox (module) est : un objet nommé VBX-xx, un objet de catégorie VIEWBOX (choix manuel
    # « C'est une Viewbox »), ou — en haut du modèle — un objet d'un type de structure saisi, ou de taille standard
    # sans catégorie. Un objet qui contient des Viewbox (ex. « Escalier intérieur » = deux Viewbox) est un ensemble :
    # chacune de ses Viewbox est un module (calculé comme une Viewbox), l'ensemble garde sa désignation.
    # parents : entité → transformation monde de son parent (Viewbox et objets d'un ensemble ; absent = haut du modèle).
    # how : Viewbox → 'nom' | 'manuel' | 'type' | 'taille' | 'ensemble' (reconnue par…).
    # box_parts : objets d'un ensemble marqué « Viewbox » posés à côté de ses Viewbox (escalier, lampes…) : sans
    # catégorie, ils font partie de la Viewbox (1.5.1).
    Analysis = Struct.new(:named, :candidates, :groups_as_modules, :duplicates, :attached, :orphans, :context,
                          :common, :others, :levels, :parents, :how, :assemblies, :assembly_of, :shared, :multiples,
                          :box_parts, keyword_init: true)
    # Ensemble de Viewbox : l'objet, ses Viewbox, ses autres objets (escalier, garde-corps…).
    Assembly = Struct.new(:entity, :modules, :items, keyword_init: true)

    def self.standard_size?(e)
      a, b = plan_dims(e)
      nominal = nominal_dims(definition_of(e))
      sizes = nominal ? [nominal] : STANDARD_SIZES
      sizes.any? { |l, s| (([a, b].max - l).abs <= 150) && (([a, b].min - s).abs <= 150) }
    end

    # Hauteur (mm) d'une instance dans son propre repère.
    def self.height_mm(e)
      a = e.transformation.to_a
      mm(definition_of(e).bounds.depth) * Math.sqrt(a[8]**2 + a[9]**2 + a[10]**2)
    end

    # Catégorie VIEWBOX choisie à la main : c'est une Viewbox, quel que soit son nom.
    def self.viewbox_marked?(e)
      category_for(e).first == C::VIEWBOX
    end

    # Objet qui est une Viewbox par son nom ou son marquage (clic droit « C'est une Viewbox » / « Ce n'est pas… »).
    def self.viewbox_entity?(e)
      !C.module_id(e.name).nil? || viewbox_marked?(e)
    end

    # Corps de Viewbox dans un objet marqué « Viewbox » : type de structure saisi, ou taille standard sans catégorie
    # et toute la hauteur (≥ 2 m : un plancher ou un toit 5 900 × 2 500 n'en est pas un).
    def self.viewbox_body?(e)
      return true if module_type(definition_of(e))
      category_for(e).first.nil? && standard_size?(e) && height_mm(e) >= C::BODY_MIN_HEIGHT
    end

    # Viewbox à l'intérieur d'un objet qui n'en est pas une : [[entité, transformation monde du parent, chemin]]
    # (chemin = objets traversés depuis le haut du modèle). Explicites : nom VBX-xx ou catégorie VIEWBOX ; avec
    # implicit (objet marqué « Viewbox »), aussi les corps de Viewbox. On n'entre jamais dans une Viewbox.
    def self.inner_viewbox(e, parent_tr, implicit, depth = 0, path = [e], out = [])
      tr = parent_tr * e.transformation
      definition_of(e).entities.each do |c|
        next unless container?(c)
        next if C.context?(label(c)) || ignored?(c)
        if viewbox_entity?(c) || (implicit && viewbox_body?(c))
          out << [c, tr, path]
        elsif depth < 2
          inner_viewbox(c, tr, implicit, depth + 1, path + [c], out)
        end
      end
      out
    end

    # Les Viewbox de e si c'est un ensemble, sinon nil. Un objet marqué « Viewbox » est un ensemble s'il contient une
    # Viewbox nommée / marquée, ou au moins deux corps de Viewbox ; sinon c'est lui la Viewbox.
    def self.assembly_modules(e, parent_tr = IDENTITY)
      return nil if C.module_id(e.name) || C.common?(label(e))
      marked = viewbox_marked?(e)
      return nil unless marked || holds_viewbox?(definition_of(e))
      inner = inner_viewbox(e, parent_tr, marked)
      explicit = inner.any? { |c, _t, _p| viewbox_entity?(c) }
      explicit || (marked && inner.size >= 2) ? inner : nil
    end

    # Une définition contient-elle une Viewbox nommée / marquée (3 niveaux) ? Gardé par analyse : les gros modèles ont
    # des milliers d'objets libres, chacun aurait été parcouru.
    def self.holds_viewbox?(defn, depth = 0, cache = @holds_cache || {})
      key = [defn, depth]
      return cache[key] if cache.key?(key)
      cache[key] = defn.entities.any? do |c|
        container?(c) && !C.context?(label(c)) && !ignored?(c) && (viewbox_entity?(c) || (depth < 2 && holds_viewbox?(definition_of(c), depth + 1, cache)))
      end
    end

    # Autres objets d'un ensemble (hors de ses Viewbox) : [[entité, transformation monde du parent]].
    def self.assembly_items(e, parent_tr, modules, path_set, out = [])
      tr = parent_tr * e.transformation
      definition_of(e).entities.each do |c|
        next unless container?(c)
        next if modules.include?(c)
        if path_set[c]
          assembly_items(c, tr, modules, path_set, out)
        else
          out << [c, tr]
        end
      end
      out
    end

    def self.parent_tr(a, e)
      (a.parents && a.parents[e]) || IDENTITY
    end

    def self.world_tr(a, e)
      parent_tr(a, e) * e.transformation
    end

    def self.world_bounds(a, e)
      world_bbox(e, parent_tr(a, e))
    end

    def self.analyze(model)
      @holds_cache = {} # le temps de cette analyse seulement (les marquages changent ensuite)
      analyze_model(model)
    ensure
      @holds_cache = nil
    end

    def self.analyze_model(model)
      tops = model.entities.select { |e| container?(e) }
      context = tops.select { |e| C.context?(label(e)) || ignored?(e) }
      rest = tops - context
      named = []
      candidates = []
      parents = {}
      how = {}
      assemblies = []
      assembly_of = {}
      shared = []
      seen = {}
      free = []
      loose = []
      add = lambda do |m, ptr, kind, path|
        # même objet atteint deux fois : composant d'ensemble utilisé plusieurs fois (rendu unique à l'export)
        if seen[m]
          shared << { module: m, path: path }
          return false
        end
        seen[m] = true
        parents[m] = ptr unless path.empty?
        how[m] = kind
        (C.module_id(m.name) ? named : candidates) << m
        true
      end
      add_assembly = lambda do |e, inner|
        asm = Assembly.new(entity: e, modules: [], items: [])
        inner.each do |c, ptr, path|
          kind = C.module_id(c.name) ? 'nom' : viewbox_marked?(c) ? 'manuel' : 'ensemble'
          next unless add.call(c, ptr, kind, path)
          asm.modules << c
          assembly_of[c] = asm
        end
        path_set = {}
        inner.each { |_c, _t, path| path.drop(1).each { |p| path_set[p] = true } }
        assembly_items(e, IDENTITY, inner.map(&:first), path_set).each do |c, ptr|
          next if seen[c]
          seen[c] = true
          parents[c] = ptr
          asm.items << c
          loose << c
        end
        assemblies << asm
      end
      # ordre : nom VBX-xx (on n'entre pas dedans), marquée « Viewbox » (ensemble si elle en contient), candidate par
      # son type ou sa taille (comme avant 1.5.0 : son corps éventuellement marqué en est une pièce), puis objet qui
      # contient des Viewbox nommées / marquées
      rest.each do |e|
        if C.module_id(e.name)
          add.call(e, IDENTITY, 'nom', [])
        elsif viewbox_marked?(e)
          inner = assembly_modules(e)
          inner ? add_assembly.call(e, inner) : add.call(e, IDENTITY, 'manuel', [])
        elsif !C.common?(label(e)) && (module_type(definition_of(e)) || (category_for(e).first.nil? && standard_size?(e)))
          add.call(e, IDENTITY, module_type(definition_of(e)) ? 'type' : 'taille', [])
        elsif (inner = assembly_modules(e))
          add_assembly.call(e, inner)
        else
          free << e
        end
      end
      modules = named + candidates
      ids = named.map { |e| C.module_id(e.name) }
      duplicates = ids.group_by { |x| x }.select { |_, v| v.size > 1 }.keys
      boxes = modules.map { |m| bbox_mm(world_bbox(m, parents[m] || IDENTITY)) }
      common = free.select { |e| C.common?(label(e)) }
      others = free - common
      attached = others.select do |e|
        min, max = bbox_mm(e.bounds)
        boxes.any? { |bmin, bmax| C.center_inside?(min, max, bmin, bmax) }
      end
      orphans = (others - attached).select { |e| C::ACCESSORY_CATEGORIES.include?(category_for(e).first) }
      # objets d'un ensemble : contexte / ignorés à part, éléments communs, sinon posés sur ses Viewbox
      loose_context = loose.select { |e| C.context?(label(e)) || ignored?(e) }
      loose_common = (loose - loose_context).select { |e| C.common?(label(e)) }
      # ceux d'un ensemble marqué « Viewbox » font partie de la Viewbox
      box_parts = {}
      assemblies.select { |x| viewbox_marked?(x.entity) }.each { |x| (x.items - loose_context - loose_common).each { |e| box_parts[e] = true } }
      zs = modules.map { |e| mm(world_bbox(e, parents[e] || IDENTITY).min.z) }
      levels = modules.zip(C.group_levels(zs)).to_h
      # Viewbox marquée d'un seul bloc qui en fait plusieurs (ex. deux Viewbox superposées) : calculée comme une seule
      multiples = modules.select { |m| how[m] == 'manuel' }.filter_map do |m|
        nominal = nominal_dims(definition_of(m))
        n = C.viewbox_count(*plan_dims(m), height_mm(m), **(nominal ? { long: nominal[0], short: nominal[1] } : {}))
        n.reduce(:*) > 1 ? [m, n] : nil
      end
      Analysis.new(named: named, candidates: candidates, groups_as_modules: modules.select { |e| e.is_a?(Sketchup::Group) },
                   duplicates: duplicates, attached: attached + (loose - loose_context - loose_common), orphans: orphans,
                   context: context + loose_context, common: common + loose_common, others: others - attached - orphans,
                   levels: levels, parents: parents, how: how, assemblies: assemblies, assembly_of: assembly_of,
                   shared: shared, multiples: multiples, box_parts: box_parts)
    end

    # Viewbox marquée à la main (catégorie VIEWBOX), seule ou dans un ensemble marqué (même numérotée VBX-xx depuis) :
    # ce qu'elle contient sans catégorie fait partie de la Viewbox — lampes, plancher bois, escalier… —, rien à classer.
    def self.marked_box?(a, m)
      return true if viewbox_marked?(m)
      asm = a.assembly_of && a.assembly_of[m]
      !asm.nil? && viewbox_marked?(asm.entity)
    end

    # Catégorie d'un objet hors des Viewbox (libre, commun, objet d'un ensemble) : un objet sans catégorie d'un ensemble
    # marqué « Viewbox » fait partie de la Viewbox.
    def self.item_category(a, e)
      cat = category_for(e)
      cat.first.nil? && a.box_parts && a.box_parts[e] ? [C::VIEWBOX, PART_SOURCE] : cat
    end

    # Désignation d'un ensemble : saisie, sinon son nom (nom d'instance, ou de composant ; un groupe sans nom n'en a pas).
    def self.assembly_label(e)
      own = label_for(e)
      return own if own
      return e.name.to_s.strip unless e.name.to_s.strip.empty? || C.module_id(e.name)
      definition_of(e).group? ? nil : definition_of(e).name.to_s
    end

    # Désignation d'une Viewbox : saisie, sinon celle de son ensemble, sinon — Viewbox marquée — le nom de son
    # composant quand il dit ce que c'est (« Escalier intérieur » : catégorie reconnue dans le nom).
    def self.module_label(a, m)
      own = label_for(m)
      return own if own
      asm = a.assembly_of && a.assembly_of[m]
      return assembly_label(asm.entity) if asm
      return nil unless a.how && a.how[m] == 'manuel'
      d = definition_of(m)
      return nil if d.group? || C.module_id(d.name)
      C.category(d.name) ? d.name.to_s : nil
    end

    # Composants d'ensemble utilisés plusieurs fois : chaque exemplaire est rendu unique (copie du composant) pour que
    # ses Viewbox aient leurs propres numéros ; une copie garde les noms VBX-xx de l'original, ils sont retirés pour être
    # renumérotés. Retourne [analyse à jour, nombre de copies].
    def self.make_assemblies_unique(model, a)
      made = 0
      20.times do
        break if a.shared.empty?
        target = a.shared.first[:path].find { |c| definition_of(c).instances.size > 1 && c.respond_to?(:make_unique) }
        break unless target
        target.make_unique
        made += 1
        # la copie garde les noms VBX-xx de l'original : ses Viewbox sont renumérotées
        inner_viewbox(target, IDENTITY, true).each { |m, _t, _p| m.name = '' if C.module_id(m.name) }
        a = analyze(model)
      end
      [a, made]
    end

    def self.classified_inside?(defn)
      defn.entities.any? { |c| container?(c) && (!category_for(c).first.nil? || textile_marked?(c)) } || contains_textile?(defn, @textile_cache ||= {})
    end

    # Parcourt les objets d'un module : yield(entité, catégorie, source, transformation monde du parent).
    # Un groupe non classé qui contient des objets classés est "ouvert" ; les objets ignorés sont sautés.
    # part : Viewbox marquée « C'est une Viewbox » (marked_box?) — un objet sans catégorie en fait partie (VIEWBOX).
    def self.each_item(entities, parent_tr, depth = 0, part: false, &block)
      @textile_cache = {} if depth.zero? # cadres textile cherchés une fois par parcours
      entities.each do |e|
        next unless container?(e)
        cat, source = category_for(e)
        next if cat == C::IGNORE
        # un cadre textile est toujours un objet à part dans le manifest (son repère F1… le suit dans VEM)
        if cat || textile_marked?(e)
          yield(e, cat, source, parent_tr)
        elsif depth < 3 && classified_inside?(definition_of(e))
          each_item(definition_of(e).entities, parent_tr * e.transformation, depth + 1, part: part, &block)
        elsif part
          yield(e, C::VIEWBOX, PART_SOURCE, parent_tr)
        else
          yield(e, nil, nil, parent_tr)
        end
      end
    end

    def self.unclassified_types(model, a)
      types = {}
      (a.named + a.candidates).map { |m| [definition_of(m), marked_box?(a, m)] }.uniq.each do |d, part|
        each_item(d.entities, IDENTITY, part: part) { |e, cat, _s, _t| types[definition_of(e)] = true if cat.nil? }
      end
      (a.attached + a.others).each { |e| types[definition_of(e)] = true if item_category(a, e).first.nil? }
      types.size
    end

    IDENTITY = Geom::Transformation.new

    def self.report_lines(a)
      lines = []
      lines << "Viewbox nommées (VBX-xx) : #{a.named.size}"
      lines << "Viewbox à nommer (reconnues à leur taille, à leur type ou marquées « Viewbox ») : #{a.candidates.size}" if a.candidates.any?
      marked = (a.named + a.candidates).count { |m| %w[manuel ensemble].include?(a.how[m]) || a.assembly_of[m] || marked_box?(a, m) }
      parts =(a.named + a.candidates).count { |m| marked_box?(a, m) }
      if marked > 0
        lines << "dont Viewbox marquées à la main ou dans un ensemble : #{marked}" \
                 "#{parts > 0 ? " — ce qu'elles contiennent sans catégorie (lampes, plancher, escalier…) fait partie de la Viewbox, rien à classer" : ''}"
      end
      a.assemblies.select { |x| x.modules.any? }.each do |x|
        ids = x.modules.map { |m| C.module_id(m.name) || 'à numéroter' }
        lines << "Ensemble « #{assembly_label(x.entity) || label(x.entity)} » : #{x.modules.size} Viewbox (#{ids.join(', ')}), calculées chacune comme une Viewbox" \
                 "#{x.items.any? ? " + #{x.items.size} objet(s)" : ''}"
      end
      a.shared.map { |sh| sh[:path].first }.uniq.each do |top|
        lines << "⚠ « #{label(top)} » contient des Viewbox et son composant est utilisé plusieurs fois : chaque exemplaire sera rendu unique à l'export pour numéroter ses Viewbox"
      end
      a.multiples.each do |m, (plan, high)|
        l, w = plan_dims(m).map(&:round)
        lines << "⚠ « #{module_label(a, m) || label(m)} » est marquée Viewbox mais mesure #{l} × #{w} × #{height_mm(m).round} mm : " \
                 "elle fait sans doute #{plan * high} Viewbox (#{plan > 1 ? "#{plan} en plan" : ''}#{plan > 1 && high > 1 ? ', ' : ''}#{high > 1 ? "#{high} niveaux" : ''}) " \
                 "d'un seul bloc et sera calculée comme UNE Viewbox. Ouvre-la et fais un composant par Viewbox (ou mets-y les composants Viewbox), puis marque l'ensemble « C'est une Viewbox »."
      end
      lines << "Niveaux : #{a.levels.values.uniq.size}" if a.levels.any?
      lines << "⚠ Noms de Viewbox en double : #{a.duplicates.join(', ')}" if a.duplicates.any?
      if a.groups_as_modules.any?
        lines << "⚠ #{a.groups_as_modules.size} Viewbox sont des groupes (conseillé : composants — clic droit › Convertir en composant) : #{a.groups_as_modules.map { |e| label(e) }.first(10).join(', ')}"
      end
      lines << "Objets posés sur une Viewbox (rattachés par leur position) : #{a.attached.size}" if a.attached.any?
      lines << "⚠ Accessoires hors de toute Viewbox : #{a.orphans.map { |e| label(e) }.uniq.first(10).join(', ')}" if a.orphans.any?
      modified = (a.named + a.candidates).count { |m| C.parse_struct(m.get_attribute(DICT, 'structParams')) }
      lines << "Viewbox modifiées (Structure…) : #{modified}" if modified > 0
      lines << "Éléments communs (COMMUN_) : #{a.common.size}"
      lines << "Contexte / ignorés (non exportés) : #{a.context.size}"
      lines << "Autres objets libres : #{a.others.map { |e| label(e) }.uniq.first(10).join(', ')}" if a.others.any?
      lines << '✗ Aucune Viewbox trouvée : nomme chaque Viewbox VBX-01, VBX-02… (Infos sur l\'entité › Nom d\'instance), ou clic droit › Viewbox › C\'est une Viewbox.' if a.named.empty? && a.candidates.empty?
      lines
    end

    def self.control_only
      model = Sketchup.active_model
      a = analyze(model)
      n = unclassified_types(model, a)
      frames = (a.named + a.candidates).map { |m| definition_of(m) }.uniq.flat_map { |d| frame_report_lines(d) }
      text = (report_lines(a) + frames + textile_report_lines(model, a)).join("\n")
      text += "\n\nTypes de composants non classés : #{n} (Extensions › Viewbox › Réviser les catégories…)" if n > 0
      puts "[Viewbox] Contrôle du modèle\n#{text}"
      UI.messagebox("Viewbox #{VERSION} — contrôle du modèle\n\n#{text}")
    rescue StandardError => e
      fail_with(e)
    end

    # ─── Préparation (modifie le modèle, annulable en une fois avec Ctrl+Z) ───

    # Numérote les Viewbox sans nom (triées par niveau, puis X, puis Y) et note leur n° et niveau en attribut.
    # Un ensemble de Viewbox dont le composant est utilisé plusieurs fois est d'abord rendu unique (une copie par
    # exemplaire) : sinon ses Viewbox, dans la définition partagée, auraient le même nom partout.
    def self.prepare(model, a)
      renamed = 0
      model.start_operation('Viewbox : préparer pour VEM', true)
      begin
        a, @uniqued = make_assemblies_unique(model, a)
        used = a.named.map { |e| C.module_id(e.name)[/\d+/].to_i }
        sorted = a.candidates.sort_by { |e| b = world_bounds(a, e); [a.levels[e] || 0, b.min.x.to_f, b.min.y.to_f] }
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
      # cadres textile (repère F1… et visuel par cadre ; un cadre du composant de la box a les siens dans chaque box)
      textile = textile_manifest(model, a)
      entry = lambda do |e, cat, source, parent_tr, owner = nil|
        export_name, original = namer.call(e)
        h = {
          'exportName' => export_name, 'name' => original, 'category' => cat, 'categorySource' => source,
          'label' => label_for(e), 'tag' => tag_name(e), 'definition' => definition_of(e).name.to_s,
          'articleRef' => article_for(e), 'materials' => materials_of(e), 'bboxWorld' => bbox_json(world_bbox(e, parent_tr))
        }
        tf = textile[[owner, e]] || textile[[nil, e]]
        h['textileFrame'] = tf if tf
        h
      end
      modules = (a.named + a.candidates).select { |m| C.module_id(m.name) }
      # désignations lues avant les noms techniques de l'export (celle d'un ensemble vient de son nom)
      module_labels = modules.to_h { |m| [m, module_label(a, m)] }
      # ensembles de Viewbox (ex. « Escalier intérieur »)
      asm_rows = a.assemblies.select { |x| x.modules.any? { |m| modules.include?(m) } }.map do |x|
        lbl = assembly_label(x.entity)
        export_name, original = namer.call(x.entity)
        [x, {
          'exportName' => export_name, 'name' => original, 'label' => lbl, 'definition' => definition_of(x.entity).name.to_s,
          'category' => category_for(x.entity).first, 'modules' => x.modules.map { |m| C.module_id(m.name) }.compact,
          'bboxWorld' => bbox_json(x.entity.bounds)
        }]
      end.to_h
      # structure dessinée de chaque définition de module (relevée avant tout renommage technique)
      structures = {}
      modules.map { |m| definition_of(m) }.uniq.each do |d|
        s = drawn_structure(d)
        structures[d.name.to_s] = s if s
      end
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
        'structSchemaVersion' => 1,
        'frameSchemaVersion' => 1,
        'textileSchemaVersion' => 1,
        'structures' => structures,
        'modules' => modules.map do |m|
          defn = definition_of(m)
          wtr = world_tr(a, m)
          tr = wtr.to_a.each_with_index.map { |v, i| [12, 13, 14].include?(i) ? (v * C::MM_PER_INCH).round(3) : v.round(9) }
          items = []
          each_item(defn.entities, wtr, part: marked_box?(a, m)) { |e, cat, source, parent_tr| items << entry.call(e, cat, source, parent_tr, m) }
          asm = a.assembly_of[m] && asm_rows[a.assembly_of[m]]
          {
            'id' => C.module_id(m.name), 'definition' => defn.name.to_s, 'tag' => tag_name(m), 'level' => a.levels[m] || 0,
            'type' => module_type(defn), 'nominalPlanMm' => nominal_dims(defn),
            'transform' => tr, 'bboxWorld' => bbox_json(world_bounds(a, m)), 'accessories' => items,
            # désignation (ex. « Escalier intérieur ») ; reconnue par son nom / marquée à la main / dans un ensemble…
            'label' => module_labels[m], 'viewboxBy' => a.how[m],
            # ensemble dont elle fait partie (clé exportName de « assemblies »)
            'assembly' => asm ? asm['exportName'] : nil,
            # Viewbox modifiée (« Structure… ») : attribut de l'instance, seulement les valeurs hors standard
            'structParams' => C.parse_struct(m.get_attribute(DICT, 'structParams')),
            # structure dessinée dans le composant (« structures » ci-dessus) et choix « gabarit / dessinée »
            'structureRef' => structures.key?(defn.name.to_s) ? defn.name.to_s : nil,
            'structSource' => struct_source(defn)
          }
        end,
        'common' => (a.common + a.attached + a.orphans + a.others).map do |e|
          cat, source = item_category(a, e)
          entry.call(e, cat, source, parent_tr(a, e))
        end,
        # ensembles de Viewbox : un objet qui contient plusieurs Viewbox (chacune est un module ci-dessus)
        'assemblySchemaVersion' => 1,
        'assemblies' => asm_rows.values,
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

    # Sort de l'édition d'un composant (les positions lues pendant l'édition seraient dans le repère du composant ouvert).
    def self.close_edit(model)
      10.times do
        break unless model.respond_to?(:active_path) && model.active_path
        break unless model.close_active
      end
    end

    def self.prepare_and_export
      model = Sketchup.active_model
      close_edit(model)
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
      uniq_text = @uniqued.to_i > 0 ? " · ensembles rendus uniques : #{@uniqued}" : ''

      start_dir = model.path.to_s.empty? ? Dir.home : File.dirname(model.path)
      dir = UI.select_directory(title: 'Dossier où enregistrer le .zip pour VEM', directory: start_dir)
      return unless dir

      title = model.title.to_s.empty? ? 'modele' : model.title
      base = "#{C.safe_file_name(title)}_VEM_#{Time.now.strftime('%Y%m%d-%H%M')}"
      zip_path = File.join(dir, "#{base}.zip")
      Sketchup.status_text = 'Viewbox : export .dae en cours…'
      count, manifest = export_zip(model, a, zip_path, base)
      all_items = manifest['modules'].flat_map { |m| m['accessories'] } + manifest['common']
      manual = all_items.count { |x| x['categorySource'] == 'manuel' }
      box_parts = all_items.count { |x| x['categorySource'] == PART_SOURCE }
      uniq_text += " · objets qui font partie d'une Viewbox marquée : #{box_parts}" if box_parts > 0
      report = ["Export VEM — #{Time.now.strftime('%d/%m/%Y %H:%M')}", "Fichier : #{zip_path} (#{count} fichiers)",
                "Viewbox numérotées : #{renamed_modules} · objets avec un choix manuel : #{manual}#{uniq_text}", '', *report_lines(a)].join("\n")
      File.write(File.join(dir, "#{base}_rapport.txt"), report)
      puts "[Viewbox] #{report}"
      UI.messagebox("✓ Export terminé (extension Viewbox #{VERSION})\n\n#{zip_path}\n\nDépose ce .zip (et lui seul) dans les fichiers du projet VEM, puis ouvre Plans Viewbox.\n\n" \
                    "Viewbox numérotées : #{renamed_modules} · objets avec un choix manuel : #{manual}#{uniq_text}")
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
      # Viewbox (nommée VBX-xx, ou marquée « Viewbox » et qui n'est pas un ensemble) : désignation et type de structure
      if selection.all? { |e| C.module_id(e.name) || (viewbox_marked?(e) && !assembly_modules(e)) }
        d = definition_of(first)
        nominal = nominal_dims(d) || plan_dims(first).map(&:round)
        src_labels = C::STRUCT_SOURCES.map { |k| C::STRUCT_SOURCE_LABELS[k] }
        res = UI.inputbox(['Désignation (ex. Escalier intérieur)', 'Type de structure (ex. Viewbox 5900, Box concurrent 6 m)', 'Dimension nominale longue (mm)', 'Dimension nominale courte (mm)', 'Structure'],
                          [label_for(first).to_s, module_type(d).to_s, nominal[0].to_s, nominal[1].to_s, C::STRUCT_SOURCE_LABELS[struct_source(d) || 'template']],
                          ['', '', '', '', src_labels.join('|')], 'Viewbox — désignation et type de structure (tous les objets de ce type)')
        return unless res
        model.start_operation('Viewbox : type de structure', true)
        selection.each { |e| e.delete_attribute(DICT, 'userLabel') if e.get_attribute(DICT, 'userLabel') } # la valeur du type s'applique
        selection.map { |e| definition_of(e) }.uniq.each do |defn|
          set_or_clear(defn, 'userLabel', res[0])
          set_or_clear(defn, 'moduleType', res[1])
          set_or_clear(defn, 'nominalLong', res[2].to_f > 0 ? res[2].to_f.round.to_s : nil)
          set_or_clear(defn, 'nominalShort', res[3].to_f > 0 ? res[3].to_f.round.to_s : nil)
          set_or_clear(defn, 'structSource', C::STRUCT_SOURCES.find { |k| C::STRUCT_SOURCE_LABELS[k] == res[4] })
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

    # ─── Clic droit : « C'est une Viewbox » / « Ce n'est pas une Viewbox » ───

    # Ce que devient chaque objet marqué (pour le message) : ensemble, Viewbox, ou rien (dans une autre Viewbox).
    def self.viewbox_status_lines(model, selection)
      a = analyze(model)
      selection.map do |e|
        name = label_for(e) || label(e)
        asm = a.assemblies.find { |x| x.entity == e }
        if asm
          ids = asm.modules.map { |m| C.module_id(m.name) || 'à numéroter' }
          "« #{name} » contient #{asm.modules.size} Viewbox (#{ids.join(', ')}) : chacune est calculée comme une Viewbox, " \
            "et elles s'affichent « #{assembly_label(e) || name} »."
        elsif (a.named + a.candidates).include?(e)
          multi = a.multiples.find { |m, _| m == e }
          line = "« #{name} » est une Viewbox#{C.module_id(e.name) ? " (#{C.module_id(e.name)})" : ', numérotée VBX-xx à l\'export'}" \
                 "#{module_label(a, e) ? ", désignation « #{module_label(a, e)} »" : ''}."
          line += "\n⚠ D'un seul bloc, elle semble faire #{multi[1].reduce(:*)} Viewbox : ouvre-la et fais un composant par Viewbox pour qu'elle soit calculée comme #{multi[1].reduce(:*)} Viewbox." if multi
          line
        else
          host = (a.named + a.candidates).find { |m| definition_of(m).entities.include?(e) }
          host ? "« #{name} » est à l'intérieur de la Viewbox #{C.module_id(host.name) || label(host)} : elle en fait partie (ce n'est pas une Viewbox de plus)." : "« #{name} » : catégorie VIEWBOX enregistrée."
        end
      end
    end

    # « C'est une Viewbox » : catégorie VIEWBOX sur le type de composant (tous ses exemplaires) ; un choix individuel
    # contraire posé sur l'objet est retiré. Un objet qui contient plusieurs Viewbox devient un ensemble.
    def self.mark_viewbox(model, selection)
      model.start_operation('Viewbox : c’est une Viewbox', true)
      selection.each do |e|
        e.delete_attribute(DICT, 'userCategory') if e.get_attribute(DICT, 'userCategory')
        definition_of(e).set_attribute(DICT, 'userCategory', C::VIEWBOX)
      end
      model.commit_operation
      selection.size
    end

    # « Ce n'est pas une Viewbox » : retire la catégorie VIEWBOX (objet et type) et, après confirmation, le nom VBX-xx
    # (de l'objet et des Viewbox d'un ensemble). Retourne les objets encore reconnus comme Viewbox (taille, type).
    def self.unmark_viewbox(model, selection, clear_names: nil)
      named = selection.select { |e| C.module_id(e.name) }
      selection.each do |e|
        inner = assembly_modules(e)
        named.concat(inner.map(&:first).select { |m| C.module_id(m.name) }) if inner
      end
      named.uniq!
      if clear_names.nil? && named.any?
        clear_names = UI.messagebox("Retirer aussi le numéro de #{named.map { |m| C.module_id(m.name) }.join(', ')} ?", MB_YESNO) == IDYES
      end
      model.start_operation('Viewbox : ce n’est pas une Viewbox', true)
      selection.each do |e|
        [e, definition_of(e)].each { |t| t.delete_attribute(DICT, 'userCategory') if C.category_key(t.get_attribute(DICT, 'userCategory').to_s) == C::VIEWBOX }
      end
      named.each { |m| m.name = '' } if clear_names
      model.commit_operation
      a = analyze(model)
      selection.select { |e| (a.named + a.candidates).include?(e) || a.assemblies.any? { |x| x.entity == e } }
    end

    # ─── « Retirer les catégories » : remettre en automatique (tout le modèle, ou la sélection) ───

    CLEAR_WHERE = ['Tout le modèle', 'La sélection et tout ce qu’elle contient'].freeze
    CLEAR_WHAT = ['Les catégories choisies à la main (garder « C’est une Viewbox » et les cadres textile)',
                  'Toutes, y compris « C’est une Viewbox » et les cadres textile'].freeze
    CLEAR_LABELS = ['Les garder', 'Les retirer aussi'].freeze

    # Objets et types (définitions) concernés : [objets, définitions]. Tout le modèle (y compris les composants pas
    # posés), ou les objets donnés et tout ce qu'ils contiennent (à toute profondeur).
    def self.clear_targets(model, roots = nil)
      unless roots
        defs = model.definitions.to_a
        insts = model.entities.select { |e| container?(e) } + defs.flat_map { |d| d.entities.select { |c| container?(c) } }
        return [insts.uniq, defs]
      end
      defs = {}
      insts = []
      stack = roots.select { |e| container?(e) }
      until stack.empty?
        e = stack.pop
        insts << e
        d = definition_of(e)
        next if defs[d]
        defs[d] = true
        d.entities.each { |c| stack << c if container?(c) }
      end
      [insts.uniq, defs.keys]
    end

    # Retire les choix manuels (catégorie, dont « Ignorer ») : tout redevient automatique (balise / nom). everything :
    # aussi « C'est une Viewbox » (catégorie VIEWBOX) et les cadres textile (catégorie Frame + marque) ; labels : aussi
    # les désignations et réf. articles. Numéros VBX-xx, types de structure, dimensions nominales et repères F1… ne
    # changent pas. Une seule opération (Ctrl+Z). Retourne { 'types', 'objects', 'values' } (ce qui a été retiré).
    def self.clear_categories(model, roots: nil, everything: false, labels: false)
      insts, defs = clear_targets(model, roots)
      keys = labels ? %w[userCategory userLabel userArticleRef] : %w[userCategory]
      keys += ['textileFrame'] if everything
      kept = ->(key, value) { key == 'userCategory' && !everything && ([C::VIEWBOX] + C::FRAME_CATEGORIES).include?(C.category_key(value)) }
      count = { 'types' => 0, 'objects' => 0, 'values' => 0 }
      model.start_operation('Viewbox : retirer les catégories', true)
      begin
        [[defs, 'types'], [insts, 'objects']].each do |list, kind|
          list.each do |t|
            n = 0
            keys.each do |key|
              v = t.get_attribute(DICT, key)
              next if v.nil? || kept.call(key, v.to_s)
              t.delete_attribute(DICT, key)
              n += 1
            end
            next if n.zero?
            count[kind] += 1
            count['values'] += n
          end
        end
        model.commit_operation
      rescue StandardError
        model.abort_operation
        raise
      end
      count
    end

    # Fenêtre « Retirer les catégories » ; from_selection : ouverte par le clic droit (la sélection proposée d'abord).
    def self.clear_categories_dialog(model, selection = [], from_selection: false)
      sel = selection.select { |e| container?(e) }
      wheres = sel.empty? ? [CLEAR_WHERE[0]] : CLEAR_WHERE
      res = UI.inputbox(['Où', 'Catégories à retirer', 'Désignations et réf. articles'],
                        [from_selection && sel.any? ? CLEAR_WHERE[1] : CLEAR_WHERE[0], CLEAR_WHAT[0], CLEAR_LABELS[0]],
                        [wheres.join('|'), CLEAR_WHAT.join('|'), CLEAR_LABELS.join('|')],
                        'Viewbox — retirer les catégories (tout remettre en automatique)')
      return unless res
      everything = res[1] == CLEAR_WHAT[1]
      n = clear_categories(model, roots: res[0] == CLEAR_WHERE[1] ? sel : nil, everything: everything, labels: res[2] == CLEAR_LABELS[1])
      text =
        if n['values'].zero?
          'Rien à retirer : aucune catégorie choisie à la main ici.'
        else
          "✓ #{n['values']} choix retiré(s) sur #{n['types']} type(s) de composants et #{n['objects']} objet(s).\n\n" \
            "Tout est de nouveau en automatique (catégorie lue dans la balise ou le nom, objets « Ignorer » de nouveau exportés)." \
            "#{everything ? '' : "\n« C’est une Viewbox » et les cadres textile sont gardés."}\n" \
            "Les numéros VBX-xx, types de structure et repères F1… ne changent pas.\n\nAnnulable avec Ctrl+Z."
        end
      UI.messagebox("Viewbox — retirer les catégories\n\n#{text}")
      n
    rescue StandardError => e
      fail_with(e)
    end

    # Structure d'une ou plusieurs Viewbox (attribut d'instance : deux instances d'un même composant peuvent différer).
    # Seules les valeurs hors standard sont gardées ; VEM les reprend sans poser de question.
    def self.edit_structure(model, selection)
      mods = selection.select { |e| C.module_id(e.name) || (viewbox_marked?(e) && !assembly_modules(e)) || standard_size?(e) }
      if mods.empty?
        UI.messagebox('Viewbox — structure : sélectionne une ou plusieurs Viewbox (VBX-xx).')
        return
      end
      cur = C.parse_struct(mods.first.get_attribute(DICT, 'structParams')) || {}
      secs = cur['sections'] || {}
      grades = cur['grades'] || {}
      list = lambda do |slot|
        here = C.struct_section_text(secs[slot])
        ([C::STANDARD] + C.struct_choices(slot) + [here]).uniq.join('|')
      end
      prompts = ['Hauteur des poteaux (mm, standard 3080)'] + C::STRUCT_SLOTS.map { |s| C::STRUCT_SLOT_LABELS[s] } +
                ['Nuance des rives', 'Nuance des poteaux', 'Contreplaqué du plancher (mm)', 'Action']
      defaults = [(cur['topZ'] || C::STANDARD_TOP_Z).to_s] + C::STRUCT_SLOTS.map { |s| C.struct_section_text(secs[s]) } +
                 [grades['rim-floor'] || C::STANDARD, grades['column'] || C::STANDARD, (cur['plywood'] || C::STANDARD_PLYWOOD).to_s, 'Enregistrer']
      lists = [''] + C::STRUCT_SLOTS.map { |s| list.call(s) } +
              [([C::STANDARD] + C::GRADES).join('|'), ([C::STANDARD] + C::GRADES).join('|'), '18|21|24|27|30', 'Enregistrer|Rétablir les valeurs standard']
      res = UI.inputbox(prompts, defaults, lists, "Viewbox — structure de #{mods.size} Viewbox (#{C.struct_summary(C.parse_struct(mods.first.get_attribute(DICT, 'structParams')))})")
      return unless res
      params = nil
      unless res.last == 'Rétablir les valeurs standard'
        values = {
          'topZ' => res[0],
          'sections' => C::STRUCT_SLOTS.each_with_index.to_h { |s, i| [s, res[1 + i]] },
          'grades' => { 'rim-floor' => res[6], 'rim-roof' => res[6], 'column' => res[7] }.reject { |_, g| g == C::STANDARD },
          'plywood' => res[8]
        }
        params = C.struct_params(values)
      end
      model.start_operation('Viewbox : structure', true)
      mods.each { |m| set_or_clear(m, 'structParams', params ? JSON.generate(params) : nil) }
      model.commit_operation
      UI.messagebox("#{mods.map { |m| label(m) }.join(', ')} : #{C.struct_summary(params)}.\n\nVEM reprend ces paramètres dans l'étude structure (onglet Variantes, origine « SketchUp »).")
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
require File.join(__dir__, 'frame')
require File.join(__dir__, 'textile')

module Viewbox
  module Prep
    unless file_loaded?(__FILE__)
      menu = UI.menu('Extensions').add_submenu('Viewbox')
      menu.add_item('Contrôler le modèle') { control_only }
      menu.add_item('Réviser les catégories…') { show_review_dialog }
      menu.add_item('Retirer les catégories (tout en automatique)…') { clear_categories_dialog(Sketchup.active_model, Sketchup.active_model.selection.to_a) }
      menu.add_item('Préparer & exporter pour VEM…') { prepare_and_export }
      menu.add_item('Structure des Viewbox sélectionnées…') { edit_structure(Sketchup.active_model, Sketchup.active_model.selection.select { |e| container?(e) }) }
      menu.add_item('Structure de la box (profils)…') { show_frame_dialog }
      menu.add_item('Cadres textile (F1, F2…)…') { show_textile_dialog }
      UI.add_context_menu_handler do |context_menu|
        model = Sketchup.active_model
        sel = model.selection.select { |e| container?(e) }
        next if sel.empty?
        sub = context_menu.add_submenu('Viewbox')
        sub.add_item('Catégorie / désignation…') { edit_selection(model, sel) }
        sub.add_item('Retirer les catégories (et de ce qu’il contient)…') { clear_categories_dialog(model, sel, from_selection: true) }
        # Viewbox quel que soit son nom (ex. « Escalier intérieur » : calculée comme une Viewbox, ou comme les Viewbox
        # qu'elle contient), catégorie VIEWBOX
        if sel.all? { |e| viewbox_entity?(e) }
          sub.add_item('Ce n’est pas une Viewbox') do
            still = unmark_viewbox(model, sel)
            if still.any?
              UI.messagebox("#{still.map { |e| label(e) }.uniq.first(5).join(', ')} : encore reconnue(s) comme Viewbox (taille standard, type de structure ou Viewbox à l'intérieur).\n\n" \
                            'Donne-lui une autre catégorie (Catégorie / désignation…) pour qu\'elle ne soit plus une Viewbox.')
            end
          rescue StandardError => e
            fail_with(e)
          end
        else
          sub.add_item('C’est une Viewbox') do
            mark_viewbox(model, sel)
            UI.messagebox("Viewbox — catégorie VIEWBOX\n\n#{viewbox_status_lines(model, sel).join("\n\n")}\n\n" \
                          "Ce qu'elle contient sans catégorie (lampes, plancher bois, escalier…) fait partie de la Viewbox : rien à classer.\n\n" \
                          'Désignation : clic droit › Viewbox › Catégorie / désignation…')
          rescue StandardError => e
            fail_with(e)
          end
        end
        marked = sel.all? { |e| textile_marked?(e) }
        [['FRAME-EXTERIEUR', 'extérieur'], ['FRAME-INTERIEUR', 'intérieur']].each do |place, word|
          next if marked && sel.all? { |e| textile_place(e) == place }
          sub.add_item(marked ? "Cadre textile #{word}" : "Marquer comme cadre textile #{word} (F1, F2…)") do
            n = mark_textile(model, sel, true, place)
            UI.messagebox("#{n} cadre(s) textile #{word}(s) marqué(s) et numéroté(s).\n\nExtensions › Viewbox › Cadres textile… pour voir / changer les repères et saisir le visuel de chaque cadre.") unless marked
          rescue StandardError => e
            fail_with(e)
          end
        end
        sub.add_item('Ce n’est pas un cadre textile') { mark_textile(model, sel, false) } if marked
        sub.add_item('Cadres textile (F1, F2…)…') { show_textile_dialog(model) }
        if sel.all? { |e| viewbox_entity?(e) || standard_size?(e) || module_type(definition_of(e)) }
          sub.add_item('Structure (hauteur, profils, nuances)…') { edit_structure(model, sel) }
          sub.add_item('Structure de la box (profils)…') { show_frame_dialog(model, sel) }
        end
      end
      file_loaded(__FILE__)
    end
  end
end
