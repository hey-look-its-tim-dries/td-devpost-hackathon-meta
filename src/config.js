// src/config.js
// What the owner fills in. FB_APP_ID: the App ID of the Meta developer app that has Facebook Login for
// the web (README: "Signing in with Facebook"). Empty: no Facebook button, everyone plays as a guest
// whose garden is kept by device. The app's secret never comes here: it is a secret of the map's Worker.
export const FB_APP_ID = '';
// GOOGLE_CLIENT_ID: the OAuth client ID (type Web application) from Google Cloud (README: "Signing in with Google").
// Empty: no Google button. It has no secret; the same ID goes into server/wrangler.toml.
export const GOOGLE_CLIENT_ID = '';
