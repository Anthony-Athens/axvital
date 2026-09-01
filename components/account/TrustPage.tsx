import Link from "next/link";
import {Footer} from "@/components/Footer";
import {publicTrustDetails} from "@/lib/account/trust";
export function TrustPage({title,children}:{title:string;children:React.ReactNode}){
  const details=publicTrustDetails();
  return <><article className="mx-auto max-w-3xl px-4 py-10"><h1 className="text-3xl font-semibold">{title}</h1>{details.operator&&<p className="mt-2 text-sm text-slate-600">Operated by {details.operator}</p>}<div className="mt-6 space-y-6 leading-7 text-slate-700">{children}</div><nav aria-label="Trust and account links" className="mt-8 flex flex-wrap gap-4 border-t pt-4">{[["/privacy","Privacy"],["/terms","Terms"],["/contact","Contact"],["/settings","Account controls"]].map(([href,label])=><Link className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline" key={href} href={href}>{label}</Link>)}</nav></article><Footer/></>;
}
