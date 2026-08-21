import { EpisodeDetail } from "@/components/episodes/EpisodeDetail";
export default async function Page({params}:{params:Promise<{id:string}>}){const{id}=await params;return <EpisodeDetail id={id}/>}
