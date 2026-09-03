import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { AppShell } from './components/layout/AppShell';
import { Dashboard } from './pages/Dashboard';
import { AgentExecution } from './pages/AgentExecution';
import { MarineMapPage } from './pages/MarineMapPage';
import { RecommendationPage } from './pages/RecommendationPage';
import { EvidenceInspectorPage } from './pages/EvidenceInspectorPage';
import { SafetyVetoPage } from './pages/SafetyVetoPage';
import { AlertsPage } from './pages/AlertsPage';
import { DataHealthPage } from './pages/DataHealthPage';
import { DemoScenariosPage } from './pages/DemoScenariosPage';
import { FishermanPage } from './pages/FishermanPage';
import { MobileFishermanPage } from './pages/MobileFishermanPage';
import { TamilVoicePage } from './pages/TamilVoicePage';
import { FleetOverviewPage } from './pages/FleetOverviewPage';

import { PersonaMode, DataMode, DemoScenario, ORCAResponse } from './types';
import { marineApi } from './services/api/marineApi';

export function App() {
  const [persona, setPersona] = useState<PersonaMode>('analyst');
  const [scenarios, setScenarios] = useState<DemoScenario[]>([]);
  const [currentScenario, setCurrentScenario] = useState<DemoScenario | null>(null);
  const [currentResponse, setCurrentResponse] = useState<ORCAResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    marineApi.getDemoScenarios()
      .then((data) => {
        setScenarios(data);
        if (data && data.length > 0) {
          setCurrentScenario(data[0]);
          handleRunQuery(data[0].query);
        }
      })
      .catch(() => {
        handleRunQuery('Where should I fish tomorrow near Chennai?');
      });
  }, []);

  const handleRunQuery = async (queryText: string) => {
    setIsLoading(true);
    try {
      // POST /api/recommend (Stack B) adapted into the ORCAResponse shape.
      const data: ORCAResponse = await marineApi.processQuery(queryText);
      setCurrentResponse(data);
    } catch (err) {
      console.error('Query failed', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectScenario = (scenario: DemoScenario) => {
    setCurrentScenario(scenario);
    handleRunQuery(scenario.query);
  };

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route
            element={
              <AppShell
                persona={persona}
                onPersonaChange={setPersona}
                dataMode={(currentResponse?.data_mode as DataMode) || 'CACHED'}
                location={currentScenario?.location || 'Chennai • Bay of Bengal'}
                selectedScenarioTitle={currentScenario?.title}
                onOpenScenarios={() => window.location.href = '/demo-scenarios'}
              />
            }
          >
            <Route path="/" element={<Dashboard response={currentResponse} onQuerySubmit={handleRunQuery} isLoading={isLoading} />} />
            <Route path="/dashboard" element={<Dashboard response={currentResponse} onQuerySubmit={handleRunQuery} isLoading={isLoading} />} />
            <Route path="/agent-execution" element={<AgentExecution response={currentResponse} />} />
            <Route path="/marine-map" element={<MarineMapPage response={currentResponse} />} />
            <Route path="/marine_map" element={<MarineMapPage response={currentResponse} />} />
            <Route path="/map" element={<MarineMapPage response={currentResponse} />} />
            <Route path="/map-controls" element={<MarineMapPage response={currentResponse} />} />
            <Route path="/recommendation" element={<RecommendationPage response={currentResponse} />} />
            <Route path="/evidence-inspector" element={<EvidenceInspectorPage response={currentResponse} />} />
            <Route path="/safety-veto" element={<SafetyVetoPage response={currentResponse} />} />
            <Route path="/safety_veto" element={<SafetyVetoPage response={currentResponse} />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/data-health" element={<DataHealthPage />} />
            <Route path="/fleet-overview" element={<FleetOverviewPage />} />
            <Route path="/demo-scenarios" element={<DemoScenariosPage onSelectScenario={handleSelectScenario} />} />
            <Route path="/fisherman" element={<FishermanPage response={currentResponse} onQuerySubmit={handleRunQuery} isLoading={isLoading} />} />
            <Route path="/fisherman-home" element={<FishermanPage response={currentResponse} onQuerySubmit={handleRunQuery} isLoading={isLoading} />} />
            <Route path="/mobile-fisherman" element={<MobileFishermanPage response={currentResponse} onQuerySubmit={handleRunQuery} isLoading={isLoading} />} />
            <Route path="/tamil-voice" element={<TamilVoicePage response={currentResponse} onQuerySubmit={handleRunQuery} isLoading={isLoading} />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
