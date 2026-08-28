// Local browser verification only; routing is replaced by the harness bundler.
import {createRoot} from "react-dom/client";
import {ExperimentWizard} from "../../../components/experiments/ExperimentWizard";
createRoot(document.getElementById("wizard-root")!).render(<ExperimentWizard/>);
