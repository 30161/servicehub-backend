function escapeHtml(value) {
  const entities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return String(value ?? '').replace(/[&<>"']/g, character => entities[character]);
}

function escapeInlineArgument(value) {
  const json = JSON.stringify(value);
  const serialized = (json === undefined ? 'null' : json)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return escapeHtml(serialized);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { escapeHtml, escapeInlineArgument };
}

if (typeof window !== 'undefined') {
  window.ProConnectSafeRender = Object.freeze({ escapeHtml, escapeInlineArgument });
}
