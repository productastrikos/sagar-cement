import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { LiveProvider } from './lib/live';
import { ToastProvider } from './lib/toast';
import { StudioProvider } from './lib/studio';
import { KpiDrawerProvider } from './lib/kpi';
import Shell from './components/Shell';
import { Loading } from './components/ui';
import Login from './pages/Login';
import PocCopilot from './copilot/Copilot';

const Overview = lazy(() => import('./pages/Overview'));
const Advisory = lazy(() => import('./pages/Advisory'));
const Connectivity = lazy(() => import('./pages/Connectivity'));
const Lab = lazy(() => import('./pages/Lab'));
const Field = lazy(() => import('./pages/Field'));
const Genealogy = lazy(() => import('./pages/Genealogy'));
const Quality = lazy(() => import('./pages/Quality'));
const Prediction = lazy(() => import('./pages/Prediction'));
const Energy = lazy(() => import('./pages/Energy'));
const Power = lazy(() => import('./pages/Power'));
const Dispatch = lazy(() => import('./pages/Dispatch'));
const Efficiency = lazy(() => import('./pages/Efficiency'));
const Platform = lazy(() => import('./pages/Platform'));
const NotFound = lazy(() => import('./pages/NotFound'));

function Authed() {
  const { user, loading } = useAuth();
  if (loading) return <Loading text="Signing you in…" />;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <LiveProvider>
      <StudioProvider>
        <KpiDrawerProvider>
          <PocCopilot>
          <Shell>
            <Suspense fallback={<Loading text="Opening page…" />}>
              <Routes>
                <Route path="/" element={<Overview />} />
                <Route path="/advisory" element={<Advisory />} />
                <Route path="/connectivity" element={<Connectivity />} />
                <Route path="/lab" element={<Lab />} />
                <Route path="/field" element={<Field />} />
                <Route path="/genealogy" element={<Genealogy />} />
                <Route path="/quality" element={<Quality />} />
                <Route path="/prediction" element={<Prediction />} />
                <Route path="/energy" element={<Energy />} />
                <Route path="/power" element={<Power />} />
                <Route path="/dispatch" element={<Dispatch />} />
                <Route path="/efficiency" element={<Efficiency />} />
                <Route path="/platform" element={<Platform />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </Shell>
          </PocCopilot>
        </KpiDrawerProvider>
      </StudioProvider>
    </LiveProvider>
  );
}

function LoginRoute() {
  const { user, loading } = useAuth();
  if (loading) return <Loading text="Checking your session…" />;
  return user ? <Navigate to="/" replace /> : <Login />;
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginRoute />} />
            <Route path="/*" element={<Authed />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}
