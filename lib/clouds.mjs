// Per-cloud profile: where to log in, and how to tell we're logged in.
export const CLOUDS = {
  aws: {
    home: "https://console.aws.amazon.com/console/home",
    loggedIn: (url) => /\.console\.aws\.amazon\.com/.test(url) && !/signin\./.test(url),
  },
  azure: {
    home: "https://portal.azure.com/",
    // Azure portal and the Entra admin center share one Entra SSO session, so a
    // live token on either domain means we're signed in (Entra modules navigate
    // to entra.microsoft.com blades).
    loggedIn: (url) => /portal\.azure\.com|entra\.microsoft\.com/.test(url) && !/login\.(microsoftonline|live)\./.test(url),
    // Azure/Entra auth (MSA + corporate SSO) can't be replayed from a saved
    // session, so we attach over CDP to a Chrome the user logged into manually.
    cdp: true,
  },
  gcp: {
    home: "https://console.cloud.google.com/",
    loggedIn: (url) => /console\.cloud\.google\.com/.test(url) && !/accounts\.google\.com/.test(url),
  },
};
