import { AppShell, Container } from '@mantine/core';
import React from 'react';
import {
  HashRouter, Outlet, Route, Routes,
} from 'react-router-dom';
import { Header } from './components/Header';
import Balloon from './pages/Balloon';
import ClientStatus from './pages/ClientStatus';
import Commands from './pages/Commands';
import Dashboard from './pages/Dashboard';
import Monitor from './pages/Monitor';
import PresentationTeams from './pages/PresentationTeams';
import Print from './pages/Print';
import Resolver from './Resolver';

function DefaultLayout() {
  return (
    <AppShell
      header={{ height: 60 }}
      padding={{ base: 'xs', sm: 'md' }}
    >
      <AppShell.Header>
        <Header />
      </AppShell.Header>
      <AppShell.Main>
        <Container size="xl" px={{ base: 0, sm: 'md' }}>
          <Outlet />
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        {window.Context.clientMode ? (
          <Route path="/" element={<DefaultLayout />}>
            <Route index element={<ClientStatus />} />
            <Route path="/print" element={<ClientStatus service="print" />} />
            <Route path="/balloon" element={<ClientStatus service="balloon" />} />
          </Route>
        ) : (
          <>
            <Route path="/" element={<DefaultLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="/presentation-teams" element={<PresentationTeams />} />
              <Route path="/print" element={<Print />} />
              <Route path="/balloon" element={<Balloon />} />
              <Route path="/monitor" element={<Monitor />} />
              <Route path="/commands" element={<Commands />} />
            </Route>
            <Route path="/resolver" element={<Resolver />} />
          </>
        )}
      </Routes>
    </HashRouter>
  );
}
