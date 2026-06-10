// Per-cloud profile: where to log in, and how to tell we're logged in.
export const CLOUDS = {
  aws: {
    home: "https://console.aws.amazon.com/console/home",
    loggedIn: (url) => /\.console\.aws\.amazon\.com/.test(url) && !/signin\./.test(url),
  },
  azure: {
    home: "https://portal.azure.com/",
    loggedIn: (url) => /portal\.azure\.com/.test(url) && !/login\.(microsoftonline|live)\./.test(url),
  },
  gcp: {
    home: "https://console.cloud.google.com/",
    loggedIn: (url) => /console\.cloud\.google\.com/.test(url) && !/accounts\.google\.com/.test(url),
  },
};
