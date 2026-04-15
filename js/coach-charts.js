function renderDrillFitnessTrend(canvasId, history) {
  var ctx = _getOrCreate(canvasId);
  if (!ctx || !history || history.length === 0) return;
  var labels = history.map(function(d) { return d.date; });
  var ctl = history.map(function(d) { return d.ctl; });
  var atl = history.map(function(d) { return d.atl; });
  var tsb = history.map(function(d) { return d.tsb; });

  _charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        { label: 'CTL', data: ctl, borderColor: '#3177FF', backgroundColor: 'rgba(49, 119, 255, 0.12)', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 },
        { label: 'ATL', data: atl, borderColor: '#FF5FA9', backgroundColor: 'transparent', tension: 0.3, pointRadius: 0, borderWidth: 1.5 },
        { label: 'TSB', data: tsb, borderColor: '#22C55E', backgroundColor: 'rgba(34,197,94,0.08)', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 1.5, borderDash: [4, 2] }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { usePointStyle: true, color: 'rgba(241,245,249,0.7)', font: { family: 'Inter', size: 11 } } },
        tooltip: Object.assign({}, _darkTooltip, {
          callbacks: { label: function(item) { return item.dataset.label + ': ' + item.raw.toFixed(1); } }
        })
      },
      scales: {
        x: { grid: { display: false }, ticks: Object.assign({}, _darkTicks, { maxTicksLimit: 6 }), border: { display: false } },
        y: { grid: _darkGrid, ticks: _darkTicks, border: { display: false } }
      }
    }
  });
}

function renderPlannedVsActual(canvasId, sessions) {
  var ctx = _getOrCreate(canvasId);
  if (!ctx) return;
  var days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  var planned = [0,0,0,0,0,0,0];
  var actual = [0,0,0,0,0,0,0];
  var statuses = ['upcoming','upcoming','upcoming','upcoming','upcoming','upcoming','upcoming'];

  sessions.forEach(function(s) {
    var d = new Date(s.date + 'T00:00:00Z').getUTCDay();
    var idx = d === 0 ? 6 : d - 1;
    planned[idx] += s.tss_planned || 0;
    if (s.status === 'completed') {
      actual[idx] += s.tss_actual || 0;
      statuses[idx] = 'completed';
    } else if (s.status === 'missed') {
      statuses[idx] = 'missed';
    }
  });
  var actualColors = statuses.map(function(st) {
    if (st === 'missed') return '#EF4444';
    if (st === 'completed') return '#3177FF';
    return 'rgba(255,255,255,0.2)';
  });

  _charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days,
      datasets: [
        { label: 'Planned TSS', data: planned, backgroundColor: 'rgba(49, 119, 255, 0.25)', borderRadius: 4, barPercentage: 0.5 },
        { label: 'Actual TSS', data: actual, backgroundColor: actualColors, borderRadius: 4, barPercentage: 0.5 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { usePointStyle: true, color: 'rgba(241,245,249,0.7)', font: { family: 'Inter', size: 11 } } },
        tooltip: _darkTooltip
      },
      scales: {
        x: { grid: { display: false }, ticks: _darkTicks, border: { display: false } },
        y: { grid: _darkGrid, ticks: _darkTicks, border: { display: false }, beginAtZero: true }
      }
    }
  });
}
