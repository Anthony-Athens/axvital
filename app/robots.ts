import { productionOrigin } from "@/lib/seo";
import type{MetadataRoute}from"next";export default function robots():MetadataRoute.Robots{const base=productionOrigin;return{rules:{userAgent:"*",allow:["/","/pricing","/privacy","/terms","/contact"],disallow:["/api/","/health/","/today","/profile","/settings/","/insights","/weekly-recap","/experiments"]},sitemap:base?base+"/sitemap.xml":undefined}}
