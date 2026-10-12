# encoding: UTF-8
# Viewbox — structure dessinée dans un composant de box (S12) : relevé des profils (barres) d'une définition de
# module, en lecture seule (le modèle n'est jamais modifié par le relevé), pour l'export VEM (« structures » du
# manifest) et la fenêtre « Structure de la box (profils)… » où l'on confirme le rôle, la section et la nuance de
# chaque profil (attributs sur les définitions des profils, valables pour toutes les box de cette définition).
#
# Pour chaque barre : extrémités de l'axe et axe de section (yRef) dans le repère de la définition du module, en mm,
# z vers le haut, et la coupe exacte au milieu de la barre (faces coupées par le plan ⟂ à l'axe, décalé de 0,37 mm
# pour qu'aucun sommet ne tombe dedans), en boucles dans le plan (y = yRef, z = axe × yRef) autour de l'axe.

module Viewbox
  module Prep
    # catégories jamais lues comme des profils de la box (façade, escaliers, terrasses : éléments à part)
    FRAME_SKIP = (C::ACCESSORY_CATEGORIES + %w[GARDE-CORPS ESCALIER TERRASSE]).freeze
    FRAME_MAX_DEPTH = 5
    FRAME_MIN_LENGTH = 150.0
    FRAME_MAX_MEMBERS = 2000

    def self.v_dot(a, b) = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
    def self.v_sub(a, b) = [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
    def self.v_add(a, b) = [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
    def self.v_mul(a, k) = [a[0] * k, a[1] * k, a[2] * k]
    def self.v_cross(a, b) = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

    def self.v_unit(a)
      l = Math.sqrt(v_dot(a, a))
      l < 1e-12 ? a : v_mul(a, 1.0 / l)
    end

    # Point (pouces, repère local) → mm dans le repère de la définition du module.
    def self.frame_point(tr, p)
      a = tr.to_a
      x, y, z = p.x.to_f, p.y.to_f, p.z.to_f
      [(a[0] * x + a[4] * y + a[8] * z + a[12]) * C::MM_PER_INCH,
       (a[1] * x + a[5] * y + a[9] * z + a[13]) * C::MM_PER_INCH,
       (a[2] * x + a[6] * y + a[10] * z + a[14]) * C::MM_PER_INCH]
    end

    # Axes locaux (x, y, z de la pièce) dans le repère du module, unitaires.
    def self.frame_axes(tr)
      a = tr.to_a
      [v_unit([a[0], a[1], a[2]]), v_unit([a[4], a[5], a[6]]), v_unit([a[8], a[9], a[10]])]
    end

    def self.frame_faces(entities)
      entities.select { |e| e.is_a?(Sketchup::Face) }
    end

    # Faces d'un conteneur découpées en solides (faces reliées entre elles).
    def self.frame_solids(faces)
      seen = {}
      out = []
      faces.each do |f|
        next if seen[f]
        comp = f.respond_to?(:all_connected) ? f.all_connected.select { |e| e.is_a?(Sketchup::Face) } : [f]
        comp = [f] if comp.empty?
        comp.each { |g| seen[g] = true }
        out << comp
      end
      out
    end

    # Coupe d'un solide par le plan (point p0, normale axis) : segments 2D (y, z) autour de o.
    def self.frame_cut(faces, tr, o, axis, yref, zref, p0)
      segs = []
      faces.each do |f|
        next unless f.respond_to?(:loops)
        loops = f.loops.map { |l| l.vertices.map { |v| frame_point(tr, v.position) } }
        next if loops.empty? || loops[0].size < 3
        hits = []
        loops.each do |pts|
          pts.each_with_index do |p, i|
            q = pts[(i + 1) % pts.size]
            sp = v_dot(v_sub(p, p0), axis)
            sq = v_dot(v_sub(q, p0), axis)
            next unless (sp < 0 && sq > 0) || (sp > 0 && sq < 0)
            t = sp / (sp - sq)
            hits << v_add(p, v_mul(v_sub(q, p), t))
          end
        end
        next if hits.size < 2
        # direction de la ligne de coupe dans la face : normale (Newell) × axe
        n = [0.0, 0.0, 0.0]
        out = loops[0]
        out.each_with_index do |p, i|
          q = out[(i + 1) % out.size]
          n[0] += (p[1] - q[1]) * (p[2] + q[2])
          n[1] += (p[2] - q[2]) * (p[0] + q[0])
          n[2] += (p[0] - q[0]) * (p[1] + q[1])
        end
        dir = v_cross(v_unit(n), axis)
        hits.sort_by! { |h| v_dot(h, dir) }
        hits.each_slice(2) do |a, b|
          next unless b
          to2 = ->(p) { d = v_sub(p, o); [v_dot(d, yref), v_dot(d, zref)] }
          segs << [to2.(a), to2.(b)]
        end
      end
      segs
    end

    # Une barre (solide) : axe = plus grande dimension dans les axes de sa pièce, coupe au milieu.
    def self.frame_member(faces, tr, info, bmin, bmax)
      pts = faces.flat_map { |f| f.respond_to?(:loops) ? f.loops.flat_map { |l| l.vertices.map { |v| frame_point(tr, v.position) } } : [] }
      return nil if pts.size < 4
      axes = frame_axes(tr)
      ext = axes.map { |ax| pr = pts.map { |p| v_dot(p, ax) }; [pr.min, pr.max] }
      k = (0..2).max_by { |i| ext[i][1] - ext[i][0] }
      len = ext[k][1] - ext[k][0]
      return nil if len < FRAME_MIN_LENGTH
      axis = axes[k]
      yi = ([0, 1, 2] - [k]).min_by { |i| axes[i][2].abs } # axe de section le plus horizontal
      yref = axes[yi]
      zref = v_unit(v_cross(axis, yref))
      o = (0..2).reduce([0.0, 0.0, 0.0]) { |acc, i| v_add(acc, v_mul(axes[i], (ext[i][0] + ext[i][1]) / 2.0)) }
      a = v_sub(o, v_mul(axis, len / 2.0))
      b = v_add(o, v_mul(axis, len / 2.0))
      segs = frame_cut(faces, tr, o, axis, yref, zref, v_add(o, v_mul(axis, 0.37)))
      loops = C.slice_segments_to_loops(segs, 0.05)
      return { 'error' => "coupe impossible (#{info['name']})" } if loops.empty?
      loops.sort_by! { |l| -C.polygon_area(l).abs }
      outer = loops.shift
      outer = outer.reverse if C.polygon_area(outer) < 0
      ys = outer.map { |p| p[0] }
      zs = outer.map { |p| p[1] }
      holes = loops.select { |l| l.all? { |p| p[0] > ys.min && p[0] < ys.max && p[1] > zs.min && p[1] < zs.max } }
      holes = holes.map { |l| C.polygon_area(l) > 0 ? l.reverse : l }
      role = info['role'] || C.role_guess(a, b, bmin, bmax, ys.max - ys.min)
      info.merge('a' => a, 'b' => b, 'yRef' => yref, 'loops' => [outer] + holes, 'role' => role, 'roleSource' => info['role'] ? 'manuel' : 'géométrie',
                 'dims' => C.section_dims(outer, holes))
    end

    # Rôle / section / nuance saisis (pièce puis définition) et section lue dans le nom.
    def self.frame_info(e, label_text)
      d = definition_of(e)
      sec = user_value(e, 'structSection')
      from_name = C.section_from_name(e.name.to_s) || C.section_from_name(d.name.to_s)
      {
        'name' => label_text, 'definition' => d.group? ? '' : d.name.to_s,
        'role' => (r = user_value(e, 'structRole')) && C::STRUCT_ROLES.include?(r) ? r : nil,
        'section' => sec ? C.struct_section_key(sec) : from_name&.dig('key'),
        'sectionSource' => sec ? 'manuel' : from_name ? 'nom' : nil,
        'grade' => (g = user_value(e, 'structGrade')) && C::GRADES.include?(g) ? g : nil,
        'materials' => materials_of(e)
      }.compact
    end

    # Relevé des profils d'une définition de module (lecture seule). Retourne [barres, avertissements, pièces] ;
    # chaque barre garde en `_ref` la pièce SketchUp (instance ou faces nues) pour la fenêtre « Structure de la box ».
    def self.frame_members(defn)
      bb = defn.bounds
      bmin = [mm(bb.min.x), mm(bb.min.y), mm(bb.min.z)]
      bmax = [mm(bb.max.x), mm(bb.max.y), mm(bb.max.z)]
      members = []
      warnings = []
      n = [0]
      add_solids = lambda do |faces, tr, info, ref|
        frame_solids(faces).each_with_index do |solid, i|
          break if members.size >= FRAME_MAX_MEMBERS
          m = frame_member(solid, tr, info.dup, bmin, bmax)
          next unless m
          if m['error']
            warnings << m['error']
            next
          end
          n[0] += 1
          m['id'] = "B#{n[0]}"
          m['_ref'] = ref.merge('solid' => i, 'faces' => solid)
          members << m
        end
      end
      walk = lambda do |entities, tr, depth|
        entities.each do |e|
          next unless container?(e)
          cat = category_for(e).first
          next if cat == C::IGNORE || FRAME_SKIP.include?(cat) || C.context?(label(e))
          d = definition_of(e)
          ctr = tr * e.transformation
          faces = frame_faces(d.entities)
          add_solids.call(faces, ctr, frame_info(e, label(e)), { 'entity' => e, 'definition' => d }) if faces.any?
          walk.call(d.entities, ctr, depth + 1) if depth < FRAME_MAX_DEPTH
        end
      end
      walk.call(defn.entities, IDENTITY, 0)
      # faces nues directement dans la définition du module
      naked = frame_faces(defn.entities)
      add_solids.call(naked, IDENTITY, { 'name' => 'faces nues', 'definition' => '' }, { 'naked' => defn }) if naked.any?
      warnings << "plus de #{FRAME_MAX_MEMBERS} barres : relevé arrêté" if members.size >= FRAME_MAX_MEMBERS
      [members, warnings, [bmin, bmax]]
    end

    def self.struct_source(defn)
      v = defn.get_attribute(DICT, 'structSource').to_s
      C::STRUCT_SOURCES.include?(v) ? v : nil
    end

    # Structure exportée d'une définition de module : structure « dessinée », ou au moins 4 barres relevées
    # (sauf si l'utilisateur a choisi « gabarit Viewbox standard »). nil = pas de structure dans le manifest.
    def self.drawn_structure(defn)
      src = struct_source(defn)
      return nil if src == 'template'
      members, warnings, bounds = frame_members(defn)
      bars = members.count { |m| m['role'] != 'none' }
      return nil unless src == 'drawn' || bars >= 4
      clean = members.map { |m| m.reject { |k, _| k.start_with?('_') || k == 'dims' || k == 'sectionSource' } }
      C.frame_json(clean, warnings, bounds)
    end

    # Lignes du « Contrôler le modèle » pour un type dessiné.
    def self.frame_report_lines(defn)
      members, warnings, = frame_members(defn)
      return [] if members.size < 4 && struct_source(defn) != 'drawn'
      by_role = members.group_by { |m| m['role'] }
      parts = C::STRUCT_ROLES.filter_map { |r| by_role[r] ? "#{by_role[r].size} #{C::STRUCT_ROLE_LABELS[r].downcase}" : nil }
      unknown = members.count { |m| m['role'] != 'none' && m['section'].nil? }
      loose = C.unconnected(members.reject { |m| m['role'] == 'none' })
      out = ["Structure dessinée « #{defn.name} » : #{members.size} barres (#{parts.join(', ')})"]
      out << "  sections à confirmer (mesurées par VEM) : #{unknown}" if unknown > 0
      out << "  ⚠ barres non reliées : #{loose.map { |m| m['name'] }.uniq.first(6).join(', ')}" if loose.any?
      out << "  ⚠ #{warnings.first(3).join(' ; ')}" if warnings.any?
      out
    end

    # ─── Fenêtre « Structure de la box (profils)… » ───

    def self.frame_dialog_rows(defn)
      members, warnings, = frame_members(defn)
      groups = members.group_by do |m|
        ref = m['_ref']
        ref['definition'] ? "d:#{ref['definition'].entityID}" : "n:#{m['role']}|#{m['section']}|#{m['dims']['h'].round}x#{m['dims']['b'].round}"
      end
      rows = groups.map do |key, list|
        m = list.first
        d = m['dims']
        {
          'key' => key, 'name' => m['name'], 'definition' => m['definition'], 'count' => list.size, 'naked' => key.start_with?('n:'),
          'role' => m['role'], 'roleSource' => m['roleSource'], 'section' => m['section'] ? C.struct_section_text(m['section']) : '',
          'sectionSource' => m['sectionSource'], 'grade' => m['grade'] || '',
          'measured' => "#{{ 'tube' => 'tube', 'open' => 'profil ouvert', 'flat' => 'plat', 'solid' => 'plein' }[d['shape']]} #{d['b'].round} × #{d['h'].round}, ép. ≈ #{d['t']}",
          'length' => list.map { |x| Math.sqrt(v_dot(v_sub(x['b'], x['a']), v_sub(x['b'], x['a']))).round }.max
        }
      end
      rows.sort_by! { |r| [C::STRUCT_ROLES.index(r['role']) || 99, r['name'].to_s] }
      {
        'definition' => defn.name.to_s, 'source' => struct_source(defn) || '', 'rows' => rows, 'warnings' => warnings,
        'roles' => C::STRUCT_ROLES.map { |r| [r, C::STRUCT_ROLE_LABELS[r]] }, 'choices' => C::STRUCT_CHOICES['frame'], 'grades' => C::GRADES,
        'sources' => C::STRUCT_SOURCES.map { |s| [s, C::STRUCT_SOURCE_LABELS[s]] }, 'version' => VERSION
      }
    end

    # Enregistre les choix (rôle, section, nuance) sur les définitions des profils, et le type de structure de la box.
    # Annulable en une fois (Ctrl+Z). Retourne le nombre de valeurs modifiées.
    def self.apply_frame(model, defn, payload)
      members, = frame_members(defn)
      by_key = members.group_by { |m| m['_ref']['definition'] ? "d:#{m['_ref']['definition'].entityID}" : nil }
      changes = 0
      write = lambda do |d, key, value|
        before = d.get_attribute(DICT, key).to_s
        after = value.to_s.strip
        next if before == after
        set_or_clear(d, key, after)
        changes += 1
      end
      model.start_operation('Viewbox : structure de la box', true)
      begin
        src = payload['source'].to_s
        write.call(defn, 'structSource', C::STRUCT_SOURCES.include?(src) ? src : '')
        Array(payload['rows']).each do |r|
          list = by_key[r['key']]
          next unless list
          d = list.first['_ref']['definition']
          # seules les valeurs changées dans la fenêtre deviennent des choix manuels (le reste reste automatique)
          write.call(d, 'structRole', C::STRUCT_ROLES.include?(r['role']) ? r['role'] : '') if r['roleChanged']
          if r['sectionChanged']
            sec = r['section'].to_s.strip
            write.call(d, 'structSection', sec.empty? ? '' : (C.struct_section_key(sec) || ''))
          end
          write.call(d, 'structGrade', C::GRADES.include?(r['grade']) ? r['grade'] : '')
        end
        model.commit_operation
      rescue StandardError
        model.abort_operation
        raise
      end
      changes
    end

    # Sélectionne dans SketchUp les pièces d'un groupe de profils (toutes les box de cette définition).
    def self.select_frame_group(model, defn, key)
      members, = frame_members(defn)
      picked = members.select do |m|
        ref = m['_ref']
        (ref['definition'] ? "d:#{ref['definition'].entityID}" : nil) == key
      end
      ents = picked.map { |m| m['_ref']['entity'] }.compact.uniq
      model.selection.clear
      model.selection.add(ents)
      model.active_view.zoom(model.selection) unless ents.empty?
      ents.size
    end

    # Faces nues d'un profil → un groupe (pour pouvoir lui donner un rôle et une section). Annulable.
    def self.group_naked(model, defn, key)
      members, = frame_members(defn)
      list = members.select do |m|
        m['_ref']['naked'] && "n:#{m['role']}|#{m['section']}|#{m['dims']['h'].round}x#{m['dims']['b'].round}" == key
      end
      return 0 if list.empty?
      # SketchUp ne groupe sans risque que des faces du contexte ouvert : il faut être dans la box (double-clic)
      if model.respond_to?(:active_entities) && model.active_entities != defn.entities
        raise 'ouvre d’abord la box (double-clic dessus pour entrer dans le composant), puis relance « Grouper ce profil »'
      end
      model.start_operation('Viewbox : grouper un profil', true)
      begin
        list.each do |m|
          faces = m['_ref']['faces']
          edges = faces.flat_map { |f| f.respond_to?(:edges) ? f.edges : [] }.uniq
          g = defn.entities.add_group(faces + edges)
          g.name = "Profil #{C::STRUCT_ROLE_LABELS[m['role']]}"
        end
        model.commit_operation
      rescue StandardError
        model.abort_operation
        raise
      end
      list.size
    end

    def self.module_definition_of(selection)
      m = selection.find { |e| container?(e) && (C.module_id(e.name) || module_type(definition_of(e)) || standard_size?(e)) } || selection.find { |e| container?(e) }
      m ? definition_of(m) : nil
    end

    def self.show_frame_dialog(model = Sketchup.active_model, selection = model.selection.to_a)
      defn = module_definition_of(selection)
      unless defn
        UI.messagebox('Viewbox — structure de la box : sélectionne une box (VBX-xx ou composant de box).')
        return
      end
      dlg = UI::HtmlDialog.new(dialog_title: "Viewbox #{VERSION} — structure de la box « #{defn.name} »", preferences_key: 'viewbox_prep_frame',
                               width: 1150, height: 760, resizable: true, style: UI::HtmlDialog::STYLE_DIALOG)
      dlg.set_html(File.read(File.join(__dir__, 'frame.html'), encoding: 'UTF-8'))
      dlg.add_action_callback('ready') { |_ctx| dlg.execute_script("VB.load(#{JSON.generate(frame_dialog_rows(defn))})") }
      dlg.add_action_callback('save') do |_ctx, json|
        begin
          n = apply_frame(model, defn, JSON.parse(json.to_s))
          dlg.execute_script("VB.saved(#{n}, #{JSON.generate(frame_dialog_rows(defn))})")
        rescue StandardError => e
          dlg.execute_script("VB.failed(#{JSON.generate(e.message)})")
        end
      end
      dlg.add_action_callback('select') { |_ctx, key| select_frame_group(model, defn, key) }
      dlg.add_action_callback('group') do |_ctx, key|
        begin
          n = group_naked(model, defn, key)
          dlg.execute_script("VB.saved(#{n}, #{JSON.generate(frame_dialog_rows(defn))})")
        rescue StandardError => e
          dlg.execute_script("VB.failed(#{JSON.generate(e.message)})")
        end
      end
      dlg.add_action_callback('close') { |_ctx| dlg.close }
      dlg.show
      dlg
    rescue StandardError => e
      fail_with(e)
    end
  end
end
