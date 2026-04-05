var _charts = {};

function _getOrCreate(canvasId) {
  if (_charts[canvasId]) {
    _charts[canvasId].destroy();
  }
  var ctx = document.getElementById(canvasId);
  if (!ctx) return null;
  return ctx.getContext('2d');
}

function renderFitnessTrend(canvasId, fitnessData) {
  var ctx = _getOrCreate(canvasId);
  if (!ctx) return;
  var labels = fitnessData.map(function(d) { return d.date; });
  var ctl = fitnessData.map(function(d) { return d.ctl; });
  var atl = fitnessData.map(function(d) { return d.atl; });
  var tsb = fitnessData.map(function(d) { return d.tsb; });

  _charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'CTL (Fitness)',
          data: ctl,
          borderColor: '#3177FF',
          backgroundColor: 'rgba(49, 119, 255, 0.08)',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2
        },
        {
          label: 'ATL (Fatigue)',
          data: atl,
          borderColor: '#FF5FA9',
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2
        },
        {
          label: 'TSB (Form)',
          data: tsb,
          borderColor: '#22C55E',
          backgroundColor: 'rgba(34, 197, 94, 0.06)',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 1.5,
          borderDash: [4, 2]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: { usePointStyle: true, pointStyle: 'line', font: { size: 12 } }
        },
        tooltip: {
          callbacks: {
            title: function(items) { return formatDate(items[0].label); },
            label: function(item) { return item.dataset.label + ': ' + item.raw.toFixed(1); }
          }
        }
      },
      scales: {
        x: {
          display: true,
          ticks: {
            maxTicksLimit: 8,
            callback: function(val, i) {
              var label = this.getLabelForValue(val);
              return label ? label.substring(5) : '';
            },
            font: { size: 11 }
          },
          grid: { display: false }
        },
        y: {
          display: true,
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: { font: { size: 11 } }
        }
      }
    }
  });
}

function renderWeeklyVolume(canvasId, weeklyTrend) {
  var ctx = _getOrCreate(canvasId);
  if (!ctx) return;
  var labels = weeklyTrend.map(function(w) {
    return w.week_start ? w.week_start.substring(5) : '';
  });
  var tss = weeklyTrend.map(function(w) { return w.tss; });

  _charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Weekly TSS',
        data: tss,
        backgroundColor: 'rgba(49, 119, 255, 0.7)',
        borderRadius: 4,
        barPercentage: 0.6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: function(items) { return 'Week of ' + items[0].label; },
            label: function(item) { return 'TSS: ' + item.raw; }
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 11 } }, beginAtZero: true }
      }
    }
  });
}

function renderSportDonut(canvasId, bySport) {
  var ctx = _getOrCreate(canvasId);
  if (!ctx) return;
  var labels = [];
  var data = [];
  var colors = { 'Bike': '#3177FF', 'Run': '#22C55E', 'Swim': '#F59E0B', 'Other': 'rgba(1, 15, 49, 0.2)' };
  var bgColors = [];
  Object.keys(bySport).forEach(function(sport) {
    labels.push(sport);
    data.push(bySport[sport].hours);
    bgColors.push(colors[sport] || 'rgba(1, 15, 49, 0.2)');
  });

  _charts[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{ data: data, backgroundColor: bgColors, borderWidth: 0, spacing: 2 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'right',
          labels: { usePointStyle: true, pointStyle: 'circle', font: { size: 12 }, padding: 12 }
        },
        tooltip: {
          callbacks: {
            label: function(item) { return item.label + ': ' + item.raw.toFixed(1) + 'h'; }
          }
        }
      }
    }
  });
}
