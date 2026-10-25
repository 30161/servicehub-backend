import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip
} from 'chart.js';

ChartJS.register(ArcElement, BarElement, CategoryScale, Filler, LineElement, LinearScale, PointElement, Tooltip);

const metricCards = [
  { key: 'pageLoadTimeMs', label: 'Page load time', unit: 'time' },
  { key: 'interactiveMs', label: 'Time to interactive', unit: 'time' },
  { key: 'serverResponseTimeMs', label: 'Time to first byte (TTFB)', unit: 'time' },
  { key: 'httpResponseTimeMs', label: 'HTTP response time', unit: 'time' },
  { key: 'lcpMs', label: 'Largest contentful paint', unit: 'time' },
  { key: 'inpMs', label: 'Interaction to next paint', unit: 'time' },
  { key: 'cls', label: 'Cumulative layout shift', unit: 'decimal' },
  { key: 'fcpMs', label: 'First contentful paint', unit: 'time' },
  { key: 'speedIndexMs', label: 'Speed index', unit: 'time' },
  { key: 'totalBlockingTimeMs', label: 'Total blocking time', unit: 'time' },
  { key: 'maxPotentialFidMs', label: 'Max potential input delay', unit: 'time' }
];

const trendMetricOptions = [
  { key: 'score', label: 'Performance score', unit: 'score' },
  { key: 'auditHealth', label: 'Good audit checks', unit: 'score' },
  { key: 'pageLoadTimeMs', label: 'Page load time', unit: 'time' },
  { key: 'fcpMs', label: 'First contentful paint', unit: 'time' },
  { key: 'lcpMs', label: 'Largest contentful paint', unit: 'time' },
  { key: 'inpMs', label: 'Interaction to next paint', unit: 'time' },
  { key: 'cls', label: 'Cumulative layout shift', unit: 'decimal' },
  { key: 'serverResponseTimeMs', label: 'Time to first byte (TTFB)', unit: 'time' },
  { key: 'httpResponseTimeMs', label: 'HTTP response time', unit: 'time' },
  { key: 'transferSizeBytes', label: 'Page size', unit: 'bytes' }
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
  if (unit === 'bytes') return formatBytes(value);
  if (unit === 'score') return `${value}%`;
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
  if (!Number.isFinite(score)) return 'text-muted';
  if (score >= 90) return 'text-forest';
  if (score >= 50) return 'text-amber-600';
  return 'text-rose-600';
}

function scoreLabel(score) {
  if (!Number.isFinite(score)) return 'Unavailable';
  if (score >= 90) return 'Good';
  if (score >= 50) return 'Needs improvement';
  return 'At risk';
}

