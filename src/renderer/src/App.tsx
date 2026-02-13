import React from 'react';
import Navbar from './components/Header';
import { ProductManager } from './components/ProductManager';
import { SalesPage } from './components/SalesPage';
import { SalesHistory } from './components/SalesHistory';

function App(): React.ReactElement {
  return (
    <>
      <Navbar title="Do'kondor POS" />
      <div style={{ padding: '12px', display: 'grid', gap: '12px' }}>
        <SalesPage />
        <ProductManager />
        <SalesHistory />
      </div>
    </>
  );
}

export default App;
