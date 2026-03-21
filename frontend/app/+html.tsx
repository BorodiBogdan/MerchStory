import { ScrollViewStyleReset } from 'expo-router/html';

// Web HTML shell — Expo Router renders this as the outer <html> document on web.
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        {/* Required for expo-router web scroll behaviour */}
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{
          __html: `
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
          `,
        }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
