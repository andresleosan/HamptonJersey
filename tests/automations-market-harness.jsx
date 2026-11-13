// Synthetic mounting harness: no production data or enabled sources.
import React from 'react';
import { createRoot } from 'react-dom/client';
import Automations from '../admin/src/Automations.jsx';
createRoot(document.getElementById('root')).render(<main><Automations stalled={false} outbound={false} onChange={async () => {}} /></main>);
