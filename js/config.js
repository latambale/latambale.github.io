/* Shared config + brand tokens. Keep brand values in sync with /config/brand.json. */
window.BK = window.BK || {};

BK.brand = {
  name: 'BuildKhata',
  tagline: "A builder's ledger, by voice.",
  currency: { code: 'INR', symbol: '₹', locale: 'en-IN' }
};

/* Backend URL.
 * Leave DEFAULT_API_BASE empty to let the app ask for it once (saved in this browser),
 * or hardcode your Apps Script /exec URL here after deploying. */
BK.DEFAULT_API_BASE = '';

BK.apiBase = function () {
  try { return localStorage.getItem('bk_api') || BK.DEFAULT_API_BASE || ''; }
  catch (e) { return BK.DEFAULT_API_BASE || ''; }
};
BK.setApiBase = function (url) {
  try { localStorage.setItem('bk_api', String(url || '').trim()); } catch (e) {}
};

/* currency formatter */
BK.money = function (n) {
  n = Number(n) || 0;
  try { return BK.brand.currency.symbol + n.toLocaleString(BK.brand.currency.locale, { maximumFractionDigits: 0 }); }
  catch (e) { return BK.brand.currency.symbol + Math.round(n); }
};
