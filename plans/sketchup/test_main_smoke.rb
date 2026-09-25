# encoding: UTF-8
# Test de fumée de main.rb avec une imitation minimale de l'API SketchUp (hors SketchUp) :
#   ruby plans/sketchup/test_main_smoke.rb
# Vérifie l'enchaînement analyse → préparation (renommages, attributs) → manifest → .zip.
require 'minitest/autorun'
require 'tmpdir'
require 'fileutils'
require 'json'

# ─── Imitation de l'API SketchUp (unités internes : pouces) ───
MB_YESNO = 4
IDYES = 6
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
    def version = '26.0.0'
    def register_extension(*) = true
  end
  Layer = Struct.new(:name)
  Material = Struct.new(:name)

  module Attr
    def set_attribute(d, k, v) = ((@attrs ||= {})[[d, k]] = v)
    def get_attribute(d, k) = (@attrs ||= {})[[d, k]]
  end

  class Entities
    include Enumerable
    def initialize(list = []) = (@list = list)
    def each(&b) = @list.each(&b)
    def <<(e) = (@list << e; self)
  end

  class Face
    include Attr
    attr_accessor :material, :back_material, :layer
    def initialize(min, max, material = nil) = (@box = Geom::BoundingBox.new.add(min, max); @material = material)
    def bounds = @box
  end

  class ComponentDefinition
    attr_accessor :name, :entities, :instances
    def initialize(name, list) = (@name, @entities, @instances = name, Entities.new(list), [])
    def count_instances = instances.size
    def bounds = Geom::BoundingBox.new.add(entities.flat_map { |e| [e.bounds.min, e.bounds.max] })
  end

  class ComponentInstance
    include Attr
    attr_accessor :name, :definition, :transformation, :layer, :material, :hidden
    def initialize(definition, tr, name: '', tag: 'Untagged')
      @definition, @transformation, @name, @layer = definition, tr, name, Layer.new(tag)
      definition.instances << self
    end
    def bounds
      b = definition.bounds
      Geom::BoundingBox.new.add((0..7).map { |i| b.corner(i).transform(transformation) })
    end
  end

  class Group < ComponentInstance; end

  class Model
    attr_accessor :entities, :path, :title, :ops, :exported
    def initialize(list) = (@entities, @path, @title, @ops = Entities.new(list), '', 'Projet test', [])
    def start_operation(*) = (@ops << :start)
    def commit_operation = (@ops << :commit)
    def abort_operation = (@ops << :abort)
    def definitions = Purgeable.new
    def materials = Purgeable.new
    def layers = Purgeable.new
    def export(path, options)
      @exported = options
      File.write(path, '<COLLADA/>')
      FileUtils.mkdir_p(File.join(File.dirname(path), File.basename(path, '.dae')))
      File.binwrite(File.join(File.dirname(path), File.basename(path, '.dae'), 'bois.jpg'), 'JPEG')
      true
    end
  end

  class Purgeable
    def purge_unused = true
  end
end

