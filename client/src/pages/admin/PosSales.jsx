import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { money, prettyDateTime } from "../../format";
import { Empty, Loading } from "../../components/ui";
import { variantText } from "./inventoryUtils";

const LIMIT = 200;
const METHODS = ["all", "cash", "card", "mobile", "other"];

function unitCount(sale) {
  return sale.items.reduce((sum, line) => sum + line.qty, 0);
}

export default function PosSales() {
  const [sales, setSales] = useState(null);
  const [error, setError] = useState("");
  const [method, setMethod] = useState("all");
  const [refreshing, setRefreshing] = useState(false);

  function load() {
    setRefreshing(true);
    api(`/api/pos/sales?limit=${LIMIT}`)
      .then((data) => {
        setSales(data.sales);
        setError("");
      })
      .catch((err) => setError(err.message))
      .finally(() => setRefreshing(false));
  }

  useEffect(() => {
    load();
  }, []);

  const shown = useMemo(
    () => (sales || []).filter((sale) => method === "all" || sale.paymentMethod === method),
    [sales, method]
  );

  if (!sales) return error ? <p className="error">{error}</p> : <Loading />;

  const today = new Date().toDateString();
  const revenue = shown.reduce((sum, sale) => sum + sale.total, 0);
  const todayRevenue = shown
    .filter((sale) => new Date(sale.createdAt).toDateString() === today)
    .reduce((sum, sale) => sum + sale.total, 0);
  const units = shown.reduce((sum, sale) => sum + unitCount(sale), 0);

  return (
    <div>
      <div className="stat-grid">
        <article>
          <p className="kicker">Sales</p>
          <strong>{shown.length}</strong>
        </article>
        <article>
          <p className="kicker">Revenue</p>
          <strong>{money(revenue)}</strong>
        </article>
        <article>
          <p className="kicker">Today</p>
          <strong>{money(todayRevenue)}</strong>
        </article>
        <article>
          <p className="kicker">Items sold</p>
          <strong>{units}</strong>
        </article>
      </div>

      <div className="inv-toolbar">
        <div className="pills" role="group" aria-label="Payment method">
          {METHODS.map((entry) => (
            <button
              key={entry}
              type="button"
              className={method === entry ? "on" : ""}
              aria-pressed={method === entry}
              onClick={() => setMethod(entry)}
            >
              {entry === "all" ? "All payments" : entry[0].toUpperCase() + entry.slice(1)}
            </button>
          ))}
        </div>
        <button type="button" className="btn line" onClick={load} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
        <Link className="btn solid" to="/pos">
          Open POS
        </Link>
      </div>

      {error && <p className="error">{error}</p>}
      {sales.length >= LIMIT && <p className="muted">Showing the latest {LIMIT} sales.</p>}

      {shown.length === 0 ? (
        <Empty
          title={sales.length ? "No sales with that payment method" : "No POS sales yet"}
          text="Sales rung up at the shop counter appear here, including ones synced after working offline."
        />
      ) : (
        <ul className="sales-list">
          {shown.map((sale) => {
            const count = unitCount(sale);
            return (
              <li key={sale.id}>
                <details>
                  <summary>
                    <span className="sales-ref">
                      <strong>{sale.receiptNo || sale.id}</strong>
                      <small className="muted">{sale.id}</small>
                    </span>
                    <span className="sales-when">{prettyDateTime(sale.createdAt)}</span>
                    <span className="sales-count">
                      {count} {count === 1 ? "item" : "items"}
                    </span>
                    <span className="sales-method">{sale.paymentMethod}</span>
                    <strong className="sales-total">{money(sale.total)}</strong>
                  </summary>
                  <div className="sales-detail">
                    <ul className="mini-lines">
                      {sale.items.map((line, index) => {
                        const variant = variantText(line);
                        return (
                          <li key={`${line.itemId}-${index}`}>
                            <span>
                              {line.qty} × {line.name}
                              {variant && <em className="muted"> · {variant}</em>}
                            </span>
                            <span>{money(line.lineTotal)}</span>
                          </li>
                        );
                      })}
                    </ul>
                    {sale.discount > 0 && (
                      <p className="total-line">
                        <span>Discount</span>
                        <span>−{money(sale.discount)}</span>
                      </p>
                    )}
                    <p className="total-line total">
                      <span>Total</span>
                      <strong>{money(sale.total)}</strong>
                    </p>
                    {sale.source === "offline" && (
                      <p className="muted">Rung up offline · synced {prettyDateTime(sale.syncedAt)}</p>
                    )}
                    {sale.note && <p className="muted">Note: {sale.note}</p>}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
