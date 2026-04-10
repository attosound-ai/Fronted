module.exports = {
  dependencies: {
    // Twilio Voice native module crashes on Android without Firebase/VoiceApplicationProxy.
    // Disable auto-linking on Android until Firebase is configured.
    '@twilio/voice-react-native-sdk': {
      platforms: {
        android: null,
      },
    },
    // iOS-only library — no Android native module exists.
    'react-native-ios-context-menu': {
      platforms: {
        android: null,
      },
    },
  },
};
