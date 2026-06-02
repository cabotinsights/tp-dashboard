// Data freshness + coverage health for the Coach Cockpit.
// Pure logic so it is unit-testable (see scripts/data-health.test.mjs) and
// reusable in the browser as window.DataHealth.
//
// Background: a failed/partial TP pull can leave roster athletes with no
// fitness (ctl === null), which renders identically to a genuine 0% / needs
// check-in. This surfaces "data is incomplete" so a coach is not misled into
// treating a pull failure as an athlete crisis.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DataHealth = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  // Daily refresh runs ~07:00; allow a generous window before calling it stale.
  var STALE_HOURS = 28;

  function computeDataHealth(data, nowMs) {
    if (!data) {
      return { degraded: false, total: 0, incompleteCount: 0, warnings: 0, ageHours: null, stale: false, message: '' };
    }

    var roster = Array.isArray(data.roster) ? data.roster : [];
    var total = roster.length;
    // An athlete with no CTL means fitness could not be pulled for them.
    var incompleteCount = roster.filter(function (a) { return a == null || a.ctl == null; }).length;
    var warnings = (data.validation && Array.isArray(data.validation.warnings)) ? data.validation.warnings.length : 0;

    var ageHours = null;
    if (data.generated_at) {
      var gen = Date.parse(data.generated_at);
      if (!isNaN(gen)) ageHours = Math.max(0, (nowMs - gen) / 3600000);
    }
    var stale = ageHours != null && ageHours > STALE_HOURS;

    var parts = [];
    if (incompleteCount > 0) {
      parts.push(incompleteCount + ' of ' + total + ' athletes have incomplete data (fitness not pulled)');
    }
    if (stale) {
      parts.push('data is ' + Math.round(ageHours) + 'h old, so a daily refresh may have failed');
    }

    return {
      degraded: incompleteCount > 0 || stale,
      total: total,
      incompleteCount: incompleteCount,
      warnings: warnings,
      ageHours: ageHours,
      stale: stale,
      message: parts.join('; '),
    };
  }

  return { computeDataHealth: computeDataHealth, STALE_HOURS: STALE_HOURS };
}));
