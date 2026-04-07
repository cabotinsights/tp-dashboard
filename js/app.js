function app() {
  return {
    view: 'personal',
    drillAthlete: null,
    data: null,
    loading: true,
    refreshing: false,
    fitnessRange: '90d',
    sportMixView: 'last',

    get me() {
      if (!this.data) return null;
      return this.data.athletes[this.data.me] || null;
    },

    get roster() {
      if (!this.data) return [];
      return this.data.roster_summary || [];
    },

    get activeAthlete() {
      if (this.drillAthlete && this.data) {
        return this.data.athletes[this.drillAthlete] || null;
      }
      return null;
    },

    get rosterCounts() {
      var r = this.roster;
      var onTrack = 0, watch = 0, flagged = 0;
      r.forEach(function(a) {
        if (a.flags && a.flags.length > 0) { flagged++; }
        else if (a.compliance_pct < 70) { watch++; }
        else { onTrack++; }
      });
      return { onTrack: onTrack, watch: watch, flagged: flagged };
    },

    get avgCompliance() {
      var r = this.roster;
      if (r.length === 0) return 0;
      var sum = r.reduce(function(acc, a) { return acc + (a.compliance_pct || 0); }, 0);
      return Math.round(sum / r.length);
    },

    thisWeekSessions() {
      if (!this.me) return [];
      var start = this.me.this_week ? this.me.this_week.start : null;
      var end = this.me.this_week ? this.me.this_week.end : null;
      var sessions = [];

      // Add completed sessions from this week
      (this.me.completed_sessions || []).forEach(function(s) {
        if ((!start || s.date >= start) && (!end || s.date <= end)) {
          sessions.push(Object.assign({}, s, { _status: 'done' }));
        }
      });

      // Add upcoming sessions for this week
      (this.me.upcoming_sessions || []).forEach(function(s) {
        if ((!start || s.date >= start) && (!end || s.date <= end)) {
          sessions.push(Object.assign({}, s, { _status: 'upcoming' }));
        }
      });

      // Add missed sessions if any
      (this.me.missed_sessions || []).forEach(function(s) {
        if ((!start || s.date >= start) && (!end || s.date <= end)) {
          sessions.push(Object.assign({}, s, { _status: 'missed' }));
        }
      });

      // Sort by date
      sessions.sort(function(a, b) { return a.date.localeCompare(b.date); });
      return sessions;
    },

    raceYears() {
      if (!this.me || !this.me.race_history) return [];
      var years = {};
      this.me.race_history.forEach(function(r) { years[r.date.substring(0, 4)] = true; });
      return Object.keys(years).sort().reverse();
    },

    racesForYear(year) {
      if (!this.me || !this.me.race_history) return [];
      return this.me.race_history
        .filter(function(r) { return r.date.startsWith(year); })
        .sort(function(a, b) { return b.date.localeCompare(a.date); });
    },

    weeklyRampRate() {
      if (!this.me || !this.me.weekly_trend || this.me.weekly_trend.length < 2) return 0;
      var trend = this.me.weekly_trend;
      var current = trend[trend.length - 1].tss;
      var prev = trend[trend.length - 2].tss;
      if (prev === 0) return 0;
      return Math.round((current - prev) / prev * 100);
    },

    athleteData(id) {
      if (!this.data) return null;
      return this.data.athletes[id] || null;
    },

    filteredFitness(athlete) {
      if (!athlete || !athlete.fitness_history) return [];
      var hist = athlete.fitness_history;
      var now = new Date();
      var cutoff;
      if (this.fitnessRange === '90d') {
        cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      } else if (this.fitnessRange === '6m') {
        cutoff = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      } else {
        cutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      }
      return hist.filter(function(d) { return new Date(d.date) >= cutoff; });
    },

    heatmapData() {
      if (!this.data) return [];
      var athletes = this.data.athletes;
      var result = [];
      var self = this;
      this.roster.forEach(function(r) {
        var a = athletes[r.id];
        if (!a) return;
        var week = a.this_week || {};
        var days = [];
        if (week.start) {
          var d = new Date(week.start + 'T00:00:00');
          for (var i = 0; i < 7; i++) {
            var ds = d.toISOString().split('T')[0];
            var completedOnDay = (a.completed_sessions || []).filter(function(s) { return s.date === ds; });
            var allOnDay = (a.completed_sessions || []).concat(a.upcoming_sessions || []).filter(function(s) { return s.date === ds; });
            var status = 'rest';
            if (completedOnDay.length > 0) {
              status = completedOnDay.length > 1 ? 'double' : 'done';
            } else if (allOnDay.length > 0) {
              var today = new Date().toISOString().split('T')[0];
              status = ds <= today ? 'missed' : 'upcoming';
            }
            days.push({ date: ds, status: status });
            d.setDate(d.getDate() + 1);
          }
        }
        result.push({ name: a.name, days: days });
      });
      return result;
    },

    heatmapIcon(status) {
      var map = { done: '✅', double: '✅✅', missed: '❌', upcoming: '⏳', rest: '🔘' };
      return map[status] || '·';
    },

    async init() {
      await this.loadData();
      this.watchCharts();
    },

    async loadData() {
      this.loading = true;
      try {
        var resp = await fetch('data.json?t=' + Date.now());
        this.data = await resp.json();
      } catch (e) {
        console.error('Failed to load data.json:', e);
      }
      this.loading = false;
      var self = this;
      this.$nextTick(function() {
        if (self.view === 'personal' && self.me) {
          self.renderPersonalCharts(self.me);
        }
      });
    },

    async refresh() {
      this.refreshing = true;
      await this.loadData();
      this.refreshing = false;
    },

    renderSportChart() {
      if (!this.me) return;
      var sportData;
      if (this.sportMixView === 'last' && this.me.last_week && this.me.last_week.by_sport) {
        sportData = this.me.last_week.by_sport;
      } else {
        sportData = this.me.this_week ? this.me.this_week.by_sport : {};
      }
      renderSportDonut('sportChart', sportData);
    },

    renderPersonalCharts(athlete) {
      renderFitnessTrend('fitnessChart', this.filteredFitness(athlete));
      renderWeeklyVolume('volumeChart', athlete.weekly_trend || []);
      this.renderSportChart();
      if (athlete.recovery && athlete.recovery.length > 0) {
        renderRecoveryChart('recoveryChart', athlete.recovery);
      }
    },

    watchCharts() {
      var self = this;
      this.$watch('view', function(val) {
        if (val === 'personal' && self.me) {
          self.$nextTick(function() { self.renderPersonalCharts(self.me); });
        }
      });
      this.$watch('fitnessRange', function() {
        if (self.view === 'personal' && self.me) {
          renderFitnessTrend('fitnessChart', self.filteredFitness(self.me));
        } else if (self.drillAthlete) {
          var a = self.athleteData(self.drillAthlete);
          if (a) renderFitnessTrend('fitnessChart-drill', self.filteredFitness(a));
        }
      });
    }
  };
}
