import type { AnchorHTMLAttributes } from "react";
export function navigate(href:string){window.history.pushState({},"",href);window.dispatchEvent(new Event("popstate"));}
export function useRouter(){return{push:navigate,replace:navigate};}
export default function Link({href,...props}:AnchorHTMLAttributes<HTMLAnchorElement>){return <a {...props} href={href} onClick={e=>{e.preventDefault();if(href)navigate(href);}}/>;}
