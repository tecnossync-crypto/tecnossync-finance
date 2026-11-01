import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import { AuthProvider, useAuth } from './lib/auth';
import { ToastProvider, Loading } from './components/ui';
import Layout from './components/Layout';
import { Login, Register } from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Invoices from './pages/Invoices';
import InvoiceEditor from './pages/InvoiceEditor';
import InvoiceView from './pages/InvoiceView';
import Expenses from './pages/Expenses';
import Contacts from './pages/Contacts';
import Products from './pages/Products';
import Banks from './pages/Banks';
import { Accounts, Journal, Ledger } from './pages/Accounting';
import Reports from './pages/Reports';
import Taxes from './pages/Taxes';
import { Budgets, BudgetEditor } from './pages/Budgets';
import Settings from './pages/Settings';
import Recurring from './pages/Recurring';
import Statement from './pages/Statement';
import Forecast from './pages/Forecast';

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
