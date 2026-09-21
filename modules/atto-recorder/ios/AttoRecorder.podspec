Pod::Spec.new do |s|
  s.name           = 'AttoRecorder'
  s.version        = '1.0.0'
  s.summary        = 'Native low latency studio recorder for the ATTO audio editor'
  s.description    = 'AVAudioEngine based take recorder with live monitoring, input gain, peak limiter, monitor reverb, backing track and overdub stem playback, meters and listen back preview.'
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
