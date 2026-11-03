-- Isolated lab databases; the main Racmond inventory remains in its own database.
CREATE DATABASE lab_erp;
CREATE DATABASE lab_accounting;
\connect lab_erp
CREATE TABLE inventory (sku TEXT PRIMARY KEY, available INTEGER NOT NULL CHECK (available >= 0));
INSERT INTO inventory VALUES ('RACK-42U', 10000);
CREATE TABLE reservations (order_id UUID PRIMARY KEY, sku TEXT NOT NULL REFERENCES inventory(sku), quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10), state TEXT NOT NULL CHECK (state IN ('reserved','released')), created_at TIMESTAMPTZ NOT NULL DEFAULT now());
\connect lab_accounting
CREATE TABLE invoices (id TEXT PRIMARY KEY, order_id UUID NOT NULL UNIQUE, amount_cents BIGINT NOT NULL CHECK (amount_cents > 0), currency TEXT NOT NULL DEFAULT 'USD', created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE journal_entries (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, invoice_id TEXT NOT NULL REFERENCES invoices(id), account TEXT NOT NULL, debit_cents BIGINT NOT NULL DEFAULT 0 CHECK (debit_cents >= 0), credit_cents BIGINT NOT NULL DEFAULT 0 CHECK (credit_cents >= 0), CHECK (debit_cents + credit_cents > 0));
CREATE UNIQUE INDEX journal_invoice_account ON journal_entries(invoice_id, account);
CREATE TABLE outbox (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, invoice_id TEXT NOT NULL REFERENCES invoices(id), order_id UUID NOT NULL, asset_id TEXT NOT NULL, amount_cents BIGINT NOT NULL, traceparent TEXT NOT NULL, published_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (invoice_id,traceparent));
CREATE VIEW journal_balance AS SELECT i.id, i.order_id, i.amount_cents, COALESCE(sum(j.debit_cents),0) AS debits, COALESCE(sum(j.credit_cents),0) AS credits, COALESCE(sum(j.debit_cents),0)=COALESCE(sum(j.credit_cents),0) AND COALESCE(sum(j.debit_cents),0)=i.amount_cents AS balanced FROM invoices i LEFT JOIN journal_entries j ON j.invoice_id=i.id GROUP BY i.id;
