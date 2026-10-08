import {createRoot} from 'react-dom/client';
import {ObservationalResults} from '../../../components/experiments/ObservationalResults';
import {resultStudy} from './observational-results-fixture.ts';
export {act} from 'react';
let root:ReturnType<typeof createRoot>;
export function mount(){root=createRoot(document.getElementById('results-root')!);root.render(<ObservationalResults study={resultStudy} refreshToken="synthetic"/>);}
export function unmount(){root.unmount();}
