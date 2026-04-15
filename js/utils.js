function tsbStatus(tsb) {
  if (tsb >= 15) return { label: 'Race Ready', colour: 'green', cssClass: 'green' };
  if (tsb >= 5) return { label: 'Fresh', colour: 'green', cssClass: 'green' };
  if (tsb >= -10) return { label: 'Neutral', colour: 'grey', cssClass: 'grey' };
  if (tsb >= -30) return { label: 'Tired', colour: 'amber', cssClass: 'amber' };
  if (tsb >= -50) return { label: 'Very Tired', colour: 'amber', cssClass: 'amber' };
  return { label: 'Overreaching', colour: 'red', cssClass: 'red' };
}

function tsbStatusHint(tsb) {
  if (tsb >= 15) return 'Tapered and ready to perform. Ideal for race day or key sessions.';
  if (tsb >= 5) return 'Well recovered. Good window for quality training or testing.';
  if (tsb >= -10) return 'Normal training state. Balanced load and recovery.';
  if (tsb >= -30) return 'Accumulating productive fatigue. Recovery needed soon.';
  if (tsb >= -50) return 'Heavy training block. Plan recovery within the next few days.';
  return 'Deep fatigue — risk of overtraining if sustained. Prioritise rest and easy sessions.';
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
  var type = typeof flag === 'string' ? flag : (flag && flag.type);
  var map = {
    'missed_sessions': '❌',
    'fatigue_risk': '⚠️',
    'training_gap': '💤',
    'mood_keyword': '🗨️',
    'race_not_ready': '🏁',
    'overreaching': '⚠️',
    'missed_2+': '❌',
    'compliance_dropping': '📉',
    'stale': '💤',
    'race_risk': '🏁'
  };
  return map[type] || '⚪';
}

function flagLabel(flag) {
  var type = typeof flag === 'string' ? flag : (flag && flag.type);
  var map = {
    'missed_sessions': 'Missed Sessions',
    'fatigue_risk': 'Fatigue Risk',
    'training_gap': 'Training Gap',
    'mood_keyword': 'Mood Warning',
    'race_not_ready': 'Race Not Ready'
  };
  return map[type] || type || '';
}

function statusLabel(status) {
  if (status === 'needs_checkin') return 'Needs Check-In';
  if (status === 'watch') return 'Watch';
  if (status === 'on_track') return 'On Track';
  return '—';
}

function statusClass(status) {
  if (status === 'needs_checkin') return 'status-red';
  if (status === 'watch') return 'status-amber';
  if (status === 'on_track') return 'status-green';
  return 'status-grey';
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

function addDaysIso(iso, n) {
  if (!iso) return '';
  var d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekStartForIso(isoDateTime) {
  if (!isoDateTime) return null;
  var d = new Date(isoDateTime);
  var day = d.getUTCDay();
  var offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
