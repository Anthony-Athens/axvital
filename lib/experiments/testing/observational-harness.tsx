import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {ObservationalWorkspace} from '../../../components/experiments/ObservationalWorkspace';
let root:Root|null=null;
export {act};
export function mount(){root=createRoot(document.getElementById('observation-root')!);root.render(<ObservationalWorkspace/>);}
export function unmount(){root?.unmount();root=null;}
export async function settle(){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,30));});}
