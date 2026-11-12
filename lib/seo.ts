// Public discovery URLs always point at the production host, including preview builds.
export const productionOrigin = "https://axvital.com";
export const publicUrl = (path: string) => `${productionOrigin}${path}`;

// Child routes that set their own `openGraph` replace the root one entirely, which
// drops the generated card image. Public pages build their social tags here instead.
export const socialImage = { url: "/opengraph-image", width: 1200, height: 630, alt: "AXVital: track what matters, discover what works" };
export function socialMetadata(title: string, description: string, path: string) {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website" as const, siteName: "AXVital", title, description, url: path, images: [socialImage] },
    twitter: { card: "summary_large_image" as const, title, description, images: [socialImage] },
  };
}
