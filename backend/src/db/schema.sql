-- Tecnossync Ledger — esquema base (multiempresa: toda tabla de negocio lleva company_id)

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS companies (
  id                SERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  trade_name        TEXT,
  is_formal         BOOLEAN NOT NULL DEFAULT false,   -- formal = RNC + NCF/e-CF
  rnc               TEXT,
  charges_itbis     BOOLEAN NOT NULL DEFAULT false,   -- registrado para ITBIS
  itbis_rate        NUMERIC(5,2) NOT NULL DEFAULT 18,
  address           TEXT,
  phone             TEXT,
  email             TEXT,
  website           TEXT,
  logo_path         TEXT,
  currency          TEXT NOT NULL DEFAULT 'DOP',
  invoice_prefix    TEXT NOT NULL DEFAULT 'FAC',
  next_invoice_no   INTEGER NOT NULL DEFAULT 1,
  quote_prefix      TEXT NOT NULL DEFAULT 'COT',
  next_quote_no     INTEGER NOT NULL DEFAULT 1,
  next_entry_no     INTEGER NOT NULL DEFAULT 1,
  invoice_footer    TEXT,
  accent_color      TEXT NOT NULL DEFAULT '#8B2FC9',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('owner','admin','accountant','operator','viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, company_id)
);

-- Catálogo de cuentas
CREATE TABLE IF NOT EXISTS accounts (
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('asset','liability','equity','income','cost','expense')),
  parent_id   INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  is_postable BOOLEAN NOT NULL DEFAULT true,
  system_key  TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (company_id, code)
);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_system_key ON accounts(company_id, system_key) WHERE system_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS journal_entries (
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  number      INTEGER NOT NULL,
  date        DATE NOT NULL,
  description TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'manual',  -- manual | invoice | payment | expense | expense_payment | bank | void
  source_id   INTEGER,
  status      TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','void')),
  created_by  INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, number)
);
CREATE INDEX IF NOT EXISTS je_company_date ON journal_entries(company_id, date);
CREATE INDEX IF NOT EXISTS je_source ON journal_entries(company_id, source_type, source_id);

CREATE TABLE IF NOT EXISTS journal_lines (
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entry_id    INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id  INTEGER NOT NULL REFERENCES accounts(id),
  debit       NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit      NUMERIC(14,2) NOT NULL DEFAULT 0,
  memo        TEXT
);
CREATE INDEX IF NOT EXISTS jl_account ON journal_lines(company_id, account_id);

CREATE TABLE IF NOT EXISTS contacts (
  id         SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('customer','supplier','both')),
  name       TEXT NOT NULL,
  id_type    TEXT NOT NULL DEFAULT 'none' CHECK (id_type IN ('rnc','cedula','passport','none')),
  tax_id     TEXT,
  email      TEXT,
  phone      TEXT,
  address    TEXT,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'service' CHECK (kind IN ('good','service')),
  name        TEXT NOT NULL,
  sku         TEXT,
  price       NUMERIC(14,2) NOT NULL DEFAULT 0,
  itbis_rate  NUMERIC(5,2) NOT NULL DEFAULT 18,
  income_account_id INTEGER REFERENCES accounts(id),
  active      BOOLEAN NOT NULL DEFAULT true
);

-- Secuencias de comprobantes fiscales (solo empresas formales)
CREATE TABLE IF NOT EXISTS ncf_sequences (
  id         SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ncf_type   TEXT NOT NULL,             -- B01, B02, B14, B15, B04, E31, E32...
  next_no    BIGINT NOT NULL DEFAULT 1,
  end_no     BIGINT NOT NULL,
  expires_at DATE,
  active     BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (company_id, ncf_type)
);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id         SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'bank' CHECK (kind IN ('bank','cash','card')),
  bank_name  TEXT,
  number     TEXT,
  currency   TEXT NOT NULL DEFAULT 'DOP',
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  active     BOOLEAN NOT NULL DEFAULT true
);

-- Facturas y cotizaciones
CREATE TABLE IF NOT EXISTS invoices (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  doc_type      TEXT NOT NULL DEFAULT 'invoice' CHECK (doc_type IN ('invoice','quote','credit_note')),
  number        TEXT NOT NULL,
  ncf           TEXT,
  ncf_type      TEXT,
  ncf_expires_at DATE,
  ref_invoice_id INTEGER REFERENCES invoices(id),
  contact_id    INTEGER REFERENCES contacts(id),
  date          DATE NOT NULL,
  due_date      DATE,
  currency      TEXT NOT NULL DEFAULT 'DOP',
  income_type   TEXT NOT NULL DEFAULT '01',     -- tipo de ingreso 607
  payment_terms TEXT,
  subtotal      NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  itbis         NUMERIC(14,2) NOT NULL DEFAULT 0,
  itbis_retained NUMERIC(14,2) NOT NULL DEFAULT 0,
  isr_retained  NUMERIC(14,2) NOT NULL DEFAULT 0,
  total         NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid          NUMERIC(14,2) NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','partial','paid','void','accepted','rejected')),
  notes         TEXT,
  created_by    INTEGER REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, doc_type, number)
);
CREATE INDEX IF NOT EXISTS inv_company_date ON invoices(company_id, date);

