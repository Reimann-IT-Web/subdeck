'use strict';
// Ein Klick auf das Symbol öffnet das Deck in einem eigenen Tab.
const api = globalThis.browser ?? globalThis.chrome;
Promise.resolve(api.tabs.create({ url: api.runtime.getURL('index.html') }))
  .catch(() => {})
  .finally(() => window.close());
