"use client";
import {useRef,useState} from "react";
import {Button,InlineNotice} from "@/components/ui/design-system";
export function ExportDataButton(){const[pending,setPending]=useState(false),[message,setMessage]=useState(""),[failed,setFailed]=useState(false);const busy=useRef(false);
  async function download(){if(busy.current)return;busy.current=true;setPending(true);setMessage("");setFailed(false);try{
    const response=await fetch("/api/account/export",{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},body:"{}"});
    if(!response.ok)throw new Error("EXPORT_FAILED");
    const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download="axvital-account-export.json";document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage("Your export is ready. Check your browser’s downloads and store the file securely.");
  }catch{setFailed(true);setMessage("We couldn't prepare your data export. Please try again. If the problem continues, contact Support; large exports may need assistance.")}finally{busy.current=false;setPending(false)}}
  return <div className="space-y-3"><Button onClick={()=>void download()} disabled={pending}>{pending?"Preparing your export...":"Download my data"}</Button>{message&&<InlineNotice tone={failed?"error":"success"}>{message}</InlineNotice>}</div>;
}
