import { useState } from 'react';
import { ArrowUpRight, Search } from 'lucide-react';
import { useCascadeState } from '@/context/CascadeStateContext';
import { formatMinorToUSD as money, formatVariancePct } from '@/utils/formatters';
import { phaseName, shortDate } from './Status';

export function SupplierWorkspace() {
  const { state, openTaskDrawer, selectedTaskId } = useCascadeState();
  const [taskId, setTaskId] = useState(selectedTaskId ?? 'all');
  const [query, setQuery] = useState('');
  const quotes = (state?.supplierQuotes ?? []).filter((quote) => (taskId === 'all' || quote.task_id === taskId) && `${quote.product_title} ${quote.merchant_name}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="supplier-workspace"><div className="section-heading"><div><h2>Supplier quote register</h2><p>Compare observed prices. Freight and tax stay visible before any approval.</p></div><span className="quiet-tag">{quotes.length} quotes</span></div>
    <div className="list-toolbar"><label>Milestone<select value={taskId} onChange={(event) => setTaskId(event.target.value)}><option value="all">All milestones</option>{state?.tasks.map((task) => <option key={task.task_id} value={task.task_id}>{phaseName(task.name)}</option>)}</select></label><label className="search-field"><Search size={16} /><input aria-label="Search supplier quotes" placeholder="Product or merchant…" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
    <div className="data-table-scroll"><table className="data-table"><thead><tr><th>Product / milestone</th><th>Merchant</th><th className="number">Unit price</th><th className="number">Qty</th><th className="number">Freight / tax</th><th className="number">Total</th><th className="number">Baseline change</th></tr></thead><tbody>{quotes.map((quote) => {
      const task = state?.tasks.find((item) => item.task_id === quote.task_id);
      return <tr key={quote.quote_id}><td><strong>{quote.product_title}</strong><button className="table-detail-link" onClick={() => openTaskDrawer(quote.task_id)}>{phaseName(task?.name ?? quote.task_id)}</button><span className="cell-note">Observed {shortDate(quote.observed_at)}</span></td><td>{quote.product_url ? <a href={quote.product_url} target="_blank" rel="noreferrer">{quote.merchant_name}<ArrowUpRight size={13} /></a> : quote.merchant_name}<span className="cell-note">{quote.source_type === 'CHANNEL3_LIVE' ? 'Channel3' : 'Incumbent'} · {quote.availability_status.toLowerCase().replace(/_/g, ' ')}</span></td><td className="number">{money(quote.unit_price_minor)}</td><td className="number">{quote.quantity}</td><td className="number">{quote.shipping_minor === null ? <span className="tone-warning">Unknown freight</span> : money(quote.shipping_minor)}<span className="cell-note">{quote.tax_minor === null ? 'Unknown tax' : `${money(quote.tax_minor)} tax`}</span></td><td className="number"><strong>{money(quote.total_minor)}</strong><span className="cell-note">{quote.currency}{quote.shipping_minor === null || quote.tax_minor === null ? ' · incomplete costs' : ''}</span></td><td className={`number ${quote.variance_vs_historical_pct > (task?.max_allowed_variance_pct ?? 10) ? 'tone-danger' : ''}`}>{formatVariancePct(quote.variance_vs_historical_pct)}</td></tr>;
    })}</tbody></table></div>
    {!quotes.length && <div className="empty-state"><h3>No quotes in this view</h3><p>Choose another milestone, or open a phase’s financials to run a supplier audit.</p><button className="button button-secondary" onClick={() => { setTaskId('all'); setQuery(''); }}>Show all quotes</button></div>}
  </section>;
}
