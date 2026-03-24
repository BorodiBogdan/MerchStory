import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { View } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

export default function SocialCallbackScreen() {
  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession();

    if (typeof window !== 'undefined' && window.opener) {
      // Facebook appends #_=_ which pushes query params into the hash.
      // Reconstruct a clean URL with the params in the right place.
      let callbackUrl = window.location.href;
      if (window.location.hash.startsWith('#_=_')) {
        const afterFragment = window.location.hash.slice(4); // e.g. "?status=linked&provider=facebook"
        callbackUrl =
          window.location.origin +
          window.location.pathname +
          window.location.search +
          afterFragment;
      }
      window.opener.postMessage({ type: 'social-callback', url: callbackUrl }, '*');
      window.close();
    }
  }, []);

  return <View />;
}
