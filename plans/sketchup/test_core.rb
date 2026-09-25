# encoding: UTF-8
# Tests de la logique pure de l'extension (hors SketchUp) : ruby plans/sketchup/test_core.rb
require 'minitest/autorun'
require 'tmpdir'
require 'fileutils'
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
    assert_nil C.category('Untagged')
    assert_nil C.category('Layer0')
  end

  def test_article_and_names
    assert_equal '7-230-044', C.article_ref('MUR-LEGER_#7-230-044')
    assert_equal 'VBX-03|PORTE-SIMPLE|02|#7-230-044', C.accessory_name('VBX-03|', 'PORTE-SIMPLE', 2, '7-230-044')
    assert_equal 'PORTE-SIMPLE|01', C.accessory_name('', 'PORTE-SIMPLE', 1)
    assert_equal 'Projet_SAP_Unit_3', C.safe_file_name('Projet SAP (Unit 3)')
  end

  def test_levels_and_numbers
    assert_equal [0, 0, 1, 0, 1, 2], C.group_levels([0, 120, 2800, -50, 2950, 5600])
    assert_equal [2, 4, 5], C.next_free_numbers([1, 3], 3)
    assert C.plan_dims_ok?(2500, 5900)
    refute C.plan_dims_ok?(2500, 6000)
    assert C.plan_dims_ok?(2600, 6000, 150.0)
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
end
