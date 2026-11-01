# Tecnossync Ledger

Finanzas y contabilidad multiempresa para negocios dominicanos, **formales** (RNC, NCF/e-CF, ITBIS, DGII) e **informales** (numeración interna, sin NCF).

## Módulos

| Área | Qué hace |
|---|---|
| Facturación | Facturas, cotizaciones (→ factura), notas de crédito. NCF B01/B02/B14/B15/B16 y e-CF E31/E32/E44/E45, control de secuencias y vencimiento. ITBIS por línea (18/16/exento), retenciones de ITBIS e ISR. Impresión carta y ticket 80 mm, monto en letras, logo y color de marca. |
| Gastos | Registro con foto/PDF del comprobante, tipo 606, retenciones, pago al contado o a crédito (CxP). Si la empresa no declara ITBIS, el ITBIS se va al gasto. |
| Tesorería | Bancos, caja y tarjetas con saldo calculado desde la contabilidad; depósitos, retiros y transferencias. |
| Contabilidad | Catálogo de cuentas RD, diario general (asientos automáticos y manuales con validación debe = haber), libro mayor, reversos auditables. |
| Reportes | Estado de resultados, balance general, balanza de comprobación, antigüedad de CxC y CxP, dashboard. |
| Presupuestos | Presupuesto anual por cuenta y mes, comparado contra lo real. |
| DGII | TXT 606, 607 y 608, y resumen para IT-1 (ITBIS a pagar/saldo a favor y retenciones a remitir). |
| Multiempresa | Un usuario puede tener varias empresas; roles dueño, admin, contador, operador y solo lectura. Toda consulta filtra por `company_id`. |

## Stack

- `backend/`: Node + Express 5 + PostgreSQL (`pg`), JWT, multer. Puerto 4100.
- `frontend/`: React + Vite + Tailwind + Recharts. Puerto 5180 (proxy `/api` → 4100).

## Correr en local

```bash
cd backend && cp .env.example .env && npm install
npm run dev:db          # PostgreSQL embebido en :5434 (o: docker compose up -d en la raíz)
npm run dev             # API (aplica el esquema al iniciar)
npm run seed            # opcional: datos demo → demo@cuadre.test / demo12345
cd ../frontend && npm install && npm run dev
```

## Notas

- Los TXT de la DGII siguen la estructura de los formatos de envío; valídalos con la herramienta de pre-validación de la DGII antes de enviarlos.
- La emisión e-CF genera la numeración E31/E32…, pero **no** firma ni envía el XML a la DGII todavía (requiere certificado digital y certificación como emisor).
