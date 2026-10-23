import { useEffect, useMemo, useState } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LinearScale,
  Tooltip
} from 'chart.js';

ChartJS.register(ArcElement, BarElement, CategoryScale, Filler, LinearScale, Tooltip);

const metricCards = [
  { key: 'pageLoadTimeMs', label: 'Page load time', unit: 'time' },
  { key: 'serverResponseTimeMs', label: 'Server response', unit: 'time' },
  { key: 'lcpMs', label: 'Largest contentful paint', unit: 'time' },
  { key: 'inpMs', label: 'Interaction to next paint', unit: 'time' },
  { key: 'cls', label: 'Cumulative layout shift', unit: 'decimal' },
  { key: 'fcpMs', label: 'First contentful paint', unit: 'time' },
  { key: 'speedIndexMs', label: 'Speed index', unit: 'time' },
  { key: 'totalBlockingTimeMs', label: 'Total blocking time', unit: 'time' }
];

const categoryLabels = {
  performance: 'Performance',
  accessibility: 'Accessibility',
  'best-practices': 'Best practices',
  seo: 'SEO'
};

async function apiRequest(path, options) {
  const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api${path}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'The request could not be completed.');
  return body;
}

function formatMetric(value, unit) {
  if (!Number.isFinite(value)) return 'Unavailable';
  if (unit === 'decimal') return value.toFixed(3);
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
  return `${Math.round(value)} ms`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'Unavailable';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function scoreTone(score) {
  if (score >= 90) return 'text-forest';
  if (score >= 50) return 'text-amber-600';
  return 'text-rose-600';
}

function ScoreBadge({ score, large = false }) {
  const safeScore = Number.isFinite(score) ? score : null;
  return (
    <div className={`score-ring ${large ? 'score-ring-large' : ''} ${scoreTone(safeScore)}`}
      style={{ '--score': `${safeScore ?? 0}%` }}>
      <span>{safeScore === null ? '—' : safeScore}</span>
    </div>
  );
}

function App() {
  const [url, setUrl] = useState('');
  const [report, setReport] = useState(null);
  const [device, setDevice] = useState('mobile');
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');

  async function refreshHistory() {
    try {
      const result = await apiRequest('/history?limit=12');
      setHistory(result.analyses || []);
      setHistoryError('');
    } catch (requestError) {
      setHistoryError(requestError.message);
    }
  }

  useEffect(() => {
    refreshHistory();
  }, []);

  async function analyzeWebsite(event) {
    event.preventDefault();
    setError('');
    setReport(null);
    setStatus('analyzing');
    try {
      const result = await apiRequest('/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      setReport(result);
      setUrl(result.websiteUrl);
      setDevice('mobile');
      setStatus('complete');
      await refreshHistory();
    } catch (requestError) {
      setError(requestError.message);
      setStatus('error');
    }
  }

  async function openHistory(id) {
    setError('');
    setStatus('loading-history');
    try {
      const result = await apiRequest(`/history/${encodeURIComponent(id)}`);
      setReport(result);
      setUrl(result.websiteUrl);
      setDevice('mobile');
      setStatus('complete');
    } catch (requestError) {
      setError(requestError.message);
      setStatus('error');
    }
  }

  const selected = report && report[device];
  const resourceData = useMemo(() => {
    const resources = selected?.resources || [];
    return {
      labels: resources.map(resource => resource.type),
      datasets: [{
        label: 'Requests',
        data: resources.map(resource => resource.requestCount),
        backgroundColor: '#378d72',
        borderRadius: 6,
        maxBarThickness: 34
      }]
    };
  }, [selected]);

  const categoryData = useMemo(() => {
    const categories = selected?.categories || {};
    const entries = Object.entries(categoryLabels).filter(([key]) => Number.isFinite(categories[key]));
    return {
      labels: entries.map(([, label]) => label),
      datasets: [{
        data: entries.map(([key]) => categories[key]),
        backgroundColor: ['#176a55', '#65a88d', '#a9c9b7', '#d3e5d9'],
        borderWidth: 0,
        hoverOffset: 5
      }]
    };
  }, [selected]);

  const resourceOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: { legend: { display: false }, tooltip: { intersect: false } },
    scales: {
      x: { beginAtZero: true, grid: { color: '#edf0ee' }, ticks: { precision: 0 } },
      y: { grid: { display: false } }
    }
  }), []);

  const categoryOptions = useMemo(() => ({
    cutout: '73%',
    plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 18 } } }
  }), []);

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <a className="flex items-center gap-3" href="/performance">
            <span className="brand-mark" aria-hidden="true"><span /></span>
            <span className="text-lg font-bold tracking-tight">pulse<span className="text-forest">.</span></span>
          </a>
          <div className="hidden items-center gap-2 text-xs font-medium text-muted sm:flex">
            <span className="status-dot" />
            Google Lighthouse data
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_290px] lg:gap-10 lg:py-11">
        <section className="min-w-0">
          <div className="mb-7">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-forest">Web performance report</p>
            <h1 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">Make every visit feel faster.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Run real Lighthouse audits for desktop and mobile, then turn the results into your next improvements.
            </p>
          </div>

          <form onSubmit={analyzeWebsite} className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-3 shadow-card sm:flex-row sm:items-center">
            <label className="sr-only" htmlFor="website-url">Website URL</label>
            <div className="flex min-w-0 flex-1 items-center gap-3 px-2">
              <span className="text-muted" aria-hidden="true">↗</span>
              <input
                id="website-url"
                className="min-w-0 flex-1 border-0 bg-transparent py-3 text-sm text-ink outline-none placeholder:text-[#a3aeaa]"
                type="url"
                placeholder="https://yourwebsite.com"
                value={url}
                onChange={event => setUrl(event.target.value)}
                required
                maxLength={2048}
              />
            </div>
            <button
              type="submit"
              disabled={status === 'analyzing' || !url.trim()}
              className="rounded-xl bg-forest px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#105844] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === 'analyzing' ? 'Analyzing…' : 'Analyze website'}
            </button>
          </form>

          {status === 'analyzing' && (
            <div className="mt-5 flex items-center gap-3 rounded-xl border border-[#d6e7df] bg-mint px-4 py-3 text-sm text-forest" role="status">
              <span className="spinner" />
              Running real desktop and mobile Lighthouse audits. This can take a minute or two.
            </div>
          )}
          {status === 'loading-history' && (
            <div className="mt-5 rounded-xl border border-line bg-white px-4 py-3 text-sm text-muted" role="status">
              Loading saved analysis…
            </div>
          )}
          {error && (
            <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
              {error}
            </div>
          )}

          {!report && status !== 'analyzing' && status !== 'loading-history' && (
            <div className="mt-8 rounded-2xl border border-dashed border-[#d7e0db] bg-white/70 px-6 py-14 text-center">
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-mint text-xl text-forest">↗</div>
              <h2 className="text-base font-semibold">Your next report starts here</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">
                Enter a public website URL above. Results are fetched from PageSpeed Insights and saved to your history.
              </p>
            </div>
          )}

          {report && selected && (
            <div className="mt-8 space-y-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-semibold text-forest">
                    <span className="status-dot" /> ANALYSIS COMPLETE
                  </div>
                  <h2 className="mt-2 truncate text-xl font-bold tracking-tight" title={report.websiteUrl}>{report.websiteUrl}</h2>
                  <p className="mt-1 text-xs text-muted">Audited {formatDate(report.analyzedAt)}</p>
                </div>
                <div className="inline-flex w-fit rounded-xl border border-line bg-white p-1">
                  {['mobile', 'desktop'].map(option => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setDevice(option)}
                      aria-pressed={device === option}
                      className={`rounded-lg px-4 py-2 text-xs font-semibold capitalize transition ${device === option ? 'bg-forest text-white shadow-sm' : 'text-muted hover:text-ink'}`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 rounded-2xl border border-line bg-white p-5 shadow-card sm:grid-cols-[auto_1fr] sm:items-center sm:p-6">
                <ScoreBadge score={selected.score} large />
                <div>
                  <p className="text-sm font-semibold">Performance score <span className="font-normal text-muted">· {device}</span></p>
                  <p className="mt-1 max-w-md text-xs leading-5 text-muted">
                    Lighthouse lab score for this device. Switch between device profiles to compare results.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-x-5 gap-y-4 border-t border-line pt-4 sm:col-span-2 sm:grid-cols-4">
                  {[
                    ['Requests', Number.isFinite(selected.metrics.totalRequests) ? selected.metrics.totalRequests : '—'],
                    ['Transfer size', formatBytes(selected.metrics.transferSizeBytes)],
                    ['Device', device],
                    ['Audit source', 'PageSpeed Insights']
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
                      <p className="mt-1 text-sm font-semibold capitalize">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <section aria-labelledby="metrics-heading">
                <div className="mb-3 flex items-end justify-between">
                  <div>
                    <h3 id="metrics-heading" className="text-sm font-bold">Core metrics</h3>
                    <p className="mt-1 text-xs text-muted">Measured by Lighthouse; unavailable fields are not estimated.</p>
                  </div>
                  <span className="text-xs font-medium capitalize text-muted">{device} results</span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {metricCards.map(({ key, label, unit }) => (
                    <article key={key} className="rounded-xl border border-line bg-white p-4">
                      <p className="text-xs leading-5 text-muted">{label}</p>
                      <p className="mt-2 text-lg font-bold tracking-tight">{formatMetric(selected.metrics[key], unit)}</p>
                    </article>
                  ))}
                </div>
              </section>

              <div className="grid gap-5 xl:grid-cols-2">
                <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
                  <div className="mb-4">
                    <h3 className="text-sm font-bold">Quality breakdown</h3>
                    <p className="mt-1 text-xs text-muted">Category scores from the same Lighthouse run.</p>
                  </div>
                  {categoryData.labels.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted">Category scores are unavailable.</p>
                  ) : (
                    <div className="relative mx-auto h-64 max-w-sm">
                      <Doughnut data={categoryData} options={categoryOptions} />
                    </div>
                  )}
                </section>
                <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
                  <div className="mb-4">
                    <h3 className="text-sm font-bold">Resource requests</h3>
                    <p className="mt-1 text-xs text-muted">Request count by resource type.</p>
                  </div>
                  {selected.resources?.length ? (
                    <div className="h-64">
                      <Bar data={resourceData} options={resourceOptions} />
                    </div>
                  ) : (
                    <p className="py-10 text-center text-sm text-muted">Resource details are unavailable.</p>
                  )}
                  {selected.resources?.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-line pt-3">
                      {selected.resources.map(resource => (
                        <div key={resource.type} className="flex justify-between gap-4 text-xs">
                          <span className="text-muted">{resource.type}</span>
                          <span className="font-semibold">{resource.requestCount} requests · {formatBytes(resource.transferSizeBytes)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold">Optimization opportunities</h3>
                    <p className="mt-1 text-xs text-muted">Lighthouse audits with scores below 90.</p>
                  </div>
                  <span className="rounded-full bg-mint px-3 py-1 text-xs font-semibold text-forest">{selected.recommendations?.length || 0} found</span>
                </div>
                {selected.recommendations?.length ? (
                  <ul className="divide-y divide-line">
                    {selected.recommendations.map(item => (
                      <li key={item.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{item.title}</p>
                          <p className="mt-1 text-xs leading-5 text-muted">{item.description.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')}</p>
                          {item.displayValue && <p className="mt-1 text-xs font-medium text-ink">{item.displayValue}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-xl bg-mint px-4 py-3 text-sm text-forest">No low-scoring Lighthouse audits in this report.</p>
                )}
              </section>
            </div>
          )}
        </section>

        <aside className="lg:pt-1">
          <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 className="text-sm font-bold">Recent analyses</h2>
                <p className="mt-1 text-xs text-muted">Saved in your MongoDB history</p>
              </div>
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-mint text-sm text-forest">↻</span>
            </div>
            {historyError && <p className="mb-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700" role="alert">{historyError}</p>}
            {history.length ? (
              <ul className="space-y-2">
                {history.map(item => {
                  const id = item._id || item.id;
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => openHistory(id)}
                        className="w-full rounded-xl border border-transparent p-3 text-left transition hover:border-line hover:bg-canvas"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-semibold" title={item.websiteUrl}>{item.websiteUrl}</span>
                          <span className="shrink-0 text-[10px] text-muted">{formatDate(item.analyzedAt)}</span>
                        </div>
                        <div className="mt-2 flex gap-4 text-[11px] text-muted">
                          <span>Mobile <b className={`ml-1 ${scoreTone(item.mobile?.score)}`}>{item.mobile?.score ?? '—'}</b></span>
                          <span>Desktop <b className={`ml-1 ${scoreTone(item.desktop?.score)}`}>{item.desktop?.score ?? '—'}</b></span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-xl bg-canvas px-4 py-5 text-center text-xs leading-5 text-muted">
                Your saved reports will appear here after your first analysis.
              </p>
            )}
          </div>
          <div className="mt-4 rounded-2xl border border-[#dce8e1] bg-mint p-5">
            <p className="text-xs font-bold text-forest">ABOUT THE DATA</p>
            <p className="mt-2 text-xs leading-5 text-[#527468]">
              Scores and metrics come from Google PageSpeed Insights. INP uses field data when available; Lighthouse does not provide an INP lab metric.
            </p>
          </div>
        </aside>
      </main>
      <footer className="border-t border-line px-5 py-5 text-center text-xs text-muted">
        Pulse Web Performance · Powered by Google PageSpeed Insights
      </footer>
    </div>
  );
}

export default App;
