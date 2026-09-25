# encoding: UTF-8
# Viewbox — préparation des modèles SketchUp pour VEM (chargeur de l'extension).
# Installation : Extensions › Gestionnaire d'extensions › Installer l'extension › viewbox_prep.rbz
require 'sketchup.rb'
require 'extensions.rb'

module Viewbox
  module Prep
    unless file_loaded?(__FILE__)
      ext = SketchupExtension.new('Viewbox — Préparer & exporter pour VEM', File.join(File.dirname(__FILE__), 'viewbox_prep', 'main'))
      ext.description = "Contrôle et nomme les Viewbox (VBX-01…), classe les accessoires d'après leurs balises, " \
                        'et exporte un .zip (.dae + textures + manifest.json) prêt pour le module Plans Viewbox de VEM.'
      ext.version = '1.1.0'
      ext.creator = 'Viewbox International SA'
      ext.copyright = '© Viewbox International SA'
      Sketchup.register_extension(ext, true)
      file_loaded(__FILE__)
    end
  end
end
