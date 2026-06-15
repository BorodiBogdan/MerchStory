import { ScrollViewStyleReset } from 'expo-router/html';

// Web HTML shell — Expo Router renders this as the outer <html> document on web.
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <title>MerchStory</title>

        {/* App identity + PWA manifest (Android "Install app", desktop PWA). */}
        <meta name="application-name" content="MerchStory" />
        <meta
          name="description"
          content="Turn raw product photos into professional AI-generated ads, catalogs, and wallpapers."
        />
        <meta name="theme-color" content="#6366F1" />
        <link rel="manifest" href="/manifest.json" />

        {/* iOS "Add to Home Screen": Safari ignores the manifest, so these tags
            (capable + title + apple-touch-icon) are what make the saved web app
            launch full-screen with the MerchStory mark instead of a screenshot. */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="MerchStory" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" href="/favicon.png" />

        {/* Required for expo-router web scroll behaviour */}
        <ScrollViewStyleReset />
        {/* Brand fonts, loaded once for the whole app. The id matches the one
            the landing/auth polish hooks look for, so they skip re-injecting. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          id="ms-landing-fonts"
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600;6..72,700&family=Inter:wght@400;500;600;700&display=swap"
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `
            /* App-wide web font: Inter for body text (text without an explicit
               fontFamily inherits this), Newsreader is used by display styles. */
            html, body {
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              -webkit-font-smoothing: antialiased;
              text-rendering: optimizeLegibility;
            }
            /* Override browser autofill background on all inputs.
               #222632 = rgba(255,255,255,0.05) composited over the card surface #161B27. */
            input:-webkit-autofill,
            input:-webkit-autofill:hover,
            input:-webkit-autofill:focus {
              -webkit-box-shadow: 0 0 0 1000px #222632 inset !important;
              -webkit-text-fill-color: #F8FAFC !important;
              caret-color: #F8FAFC;
              transition: background-color 5000s ease-in-out 0s;
            }
            /* Stop mobile browsers (notably iOS Safari) from auto-zooming and
               jumping to a focused field. The zoom only fires when the control's
               font-size is under 16px, so pin text controls to 16px on phone
               widths. iOS ignores viewport maximum-scale, so this is the only
               reliable fix and it leaves intentional pinch-zoom untouched. */
            @media (max-width: 768px) {
              input, textarea, select {
                font-size: 16px !important;
              }
            }
          `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
