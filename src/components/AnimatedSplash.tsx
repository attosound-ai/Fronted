import React from 'react';
import { View, StyleSheet } from 'react-native';
import WebView from 'react-native-webview';
import { SPLASH_HTML } from './splashHtml';

interface Props {
  onAnimationComplete: () => void;
}

export default function AnimatedSplash({ onAnimationComplete }: Props) {
  return (
    <View style={styles.container}>
      <WebView
        source={{ html: SPLASH_HTML }}
        style={styles.webview}
        scrollEnabled={false}
        bounces={false}
        javaScriptEnabled={true}
        originWhitelist={['*']}
        onMessage={(event) => {
          if (event.nativeEvent.data === 'done') {
            onAnimationComplete();
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
