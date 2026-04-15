function app() {
  return {
    view: 'personal',
    drillAthlete: null,
    coachTab: 'triage',
    triageFilters: { search: '', sports: [], flagTypes: [], statusFilter: null },
    triageSort: { column: 'status', direction: 'desc' },
    weekOffset: 0,
    reviewState: {},
    data: null,
    loading: true,
    refreshing: false,
    fitnessRange: '90d',
    sportMixView: 'last',
    coachQuestion: '',
    coachMessages: [],
    coachLoading: false,
    coachMsgId: 0,

    get me() {
      if (!this.data) return null;
      return this.data.athletes[this.data.me] || null;
    },

    get roster() {
      if (!this.data) return [];
      if (Array.isArray(this.data.roster)) return this.data.roster;
      if (Array.isArray(this.data.roster_summary)) return this.data.roster_summary;
      return [];
    },

    get triageRoster() {
      var r = this.roster.slice();
      var f = this.triageFilters;

      if (f.search) {
        var q = f.search.toLowerCase();
        r = r.filter(function(a) { return (a.name || '').toLowerCase().indexOf(q) !== -1; });
      }
      if (f.statusFilter) {
        r = r.filter(function(a) { return a.status === f.statusFilter; });
      }
      if (f.sports && f.sports.length > 0) {
        var athletes = (this.data && this.data.athletes) || {};
        r = r.filter(function(entry) {
          var a = athletes[entry.id];
          if (!a || !a.sessions_by_week) return false;
          for (var wk in a.sessions_by_week) {
            var sessions = a.sessions_by_week[wk] || [];
            for (var i = 0; i < sessions.length; i++) {
              if (f.sports.indexOf(sportClass(sessions[i].sport)) !== -1) return true;
            }
          }
          return false;
        });
      }
      if (f.flagTypes && f.flagTypes.length > 0) {
        r = r.filter(function(a) {
          if (!a.flags || a.flags.length === 0) return false;
          return a.flags.some(function(fl) { return f.flagTypes.indexOf(fl.type) !== -1; });
        });
      }

      var severityOrder = { needs_checkin: 0, watch: 1, on_track: 2 };
      r.sort(function(a, b) {
        var da = severityOrder[a.status] != null ? severityOrder[a.status] : 99;
        var db = severityOrder[b.status] != null ? severityOrder[b.status] : 99;
        if (da !== db) return da - db;
        var ra = a.days_to_event == null ? 9999 : a.days_to_event;
        var rb = b.days_to_event == null ? 9999 : b.days_to_event;
        return ra - rb;
      });

      return r;
    },

    toggleFlagFilter(type) {
      var idx = this.triageFilters.flagTypes.indexOf(type);
      if (idx === -1) this.triageFilters.flagTypes.push(type);
      else this.triageFilters.flagTypes.splice(idx, 1);
    },

    toggleSportFilter(sport) {
      var idx = this.triageFilters.sports.indexOf(sport);
      if (idx === -1) this.triageFilters.sports.push(sport);
      else this.triageFilters.sports.splice(idx, 1);
    },

    clearTriageFilters() {
      this.triageFilters = { search: '', sports: [], flagTypes: [], statusFilter: null };
    },

    hasActiveFilters() {
      var f = this.triageFilters;
      return !!(f.search || f.statusFilter || (f.flagTypes && f.flagTypes.length > 0) || (f.sports && f.sports.length > 0));
    },

    loadReviewState() {
      try {
        var raw = localStorage.getItem('coach_review_state_v1');
        this.reviewState = raw ? JSON.parse(raw) : {};
      } catch (e) {
        this.reviewState = {};
      }
    },

    saveReviewState() {
      try {
        localStorage.setItem('coach_review_state_v1', JSON.stringify(this.reviewState));
      } catch (e) { }
    },

    markReviewed(athleteId) {
      if (!this.reviewState) this.reviewState = {};
      this.reviewState[athleteId] = new Date().toISOString();
      this.saveReviewState();
    },

    markAllReviewed() {
      var now = new Date().toISOString();
      var self = this;
      this.triageRoster.forEach(function(a) { self.reviewState[a.id] = now; });
      this.saveReviewState();
    },

    lastReviewed(athleteId) {
      if (!this.reviewState) return null;
      return this.reviewState[athleteId] || null;
    },

    get selectedWeekStart() {
      if (!this.data || !this.data.weekly_totals) return null;
      var keys = Object.keys(this.data.weekly_totals).sort();
      if (keys.length === 0) return null;
      var idx = keys.length - 1 + this.weekOffset;
      if (idx < 0) idx = 0;
      if (idx >= keys.length) idx = keys.length - 1;
      return keys[idx];
    },

    get previousWeekStart() {
      if (!this.data || !this.data.weekly_totals) return null;
      var keys = Object.keys(this.data.weekly_totals).sort();
      var idx = keys.indexOf(this.selectedWeekStart);
      return idx > 0 ? keys[idx - 1] : null;
    },

    get selectedWeekTotals() {
      var wk = this.selectedWeekStart;
      if (!wk || !this.data || !this.data.weekly_totals) return null;
      return this.data.weekly_totals[wk] || null;
    },

    get previousWeekTotals() {
      var wk = this.previousWeekStart;
      if (!wk || !this.data || !this.data.weekly_totals) return null;
      return this.data.weekly_totals[wk] || null;
    },

    weekDelta(current, previous) {
      if (previous == null || previous === 0) return null;
      return Math.round(((current - previous) / previous) * 100);
    },

    stepWeek(dir) {
      if (!this.data || !this.data.weekly_totals) return;
      var keys = Object.keys(this.data.weekly_totals).sort();
      var idx = keys.length - 1 + this.weekOffset + dir;
      if (idx < 0 || idx >= keys.length) return;
      this.weekOffset += dir;
    },

    formatWeekRange(wkStart) {
      if (!wkStart) return '';
      var start = new Date(wkStart + 'T00:00:00');
      var end = new Date(start.getTime() + 6 * 86400000);
      var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return months[start.getMonth()] + ' ' + start.getDate() + ' – ' + months[end.getMonth()] + ' ' + end.getDate();
    },

    coachHeatmapData() {
      if (!this.data) return [];
      var wk = this.selectedWeekStart;
      if (!wk) return [];
      var athletes = this.data.athletes;
      var out = [];

      this.triageRoster.forEach(function(r) {
        var a = athletes[r.id];
        if (!a) return;
        var weekSessions = (a.sessions_by_week && a.sessions_by_week[wk]) || [];
        var days = [];
        for (var i = 0; i < 7; i++) {
          var d = new Date(wk + 'T00:00:00Z');
          d.setUTCDate(d.getUTCDate() + i);
          var ds = d.toISOString().slice(0, 10);
          var daySessions = weekSessions.filter(function(s) { return s.date === ds; });
          var primary = daySessions.slice().sort(function(a, b) {
            return (b.tss_planned || 0) - (a.tss_planned || 0);
          })[0];
          var status = 'rest';
          if (primary) {
            if (primary.status === 'completed') status = 'done';
            else if (primary.status === 'missed') status = 'missed';
            else status = 'upcoming';
          }
          days.push({
            date: ds,
            status: status,
            count: daySessions.length,
            primary: primary || null,
            sessions: daySessions
          });
        }
        out.push({
          id: r.id,
          name: r.name,
          avatar_initials: r.avatar_initials || r.name.slice(0, 2).toUpperCase(),
          days: days
        });
      });
      return out;
    },

    sportIcon(sport) {
      if (!sport) return '•';
      var s = sport.toLowerCase();
      if (s === 'run') return '🏃';
      if (s === 'bike' || s === 'mtnbike') return '🚴';
      if (s === 'swim') return '🏊';
      return '•';
    },

    heatmapTooltip(day) {
      if (!day.sessions || day.sessions.length === 0) return 'Rest';
      return day.sessions.map(function(s) {
        var tss = (s.tss_actual != null ? s.tss_actual : s.tss_planned) + ' TSS';
        return s.title + ' (' + s.sport + ', ' + tss + ')';
      }).join('\n');
    },

    upcomingRaces() {
      var out = { this_week: [], next_2w: [], this_month: [], later: [] };
      this.roster.forEach(function(r) {
        if (!r.next_event || r.days_to_event == null || r.days_to_event < 0) return;
        var entry = {
          id: r.id, athlete: r.name, avatar: r.avatar_initials,
          race: r.next_event, days: r.days_to_event,
          ctl: r.ctl, tsb: r.tsb
        };
        if (r.days_to_event <= 7) out.this_week.push(entry);
        else if (r.days_to_event <= 14) out.next_2w.push(entry);
        else if (r.days_to_event <= 31) out.this_month.push(entry);
        else out.later.push(entry);
      });
      for (var k in out) out[k].sort(function(a, b) { return a.days - b.days; });
      return out;
    },

    recentComments() {
      if (!this.data) return [];
      return this.data.recent_comments_feed || [];
    },

    get activeAthlete() {
      if (this.drillAthlete && this.data) {
        return this.data.athletes[this.drillAthlete] || null;
      }
      return null;
    },

    get rosterCounts() {
      var summary = this.data && this.data.roster_summary;
      if (summary && typeof summary === 'object' && !Array.isArray(summary)) {
        return {
          onTrack: summary.on_track || 0,
          watch: summary.watch || 0,
          needsCheckin: summary.needs_checkin || 0,
          total: summary.total || 0
        };
      }
      var r = this.roster;
      var onTrack = 0, watch = 0, needsCheckin = 0;
      r.forEach(function(a) {
        if (a.status === 'needs_checkin') needsCheckin++;
        else if (a.status === 'watch') watch++;
        else onTrack++;
      });
      return { onTrack: onTrack, watch: watch, needsCheckin: needsCheckin, total: r.length };
    },

    get avgCompliance() {
      var s = this.data && this.data.roster_summary;
      if (s && typeof s === 'object' && !Array.isArray(s) && typeof s.avg_compliance_pct === 'number') {
        return s.avg_compliance_pct;
      }
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
      this.loadReviewState();
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

    async askCoach(question) {
      if (!question || !question.trim() || this.coachLoading) return;
      var q = question.trim();
      this.coachQuestion = '';
      this.coachMsgId++;
      this.coachMessages.push({ id: this.coachMsgId, role: 'user', text: q });
      if (this.coachMessages.length > 8) this.coachMessages.splice(0, 2);
      this.coachLoading = true;

      try {
        var athleteData = {
          name: this.me.name,
          current_fitness: this.me.current_fitness,
          this_week: this.me.this_week,
          last_week: this.me.last_week,
          recovery: this.me.recovery ? this.me.recovery.slice(-7) : [],
          upcoming_sessions: this.me.upcoming_sessions,
          completed_sessions: this.me.completed_sessions ? this.me.completed_sessions.slice(-5) : [],
          next_event: this.me.next_event,
          focus_event: this.me.focus_event,
          pbs: this.me.pbs,
          race_history: this.me.race_history,
          weekly_trend: this.me.weekly_trend ? this.me.weekly_trend.slice(-6) : []
        };

        var resp = await fetch('/.netlify/functions/ask-coach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: q, athleteData: athleteData })
        });
        var result = await resp.json();
        this.coachMsgId++;
        this.coachMessages.push({ id: this.coachMsgId, role: 'coach', text: result.reply });
      } catch (err) {
        this.coachMsgId++;
        this.coachMessages.push({ id: this.coachMsgId, role: 'coach', text: 'Sorry, could not reach Coach AI. Try again.' });
      }
      this.coachLoading = false;
      if (this.coachMessages.length > 8) this.coachMessages.splice(0, 2);
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