function ScoreBadge({ score, large = false }) {
  const safeScore = Number.isFinite(score) ? score : null;
  return (
    <div className={`score-ring ${large ? 'score-ring-large' : ''} ${scoreTone(safeScore)}`}
      role="img"
      aria-label={safeScore === null ? 'Performance score unavailable' : `Performance score ${safeScore} percent, ${scoreLabel(safeScore)}`}
      style={{ '--score': `${safeScore ?? 0}%` }}>
      <span>{safeScore === null ? '—' : `${safeScore}%`}</span>
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
  const [scheduler, setScheduler] = useState(null);
  const [clockNow, setClockNow] = useState(Date.now());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [trendMetric, setTrendMetric] = useState('score');

  const refreshHistory = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [result, latest] = await Promise.all([
        apiRequest('/history?limit=50'),
        apiRequest('/latest').catch(requestError => {
          if (requestError.message.includes('No successful performance analysis')) return null;
          throw requestError;
        })
      ]);
      setHistory(result.analyses || []);
      setScheduler(result.scheduler || null);
      if (latest) {
        setReport(current => (
          !current || current.websiteUrl === latest.websiteUrl ? latest : current
        ));
        setUrl(current => current || latest.websiteUrl);
      }
      setHistoryError('');
    } catch (requestError) {
      setHistoryError(requestError.message);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refreshHistory();
    const pollInterval = setInterval(refreshHistory, 60_000);
    const countdownInterval = setInterval(() => setClockNow(Date.now()), 1000);
    return () => {
      clearInterval(pollInterval);
      clearInterval(countdownInterval);
    };
  }, [refreshHistory]);

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
  const monitoredUrl = report?.websiteUrl
    || history.find(item => item.status !== 'failed' && item.desktop && item.mobile)?.websiteUrl;
  const monitoringHistory = useMemo(() => history
    .filter(item => (
      item.websiteUrl === monitoredUrl
      && item.status !== 'failed'
      && item.desktop
      && item.mobile
    ))
    .sort((left, right) => new Date(left.analyzedAt) - new Date(right.analyzedAt)), [history, monitoredUrl]);
  const latestSuccessfulTest = monitoringHistory[monitoringHistory.length - 1];
  const secondsUntilUpdate = scheduler?.nextRunAt
    ? Math.max(0, Math.ceil((new Date(scheduler.nextRunAt).getTime() - clockNow) / 1000))
    : null;
  const countdown = secondsUntilUpdate === null
    ? 'Waiting for a saved website'
    : `${String(Math.floor(secondsUntilUpdate / 60)).padStart(2, '0')}:${String(secondsUntilUpdate % 60).padStart(2, '0')}`;

  const trendData = useMemo(() => {
    const metric = trendMetricOptions.find(option => option.key === trendMetric);
    const valueFor = (analysis, strategy) => {
      const result = analysis[strategy];
      const value = trendMetric === 'score'
        ? result?.score
        : trendMetric === 'auditHealth'
          ? result?.auditHealth?.percentage
          : trendMetric === 'transferSizeBytes'
            ? result?.metrics?.transferSizeBytes
            : result?.metrics?.[trendMetric];
      return Number.isFinite(value) ? value : null;
    };
    return {
      labels: monitoringHistory.map(item => formatDate(item.analyzedAt)),
      datasets: [
        {
          label: 'Desktop',
          data: monitoringHistory.map(item => valueFor(item, 'desktop')),
          borderColor: '#176a55',
          backgroundColor: '#176a55',
          tension: 0.3,
          spanGaps: false
        },
        {
          label: 'Mobile',
          data: monitoringHistory.map(item => valueFor(item, 'mobile')),
          borderColor: '#d98a36',
          backgroundColor: '#d98a36',
          tension: 0.3,
          spanGaps: false
        }
      ],
      metric
    };
  }, [monitoringHistory, trendMetric]);

  const beforeAfterData = useMemo(() => {
    if (!monitoringHistory.length) return null;
    const first = monitoringHistory[0];
    const latest = monitoringHistory[monitoringHistory.length - 1];
    return {
      labels: ['Desktop', 'Mobile'],
      datasets: [
        {
          label: 'First saved result',
          data: [first.desktop?.score, first.mobile?.score],
          backgroundColor: '#a9c9b7',
          borderRadius: 5
        },
        {
          label: 'Latest result',
          data: [latest.desktop?.score, latest.mobile?.score],
          backgroundColor: '#176a55',
          borderRadius: 5
        }
      ]
    };
  }, [monitoringHistory]);

  const trendOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true } },
      tooltip: {
        callbacks: {
          label: context => {
            const value = context.parsed.y;
            if (!Number.isFinite(value)) return `${context.dataset.label}: Unavailable`;
            if (trendData.metric?.unit === 'score') return `${context.dataset.label}: ${value}/100`;
            return `${context.dataset.label}: ${formatMetric(value, trendData.metric?.unit)}`;
          }
        }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 6, maxRotation: 0 } },
      y: { beginAtZero: true, grid: { color: '#edf0ee' } }
    }
  }), [trendData.metric]);

  const beforeAfterOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { usePointStyle: true } } },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, max: 100, grid: { color: '#edf0ee' } }
    }
  }), []);

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
              {status === 'analyzing' ? 'Running test…' : 'Run Test Now'}
            </button>
          </form>

          <section className="mt-4 rounded-2xl border border-line bg-white p-4 shadow-card sm:p-5" aria-label="Automatic performance monitoring">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold">Automatic monitoring</h2>
                  {isRefreshing && <span className="text-[11px] text-muted">Refreshing from MongoDB…</span>}
                </div>
                <p className="mt-1 truncate text-xs text-muted" title={monitoredUrl || ''}>
                  {monitoredUrl || 'Run a test to save a website URL for scheduled monitoring.'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-5 text-xs sm:shrink-0">
                <div>
                  <p className="text-muted">Next scheduled test</p>
                  <p className="mt-1 font-semibold text-forest">
                    {scheduler?.enabled
                      ? scheduler.isRunning ? 'A test is running' : countdown
                      : 'Backend scheduler unavailable'}
                  </p>
                </div>
                <div>
                  <p className="text-muted">Latest successful test</p>
                  <p className="mt-1 font-semibold">
                    {latestSuccessfulTest ? formatDate(latestSuccessfulTest.analyzedAt) : 'No successful test yet'}
                  </p>
                </div>
              </div>
            </div>
            {history.find(item => item.status === 'failed' && item.websiteUrl === monitoredUrl) && (
              <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700" role="status">
                Latest test failed: {history.find(item => item.status === 'failed' && item.websiteUrl === monitoredUrl).errorMessage || 'The website could not be analyzed.'}
              </p>
            )}
          </section>

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
                  <p className={`text-sm font-semibold ${scoreTone(selected.score)}`}>
                    {scoreLabel(selected.score)} performance · {device}
                  </p>
                  <p className="mt-1 max-w-md text-xs leading-5 text-muted">
                    Lighthouse performance score shown as a percentage. Scores of 90% or higher are good.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-x-5 gap-y-4 border-t border-line pt-4 sm:col-span-2 sm:grid-cols-4">
                  {[
                    [
                      'Good audit checks',
                      Number.isFinite(selected.auditHealth?.percentage)
                        ? `${selected.auditHealth.percentage}% (${selected.auditHealth.passed}/${selected.auditHealth.assessed})`
                        : 'Unavailable'
                    ],
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

              <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
                <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                  <div>
                    <h3 className="text-sm font-bold">Performance over time</h3>
                    <p className="mt-1 text-xs text-muted">
                      Actual saved PageSpeed measurements for {device === 'mobile' ? 'mobile and desktop' : 'desktop and mobile'}.
                      Missing field data is left blank.
                    </p>
                  </div>
                  <label className="text-xs font-medium text-muted">
                    Metric
                    <select
                      className="ml-2 rounded-lg border border-line bg-white px-2 py-1.5 text-ink"
                      value={trendMetric}
                      onChange={event => setTrendMetric(event.target.value)}
                    >
                      {trendMetricOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
                    </select>
                  </label>
                </div>
                {monitoringHistory.length > 0 ? (
                  <div className="h-72">
                    <Line data={trendData} options={trendOptions} />
                  </div>
                ) : (
                  <p className="py-10 text-center text-sm text-muted">Historical measurements will appear after a successful test.</p>
                )}
              </section>

              <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
                <div className="mb-4">
                  <h3 className="text-sm font-bold">First saved vs. latest performance</h3>
                  <p className="mt-1 text-xs text-muted">
                    Score comparison from stored data; the first result is a baseline, not an assumed optimization.
                  </p>
                </div>
                {beforeAfterData ? (
                  <div className="h-56">
                    <Bar data={beforeAfterData} options={beforeAfterOptions} />
                  </div>
                ) : (
                  <p className="py-10 text-center text-sm text-muted">A baseline comparison will appear after a successful test.</p>
                )}
              </section>

              <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
                <div className="mb-4">
                  <h3 className="text-sm font-bold">Lighthouse run details</h3>
                  <p className="mt-1 text-xs text-muted">Exact run metadata and field data returned with this saved report.</p>
                </div>
                <dl className="grid gap-4 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="font-medium text-muted">Final URL</dt>
                    <dd className="mt-1 break-all font-semibold">{selected.lighthouse?.finalUrl || report.websiteUrl}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-muted">Lighthouse version</dt>
                    <dd className="mt-1 font-semibold">{selected.lighthouse?.version || 'Unavailable'}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-muted">Run time</dt>
                    <dd className="mt-1 font-semibold">{selected.lighthouse?.fetchTime ? formatDate(selected.lighthouse.fetchTime) : 'Unavailable'}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-muted">Warnings</dt>
                    <dd className="mt-1 font-semibold">{selected.lighthouse?.runWarnings?.length || 0}</dd>
                  </div>
                </dl>
                <details className="mt-4 border-t border-line pt-3">
                  <summary className="cursor-pointer text-xs font-semibold text-forest">View full run metadata, field data, and warnings</summary>
                  <pre className="mt-3 overflow-x-auto rounded-lg bg-canvas p-3 text-[11px] leading-5">{JSON.stringify({
                    analysisUTCTimestamp: selected.analysisUTCTimestamp,
                    lighthouse: selected.lighthouse,
                    categories: selected.categoryDetails,
                    fieldData: selected.fieldData
                  }, null, 2)}</pre>
                </details>
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

                <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
                  <div className="mb-4">
                    <h3 className="text-sm font-bold">Complete Lighthouse audit report</h3>
                    <p className="mt-1 text-xs text-muted">All returned audits, including passing, informational, and failing checks. Expand an audit to inspect its complete result and diagnostics.</p>
                  </div>
                  {Object.keys(selected.audits || {}).length ? (
                    <div className="divide-y divide-line">
                      {Object.entries(selected.audits).map(([id, audit]) => (
                        <details key={id} className="py-3 first:pt-0 last:pb-0">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold">{audit.title || id}</span>
                              <span className="mt-1 block text-[11px] text-muted">{id}</span>
                            </span>
                            <span className="shrink-0 text-right text-xs font-semibold text-muted">
                              {Number.isFinite(audit.score) ? `${Math.round(audit.score * 100)} / 100` : audit.scoreDisplayMode || 'Not scored'}
                              {audit.displayValue && <span className="mt-1 block font-normal">{audit.displayValue}</span>}
                            </span>
                          </summary>
                          <div className="mt-3">
                            {audit.description && <p className="mb-3 text-xs leading-5 text-muted">{audit.description.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')}</p>}
                            <pre className="overflow-x-auto rounded-lg bg-canvas p-3 text-[11px] leading-5">{JSON.stringify(audit, null, 2)}</pre>
                          </div>
                        </details>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-xl bg-canvas px-4 py-5 text-center text-xs text-muted">Detailed audit data is unavailable for this report.</p>
                  )}
                </section>
              </div>

              <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold">Risk factors and what to fix</h3>
                    <p className="mt-1 text-xs text-muted">
                      Lighthouse checks scoring below 90%; high priority is shown first.
                    </p>
                  </div>
                  <span className="rounded-full bg-mint px-3 py-1 text-xs font-semibold text-forest">
                    {(selected.riskFactors || selected.recommendations || []).length} found
                  </span>
                </div>
                {(selected.riskFactors || selected.recommendations || []).length ? (
                  <ul className="divide-y divide-line">
                    {(selected.riskFactors || selected.recommendations).map(item => (
                      <li key={item.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.priority === 'high' ? 'bg-rose-600' : 'bg-amber-500'}`} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold">{item.title}</p>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${item.priority === 'high' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>
                              {item.priority || (item.score < 0.5 ? 'high' : 'medium')} priority
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-muted">
                            What to solve: {(item.whatToFix || item.description || item.title).replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')}
                          </p>
                          {(item.measuredImpact || item.displayValue) && (
                            <p className="mt-1 text-xs font-medium text-ink">{item.measuredImpact || item.displayValue}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-xl bg-mint px-4 py-3 text-sm text-forest">
                    {selected.auditHealth?.assessed
                      ? `Good: ${selected.auditHealth.percentage}% of scored Lighthouse checks passed. No low-scoring risk factors were reported.`
                      : 'No scored Lighthouse checks or risk data are available for this report.'}
                  </p>
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
            {history.some(item => item.status !== 'failed' && item.desktop && item.mobile) ? (
              <ul className="space-y-2">
                {history.filter(item => item.status !== 'failed' && item.desktop && item.mobile).map(item => {
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