module UI
  class << self
    attr_accessor :answers, :messages, :dir
    def messagebox(text, type = 0) = ((@messages ||= []) << text; type == MB_YESNO ? (answers&.shift || IDYES) : 1)
    def select_directory(**) = dir
    def menu(*) = MenuStub.new
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

  def box(x0, y0, z0, x1, y1, z1, mat = nil) = S::Face.new(P.new(x0 / IN, y0 / IN, z0 / IN), P.new(x1 / IN, y1 / IN, z1 / IN), mat)
  def t(x, y, z) = Geom::Transformation.translation(x / IN, y / IN, z / IN)

  def build_model
    door_def = S::ComponentDefinition.new('Porte simple 900', [box(0, 0, 0, 20, 900, 2150)])
    glass_def = S::ComponentDefinition.new('Vitrage 5700', [box(0, 0, 0, 5700, 20, 2550, S::Material.new('Verre'))])
    frame_def = S::ComponentDefinition.new('Cadre', [box(0, 0, 0, 5900, 2500, 2800)])
    foot_def = S::ComponentDefinition.new('Pied réglable', [box(0, 0, -100, 200, 200, 0)])
    viewbox = S::ComponentDefinition.new('Viewbox 5900', [])
    viewbox.entities << S::Group.new(frame_def, t(0, 0, 0), name: 'STRUCTURE_cadre')
    viewbox.entities << S::ComponentInstance.new(glass_def, t(100, 0, 150), tag: 'Windwos Seamless')
    viewbox.entities << S::ComponentInstance.new(door_def, t(5880, 800, 150))
    viewbox.entities << S::ComponentInstance.new(foot_def, t(0, 0, 0))
    viewbox.entities << S::ComponentInstance.new(foot_def, t(5700, 0, 0))
    unique = S::ComponentDefinition.new('Viewbox étage', [S::Group.new(frame_def, t(0, 0, 0), name: 'STRUCTURE_cadre'),
                                                          S::ComponentInstance.new(door_def, t(5880, 800, 150)),
                                                          S::ComponentInstance.new(door_def, t(5880, 1700, 150))])
    stair_def = S::ComponentDefinition.new('Escalier', [box(0, 0, 0, 1500, 1000, 2800)])
    ground_def = S::ComponentDefinition.new('Sol', [box(-10000, -10000, -10, 40000, 20000, 0)])
    orphan_def = S::ComponentDefinition.new('Double Door 1800', [box(0, 0, 0, 1800, 100, 2300)])
    S::Model.new([
      S::ComponentInstance.new(viewbox, t(0, 0, 0), name: 'VBX-01'),
      S::ComponentInstance.new(viewbox, t(5900, 0, 0)), # sans nom : reconnue par ses dimensions
      S::ComponentInstance.new(unique, t(0, 0, 2800)), # sans nom, à l'étage, définition unique
      S::ComponentInstance.new(stair_def, t(-2000, 0, 0), name: 'COMMUN_ESCALIER-01'),
      S::ComponentInstance.new(ground_def, t(0, 0, 0), name: 'CTX_sol'),
      S::ComponentInstance.new(orphan_def, t(30000, 0, 0))
    ])
  end

  def test_analyse_prepare_manifest_zip
    model = build_model
    Sketchup.active_model = model
    a = Viewbox::Prep.analyze(model)
    assert_equal 1, a.named.size
    assert_equal 2, a.candidates.size
    assert_equal 1, a.orphans.size
    assert_equal 1, a.common.size
    assert_equal 1, a.context.size
    assert_equal [0, 0, 1], (a.named + a.candidates).map { |m| a.levels[m] }

    renamed_modules, renamed_items = Viewbox::Prep.prepare(model, a)
    assert_equal 2, renamed_modules
    names = model.entities.map(&:name)
    assert_includes names, 'VBX-02'
    assert_includes names, 'VBX-03'
    assert_equal 'VBX-03', model.entities.to_a[2].name # l'étage vient après le rez-de-chaussée
    viewbox_items = model.entities.first.definition.entities.map(&:name)
    # définition partagée par 2 Viewbox : pas de préfixe de module ; les deux pieds sans nom sont numérotés
    assert_includes viewbox_items, 'VITRE-SEAMLESS|01'
    assert_includes viewbox_items, 'PORTE-SIMPLE|01'
    assert_equal %w[PIED|01 PIED|02], viewbox_items.grep(/PIED/).sort
    unique_items = model.entities.to_a[2].definition.entities.map(&:name)
    assert_equal ['STRUCTURE_cadre', 'VBX-03|PORTE-SIMPLE|01', 'VBX-03|PORTE-SIMPLE|02'], unique_items
    assert renamed_items >= 6
    assert_equal 'VITRE-SEAMLESS', model.entities.first.definition.entities.to_a[1].get_attribute('viewbox', 'category')
    assert_equal [:start, :commit], model.ops

    a = Viewbox::Prep.analyze(model)
    manifest = Viewbox::Prep.build_manifest(model, a)
    assert_equal %w[VBX-01 VBX-02 VBX-03], manifest['modules'].map { |m| m['id'] }
    m2 = manifest['modules'][1]
    glass = m2['accessories'].find { |x| x['category'] == 'VITRE-SEAMLESS' }
    assert_equal 'Windwos Seamless', glass['tag']
    assert_equal ['Verre'], glass['materials']
    assert_in_delta 5900 + 100, glass['bboxWorld']['min'][0], 0.2 # boîte monde propre à VBX-02
    assert_in_delta 5900 * IN / IN, m2['transform'][12], 0.01
    assert_equal ['CTX_sol'], manifest['context'].map { |c| c['name'] }
    assert_equal 2, manifest['common'].size

    Dir.mktmpdir do |dir|
      zip = File.join(dir, 'out.zip')
      count = Viewbox::Prep.export_zip(model, manifest, zip, 'projet')
      assert_equal 3, count
      assert_equal false, model.exported[:doublesided_faces]
      assert_equal true, model.exported[:preserve_instancing]
      list = `python3 -c "import zipfile,sys; print('|'.join(sorted(zipfile.ZipFile(sys.argv[1]).namelist())))" #{zip}`.strip
      assert_equal 'manifest.json|projet.dae|projet/bois.jpg', list
      assert_equal :abort, model.ops.last # visibilité du contexte rétablie
    end
  end

  def test_full_menu_flow
    model = build_model
    Sketchup.active_model = model
    Dir.mktmpdir do |dir|
      UI.dir = dir
      UI.answers = [IDYES, IDYES]
      UI.messages = []
      Viewbox::Prep.prepare_and_export
      assert_match(/Export terminé/, UI.messages.last)
      assert_equal 1, Dir.glob(File.join(dir, '*.zip')).size
      assert_equal 1, Dir.glob(File.join(dir, '*_rapport.txt')).size
    end
  end
end
