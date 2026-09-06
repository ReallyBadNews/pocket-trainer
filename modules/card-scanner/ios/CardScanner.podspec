Pod::Spec.new do |s|
  s.name = 'CardScanner'
  s.version = '1.0.0'
  s.summary = 'On-device English and Japanese card text recognition'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = 'Pocket Trainer'
  s.homepage = 'https://github.com/ReallyBadNews/pokedex'
  s.platforms = { :ios => '16.4' }
  s.source = { :git => 'https://github.com/ReallyBadNews/pokedex.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision', 'CoreImage', 'ImageIO'
  s.source_files = '**/*.swift'
  s.swift_version = '5.9'
end
