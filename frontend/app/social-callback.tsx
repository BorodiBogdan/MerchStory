import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { View } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

export default function SocialCallbackScreen() {
  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession();

    if (typeof window !== 'undefined' && window.opener) {
      window.opener.postMessage({ type: 'social-callback', url: window.location.href }, '*');
      window.close();
    }
  }, []);

  return <View />;
}
