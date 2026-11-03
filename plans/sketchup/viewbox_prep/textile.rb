# encoding: UTF-8
# Viewbox — cadres textile (tissu tendu, SEG) : on dit dans SketchUp « ceci est un cadre », chaque cadre reçoit son
# repère F1, F2, F3… (un par cadre : chaque impression est différente) et son visuel ; VEM les reprend tels quels
# (nomenclature, planches cotées, repères sur les vues).
#
# Où sont rangées les données :
#   - la marque « cadre textile » : attribut de l'objet (« textileFrame »), ou de sa définition pour tous les objets
#     de ce type ;
#   - le repère et le visuel d'un cadre posé à côté des box (objet unique) : attributs de l'objet ;
#   - le repère et le visuel d'un cadre dessiné DANS le composant de la box (le même objet se retrouve dans chaque box
#     de ce type) : sur l'instance de la box (« textileFrames », JSON { id persistant du cadre => { ref, visual } }),
#     pour qu'un même cadre puisse s'appeler F1 dans VBX-01 et F5 dans VBX-02.

module Viewbox
  module Prep
    TEXTILE_MAX_DEPTH = 6

    # Marque posée par « Marquer comme cadre textile » (sur l'objet ou sa définition).
    def self.textile_flag?(e)
      user_value(e, 'textileFrame') == 'true'
    end

    # Cadre textile = marqué, ou classé « Frame extérieur / intérieur » (catégorie choisie ou trouvée dans le nom).
    def self.textile_marked?(e)
      textile_flag?(e) || C::FRAME_CATEGORIES.include?(category_for(e).first)
    end

    # « Frame extérieur » / « Frame intérieur » d'un cadre (nil si l'objet a une autre catégorie).
    def self.textile_place(e)
      cat = category_for(e).first
      C::FRAME_CATEGORIES.include?(cat) ? cat : nil
    end

    def self.persistent_key(e)
      (e.respond_to?(:persistent_id) ? e.persistent_id : e.entityID).to_s
    end

    # Cadres dans une définition (et ses sous-composants) : [entité, transformation vers le repère de la définition].
    # Gardé par définition : toutes les box d'un même type partagent la même liste.
    def self.textile_in_definition(defn, cache = {})
      cache[defn] ||= begin
        out = []
        walk = lambda do |entities, tr, depth|
          entities.each do |e|
            next unless container?(e)
            next if ignored?(e)
            if textile_marked?(e)
              out << [e, tr]
            elsif depth < TEXTILE_MAX_DEPTH
              walk.call(definition_of(e).entities, tr * e.transformation, depth + 1)
            end
          end
        end
        walk.call(defn.entities, IDENTITY, 0)
        out
      end
    end

    # Une définition contient-elle un cadre (à n'importe quelle profondeur) ? (export : ouvrir les groupes qui en ont)
    def self.contains_textile?(defn, cache = {})
      !textile_in_definition(defn, cache).empty?
    end

    def self.corners_mm(e, tr)
      b = e.bounds
      (0..7).map do |i|
        p = b.corner(i).transform(tr)
        [mm(p.x), mm(p.y), mm(p.z)]
      end
    end

    def self.box_of(points)
      min = [0, 1, 2].map { |k| points.map { |p| p[k] }.min }
      max = [0, 1, 2].map { |k| points.map { |p| p[k] }.max }
      [min, max]
    end

    # Largeur × hauteur × épaisseur (mm) d'une boîte : la plus petite étendue est l'épaisseur.
    def self.frame_dims(min, max)
      d = [0, 1, 2].map { |k| max[k] - min[k] }
      if d[2] <= d[0] && d[2] <= d[1]
        [[d[0], d[1]].max, [d[0], d[1]].min, d[2]]
      else
        [d[0] <= d[1] ? d[1] : d[0], d[2], [d[0], d[1]].min]
      end.map { |v| v.round }
    end

    # Position le long du côté (tour de la box dans le sens des aiguilles d'une montre, vu de dessus).
    def self.frame_along(side, c)
      case side
      when '-y' then c[0]
      when '+x' then c[1]
      when '+y' then -c[0]
      when '-x' then -c[1]
      else c[0]
      end
    end

    # Tous les cadres du modèle, chacun avec sa box : une ligne par cadre (un cadre dans le composant de la box compte
    # une fois par box).
    def self.textile_occurrences(model, a = analyze(model))
      cache = {}
      out = []
      modules = (a.named + a.candidates)
      modules.each do |m|
        defn = definition_of(m)
        bb = defn.bounds
        bmin = [mm(bb.min.x), mm(bb.min.y), mm(bb.min.z)]
        bmax = [mm(bb.max.x), mm(bb.max.y), mm(bb.max.z)]
        textile_in_definition(defn, cache).each do |e, tr|
          min, max = box_of(corners_mm(e, tr))
          c = [0, 1, 2].map { |k| (min[k] + max[k]) / 2.0 }
          dims = frame_dims(min, max)
          side = C.frame_side(c, bmin, bmax, [max[0] - min[0], max[1] - min[1], max[2] - min[2]])
          out << { key: "#{persistent_key(m)}/#{persistent_key(e)}", entity: e, owner: m, module: C.module_id(m.name), side: side,
                   along: frame_along(side, c), z: c[2], dims: dims, world_tr: m.transformation * tr }
        end
      end
      boxes = modules.map { |m| [C.module_id(m.name), *bbox_mm(m.bounds)] }
      (a.attached + a.common + a.others + a.orphans).each do |top|
        list = textile_marked?(top) ? [[top, IDENTITY]] : textile_in_definition(definition_of(top), cache).map { |e, tr| [e, top.transformation * tr] }
        list.each do |e, tr|
          min, max = box_of(corners_mm(e, tr))
          c = [0, 1, 2].map { |k| (min[k] + max[k]) / 2.0 }
          # box la plus proche (centre dans la box agrandie de 0,5 m), repère monde
          host = boxes.find { |_id, bmin, bmax| C.center_inside?(min, max, bmin, bmax, 500.0) }
          side = host ? C.frame_side(c, host[1], host[2], [max[0] - min[0], max[1] - min[1], max[2] - min[2]]) : (max[2] - min[2] < [max[0] - min[0], max[1] - min[1]].min ? 'top' : '-y')
          out << { key: persistent_key(e), entity: e, owner: nil, module: host && host[0], side: side,
                   along: frame_along(side, c), z: c[2], dims: frame_dims(min, max), world_tr: tr }
        end
      end
      out
    end

    def self.textile_store_of(owner)
      raw = owner.get_attribute(DICT, 'textileFrames')
      h = raw ? JSON.parse(raw.to_s) : {}
      h.is_a?(Hash) ? h : {}
    rescue JSON::ParserError
      {}
    end

    # Repère et visuel d'un cadre (« F3 », « Logo IKEA »).
    def self.textile_data(o)
      if o[:owner]
        d = textile_store_of(o[:owner])[persistent_key(o[:entity])] || {}
        [d['ref'], d['visual']]
      else
        [o[:entity].get_attribute(DICT, 'frameRef'), o[:entity].get_attribute(DICT, 'frameVisual')]
      end
    end

    # Écrit repère et visuel ; renvoie le nombre de valeurs changées. (Dans une opération ouverte par l'appelant.)
    def self.textile_write(o, ref, visual)
      ref = C.frame_ref(ref)
      visual = blank?(visual) ? nil : visual.to_s.strip
      old_ref, old_visual = textile_data(o)
      changes = (ref == old_ref ? 0 : 1) + (visual == (blank?(old_visual) ? nil : old_visual) ? 0 : 1)
      return 0 if changes.zero?
      if o[:owner]
        h = textile_store_of(o[:owner])
        d = { 'ref' => ref, 'visual' => visual }.compact
        if d.empty? then h.delete(persistent_key(o[:entity])) else h[persistent_key(o[:entity])] = d end
        set_or_clear(o[:owner], 'textileFrames', h.empty? ? nil : JSON.generate(h))
      else
        set_or_clear(o[:entity], 'frameRef', ref)
        set_or_clear(o[:entity], 'frameVisual', visual)
      end
      changes
    end

    # Extérieur / intérieur d'un cadre (sur l'objet : un cadre du composant de la box l'est dans chaque box de ce type).
    def self.textile_set_place(e, place)
      place = C.category_key(place.to_s)
      return 0 unless C::FRAME_CATEGORIES.include?(place) && textile_place(e) != place
      set_or_clear(e, 'userCategory', place)
      1
    end

    def self.textile_name(e)
      label_for(e) || (e.name.to_s.empty? ? definition_of(e).name.to_s : e.name.to_s)
    end

    # Lignes de la fenêtre « Cadres textile » (dans l'ordre de numérotation).
    def self.textile_rows(model)
      occ = textile_occurrences(model)
      rows = occ.map do |o|
        ref, visual = textile_data(o)
        { 'key' => o[:key], 'ref' => ref.to_s, 'visual' => visual.to_s, 'module' => o[:module], 'side' => o[:side],
          'sideLabel' => C::FRAME_SIDE_LABELS[o[:side]] || o[:side], 'along' => o[:along].round, 'z' => o[:z].round,
          'dims' => o[:dims], 'name' => textile_name(o[:entity]), 'inBox' => !o[:owner].nil?,
          'place' => textile_place(o[:entity]) || C::DEFAULT_FRAME_CATEGORY }
      end
      rows = C.frame_order(rows)
      dups = C.frame_duplicates(rows)
      warnings = dups.map { |ref, keys| "#{ref} est donné à #{keys.size} cadres" }
      missing = rows.count { |r| C.frame_ref(r['ref']).nil? }
      warnings << "#{missing} cadre(s) sans repère : « Numéroter les cadres sans repère »" if missing > 0
      { 'rows' => rows, 'warnings' => warnings, 'version' => VERSION }
    end

    # Enregistre les repères / visuels saisis (annulable en une fois).
    def self.apply_textile(model, payload)
      by_key = textile_occurrences(model).to_h { |o| [o[:key], o] }
      changes = 0
      model.start_operation('Viewbox : cadres textile', true)
      begin
        (payload['rows'] || []).each do |r|
          o = by_key[r['key'].to_s]
          next unless o
          changes += textile_write(o, r['ref'], r['visual'])
          changes += textile_set_place(o[:entity], r['place'])
        end
        model.commit_operation
      rescue StandardError
        model.abort_operation
        raise
      end
      changes
    end

    # Numérote les cadres sans repère (ou tous) : F1, F2… dans l'ordre Viewbox / tour de la box.
    def self.number_textile(model, renumber: false)
      occ = textile_occurrences(model)
      rows = occ.map { |o| { 'key' => o[:key], 'ref' => textile_data(o)[0], 'module' => o[:module], 'side' => o[:side], 'along' => o[:along], 'z' => o[:z] } }
      refs = C.assign_frame_refs(rows, renumber: renumber)
      changes = 0
      model.start_operation(renumber ? 'Viewbox : renuméroter les cadres' : 'Viewbox : numéroter les cadres', true)
      begin
        occ.each { |o| changes += textile_write(o, refs[o[:key]], textile_data(o)[1]) }
        model.commit_operation
      rescue StandardError
        model.abort_operation
        raise
      end
      changes
    end

    # Marque (ou démarque) des objets comme cadres textile, puis numérote les nouveaux. Renvoie le nombre d'objets.
    # place = 'FRAME-EXTERIEUR' / 'FRAME-INTERIEUR' : catégorie donnée en même temps (sinon : celle déjà choisie, ou
    # « Frame extérieur »). Démarquer retire aussi une catégorie Frame choisie à la main.
    def self.mark_textile(model, entities, on, place = nil)
      list = entities.select { |e| container?(e) }
      return 0 if list.empty?
      model.start_operation(on ? 'Viewbox : marquer comme cadres textile' : 'Viewbox : ce ne sont pas des cadres', true)
      begin
        list.each do |e|
          set_or_clear(e, 'textileFrame', on ? 'true' : nil)
          set_or_clear(e, 'userCategory', place) if on && C::FRAME_CATEGORIES.include?(place)
          next if on
          d = definition_of(e)
          # démarqué alors que sa définition l'est : marque de la définition retirée aussi
          set_or_clear(d, 'textileFrame', nil) if d.get_attribute(DICT, 'textileFrame')
          [e, d].each do |t|
            v = t.get_attribute(DICT, 'userCategory')
            set_or_clear(t, 'userCategory', nil) if v && C::FRAME_CATEGORIES.include?(C.category_key(v))
          end
        end
        model.commit_operation
      rescue StandardError
        model.abort_operation
        raise
      end
      number_textile(model) if on
      list.size
    end

    # Données du manifest : [box ou nil, objet] => { ref, visual }.
    def self.textile_manifest(model, a)
      textile_occurrences(model, a).to_h do |o|
        ref, visual = textile_data(o)
        [[o[:owner], o[:entity]], { 'ref' => C.frame_ref(ref), 'visual' => blank?(visual) ? nil : visual.to_s }.compact]
      end
    end

    def self.textile_report_lines(model, a)
      occ = textile_occurrences(model, a)
      return [] if occ.empty?
      refs = occ.map { |o| C.frame_ref(textile_data(o)[0]) }
      dup = refs.compact.tally.select { |_, n| n > 1 }.keys
      line = "Cadres textile : #{occ.size}"
      line += " · sans repère : #{refs.count(&:nil?)}" if refs.any?(&:nil?)
      line += " · ⚠ repères en double : #{dup.join(', ')}" if dup.any?
      [line]
    end

    def self.select_textile(model, key)
      o = textile_occurrences(model).find { |x| x[:key] == key.to_s }
      return 0 unless o
      model.selection.clear
      # cadre dans le composant d'une box : on sélectionne la box (double-clic dessus pour atteindre le cadre)
      model.selection.add(o[:owner] || o[:entity])
      model.active_view.zoom(model.selection)
      1
    end

    def self.show_textile_dialog(model = Sketchup.active_model)
      dlg = UI::HtmlDialog.new(dialog_title: "Viewbox #{VERSION} — cadres textile", preferences_key: 'viewbox_prep_textile',
                               width: 1100, height: 720, resizable: true, style: UI::HtmlDialog::STYLE_DIALOG)
      dlg.set_html(File.read(File.join(__dir__, 'textile.html'), encoding: 'UTF-8'))
      reply = lambda do |n, what|
        dlg.execute_script("VB.saved(#{n}, #{JSON.generate(what)}, #{JSON.generate(textile_rows(model))})")
      end
      run = lambda do |what, &blk|
        begin
          reply.call(blk.call, what)
        rescue StandardError => e
          dlg.execute_script("VB.failed(#{JSON.generate(e.message)})")
        end
      end
      dlg.add_action_callback('ready') { |_ctx| dlg.execute_script("VB.load(#{JSON.generate(textile_rows(model))})") }
      dlg.add_action_callback('save') { |_ctx, json| run.call('enregistré') { apply_textile(model, JSON.parse(json.to_s)) } }
      dlg.add_action_callback('number') { |_ctx| run.call('numéroté') { number_textile(model) } }
      dlg.add_action_callback('renumber') { |_ctx| run.call('renuméroté') { number_textile(model, renumber: true) } }
      dlg.add_action_callback('mark') { |_ctx, place| run.call('marqué') { mark_textile(model, model.selection.to_a, true, place.to_s.empty? ? nil : place.to_s) } }
      dlg.add_action_callback('unmark') { |_ctx| run.call('démarqué') { mark_textile(model, model.selection.to_a, false) } }
      dlg.add_action_callback('select') { |_ctx, key| select_textile(model, key) }
      dlg.add_action_callback('close') { |_ctx| dlg.close }
      dlg.show
      dlg
    rescue StandardError => e
      fail_with(e)
    end
  end
end
