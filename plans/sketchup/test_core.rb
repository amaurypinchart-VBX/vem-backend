# encoding: UTF-8
# Tests de la logique pure de l'extension (hors SketchUp) : ruby plans/sketchup/test_core.rb
require 'minitest/autorun'
require 'tmpdir'
require 'fileutils'
require 'json'
require_relative 'viewbox_prep/core'

class CoreTest < Minitest::Test
  C = Viewbox::Prep::Core

  def test_module_id
    assert_equal 'VBX-01', C.module_id('VBX-01')
    assert_equal 'VBX-07', C.module_id('vbx_7')
    assert_equal 'VBX-12', C.module_id('VBX 12 entrée')
    assert_nil C.module_id('VBX-03|PORTE-SIMPLE|02')
    assert_nil C.module_id('Viewbox 5900')
  end

  def test_category_from_tags_and_names
    assert_equal 'VITRE-SEAMLESS', C.category('Windwos Seamless')
    assert_equal 'VITRE-CADRE', C.category('Windows Frame')
    assert_equal 'MUR-LEGER', C.category('WALL LIGHT')
    assert_equal 'MUR-LOURD', C.category('Mur lourd')
    assert_equal 'PORTE-SIMPLE', C.category('Single Door')
    assert_equal 'PORTE-DOUBLE', C.category('Double Door')
    assert_equal 'PORTE-COULISSANTE', C.category('Full Slidding door')
    assert_equal 'MUR-LEGER', C.category('Mur léger')
    # élément terrasse 5,9 × 2,5 m : catégorie, donc jamais pris pour une Viewbox
    assert_equal 'TERRASSE', C.category('7-632-029 TERRACE PLATFORM - VIEWBOX M16')
    assert_equal 'TERRASSE', C.category('Terrasse VIP')
    assert_equal 'ESCALIER', C.category('STAIRWAYKIT WITH PLATEFORM')
    assert_nil C.category('Untagged')
    assert_nil C.category('Layer0')
  end

  def test_article_and_names
    assert_equal '7-230-044', C.article_ref('MUR-LEGER_#7-230-044')
    assert_equal 'VBXE-12', C.export_name(12)
    assert_equal 'PORTE-ORANGERIE', C.category_key('Porte orangerie')
    assert_equal 'IGNORER', C.category_key('ignorer')
    assert_equal 'Projet_SAP_Unit_3', C.safe_file_name('Projet SAP (Unit 3)')
  end

  def test_erp_vocabulary
    assert_equal 'PIED', C.category('7-632-001 Leveling feet')
    assert_equal 'STRUCTURE', C.category('7-355-014 Vertical poles simple')
    assert_equal 'PLANCHER', C.category('7-632-001 Floor module equipped with:')
    assert_equal 'VITRE-SEAMLESS', C.category('7-637-010 Glasswall Seamless 10mm 2500X1130X#1')
    assert_nil C.category('porte orangerie')
    assert_nil C.category('Napoleon')
  end

  def test_center_inside
    assert C.center_inside?([0, 0, 0], [100, 20, 2500], [0, 0, 0], [5900, 2500, 3000])
    assert C.center_inside?([-40, 0, 0], [-20, 20, 2500], [0, 0, 0], [5900, 2500, 3000]) # à moins de 50 mm
    refute C.center_inside?([-200, 0, 0], [-100, 20, 2500], [0, 0, 0], [5900, 2500, 3000])
  end

  def test_levels_and_numbers
    assert_equal [0, 0, 1, 0, 1, 2], C.group_levels([0, 120, 2800, -50, 2950, 5600])
    assert_equal [2, 4, 5], C.next_free_numbers([1, 3], 3)
    assert C.plan_dims_ok?(2500, 5900)
    refute C.plan_dims_ok?(2500, 6000)
    assert C.plan_dims_ok?(2600, 6000, 150.0)
  end

  def test_struct_params
    assert_equal 'CAT-UPN160', C.struct_section_key('UPN 160')
    assert_equal 'CAT-SHS120x120x5', C.struct_section_key('SHS 120 × 120 × 5'.delete(' ').sub('SHS', 'SHS '))
    assert_equal 'UNP220', C.struct_section_key('UNP220')
    assert_nil C.struct_section_key('gabarit')
    assert_nil C.struct_section_key('  ')
    assert_equal 'UPN 160', C.struct_section_text('CAT-UPN160')
    assert_equal 'gabarit', C.struct_section_text(nil)
    p = C.struct_params('topZ' => '5000', 'sections' => { 'rim-floor' => 'UPN 160', 'column' => 'gabarit' }, 'grades' => { 'column' => 'S355', 'rim-roof' => 'gabarit' }, 'plywood' => '18')
    assert_equal({ 'v' => 1, 'topZ' => 5000, 'sections' => { 'rim-floor' => 'CAT-UPN160' }, 'grades' => { 'column' => 'S355' } }, p)
    assert_nil C.struct_params('topZ' => '3080', 'sections' => { 'rim-floor' => 'gabarit' }, 'plywood' => '18')
    assert_equal 'Viewbox modifiée (3 paramètres)', C.struct_summary(p)
    assert_equal 'Viewbox standard', C.struct_summary(nil)
    assert_equal p, C.parse_struct(JSON.generate(p))
    assert_nil C.parse_struct('pas du json')
    assert_nil C.parse_struct('{"v":1}')
  end

  def test_zip_is_readable
    Dir.mktmpdir do |dir|
      src = File.join(dir, 'src')
      FileUtils.mkdir_p(File.join(src, 'modele'))
      File.write(File.join(src, 'modele.dae'), '<COLLADA>' + ('x' * 5000) + '</COLLADA>')
      File.binwrite(File.join(src, 'modele', 'texture é.png'), (0..255).map(&:chr).join * 10)
      File.write(File.join(src, 'manifest.json'), '{"schema":"viewbox-manifest/1"}')
      zip = File.join(dir, 'out.zip')
      assert_equal 3, C.zip_directory(src, zip)
      check = `python3 -c "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print('|'.join(sorted(z.namelist()))); print(len(z.read('modele/texture é.png')))" #{zip} 2>&1`
      assert_equal "manifest.json|modele.dae|modele/texture é.png\n2560\n", check
    end
  end

  # ─── S12 : structure dessinée ───
  def test_struct_roles_and_names
    assert_equal 11, C::STRUCT_ROLES.size
    assert_equal 'Traverse du plancher', C::STRUCT_ROLE_LABELS['transverse-floor']
    assert C.plan_dims_ok?(2438, 6058, long: 6058, short: 2438)
    refute C.plan_dims_ok?(2438, 6058)
    bmin = [0, 0, 0]
    bmax = [5900, 2500, 3080]
    assert_equal 'rim-floor', C.role_guess([0, 40, 80], [5900, 40, 80], bmin, bmax)
    assert_equal 'rim-roof', C.role_guess([0, 2460, 3000], [5900, 2460, 3000], bmin, bmax)
    assert_equal 'transverse-floor', C.role_guess([1000, 0, 80], [1000, 2500, 80], bmin, bmax)
    assert_equal 'stringer-roof', C.role_guess([0, 1250, 3000], [5900, 1250, 3000], bmin, bmax)
    assert_equal 'column', C.role_guess([50, 50, 0], [50, 50, 3080], bmin, bmax)
    assert_equal 'brace', C.role_guess([0, 0, 100], [2000, 0, 2900], bmin, bmax)
    # module tourné (grand côté selon y) : mêmes rôles
    assert_equal 'rim-floor', C.role_guess([40, 0, 80], [40, 5900, 80], [0, 0, 0], [2500, 5900, 3080])
    assert_equal 'transverse-floor', C.role_guess([0, 1000, 80], [2500, 1000, 80], [0, 0, 0], [2500, 5900, 3080])

    {
      'UPN200' => ['UPN 200', 'CAT-UPN200'], 'Profil UPN 200 rive' => ['UPN 200', 'CAT-UPN200'], 'IPE 200' => ['IPE 200', 'CAT-IPE200'],
      'HEA160' => ['HEA 160', 'CAT-HEA160'], 'RHS 120x60x4' => ['RHS 120x60x4', 'CAT-RHS120x60x4'],
      'Tube 100x100x5' => ['SHS 100x100x5', 'CAT-SHS100x100x5'], 'SHS 100x5' => ['SHS 100x100x5', 'CAT-SHS100x100x5'],
      'Plat 130x15' => ['PLAT 130x15', 'CAT-PLAT130x15'], 'U 200x80x5' => ['U 200x80x5', 'CAT-U200x80x5'],
      'tube 60,3x2,9' => nil, 'CHS 60.3x2.9' => ['CHS 60.3x2.9', 'CAT-CHS60.3x2.9']
    }.each do |name, want|
      got = C.section_from_name(name)
      want ? assert_equal(want, [got['text'], got['key']], name) : assert_nil(got, name)
    end
    assert_nil C.section_from_name('VBX-03 Viewbox 5900')
    assert_nil C.section_from_name('Kingspan 60')
  end

  def rect(w, h) = [[-w / 2.0, -h / 2.0], [w / 2.0, -h / 2.0], [w / 2.0, h / 2.0], [-w / 2.0, h / 2.0]]

  def test_section_dims_and_loops
    tube = C.section_dims(rect(120, 60), [rect(112, 52).reverse])
    assert_equal ['tube', 60.0, 120.0], [tube['shape'], tube['h'], tube['b']]
    assert_in_delta 4.0, tube['t'], 0.2
    plat = C.section_dims(rect(130, 15))
    assert_equal ['flat', 15.0, 130.0], [plat['shape'], plat['h'], plat['b']]
    # UPN 200 simplifié (âme 8,5, ailes 11,5)
    upn = [[0, 0], [75, 0], [75, 11.5], [8.5, 11.5], [8.5, 188.5], [75, 188.5], [75, 200], [0, 200]]
    u = C.section_dims(upn)
    assert_equal ['open', 200.0, 75.0], [u['shape'], u['h'], u['b']]
    assert_in_delta 10, u['t'], 2
    # segments d'une coupe de tube, dans le désordre et retournés → 2 boucles fermées
    segs = []
    [rect(120, 60), rect(112, 52)].each { |l| l.each_with_index { |p, i| segs << [p, l[(i + 1) % 4]] } }
    segs = segs.each_with_index.map { |sg, i| i.odd? ? sg.reverse : sg }.shuffle(random: Random.new(3))
    loops = C.slice_segments_to_loops(segs)
    assert_equal [4, 4], loops.map(&:size)
    assert_equal [7200.0, 5824.0], loops.map { |l| C.polygon_area(l).abs.round(1) }.sort.reverse
    # simplification : points alignés retirés
    dense = (0..10).map { |i| [i * 10.0, 0.0] } + [[100.0, 50.0], [0.0, 50.0]]
    assert_equal 4, C.simplify_loop(dense, 0.2).size
  end

  def test_frame_json_and_unconnected
    m = lambda do |id, role, a, b|
      { 'id' => id, 'name' => id, 'definition' => 'def', 'a' => a, 'b' => b, 'yRef' => [0, 1, 0], 'loops' => [rect(100, 100)], 'role' => role }
    end
    bars = [
      m.('c', 'column', [0, 0, 0], [0, 0, 3000.04]),
      m.('r', 'rim-floor', [0, 0, 80], [5900.04, 0, 80]),
      m.('x', 'other', [3000, 1500, 1500], [3500, 1500, 1500])
    ]
    assert_equal ['x'], C.unconnected(bars).map { |b| b['id'] }
    j = C.frame_json(bars, ['w'], [[0, 0, 0], [5900, 2500, 3080]])
    assert_equal %w[r c x], j['members'].map { |b| b['id'] }
    assert_equal [5900.0, 0.0, 80.0], j['members'][0]['b']
    assert_equal({ 'min' => [0.0, 0.0, 0.0], 'max' => [5900.0, 2500.0, 3080.0] }, j['bounds'])
    assert_equal JSON.generate(j), JSON.generate(C.frame_json(bars.reverse, ['w'], [[0, 0, 0], [5900, 2500, 3080]]))
  end
end
