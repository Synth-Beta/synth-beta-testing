/**
 * First-party visitor tracker, served as /api/share?seo=tracker and loaded by the SEO
 * pages and both SPAs. Sends pageviews (including SPA navigations) and conversion clicks
 * to /api/share?collect=1. Ids live in first-party cookies scoped to .getsynth.app so a
 * visit that starts on getsynth.app and signs up on join.getsynth.app stays one visitor.
 *
 * Exposes window.synthTrack(eventName) for in-app conversions (signup).
 * No imports: node:test loads this file directly.
 */

export const TRACKER_JS = `(function(){
  if (window.synthTrack || !/^https?:$/.test(location.protocol) || navigator.webdriver) return;
  var host = location.hostname;
  var domain = /(^|\\.)getsynth\\.app$/.test(host) ? '; domain=.getsynth.app' : '';
  function getCookie(name){ var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : null; }
  function setCookie(name, value, seconds){ document.cookie = name + '=' + encodeURIComponent(value) + '; path=/; max-age=' + seconds + '; samesite=lax' + domain + (location.protocol === 'https:' ? '; secure' : ''); }
  function rid(){ var a = new Uint8Array(12); (window.crypto || window.msCrypto).getRandomValues(a); return Array.prototype.map.call(a, function(b){ return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function ids(){
    var vid = getCookie('synth_vid') || rid();
    var sid = getCookie('synth_sid') || rid();
    setCookie('synth_vid', vid, 63072000);
    setCookie('synth_sid', sid, 1800);
    return { v: vid, s: sid };
  }
  function pageType(){ var m = document.querySelector('meta[name="synth:page-type"]'); return m ? m.getAttribute('content') : null; }
  function utm(){
    var q = new URLSearchParams(location.search), o = {};
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'].forEach(function(k){ var v = q.get(k); if (v) o[k] = v.slice(0, 200); });
    return o;
  }
  function send(eventName, extra){
    if (location.pathname.indexOf('/admin') === 0) return;
    var id = ids();
    var body = { e: eventName, h: host, p: location.pathname, t: pageType(), r: extra && extra.r !== undefined ? extra.r : '', u: utm(), v: id.v, s: id.s };
    var json = JSON.stringify(body);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon('/api/share?collect=1', new Blob([json], { type: 'text/plain' }))) return;
    } catch (e) {}
    try { fetch('/api/share?collect=1', { method: 'POST', body: json, keepalive: true, headers: { 'Content-Type': 'text/plain' } }); } catch (e) {}
  }
  var lastPath = null, lastHref = document.referrer || '';
  function pageview(){
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    send('pageview', { r: lastHref });
    lastHref = location.href;
  }
  ['pushState','replaceState'].forEach(function(fn){
    var orig = history[fn];
    history[fn] = function(){ var out = orig.apply(this, arguments); setTimeout(pageview, 0); return out; };
  });
  window.addEventListener('popstate', function(){ setTimeout(pageview, 0); });
  var CLICK = { open_in_synth: 'cta_click', app_store_click: 'app_store_click', ticket_click: 'ticket_click' };
  document.addEventListener('click', function(ev){
    var a = ev.target && ev.target.closest ? ev.target.closest('a') : null;
    if (!a) return;
    var tag = a.getAttribute('data-track');
    var name = tag && CLICK[tag] ? CLICK[tag] : (/apps\\.apple\\.com/.test(a.href || '') ? 'app_store_click' : null);
    if (name) send(name, { r: '' });
  }, true);
  window.synthTrack = function(name){ send(name, { r: '' }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pageview); else pageview();
})();`;
