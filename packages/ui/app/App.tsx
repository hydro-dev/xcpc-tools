import { AppShell, Container } from '@mantine/core';
import React from 'react';
import {
  HashRouter, Outlet, Route, Routes,
} from 'react-router-dom';
import { Header } from './components/Header';
import Balloon from './pages/Balloon';
import Commands from './pages/Commands';
import Dashboard from './pages/Dashboard';
import Logs from './pages/Logs';
import Monitor from './pages/Monitor';
import Print from './pages/Print';
import Resolver from './Resolver';

function DefaultLayout() {
  return (
    <AppShell
      header={{ height: '60px' }}
      padding="md"
    >
      <AppShell.Header>
        <Header />
      </AppShell.Header>
      <AppShell.Main>
        <Container size="xl">
          <Outlet />
        </Container>
        <Logs />
      </AppShell.Main>
    </AppShell>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<DefaultLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="/print" element={<Print />} />
          <Route path="/balloon" element={<Balloon />} />
          <Route path="/monitor" element={<Monitor />} />
          <Route path="/commands" element={<Commands />} />
        </Route>
        <Route path="/resolver" element={<Resolver />} />
      </Routes>
    </HashRouter>
  );
}
