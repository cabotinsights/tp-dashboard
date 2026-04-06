function tsbStatus(tsb) {
  if (tsb >= 15) return { label: 'Race Ready', colour: 'green', cssClass: 'green' };
  if (tsb >= 5) return { label: 'Fresh', colour: 'green', cssClass: 'green' };
  if (tsb >= -10) return { label: 'Neutral', colour: 'grey', cssClass: 'grey' };
  if (tsb >= -30) return { label: 'Tired', colour: 'amber', cssClass: 'amber' };
  if (tsb >= -50) return { label: 'Very Tired', colour: 'amber', cssClass: 'amber' };
  return { label: 'Overreaching', colour: 'red', cssClass: 'red' };
}

function complianceClass(pct) {
  if (pct >= 80) return 'high';
  if (pct >= 50) return 'mid';
  return 'low';
}

function deltaStr(val) {
  if (val > 0) return '▲ +' + val.toFixed(1);
  if (val < 0) return '▼ ' + val.toFixed(1);
  return '— 0.0';
}

function deltaClass(val) {
  if (val > 0) return 'up';
  if (val < 0) return 'down';
  return 'neutral';
}

function formatDate(dateStr) {
  var d = new Date(dateStr + 'T00:00:00');
  var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return days[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()];
}

function formatDay(dateStr) {
  var d = new Date(dateStr + 'T00:00:00');
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
}

function formatHours(h) {
  if (h == null) return '-';
  var hrs = Math.floor(h);
  var mins = Math.round((h - hrs) * 60);
  if (hrs === 0) return mins + 'm';
  if (mins === 0) return hrs + 'h';
  return hrs + 'h ' + mins + 'm';
}

function sportClass(sport) {
  if (!sport) return 'other';
  var s = sport.toLowerCase();
  if (s === 'bike' || s === 'mtnbike') return 'bike';
  if (s === 'run') return 'run';
  if (s === 'swim') return 'swim';
  return 'other';
}

function flagEmoji(flag) {
  var map = {
    'overreaching': '⚠️',
    'missed_2+': '❌',
    'compliance_dropping': '📉',
    'stale': '💤',
    'race_risk': '🔴'
  };
  return map[flag] || '⚪';
}

function raceRag(ctlCurrent, ctlTarget, daysOut) {
  if (!ctlTarget || !daysOut) return 'grey';
  var pct = ctlCurrent / ctlTarget;
  if (daysOut <= 21 && pct < 0.8) return 'red';
  if (pct < 0.9) return 'amber';
  return 'green';
}

function sparklineSvg(data, width, height) {
  width = width || 80;
  height = height || 24;
  if (!data || data.length < 2) return '';
  var max = Math.max.apply(null, data);
  var min = Math.min.apply(null, data);
  var range = max - min || 1;
  var step = width / (data.length - 1);
  var points = data.map(function(v, i) {
    var x = i * step;
    var y = height - ((v - min) / range) * (height - 4) - 2;
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');
  return '<svg class="sparkline" width="' + width + '" height="' + height +
    '" viewBox="0 0 ' + width + ' ' + height + '">' +
    '<defs><filter id="glow"><feGaussianBlur stdDeviation="2" result="blur"/>' +
    '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
    '<polyline fill="none" stroke="#3177FF" stroke-width="1.5" filter="url(#glow)" points="' +
    points + '"/></svg>';
}
