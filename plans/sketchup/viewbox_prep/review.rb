# encoding: UTF-8
# Viewbox — fenêtre « Réviser les catégories » : un tableau par type de composant (définition) où l'on
# corrige la catégorie proposée, saisit une désignation et une réf. article, et, pour les Viewbox,
# leur type et leurs dimensions nominales. Tout est enregistré en attributs sur les définitions
# (Ctrl+Z annule l'enregistrement en une fois).

module Viewbox
  module Prep
    def self.display_name_of(e)
      d = definition_of(e)
      return e.name.to_s unless e.name.to_s.empty?
      d.group? ? 'Groupe sans nom' : d.name.to_s
    end

    # Données de la fenêtre (types de Viewbox + types de composants), prêtes à passer en JSON.
    def self.review_rows(model)
      a = analyze(model)
      modules = a.named + a.candidates
      module_rows = modules.group_by { |m| definition_of(m) }.map do |d, inst|
        measured = plan_dims(inst.first).map(&:round)
        {
          'id' => d.entityID, 'name' => d.name.to_s, 'count' => inst.size,
          'modules' => inst.map { |m| C.module_id(m.name) || '(sans nom)' }.sort,
          'type' => module_type(d).to_s, 'nominal' => nominal_dims(d)&.map(&:round), 'measured' => [measured.max, measured.min]
        }
      end
      rows = {}
      add = lambda do |e, count, scope|
        d = definition_of(e)
        row = rows[d] ||= begin
          auto, source = auto_category(e)
          {
            'id' => d.entityID, 'name' => display_name_of(e), 'definition' => d.name.to_s, 'isGroup' => d.group?,
            'count' => 0, 'tags' => [], 'scope' => scope,
            'auto' => auto, 'autoSource' => source,
            'category' => d.get_attribute(DICT, 'userCategory').to_s,
            'label' => d.get_attribute(DICT, 'userLabel').to_s,
            'article' => d.get_attribute(DICT, 'userArticleRef').to_s,
            'autoArticle' => C.article_ref(e.name) || C.article_ref(d.name),
            'individual' => 0
          }
        end
        row['count'] += count
        row['tags'] |= [tag_name(e)]
        row['individual'] += count unless blank?(e.get_attribute(DICT, 'userCategory'))
      end
      modules.group_by { |m| definition_of(m) }.each do |d, inst|
        d.entities.each { |c| add.call(c, inst.size, 'Viewbox') if container?(c) }
      end
      (a.common + a.attached + a.orphans + a.others).each { |e| add.call(e, 1, 'libre') }
      a.context.select { |e| ignored?(e) }.each { |e| add.call(e, 1, 'libre') }
      # Les types à classer d'abord, puis par portée et par nom.
      components = rows.values.sort_by { |r| [r['auto'].nil? && r['category'].to_s.empty? ? 0 : 1, r['scope'], r['name'].downcase] }
      categories = (C::CATEGORIES + custom_categories(model)).uniq
      { 'modules' => module_rows, 'components' => components, 'categories' => categories, 'version' => VERSION }
    end

    # Enregistre les choix de la fenêtre. Retourne le nombre de valeurs modifiées.
    def self.apply_review(model, payload)
      defs = {}
      model.definitions.each { |d| defs[d.entityID] = d }
      changes = 0
      write = lambda do |d, key, value|
        before = d.get_attribute(DICT, key).to_s
        after = value.to_s.strip
        return if before == after
        set_or_clear(d, key, after)
        changes += 1
      end
      model.start_operation('Viewbox : catégories', true)
      begin
        Array(payload['components']).each do |c|
          d = defs[c['id'].to_i]
          next unless d
          cat = c['category'].to_s.strip
          write.call(d, 'userCategory', cat.empty? ? '' : (cat == C::IGNORE ? C::IGNORE : C.category_key(cat)))
          write.call(d, 'userLabel', c['label'])
          write.call(d, 'userArticleRef', c['article'])
        end
        Array(payload['modules']).each do |m|
          d = defs[m['id'].to_i]
          next unless d
          write.call(d, 'moduleType', m['type'])
          n = Array(m['nominal']).map(&:to_f)
          ok = n.size == 2 && n.all? { |v| v > 0 }
          write.call(d, 'nominalLong', ok ? n.max.round.to_s : '')
          write.call(d, 'nominalShort', ok ? n.min.round.to_s : '')
        end
        model.commit_operation
      rescue StandardError
        model.abort_operation
        raise
      end
      changes
    end

    # Sélectionne dans le modèle les objets d'un type (ou les Viewbox qui le contiennent) et zoome dessus.
    def self.select_definition(model, id)
      d = model.definitions.find { |x| x.entityID == id.to_i }
      return 0 unless d
      tops = model.entities.select { |e| container?(e) }
      picked = tops.select { |e| definition_of(e) == d }
      picked = tops.select { |e| definition_of(e).entities.any? { |c| container?(c) && definition_of(c) == d } } if picked.empty?
      model.selection.clear
      model.selection.add(picked)
      model.active_view.zoom(model.selection) unless picked.empty?
      picked.size
    end

    def self.show_review_dialog
      model = Sketchup.active_model
      dlg = UI::HtmlDialog.new(dialog_title: "Viewbox #{VERSION} — réviser les catégories", preferences_key: 'viewbox_prep_review',
                               width: 1250, height: 780, resizable: true, style: UI::HtmlDialog::STYLE_DIALOG)
      dlg.set_html(File.read(File.join(__dir__, 'review.html'), encoding: 'UTF-8'))
      dlg.add_action_callback('ready') do |_ctx|
        dlg.execute_script("VB.load(#{JSON.generate(review_rows(model))})")
      end
      dlg.add_action_callback('save') do |_ctx, json|
        begin
          n = apply_review(model, JSON.parse(json.to_s))
          dlg.execute_script("VB.saved(#{n}, #{JSON.generate(review_rows(model))})")
        rescue StandardError => e
          dlg.execute_script("VB.failed(#{JSON.generate(e.message)})")
        end
      end
      dlg.add_action_callback('select') { |_ctx, id| select_definition(model, id) }
      dlg.add_action_callback('export') do |_ctx|
        dlg.close
        UI.start_timer(0.1, false) { prepare_and_export }
      end
      dlg.add_action_callback('close') { |_ctx| dlg.close }
      dlg.show
      dlg
    rescue StandardError => e
      fail_with(e)
    end
  end
end
