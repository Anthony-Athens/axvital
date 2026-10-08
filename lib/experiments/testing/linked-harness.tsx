import {createRoot} from 'react-dom/client';
import {ObservationalWorkspace} from '../../../components/experiments/ObservationalWorkspace';
import {SupplementsHome} from '../../../components/nutrition/SupplementsHome';
import {IntakeReviewHome} from '../../../components/nutrition/IntakeReviewHome';
export function mount(){createRoot(document.getElementById('linked-root')!).render(location.pathname==='/health/supplements'?<SupplementsHome/>:location.pathname==='/health/nutrition/review'?<IntakeReviewHome/>:<ObservationalWorkspace/>);}
