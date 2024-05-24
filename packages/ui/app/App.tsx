import React from 'react';
import { AppShell, Container } from '@mantine/core';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { Header } from './components/Header';
import Balloon from './pages/Balloon';
import Commands from './pages/Commands';
import Logs from './pages/Logs';
import Dashboard from './pages/Dashboard';
import Monitor from './pages/Monitor';
import Print from './pages/Print';

export default function App() {
  return (
    <HashRouter>
      <AppShell
        header={{ height: '60px' }}
        padding="md"
      >
        <AppShell.Header>
          <Header />
        </AppShell.Header>
        <AppShell.Main>
          <Container size="xl">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/print" element={<Print />} />
              <Route path="/balloon" element={<Balloon />} />
              <Route path="/monitor" element={<Monitor />} />
              <Route path="/commands" element={<Commands />} />
            </Routes>
          </Container>
          <Logs />
        </AppShell.Main>
      </AppShell>
    </HashRouter>
  );
}
