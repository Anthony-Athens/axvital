// Public discovery URLs always point at the production host, including preview builds.
export const productionOrigin = "https://axvital.com";
export const publicUrl = (path: string) => `${productionOrigin}${path}`;
