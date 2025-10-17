import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import DetailPage from './pages/DetailPage';
import SearchPage from './pages/SearchPage';

function App(): JSX.Element {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <header className="app-header">
          <div className="app-header__content">
            <h1 className="app-title">Airplane Check</h1>
            <p className="app-subtitle">Search FAA registrations by N-number</p>
          </div>
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<SearchPage />} />
            <Route path="/airplanes/:tailNumber" element={<DetailPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <footer className="app-footer">
          <small>Data provided by the Airplane Check Azure-hosted FAA API.</small>
        </footer>
      </div>
    </BrowserRouter>
  );
}

export default App;
