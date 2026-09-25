# encoding: UTF-8
# Test de fumée de l'extension avec une imitation minimale de l'API SketchUp (hors SketchUp) :
#   ruby plans/sketchup/test_main_smoke.rb
# Vérifie : analyse → fenêtre de révision (données + enregistrement) → clic droit → export (noms
# techniques dans le .dae, noms du modèle rétablis, choix manuels dans le manifest) → .zip propre.
require 'minitest/autorun'
require 'tmpdir'
require 'fileutils'
require 'json'

# ─── Imitation de l'API SketchUp (unités internes : pouces) ───
MB_YESNO = 4
IDYES = 6
IDNO = 7
$loaded = {}
def file_loaded?(f) = $loaded[f]
def file_loaded(f) = ($loaded[f] = true)

module Geom
  class Point3d
    attr_reader :x, :y, :z
    def initialize(x, y, z) = (@x, @y, @z = x.to_f, y.to_f, z.to_f)
    def transform(tr)
      a = tr.to_a
      Point3d.new(a[0] * x + a[4] * y + a[8] * z + a[12], a[1] * x + a[5] * y + a[9] * z + a[13], a[2] * x + a[6] * y + a[10] * z + a[14])
    end
  end

  class BoundingBox
    attr_reader :min, :max
    def add(*pts)
      pts.flatten.each do |p|
        @min = @min ? Point3d.new([@min.x, p.x].min, [@min.y, p.y].min, [@min.z, p.z].min) : p
        @max = @max ? Point3d.new([@max.x, p.x].max, [@max.y, p.y].max, [@max.z, p.z].max) : p
      end
      self
    end
    def width = max.x - min.x
    def height = max.y - min.y
    def depth = max.z - min.z
    def corner(i) = Point3d.new(i & 1 == 0 ? min.x : max.x, i & 2 == 0 ? min.y : max.y, i & 4 == 0 ? min.z : max.z)
  end

  class Transformation
    def initialize(a = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) = (@a = a.map(&:to_f))
    def self.translation(x, y, z) = new([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1])
    def to_a = @a.dup
    def *(o)
      b = o.to_a
      Transformation.new((0..15).map { |k| c, r = k.divmod(4); (0..3).sum { |i| @a[i * 4 + r] * b[c * 4 + i] } })
    end
  end
end

module Sketchup
  class << self
    attr_accessor :active_model, :status_text
    def version = '26.2.243'
    def register_extension(*) = true
  end
  Layer = Struct.new(:name)
  Material = Struct.new(:name)
  $next_id = 100

  module Attr
    def attrs = (@attrs ||= {})
    def set_attribute(d, k, v) = (attrs[[d, k]] = v)
    def get_attribute(d, k) = attrs[[d, k]]
    def delete_attribute(d, k) = attrs.delete([d, k])
    def entityID = (@entity_id ||= ($next_id += 1))
  end

  class Entities
    include Enumerable
    def initialize(list = []) = (@list = list)
    def each(&b) = @list.each(&b)
    def <<(e) = (@list << e; self)
  end

  class Face
    include Attr
    attr_accessor :material, :back_material, :layer, :hidden
    def initialize(min, max, material = nil) = (@box = Geom::BoundingBox.new.add(min, max); @material = material)
    def bounds = @box
    def name = ''
  end

  class ComponentDefinition
    include Attr
    attr_accessor :name, :entities, :instances
    def initialize(name, list, group: false) = (@name, @entities, @instances, @group = name, Entities.new(list), [], group)
    def group? = @group
    def count_instances = instances.size
    def bounds = Geom::BoundingBox.new.add(entities.flat_map { |e| [e.bounds.min, e.bounds.max] })
  end

  class ComponentInstance
    include Attr
    attr_accessor :name, :definition, :transformation, :layer, :material, :hidden
    def initialize(definition, tr, name: '', tag: 'Untagged')
      @definition, @transformation, @name, @layer, @hidden = definition, tr, name, Layer.new(tag), false
      definition.instances << self
    end
    def bounds
      b = definition.bounds
      Geom::BoundingBox.new.add((0..7).map { |i| b.corner(i).transform(transformation) })
    end
  end

  class Group < ComponentInstance; end

  class Definitions
    include Enumerable
    def initialize(list) = (@list = list)
    def each(&b) = @list.each(&b)
    def purge_unused = true
  end

  class Selection
    attr_reader :items
    def initialize = (@items = [])
    def clear = @items.clear
    def add(list) = @items.concat(Array(list))
  end

  class Model
    attr_accessor :entities, :path, :title, :ops, :exported, :names_at_export, :selection, :defs
    def initialize(list, defs)
      @entities, @path, @title, @ops, @defs, @selection = Entities.new(list), '', 'Projet test', [], defs, Selection.new
    end
    # Journal d'annulation minimal : noms + visibilité des objets (comme le vrai abort_operation).
    def all_entities = entities.to_a + @defs.flat_map { |d| d.entities.to_a }
    def start_operation(*) = (@ops << :start; @snapshot = all_entities.map { |e| [e, e.name, e.hidden] })
    def commit_operation = (@ops << :commit; @snapshot = nil)
    def abort_operation
      @ops << :abort
      @snapshot&.each { |e, n, h| e.name = n unless e.is_a?(Face); e.hidden = h }
      @snapshot = nil
    end
    def definitions = Definitions.new(@defs)
    def materials = Definitions.new([])
    def layers = Definitions.new([])
    def active_view = Struct.new(:z) { def zoom(*) = true }.new
    def export(path, options)
      @exported = options
      @names_at_export = all_entities.reject { |e| e.is_a?(Face) || e.hidden }.map(&:name)
      File.write(path, '<COLLADA/>')
      FileUtils.mkdir_p(File.join(File.dirname(path), File.basename(path, '.dae')))
      File.binwrite(File.join(File.dirname(path), File.basename(path, '.dae'), 'bois.jpg'), 'JPEG')
      true
    end
  end
