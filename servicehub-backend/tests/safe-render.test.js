const assert = require('node:assert/strict');
const test = require('node:test');
const { escapeHtml, escapeInlineArgument } = require('../safe-render');

test('escapes HTML-special characters before inserting user values into markup', () => {
  assert.equal(escapeHtml(`<img src=x onerror="run()"> & 'test'`), '&lt;img src=x onerror=&quot;run()&quot;&gt; &amp; &#39;test&#39;');
});

test('serializes and HTML-escapes values used as inline event-handler arguments', () => {
  const escaped = escapeInlineArgument(`</button>" onclick="run()&`);
  assert.equal(escaped, '&quot;&lt;/button&gt;\\&quot; onclick=\\&quot;run()&amp;&quot;');
});
