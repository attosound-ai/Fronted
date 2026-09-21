Pod::Spec.new do |s|
  s.name           = 'AttoTimeline'
  s.version        = '1.0.0'
  s.summary        = 'Native audio editor timeline (ruler, lanes, waveforms, selection, playhead)'
  s.description    = 'UIScrollView based timeline drawn with Core Graphics so scrolling, pinch zoom, selection and clip drags run natively at display rate.'
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
