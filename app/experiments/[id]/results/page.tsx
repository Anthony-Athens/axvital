import{ExperimentDetail}from"@/components/experiments/ExperimentDetail";export default async function Page({params}:{params:Promise<{id:string}>}){return <ExperimentDetail id={(await params).id}/>}