CREATE TABLE IF NOT EXISTS invoice_items (
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id  INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id  INTEGER REFERENCES products(id),
  description TEXT NOT NULL,
  qty         NUMERIC(14,3) NOT NULL DEFAULT 1,
  price       NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  itbis_rate  NUMERIC(5,2) NOT NULL DEFAULT 0,
  itbis       NUMERIC(14,2) NOT NULL DEFAULT 0,
  total       NUMERIC(14,2) NOT NULL DEFAULT 0,
  kind        TEXT NOT NULL DEFAULT 'service'
);

-- Gastos / compras (606)
CREATE TABLE IF NOT EXISTS expenses (
  id             SERIAL PRIMARY KEY,
  company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id     INTEGER REFERENCES contacts(id),
  date           DATE NOT NULL,
  due_date       DATE,
  ncf            TEXT,
  expense_type   TEXT NOT NULL DEFAULT '02',    -- tipo de bienes y servicios 606 (01-11)
  account_id     INTEGER NOT NULL REFERENCES accounts(id),
  description    TEXT NOT NULL,
  goods_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
  services_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  itbis          NUMERIC(14,2) NOT NULL DEFAULT 0,
  itbis_retained NUMERIC(14,2) NOT NULL DEFAULT 0,
  isr_type       TEXT,                          -- tipo retención ISR 606 (01-08)
  isr_retained   NUMERIC(14,2) NOT NULL DEFAULT 0,
  tip            NUMERIC(14,2) NOT NULL DEFAULT 0,
  other_taxes    NUMERIC(14,2) NOT NULL DEFAULT 0,
  total          NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid           NUMERIC(14,2) NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','partial','paid','void')),
  receipt_path   TEXT,
  receipt_name   TEXT,
  budget_tag     TEXT,
  created_by     INTEGER REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exp_company_date ON expenses(company_id, date);

-- Cobros (invoice) y pagos (expense)
CREATE TABLE IF NOT EXISTS payments (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  direction       TEXT NOT NULL CHECK (direction IN ('in','out')),
  invoice_id      INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
  expense_id      INTEGER REFERENCES expenses(id) ON DELETE CASCADE,
  bank_account_id INTEGER NOT NULL REFERENCES bank_accounts(id),
  date            DATE NOT NULL,
  amount          NUMERIC(14,2) NOT NULL,
  method          TEXT NOT NULL DEFAULT 'transfer' CHECK (method IN ('cash','transfer','check','card','credit','other')),
  reference       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Presupuestos
CREATE TABLE IF NOT EXISTS budgets (
  id         SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  year       INTEGER NOT NULL,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS budget_lines (
  id         SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  budget_id  INTEGER NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  month      INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  UNIQUE (budget_id, account_id, month)
);

-- Datos para pago (cuentas bancarias, etc.) impresos en facturas y estados de cuenta
ALTER TABLE companies ADD COLUMN IF NOT EXISTS payment_instructions TEXT;

-- Cobros recurrentes: plantillas que generan una factura cada N meses
CREATE TABLE IF NOT EXISTS recurring_invoices (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id    INTEGER NOT NULL REFERENCES contacts(id),
  name          TEXT NOT NULL,
  every_months  INTEGER NOT NULL DEFAULT 1 CHECK (every_months IN (1,2,3,6,12)),
  day_of_month  INTEGER NOT NULL DEFAULT 1 CHECK (day_of_month BETWEEN 1 AND 31),
  next_date     DATE NOT NULL,
  end_date      DATE,
  due_days      INTEGER NOT NULL DEFAULT 15,
  auto_issue    BOOLEAN NOT NULL DEFAULT true,     -- false = deja la factura en borrador para revisarla
  period_label  BOOLEAN NOT NULL DEFAULT true,     -- agrega "— noviembre 2026" a cada línea
  ncf_type      TEXT,
  income_type   TEXT NOT NULL DEFAULT '01',
  payment_terms TEXT,
  itbis_retention_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  isr_retention_pct   NUMERIC(5,2) NOT NULL DEFAULT 0,
  notes         TEXT,
  items         JSONB NOT NULL DEFAULT '[]',
  active        BOOLEAN NOT NULL DEFAULT true,
  last_run_at   TIMESTAMPTZ,
  last_error    TEXT,
  created_by    INTEGER REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rec_due ON recurring_invoices(next_date) WHERE active;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recurring_id INTEGER REFERENCES recurring_invoices(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS period TEXT;

-- Descuento al cobrar: comisión de una plataforma/pasarela (gasto) o retención de impuesto del cliente.
-- amount = lo que entra al banco; amount + fee = lo que se descuenta de la factura.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS fee NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS fee_type TEXT CHECK (fee_type IN ('commission','withholding'));
-- Descuento habitual de un cliente, para precargarlo al registrar el cobro
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS payment_fee_pct NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS payment_fee_type TEXT CHECK (payment_fee_type IN ('commission','withholding'));
