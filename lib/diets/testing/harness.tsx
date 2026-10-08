import {createRoot} from 'react-dom/client';
import {DietsHome} from '../../../components/diets/DietsHome';
export function mount(){createRoot(document.getElementById('diet-root')!).render(<DietsHome/>);}
