import { useEffect, useState } from 'react';
import type { ClassificationRules } from './core/types';
import { DEFAULT_RULES, mergeRules } from './core/classification';
import type { Project } from './api/vem';
import { PROJECT_ID, TOKEN, vem } from './api/vem';
import { ModelsPage } from './ui/ModelsPage';
import { SettingsPage } from './ui/SettingsPage';

export function App() {
  const [tab, setTab] = useState<'models' | 'settings'>('models');
  const [project, setProject] = useState<Project | null>(null);
  const [rules, setRules] = useState<ClassificationRules>(DEFAULT_RULES);
  const [rulesKey, setRulesKey] = useState(0);
  const [fatal, setFatal] = useState('');

  useEffect(() => {
    if (!PROJECT_ID) {
      setFatal('Aucun projet indiqué. Ouvre Plans Viewbox depuis la fiche d’un projet VEM (section Modèles 3D).');
      return;
    }
    if (!TOKEN) {
      setFatal('Session VEM introuvable. Connecte-toi à VEM puis rouvre cet outil depuis la fiche projet.');
      return;
    }
    vem
      .project(PROJECT_ID)
      .then(setProject)
      .catch((e: Error) => setFatal(e.message));
    vem
      .getRules()
      .then((saved) => {
        setRules(mergeRules(saved));
        setRulesKey((k) => k + 1);
      })
      .catch(() => {
        /* règles par défaut */
      });
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          📐 Plans Viewbox
          <small>{project ? `${project.internalNumber ? project.internalNumber + ' · ' : ''}${project.name}` : ''}</small>
        </div>
        <nav className="tabs">
          <button className={`tab ${tab === 'models' ? 'active' : ''}`} onClick={() => setTab('models')}>
            Modèles
          </button>
          <button className={`tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>
            Réglages
          </button>
        </nav>
        <div className="spacer" />
        <a className="btn small" href="tools/viewbox_prep.rbz" download title="Extension SketchUp : prépare et exporte le modèle pour VEM">
          🧩 Extension SketchUp
        </a>
      </header>
      <main className="main">
        {fatal ? (
          <div className="center-msg">{fatal}</div>
        ) : (
          <>
            <div style={{ display: tab === 'models' ? 'block' : 'none' }}>
              <ModelsPage rules={rules} />
            </div>
            <div style={{ display: tab === 'settings' ? 'block' : 'none' }}>
              <SettingsPage key={rulesKey} rules={rules} onSaved={setRules} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
