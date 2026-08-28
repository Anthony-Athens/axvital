import {useEffect,useState} from "react";
import {createRoot} from "react-dom/client";
import {ExperimentWizard} from "../../components/experiments/ExperimentWizard";
import {ExperimentsHome} from "../../components/experiments/ExperimentsHome";
import {ExperimentDetail} from "../../components/experiments/ExperimentDetail";
import {ActiveStudyStatus} from "../../components/experiments/ActiveStudyStatus";
import {counters,fixtureFetch,id,legacyId,scenario} from "./data";
import {navigate} from "./navigation";
window.fetch=fixtureFetch;
function Preview(){const[path,setPath]=useState(location.pathname),[,render]=useState(0);useEffect(()=>{const update=()=>setPath(location.pathname);window.addEventListener("popstate",update);const timer=setInterval(()=>render(n=>n+1),500);return()=>{clearInterval(timer);window.removeEventListener("popstate",update);};},[]);
return <><aside className="border-b bg-amber-50 p-3 text-sm"><strong>Local synthetic data only — no live requests.</strong><nav className="flex flex-wrap gap-3">{[["Home","/experiments"],["New wizard","/experiments/new"],["Saved draft",`/experiments/${id}/edit`],["V2 status",`/experiments/${id}`],["Legacy detail",`/experiments/${legacyId}`]].map(([label,url])=><button className="min-h-11 underline" key={label} onClick={()=>navigate(url)}>{label}</button>)}</nav><label>Preview access <select onChange={e=>{scenario.premium=e.target.value==="premium";}}><option value="premium">Premium</option><option value="free">Free</option></select></label><label className="ml-3">Readiness fixture <select onChange={e=>{scenario.readiness=e.target.value;}}>{["good","limited","insufficient","failed"].map(s=><option key={s}>{s}</option>)}</select></label><p>Requests: creates {counters.creates} · saves {counters.saves} · starts {counters.starts} · readiness {counters.readiness}</p></aside>
{path==="/study-preview"?<ActiveStudyStatus id={id}/>:path.endsWith("/new")?<ExperimentWizard key={path}/>:path.endsWith("/edit")?<ExperimentWizard key={path} draftId={id}/>:path===`/experiments/${id}`||path===`/experiments/${legacyId}`?<ExperimentDetail key={path} id={path.split("/").at(-1)!}/>:<ExperimentsHome/>}</>;
}createRoot(document.getElementById("root")!).render(<Preview/>);
