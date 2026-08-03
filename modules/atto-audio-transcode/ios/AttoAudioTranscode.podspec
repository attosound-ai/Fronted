Pod::Spec.new do |s|
  s.name           = 'AttoAudioTranscode'
  s.version        = '1.0.0'
  s.summary        = 'On-device audio normalisation to 8 kHz mono PCM WAV'
  s.description    = 'Converts imported audio to the project pipeline target format before upload, so the upload is ~11x smaller and the server can skip its ffmpeg pass.'
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
