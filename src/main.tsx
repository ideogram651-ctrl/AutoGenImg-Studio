import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Reference CSS — ordered per original cascade
import './styles/reference/base.css';
import './styles/reference/layout.css';
import './styles/reference/components.css';
import './styles/reference/workspaces.css';
import './styles/reference/overlays.css';
import './styles/reference/responsive.css';
import './styles/reference/accessibility.css';
import './styles/reference/states.css';
import './styles/reference/artwork.css';
import './styles/reference/themes/dark.css';
import './styles/reference/themes/light.css';
import './styles/reference/themes/shared-glass.css';
import './styles/reference/themes/aurora-violet.css';
import './styles/reference/themes/arctic-blue.css';
import './styles/reference/themes/lavender-mist.css';
import './styles/reference/themes/midnight-orchid.css';
import './styles/reference/themes/obsidian-amethyst.css';
import './styles/reference/themes/carbon-graphite.css';
import './styles/reference/themes/midnight-sapphire.css';
import './styles/reference/themes/dark-titanium.css';
import './styles/reference/themes/shared-premium.css';

createRoot(document.getElementById('root')!).render(<App />);