end

module UI
  class << self
    attr_accessor :answers, :messages, :dir, :inputs
    def messagebox(text, type = 0) = ((@messages ||= []) << text; type == MB_YESNO ? (answers&.shift || IDYES) : 1)
    def select_directory(**) = dir
    def menu(*) = MenuStub.new
    def add_context_menu_handler(&) = true
    def inputbox(*) = inputs&.shift
    def start_timer(*, &b) = b.call
  end
  class MenuStub
    def add_submenu(*) = self
    def add_item(*) = self
  end
end

$LOAD_PATH.unshift(File.join(Dir.mktmpdir, 'stubs'))
FileUtils.mkdir_p($LOAD_PATH.first)
File.write(File.join($LOAD_PATH.first, 'sketchup.rb'), '')
File.write(File.join($LOAD_PATH.first, 'extensions.rb'), '')
require_relative 'viewbox_prep/main'

class MainSmokeTest < Minitest::Test
  S = Sketchup
  P = Geom::Point3d
  IN = 25.4
  PREP = Viewbox::Prep

  def box(x0, y0, z0, x1, y1, z1, mat = nil) = S::Face.new(P.new(x0 / IN, y0 / IN, z0 / IN), P.new(x1 / IN, y1 / IN, z1 / IN), mat)
  def t(x, y, z) = Geom::Transformation.translation(x / IN, y / IN, z / IN)

  # Reproduit la structure du modèle NVIDIA : composants ERP dans la Viewbox, vitrages/portes/murs posés à côté.
  def build_model
    d = {}
    d[:feet] = S::ComponentDefinition.new('7-632-001 Leveling feet', [box(0, 0, -100, 200, 200, 0)])
    d[:poles] = S::ComponentDefinition.new('7-355-014 Vertical poles simple', [box(0, 0, 0, 100, 100, 3000)])
    d[:frame] = S::ComponentDefinition.new('VBXM16FULL', [box(0, 0, 0, 5900, 2500, 3080)])
    d[:grp] = S::ComponentDefinition.new('Group587', [box(0, 0, 0, 50, 50, 50)], group: true)
    d[:viewbox] = S::ComponentDefinition.new('VBXM16FULL COMPLETE', [])
    d[:viewbox].entities << S::ComponentInstance.new(d[:frame], t(0, 0, 0))
    d[:viewbox].entities << S::ComponentInstance.new(d[:feet], t(0, 0, 0), tag: 'Leveling feet')
    d[:viewbox].entities << S::ComponentInstance.new(d[:poles], t(0, 0, 0))
    d[:viewbox].entities << S::Group.new(d[:grp], t(10, 10, 10), name: '7-355-14:1')
    d[:glass] = S::ComponentDefinition.new('7-637-010 Glasswall Seamless 10mm 2500X1130X#1', [box(0, 0, 0, 1130, 10, 2500, S::Material.new('Verre'))])
    d[:door] = S::ComponentDefinition.new('porte orangerie', [box(0, 0, 0, 1800, 60, 2300)])
    d[:nida] = S::ComponentDefinition.new('7-636-008 NIDAPLAST WALL WHITE  WHITE 1130x2520 COMPLETE - VIEWBOX M16', [box(0, 0, 0, 1130, 40, 2520)])
    d[:dibond] = S::ComponentDefinition.new('dibond noir 17700x780', [box(0, 0, 0, 17700, 5, 780)])
    d[:ground] = S::ComponentDefinition.new('Sol', [box(-10000, -10000, -10, 40000, 20000, 0)])
    tops = [
      S::ComponentInstance.new(d[:viewbox], t(0, 0, 0), name: 'VBX-01'),
      S::ComponentInstance.new(d[:viewbox], t(5900, 0, 0)), # sans nom : reconnue par sa taille
      S::ComponentInstance.new(d[:glass], t(100, 0, 150)),
      S::ComponentInstance.new(d[:glass], t(1300, 0, 150)),
      S::ComponentInstance.new(d[:door], t(6500, 0, 150)),
      S::ComponentInstance.new(d[:nida], t(8000, 2460, 150)), # façade arrière de VBX-02
      S::ComponentInstance.new(d[:dibond], t(0, -20, 3080)), # bandeau au-dessus du toit, sur 3 Viewbox : élément libre
      S::ComponentInstance.new(d[:door], t(30000, 0, 0)), # vraiment hors de toute Viewbox
      S::ComponentInstance.new(d[:ground], t(0, 0, 0), name: 'CTX_sol')
    ]
    [S::Model.new(tops, d.values), d]
  end

  def test_analyse_review_export
    model, d = build_model
    Sketchup.active_model = model
    a = PREP.analyze(model)
    assert_equal 1, a.named.size
    assert_equal 1, a.candidates.size
    assert_equal 4, a.attached.size # 2 vitrages, 1 porte, 1 mur : posés sur les Viewbox
    assert_equal [], a.orphans.map { |e| e.definition.name } # la porte lointaine n'est pas classée → pas « accessoire »
    assert_equal ['dibond noir 17700x780', 'porte orangerie'], a.others.map { |e| e.definition.name }.sort

    # ── Fenêtre de révision : données ──
    rows = PREP.review_rows(model)
    File.write(ENV['DUMP_REVIEW'], JSON.generate(rows)) if ENV['DUMP_REVIEW'] # pour tester la page HTML
    assert_equal ['VBXM16FULL COMPLETE'], rows['modules'].map { |m| m['name'] }
    assert_equal [5900, 2500], rows['modules'][0]['measured']
    comp = rows['components'].to_h { |r| [r['definition'], r] }
    assert_equal 'PIED', comp['7-632-001 Leveling feet']['auto']
    assert_equal 'balise', comp['7-632-001 Leveling feet']['autoSource']
    assert_equal 2, comp['7-632-001 Leveling feet']['count'] # 1 par Viewbox × 2 Viewbox
    assert_equal 'STRUCTURE', comp['7-355-014 Vertical poles simple']['auto']
    assert_nil comp['porte orangerie']['auto']
    assert_equal 2, comp['porte orangerie']['count']
    assert_equal '7-355-14:1', comp['Group587']['name'] # groupe : on montre son nom d'instance
    assert_nil rows['components'].first['auto'] # les types à classer d'abord

    # ── Fenêtre de révision : enregistrement ──
    payload = {
      'components' => [
        { 'id' => d[:door].entityID, 'category' => 'Porte orangerie', 'label' => 'Porte orangerie 1800', 'article' => '' },
        { 'id' => d[:nida].entityID, 'category' => 'MUR-LEGER', 'label' => '', 'article' => '' },
        { 'id' => d[:frame].entityID, 'category' => 'STRUCTURE', 'label' => 'Frame M16', 'article' => '' },
        { 'id' => d[:dibond].entityID, 'category' => 'IGNORER', 'label' => '', 'article' => '' },
        { 'id' => d[:grp].entityID, 'category' => '', 'label' => '', 'article' => '' }
      ],
      'modules' => [{ 'id' => d[:viewbox].entityID, 'type' => 'Viewbox M16 5900', 'nominal' => [2500, 5900] }]
    }
    assert_equal 9, PREP.apply_review(model, payload) # porte 2 + mur 1 + frame 2 + bandeau 1 + Viewbox 3
    assert_equal 'PORTE-ORANGERIE', d[:door].get_attribute('viewbox', 'userCategory')
    assert_equal '5900', d[:viewbox].get_attribute('viewbox', 'nominalLong')
    assert_equal 0, PREP.apply_review(model, payload) # rien de nouveau
    assert_includes PREP.review_rows(model)['categories'], 'PORTE-ORANGERIE'

    # ── Clic droit sur un objet isolé : choix individuel prioritaire ──
    lone_door = model.entities.to_a[7]
    UI.inputs = [['MUR-LOURD', '', 'Porte condamnée', '', 'La sélection seulement']]
    PREP.edit_selection(model, [lone_door])
    assert_equal ['MUR-LOURD', 'manuel'], PREP.category_for(lone_door)
    assert_equal ['PORTE-ORANGERIE', 'manuel'], PREP.category_for(model.entities.to_a[4])

    # ── Export ──
    a = PREP.analyze(model)
    assert_equal 1, a.orphans.size # la porte condamnée (MUR-LOURD) est loin de toute Viewbox
    PREP.prepare(model, a)
    a = PREP.analyze(model)
    names_before = model.all_entities.reject { |e| e.is_a?(S::Face) }.map(&:name)
    Dir.mktmpdir do |dir|
      zip = File.join(dir, 'out.zip')
      count, manifest = PREP.export_zip(model, a, zip, 'projet')
      assert_equal 3, count
      list = `python3 -c "import zipfile,sys; print('|'.join(sorted(zipfile.ZipFile(sys.argv[1]).namelist())))" #{zip}`.strip
      assert_equal 'manifest.json|projet.dae|projet/bois.jpg', list

      # pendant l'export : noms techniques uniques, bandeau ignoré absent (masqué)
      exported = model.names_at_export.grep(/\AVBXE-/)
      assert_equal exported.uniq.size, exported.size
      refute(model.names_at_export.any? { |n| n.to_s.include?('dibond') })
      # après l'export : le modèle est rétabli à l'identique
      assert_equal names_before, model.all_entities.reject { |e| e.is_a?(S::Face) }.map(&:name)
      assert(model.all_entities.none?(&:hidden))

      assert_equal %w[VBX-01 VBX-02], manifest['modules'].map { |m| m['id'] }
      m1 = manifest['modules'][0]
      assert_equal 'Viewbox M16 5900', m1['type']
      assert_equal [5900.0, 2500.0], m1['nominalPlanMm']
      frame = m1['accessories'].find { |x| x['definition'] == 'VBXM16FULL' }
      assert_equal ['STRUCTURE', 'manuel', 'Frame M16'], [frame['category'], frame['categorySource'], frame['label']]
      assert_match(/\AVBXE-\d+\z/, frame['exportName'])
      # définition partagée : même nom technique dans les deux Viewbox
      assert_equal frame['exportName'], manifest['modules'][1]['accessories'].find { |x| x['definition'] == 'VBXM16FULL' }['exportName']
      doors = manifest['common'].select { |x| x['definition'] == 'porte orangerie' }
      assert_equal [['PORTE-ORANGERIE', 'Porte orangerie 1800'], ['MUR-LOURD', 'Porte condamnée']], doors.map { |x| [x['category'], x['label']] }
      glass = manifest['common'].find { |x| x['definition'].start_with?('7-637-010') }
      assert_equal ['VITRE-SEAMLESS', 'définition', '7-637-010'], [glass['category'], glass['categorySource'], glass['articleRef']]
      assert_equal '', glass['name'] # nom d'origine conservé (vide ici)
      assert_equal [{ 'name' => 'CTX_sol', 'ignored' => false }, { 'name' => 'dibond noir 17700x780', 'ignored' => true }], manifest['context'].sort_by { |c| c['name'] }
    end
  end

  def test_full_menu_flow
    model, = build_model
    Sketchup.active_model = model
    Dir.mktmpdir do |dir|
      UI.dir = dir
      UI.messages = []
      # 1er lancement : types non classés → la fenêtre de révision est proposée ; on répond Non puis Oui, Oui
      UI.answers = [IDNO, IDYES, IDYES]
      PREP.prepare_and_export
      assert_match(/type\(s\) de composants ne sont pas classés/, UI.messages.first)
      assert_match(/Export terminé/, UI.messages.last)
      assert_equal 1, Dir.glob(File.join(dir, '*.zip')).size
      assert_equal 1, Dir.glob(File.join(dir, '*_rapport.txt')).size
    end
  end
end
