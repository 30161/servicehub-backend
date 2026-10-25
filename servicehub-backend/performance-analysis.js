const PAGE_SPEED_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const PAGE_SPEED_TIMEOUT_MS = 120000;

class PageSpeedError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = 'PageSpeedError';
    this.statusCode = statusCode;
  }
}

function normalizeWebsiteUrl(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048) {
    throw new Error('Enter a website URL no longer than 2048 characters.');
  }

  const input = value.trim();
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('Enter a valid website URL, such as https://example.com.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error('Use a valid HTTP or HTTPS website URL without embedded credentials.');
  }

  return parsed.toString();
}

async function requestPageSpeed(websiteUrl, strategy) {
  const requestUrl = new URL(PAGE_SPEED_ENDPOINT);
  requestUrl.searchParams.set('url', websiteUrl);
  requestUrl.searchParams.set('strategy', strategy);
  requestUrl.searchParams.set('category', 'performance');
  requestUrl.searchParams.append('category', 'accessibility');
  requestUrl.searchParams.append('category', 'best-practices');
  requestUrl.searchParams.append('category', 'seo');
  if (process.env.PAGESPEED_API_KEY) {
    requestUrl.searchParams.set('key', process.env.PAGESPEED_API_KEY);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PAGE_SPEED_TIMEOUT_MS);

  try {
    const response = await fetch(requestUrl, { signal: controller.signal });
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new PageSpeedError('Google PageSpeed Insights returned an unreadable response.');
    }

    if (!response.ok) {
      const providerMessage = payload.error && payload.error.message;
      const message = response.status === 429
        ? 'Google PageSpeed Insights rate limit reached. Please try again later.'
        : `Google PageSpeed Insights could not analyze this website${providerMessage ? `: ${providerMessage}` : '.'}`;
      throw new PageSpeedError(message, response.status === 429 ? 429 : 502);
    }

    return extractPageSpeedResult(payload, strategy);
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new PageSpeedError('Google PageSpeed Insights timed out. Please try again.', 504);
    }
    if (error instanceof PageSpeedError) throw error;
    throw new PageSpeedError('Could not reach Google PageSpeed Insights. Please try again.', 502);
  } finally {
    clearTimeout(timeout);
  }
}

