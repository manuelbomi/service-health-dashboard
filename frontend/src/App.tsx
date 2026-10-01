import { useState } from 'react';
import { Dashboard } from './pages/Dashboard';
import { History } from './pages/History';

type Tab = 'live' | 'history';

function App() {
  const [tab, setTab] = useState<Tab>('live');

  return (
    <div className="app">
      <header className="app__header">
        <h1>Service Health Dashboard</h1>
        <nav className="app__tabs">
          <button
            type="button"
            className={tab === 'live' ? 'tab tab--active' : 'tab'}
            onClick={() => setTab('live')}
          >
            Live
          </button>
          <button
            type="button"
            className={tab === 'history' ? 'tab tab--active' : 'tab'}
            onClick={() => setTab('history')}
          >
            History
          </button>
        </nav>
      </header>

      <main>{tab === 'live' ? <Dashboard /> : <History />}</main>
    </div>
  );
}

export default App;
