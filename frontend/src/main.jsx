import React, { lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import { AuthProvider, useAuth } from './lib/auth';
import { ToastProvider, Loading } from './components/ui';
import Layout from './components/Layout';
import { reloadOnceForNewVersion } from './components/ErrorBoundary';
import { Login, Register } from './pages/Auth';

// Cada sección se descarga al abrirla: el teléfono carga la app mucho más rápido.
const page = (load, name = 'default') => lazy(() => load().then((m) => ({ default: m[name] })));
const Dashboard = page(() => import('./pages/Dashboard'));
const Invoices = page(() => import('./pages/Invoices'));
const InvoiceEditor = page(() => import('./pages/InvoiceEditor'));
const InvoiceView = page(() => import('./pages/InvoiceView'));
const Expenses = page(() => import('./pages/Expenses'));
const Contacts = page(() => import('./pages/Contacts'));
const Products = page(() => import('./pages/Products'));
const Banks = page(() => import('./pages/Banks'));
const Accounts = page(() => import('./pages/Accounting'), 'Accounts');
const Journal = page(() => import('./pages/Accounting'), 'Journal');
const Ledger = page(() => import('./pages/Accounting'), 'Ledger');
const Reports = page(() => import('./pages/Reports'));
const Taxes = page(() => import('./pages/Taxes'));
const Budgets = page(() => import('./pages/Budgets'), 'Budgets');
const BudgetEditor = page(() => import('./pages/Budgets'), 'BudgetEditor');
const Settings = page(() => import('./pages/Settings'));
const Recurring = page(() => import('./pages/Recurring'));
const Statement = page(() => import('./pages/Statement'));
const Forecast = page(() => import('./pages/Forecast'));

// Vite avisa cuando un archivo de una versión anterior ya no existe (después de publicar)
window.addEventListener('vite:preloadError', (e) => { if (reloadOnceForNewVersion()) e.preventDefault(); });
window.addEventListener('load', () => setTimeout(() => { try { sessionStorage.removeItem('ledger.reloaded'); } catch { /* */ } }, 10000));

function App() {
  const { ready, session } = useAuth();
  if (!ready) return <Loading />;
  if (!session) {
    return (
      <Routes>
        <Route path="/registro" element={<Register />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="facturas" element={<Invoices />} />
        <Route path="facturas/nueva" element={<InvoiceEditor />} />
        <Route path="facturas/:id" element={<InvoiceView />} />
        <Route path="facturas/:id/editar" element={<InvoiceEditor />} />
        <Route path="facturas/:id/nota-credito" element={<InvoiceEditor />} />
        <Route path="cotizaciones" element={<Invoices quote />} />
        <Route path="cotizaciones/nueva" element={<InvoiceEditor quote />} />
        <Route path="cotizaciones/:id" element={<InvoiceView quote />} />
        <Route path="cotizaciones/:id/editar" element={<InvoiceEditor quote />} />
        <Route path="recurrentes" element={<Recurring />} />
        <Route path="recurrentes/nuevo" element={<InvoiceEditor recurring />} />
        <Route path="recurrentes/:id" element={<InvoiceEditor recurring />} />
        <Route path="clientes/:id/estado" element={<Statement />} />
        <Route path="gastos" element={<Expenses />} />
        <Route path="clientes" element={<Contacts />} />
        <Route path="productos" element={<Products />} />
        <Route path="bancos" element={<Banks />} />
        <Route path="presupuestos" element={<Budgets />} />
        <Route path="presupuestos/:id" element={<BudgetEditor />} />
        <Route path="contabilidad/catalogo" element={<Accounts />} />
        <Route path="contabilidad/asientos" element={<Journal />} />
        <Route path="contabilidad/mayor/:id" element={<Ledger />} />
        <Route path="reportes" element={<Reports />} />
        <Route path="impuestos" element={<Taxes />} />
        <Route path="proyeccion" element={<Forecast />} />
        <Route path="ajustes" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider><App /></ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