function extractPageSpeedResult(payload, strategy) {
  const lighthouse = payload.lighthouseResult;
  if (!lighthouse || !lighthouse.audits) {
    throw new PageSpeedError('Google PageSpeed Insights returned incomplete Lighthouse results.');
  }

  const audits = lighthouse.audits;
  const metric = id => {
    const value = audits[id] && audits[id].numericValue;
    return Number.isFinite(value) ? value : null;
  };
  const cruxMetric = (source, keys) => {
    for (const key of keys) {
      const entry = source && source.metrics && source.metrics[key];
      if (entry && Number.isFinite(entry.percentile)) return entry.percentile;
    }
    return null;
  };
  const resourceSummary = audits['resource-summary'] && audits['resource-summary'].details;
  const resources = (resourceSummary && Array.isArray(resourceSummary.items) ? resourceSummary.items : [])
    .map(item => ({
      type: item.label || item.resourceType || 'Other',
      requestCount: Number.isFinite(item.requestCount) ? item.requestCount : 0,
      transferSizeBytes: Number.isFinite(item.transferSize) ? item.transferSize : 0
    }));
  const networkRequests = audits['network-requests'] && audits['network-requests'].details;
  const requestItems = networkRequests && Array.isArray(networkRequests.items) ? networkRequests.items : [];
  const hasRequestItems = Boolean(networkRequests && Array.isArray(networkRequests.items));
  const requestWaterfallLoadTime = requestItems.reduce((latest, item) => (
    Number.isFinite(item.networkEndTime) ? Math.max(latest, item.networkEndTime) : latest
  ), 0);
  const mainDocumentRequest = requestItems.find(item => (
    (item.resourceType === 'Document' || item.url === lighthouse.finalUrl || item.url === lighthouse.requestedUrl)
    && Number.isFinite(item.networkRequestTime)
    && Number.isFinite(item.networkEndTime)
    && item.networkEndTime >= item.networkRequestTime
  ));
  const totalTransferSizeBytes = metric('total-byte-weight');
  const performanceScore = lighthouse.categories && lighthouse.categories.performance;
  const recommendations = Object.entries(audits)
    .filter(([, audit]) => Number.isFinite(audit.score) && audit.score < 0.9 && audit.title)
    .sort(([, left], [, right]) => left.score - right.score)
    .slice(0, 10)
    .map(([id, audit]) => {
      const detailGuidance = Array.isArray(audit.details && audit.details.items)
        ? audit.details.items.find(item => item && item.description)?.description
        : null;
      return {
        id,
        title: audit.title,
        description: audit.description || audit.displayValue || detailGuidance || audit.title,
        displayValue: audit.displayValue || null,
        score: audit.score,
        priority: audit.score < 0.5 ? 'high' : 'medium'
      };
    });
  const scoredAudits = Object.values(audits).filter(audit => (
    Number.isFinite(audit.score)
    && !['notApplicable', 'informative', 'manual', 'error'].includes(audit.scoreDisplayMode)
  ));
  const passedAudits = scoredAudits.filter(audit => audit.score >= 0.9).length;
  const auditHealth = {
    passed: passedAudits,
    assessed: scoredAudits.length,
    percentage: scoredAudits.length ? Math.round((passedAudits / scoredAudits.length) * 100) : null
  };
  const riskFactors = recommendations.map(item => ({
    id: item.id,
    title: item.title,
    score: item.score,
    priority: item.priority,
    whatToFix: item.description,
    measuredImpact: item.displayValue
  }));

  const categoryScores = {};
  for (const [id, category] of Object.entries(lighthouse.categories || {})) {
    categoryScores[id] = Number.isFinite(category.score) ? Math.round(category.score * 100) : null;
  }

  return {
    strategy,
    lighthouse: {
      version: lighthouse.lighthouseVersion || null,
      fetchTime: lighthouse.fetchTime || null,
      requestedUrl: lighthouse.requestedUrl || null,
      finalUrl: lighthouse.finalUrl || null,
      userAgent: lighthouse.userAgent || null,
      environment: lighthouse.environment || null,
      configSettings: lighthouse.configSettings || null,
      timing: lighthouse.timing || null,
      stackPacks: lighthouse.stackPacks || [],
      runWarnings: Array.isArray(lighthouse.runWarnings) ? lighthouse.runWarnings : []
    },
    analysisUTCTimestamp: payload.analysisUTCTimestamp || null,
    score: Number.isFinite(performanceScore && performanceScore.score)
      ? Math.round(performanceScore.score * 100)
      : null,
    auditHealth,
    riskFactors,
    categories: categoryScores,
    categoryDetails: lighthouse.categories || {},
    metrics: {
      pageLoadTimeMs: metric('load')
        ?? (requestWaterfallLoadTime > 0 ? requestWaterfallLoadTime : metric('interactive')),
      interactiveMs: metric('interactive'),
      serverResponseTimeMs: metric('server-response-time'),
      httpResponseTimeMs: mainDocumentRequest
        ? mainDocumentRequest.networkEndTime - mainDocumentRequest.networkRequestTime
        : null,
      lcpMs: metric('largest-contentful-paint'),
      inpMs: metric('interaction-to-next-paint')
        ?? cruxMetric(payload.loadingExperience, ['INP', 'INTERACTION_TO_NEXT_PAINT', 'EXPERIMENTAL_INTERACTION_TO_NEXT_PAINT'])
        ?? cruxMetric(payload.originLoadingExperience, ['INP', 'INTERACTION_TO_NEXT_PAINT', 'EXPERIMENTAL_INTERACTION_TO_NEXT_PAINT']),
      cls: metric('cumulative-layout-shift')
        ?? cruxMetric(payload.loadingExperience, ['CLS', 'CUMULATIVE_LAYOUT_SHIFT', 'CUMULATIVE_LAYOUT_SHIFT_SCORE'])
        ?? cruxMetric(payload.originLoadingExperience, ['CLS', 'CUMULATIVE_LAYOUT_SHIFT', 'CUMULATIVE_LAYOUT_SHIFT_SCORE']),
      fcpMs: metric('first-contentful-paint'),
      speedIndexMs: metric('speed-index'),
      totalBlockingTimeMs: metric('total-blocking-time'),
      maxPotentialFidMs: metric('max-potential-fid'),
      totalRequests: hasRequestItems ? requestItems.length : null,
      transferSizeBytes: Number.isFinite(totalTransferSizeBytes) ? totalTransferSizeBytes : null
    },
    resources,
    recommendations,
    audits,
    fieldData: {
      page: payload.loadingExperience || null,
      origin: payload.originLoadingExperience || null
    }
  };
}

module.exports = {
  normalizeWebsiteUrl,
  requestPageSpeed,
  extractPageSpeedResult,
  PageSpeedError
};
