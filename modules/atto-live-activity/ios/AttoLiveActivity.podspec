Pod::Spec.new do |s|
  s.name           = 'AttoLiveActivity'
  s.version        = '1.0.0'
  s.summary        = 'Live Activity for posts on their way out'
  s.description    = 'Starts, updates and ends the ActivityKit Live Activity that shows a post uploading, Instagram style.'
  s.author         = 'ATTO SOUND'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.license        = { :type => 'MIT' }
  s.platforms = {
    :ios => '15.1'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
