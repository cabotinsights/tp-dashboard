var _charts = {};

function _getOrCreate(canvasId) {
  if (_charts[canvasId]) {
    _charts[canvasId].destroy();
  }
  var ctx = document.getElementById(canvasId);
  if (!ctx) return null;
  return ctx.getContext('2d');
}

/* Shared dark-theme defaults */
var _darkTooltip = {
  backgroundColor: '#1E293B',
  titleColor: '#F1F5F9',
  bodyColor: '#F1F5F9',
  borderColor: 'rgba(255,255,255,0.08)',
  borderWidth: 1,
  padding: 10,
  titleFont: { family: 'Inter', weight: '600' },
  bodyFont: { family: 'Inter' }
};

var _darkGrid = {
  color: 'rgba(255,255,255,0.06)',
  drawBorder: false
};

var _darkTicks = {
  color: 'rgba(241,245,249,0.5)',
  font: { family: 'Inter', size: 11 }
};

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
          backgroundColor: 'rgba(49, 119, 255, 0.12)',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2.5
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
          backgroundColor: 'rgba(34, 197, 94, 0.08)',
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
          labels: {
            usePointStyle: true,
            pointStyle: 'line',
            font: { family: 'Inter', size: 12 },
            color: 'rgba(241,245,249,0.7)',
            padding: 16
          }
        },
        tooltip: Object.assign({}, _darkTooltip, {
          callbacks: {
            title: function(items) { return formatDate(items[0].label); },
            label: function(item) { return item.dataset.label + ': ' + item.raw.toFixed(1); }
          }
        })
      },
      scales: {
        x: {
          display: true,
          ticks: Object.assign({}, _darkTicks, {
            maxTicksLimit: 8,
            callback: function(val, i) {
              var label = this.getLabelForValue(val);
              return label ? label.substring(5) : '';
            }
          }),
          grid: { display: false },
          border: { display: false }
        },
        y: {
          display: true,
          grid: _darkGrid,
          ticks: _darkTicks,
          border: { display: false }
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
  var hours = weeklyTrend.map(function(w) { return w.hours; });

  var gradient = ctx.createLinearGradient(0, 0, 0, 280);
  gradient.addColorStop(0, 'rgba(49, 119, 255, 0.9)');
  gradient.addColorStop(1, 'rgba(108, 92, 231, 0.6)');

  _charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Weekly TSS',
        data: tss,
        backgroundColor: gradient,
        borderRadius: 6,
        barPercentage: 0.6,
        yAxisID: 'y'
      }, {
        label: 'Hours',
        data: hours,
        type: 'line',
        borderColor: '#22C55E',
        backgroundColor: 'transparent',
        pointRadius: 4,
        pointBackgroundColor: '#22C55E',
        borderWidth: 2,
        tension: 0.3,
        yAxisID: 'y1'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            usePointStyle: true,
            font: { family: 'Inter', size: 11 },
            color: 'rgba(241,245,249,0.6)',
            padding: 12
          }
        },
        tooltip: Object.assign({}, _darkTooltip, {
          callbacks: {
            title: function(items) { return 'Week of ' + items[0].label; },
            label: function(item) {
              if (item.datasetIndex === 0) return 'TSS: ' + item.raw;
              return 'Hours: ' + item.raw.toFixed(1) + 'h';
            }
          }
        })
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: _darkTicks,
          border: { display: false }
        },
        y: {
          position: 'left',
          grid: _darkGrid,
          ticks: _darkTicks,
          border: { display: false },
          beginAtZero: true,
          title: { display: true, text: 'TSS', color: 'rgba(241,245,249,0.4)', font: { family: 'Inter', size: 11 } }
        },
        y1: {
          position: 'right',
          grid: { display: false },
          ticks: Object.assign({}, _darkTicks, {
            callback: function(val) { return val + 'h'; }
          }),
          border: { display: false },
          beginAtZero: true,
          title: { display: true, text: 'Hours', color: 'rgba(241,245,249,0.4)', font: { family: 'Inter', size: 11 } }
        }
      }
    }
  });
}

function renderSportDonut(canvasId, bySport) {
  var ctx = _getOrCreate(canvasId);
  if (!ctx) return;
  var labels = [];
  var data = [];
  var colors = {
    'Bike': '#3177FF',
    'Run': '#22C55E',
    'Swim': '#F59E0B',
    'Other': 'rgba(255,255,255,0.15)'
  };
  var bgColors = [];
  Object.keys(bySport).forEach(function(sport) {
    labels.push(sport);
    data.push(bySport[sport].hours);
    bgColors.push(colors[sport] || 'rgba(255,255,255,0.15)');
  });

  var totalHours = data.reduce(function(a, b) { return a + b; }, 0);

  _charts[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: bgColors,
        borderWidth: 0,
        spacing: 3,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'right',
          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            font: { family: 'Inter', size: 12 },
            color: 'rgba(241,245,249,0.7)',
            padding: 14,
            generateLabels: function(chart) {
              var d = chart.data;
              return d.labels.map(function(label, i) {
                var val = d.datasets[0].data[i];
                var pct = totalHours > 0 ? Math.round(val / totalHours * 100) : 0;
                return {
                  text: label + '  ' + val.toFixed(1) + 'h  (' + pct + '%)',
                  fillStyle: d.datasets[0].backgroundColor[i],
                  strokeStyle: 'transparent',
                  lineWidth: 0,
                  pointStyle: 'circle',
                  hidden: false,
                  index: i
                };
              });
            }
          }
        },
        tooltip: Object.assign({}, _darkTooltip, {
          callbacks: {
            label: function(item) {
              var pct = totalHours > 0 ? Math.round(item.raw / totalHours * 100) : 0;
              return item.label + ': ' + item.raw.toFixed(1) + 'h (' + pct + '%)';
            }
          }
        })
      }
    }
  });
}
