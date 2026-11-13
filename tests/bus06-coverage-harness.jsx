// Synthetic component harness: no production data or enabled market sources.
import React from 'react';
import { createRoot } from 'react-dom/client';
import MarketInventory from '../admin/src/MarketInventory.jsx';
createRoot(document.getElementById('root')).render(<main><MarketInventory /></main>);
