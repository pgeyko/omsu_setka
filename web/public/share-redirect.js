// Executed on a short /g/<id> share page. The page itself is intentionally
// static for link-preview bots; real browsers are sent to the right viewport.
(function () {
  var match = window.location.pathname.match(/^\/g\/(\d+)\/?$/);
  if (!match) return;
  var target = window.matchMedia('(min-width: 980px)').matches ? 'week' : 'today';
  window.location.replace('/g/' + match[1] + '/' + target);
})();
