/* Home Coach – guided workout player. Plain JS, no dependencies. */
(function () {
  'use strict';

  var SESSIONS = window.COACH_SESSIONS;
  var qs = new URLSearchParams(location.search);
  var SPEED = Math.min(60, Math.max(0.1, parseFloat(qs.get('speed')) || 1)); // debug: ?speed=10
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- storage ---------- */
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem('coach.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('coach.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  var prefs = { sound: LS.get('sound', true), voice: LS.get('voice', true), voiceQuiet: LS.get('voiceQuiet', false) };
  // Quiet sessions (e.g. recall, used in a shared office) stay silent unless voice is also switched on for them.
  function isQuiet() { var S = st && st.key && SESSIONS[st.key]; return !!(S && S.quiet); }
  // Sessions flagged voiceDefaultOff (pelvic) are silent until voice is switched on for them, like quiet ones.
  function voiceOptIn() { var S = st && st.key && SESSIONS[st.key]; return !!(S && (S.quiet || S.voiceDefaultOff)); }
  function voiceOn() { return prefs.voice && (!voiceOptIn() || prefs.voiceQuiet); }

  /* ---------- helpers ---------- */
  function fmt(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function fmtMin(sec) { return sec < 90 ? Math.round(sec) + ' s' : '~' + Math.round(sec / 60) + ' min'; }
  function spoken(t) { return String(t).replace(/[–-]/g, ' to '); }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
  var textCache = new Map();
  function setText(el, txt) { if (textCache.get(el) !== txt) { textCache.set(el, txt); el.textContent = txt; } }

  /* ---------- audio (Web Audio beeps) ---------- */
  var Sound = {
    ctx: null,
    unlock: function () {
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* Safari 17+ only */ }
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        if (!this.ctx) this.ctx = new AC();
        if (this.ctx.state !== 'running') this.ctx.resume();
        var b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource();
        s.buffer = b; s.connect(this.ctx.destination); s.start(0);
      } catch (e) { /* no audio */ }
    },
    tone: function (freq, dur, o) {
      o = o || {};
      var c = this.ctx, t = c.currentTime + (o.at || 0), vol = o.vol || 0.25;
      var osc = c.createOscillator(), g = c.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(c.destination);
      osc.start(t); osc.stop(t + dur + 0.05);
    },
    play: function (name) {
      if (!prefs.sound || !this.ctx) return;
      if (this.ctx.state !== 'running') { try { this.ctx.resume(); } catch (e) {} }
      var T = this.tone.bind(this);
      try {
        switch (name) {
          case 'start': T(660, 0.22, { slide: 990, vol: 0.3 }); break;              // squeeze / go: rising
          case 'relax': T(560, 0.4, { slide: 330, vol: 0.25 }); break;              // relax / rest: falling
          case 'tick': T(1250, 0.07, { type: 'square', vol: 0.07 }); break;         // last-3-seconds tick
          case 'flick': T(900, 0.09, { vol: 0.22 }); break;                         // quick flick blip
          case 'switch': T(740, 0.11, { vol: 0.25 }); T(740, 0.11, { at: 0.18, vol: 0.25 }); break;
          case 'in': T(392, 0.5, { slide: 523, vol: 0.1 }); break;                  // soft breathe in
          case 'out': T(494, 0.7, { slide: 330, vol: 0.08 }); break;                // soft breathe out
          case 'set': [523, 659, 784].forEach(function (f, i) { T(f, 0.25, { at: i * 0.12, vol: 0.22 }); }); break;
          case 'chime': T(784, 1.6, { vol: 0.07 }); T(1175, 1.2, { at: 0.03, vol: 0.025 }); break; // soft bell (quiet sessions)
          case 'done': [523, 659, 784, 1047].forEach(function (f, i) { T(f, 0.35, { at: i * 0.14, vol: 0.22 }); }); break;
        }
      } catch (e) { /* ignore */ }
    }
  };

  /* ---------- speech ---------- */
  var Voice = {
    ok: 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window,
    voice: null,
    pick: function () {
      if (!this.ok) return;
      var vs = speechSynthesis.getVoices() || [];
      var en = vs.filter(function (v) { return /^en([-_]|$)/i.test(v.lang); });
      this.voice = en.find(function (v) { return /Samantha|Karen|Daniel|Moira|Serena|Google UK English Female|Google US English/i.test(v.name); }) ||
        en.find(function (v) { return v.localService; }) || en[0] || null;
    },
    say: function (text, interrupt) {
      if (!this.ok || !voiceOn() || !text) return;
      try {
        if (interrupt) speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(text);
        if (!this.voice) this.pick();
        if (this.voice) { u.voice = this.voice; u.lang = this.voice.lang; } else u.lang = 'en-US';
        var q = isQuiet();
        u.rate = q ? 0.92 : 1; u.pitch = 1; u.volume = q ? 0.35 : 1;
        speechSynthesis.speak(u);
      } catch (e) { /* ignore */ }
    },
    stop: function () { if (this.ok) try { speechSynthesis.cancel(); } catch (e) {} },
    unlock: function () {
      if (!this.ok) return;
      try { this.pick(); var u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (e) {}
    }
  };
  if (Voice.ok) { try { speechSynthesis.onvoiceschanged = function () { Voice.pick(); }; } catch (e) {} }

  /* ---------- wake lock ---------- */
  var wakeLock = null;
  function lockOn() {
    try {
      if ('wakeLock' in navigator && !wakeLock && document.visibilityState === 'visible') {
        navigator.wakeLock.request('screen').then(function (l) {
          wakeLock = l; l.addEventListener('release', function () { wakeLock = null; });
        }).catch(function () {});
      }
    } catch (e) {}
  }
  function lockOff() { try { if (wakeLock) wakeLock.release(); } catch (e) {} wakeLock = null; }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && st.running) lockOn(); });

  /* ---------- build steps from session data ---------- */
  function holdTimes(S, week) {
    var rows = S.holdByWeek || [];
    for (var i = 0; i < rows.length; i++) if (week <= rows[i].maxWeek) return rows[i];
    return { hold: 5, relax: 5 };
  }
  function wv(b, field, row) { // block value, overridden by the holdByWeek row key named in b.weekKeys[field]
    var k = b.weekKeys && b.weekKeys[field];
    return k && row[k] != null ? row[k] : b[field];
  }
  function restStep(seconds, say, extra) {
    var s = {
      kind: 'timed', name: 'Rest', anim: 'rest', isRest: true, sayNext: true,
      instruction: 'Shake it out and breathe easy.',
      phases: [{ type: 'rest', dur: seconds, label: 'Rest', say: say, tone: 'relax', ticks: true }]
    };
    for (var k in extra) s[k] = extra[k];
    return s;
  }

  /* recall prompts: time of day (device clock) + rotating variants */
  function dayKey(d) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function hhmm(d) { return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  function recallContext(now) {
    now = now || new Date();
    var since = now.getHours() < 14 ? 'this morning' : 'lunch', last = LS.get('recallLast', null);
    if (last) { var ld = new Date(last); if (dayKey(ld) === dayKey(now) && ld < now) since = 'your last break (' + hhmm(ld) + ')'; }
    return { period: now.getHours() < 12 ? 'morning' : 'afternoon', since: since, rot: LS.get('recallRot', 0) | 0 };
  }
  function pickPrompt(b, c) {
    var list = b.prompts;
    if (!list) return b.instruction || '';
    if (!Array.isArray(list)) list = list[c.period] || list.morning || [];
    if (!list.length) return b.instruction || '';
    return String(list[((c.rot % list.length) + list.length) % list.length]).replace(/\{since\}/g, c.since);
  }

  /* habit cue: 'Same time, same spot, 4 minutes' (the minutes follow this week's total) */
  function cueText(S, totalSec) {
    return S.cue ? S.cue.replace(/\{min\}/g, String(Math.max(1, Math.round(totalSec / 60)))) : '';
  }

  /* streak (localStorage 'coach.streak' = { count, last: local day key, best }); counts one per day, consecutive days */
  function streakNow(now) { // the streak still alive today (0 if the last day done was before yesterday)
    var d = LS.get('streak', null), y = new Date(now); y.setDate(y.getDate() - 1);
    return d && (d.last === dayKey(now) || d.last === dayKey(y)) ? (d.count | 0) : 0;
  }
  function streakBump(now) { // -> { count, added }
    now = now || new Date();
    var d = LS.get('streak', null) || { count: 0, last: null, best: 0 };
    if (d.last === dayKey(now)) return { count: d.count | 0, added: false };
    d.count = streakNow(now) + 1; d.last = dayKey(now); d.best = Math.max(d.best | 0, d.count);
    LS.set('streak', d);
    return { count: d.count, added: true };
  }

  function build(key, week, rctx) {
    var S = SESSIONS[key], steps = [], overview = [];
    var nPrompts = S.blocks.filter(function (b) { return b.type === 'reflect' && !b.settle; }).length, promptNo = 0;
    var ready = S.readySeconds || 0, lastSection = null, lastOvHeader = null, seenOptional = {};
    function add(step, b) {
      step.section = step.section || b.section || b.optional || '';
      step.optional = b.optional || null;
      step.sectionKey = b.section || b.optional || b.name;
      steps.push(step);
      return step;
    }
    function header(b, title) {
      if (b.section && b.section !== lastOvHeader) { overview.push({ header: true, key: b.section, title: title || b.section }); lastOvHeader = b.section; }
      if (!b.section) lastOvHeader = null;
    }
    function sectionIntro(b) {
      var sec = b.section || b.optional;
      if (sec && sec !== lastSection) { lastSection = sec; return sec + '. '; }
      if (!sec) lastSection = null;
      return '';
    }

    S.blocks.forEach(function (b) {
      var first = steps.length, r, s, i, phases;
      switch (b.type) {
        case 'breathing': {
          var n = Math.max(1, Math.round(wv(b, 'seconds', holdTimes(S, week)) / (b.inhale + b.exhale)));
          phases = [{ type: 'ready', dur: 6, label: 'Get comfortable', say: sectionIntro(b) + b.name + '. ' + b.instruction, tip: (b.tips || {}).ready }];
          for (i = 1; i <= n; i++) {
            phases.push({ type: 'inhale', dur: b.inhale, label: 'Breathe in', say: 'Breathe in', tone: 'in', rep: i, reps: n, repWord: 'Breath', tip: (b.tips || {}).inhale });
            phases.push({ type: 'exhale', dur: b.exhale, label: 'Breathe out', say: 'Breathe out', tone: 'out', rep: i, reps: n, repWord: 'Breath', tip: (b.tips || {}).exhale });
          }
          add({ kind: 'timed', name: b.name, anim: 'breathe', instruction: b.instruction, phases: phases }, b);
          header(b);
          overview.push({ title: b.name, detail: n + ' slow breaths · in ' + b.inhale + ' s, out ' + b.exhale + ' s', from: first, optional: b.optional });
          break;
        }
        case 'holds': {
          var ht = holdTimes(S, week);
          var hold = b.hold === 'week' ? ht.hold : b.hold, relax = b.relax === 'week' ? ht.relax : b.relax;
          var nSets = wv(b, 'sets', ht), nReps = wv(b, 'reps', ht);
          var flick = b.anim === 'pulse', rel = b.anim === 'ripple' || b.anim === 'drop', voiced = b.perRepVoice !== false;
          for (s = 1; s <= nSets; s++) {
            var intro = (s === 1 ? sectionIntro(b) + (b.introSay || b.name + '.') + ' ' : '') +
              (nSets > 1 ? 'Set ' + s + ' of ' + nSets + '. ' : '') + 'Get ready.';
            phases = [{ type: 'ready', dur: s === 1 && b.introSay ? 6 : 4, label: 'Get ready', say: intro, tip: (b.tips || {}).ready }];
            for (r = 1; r <= nReps; r++) {
              var tp = b.tips || {};
              var main = {
                type: flick ? 'flick' : rel ? 'release' : 'squeeze', dur: hold, label: b.squeezeLabel, rep: r, reps: nReps,
                tone: flick ? 'flick' : 'start', interrupt: true, tip: tp.squeeze,
                say: voiced ? (r === nReps && nReps > 1 ? 'Last one. ' : '') + b.squeezeSay : null
              };
              // optional second half of the main phase with its own label/colour/tip (e.g. 'Squeeze & lift' -> 'Hold')
              if (b.thenLabel && hold > b.thenAt + 1) main.then = { at: b.thenAt, type: 'hold', label: b.thenLabel, tip: tp.then };
              phases.push(main);
              phases.push({
                type: flick ? 'flickrel' : rel ? 'restRep' : 'relax', dur: relax, label: b.relaxLabel, rep: r, reps: nReps,
                tone: flick ? null : 'relax', interrupt: true, say: voiced ? b.relaxSay : null, tip: tp.relax
              });
            }
            add({ kind: 'timed', name: b.name, set: s, sets: nSets, showSets: !!b.showSets, anim: b.anim, instruction: b.instruction, phases: phases, endTone: 'set', spokenName: b.name, clockMode: hold <= 2 ? 'step' : null }, b);
            if (s < nSets && b.restBetweenSets) add(restStep(b.restBetweenSets, 'Set complete. Rest ' + b.restBetweenSets + ' seconds.'), b);
          }
          header(b);
          overview.push({
            title: b.name, from: first, optional: b.optional,
            detail: (nSets > 1 ? nSets + ' sets × ' : '') + nReps + ' reps · ' + hold + ' s ' + b.squeezeLabel.toLowerCase() + ' / ' + relax + ' s ' + b.relaxLabel.toLowerCase()
          });
          break;
        }
        case 'stretch': {
          var optIntro = '';
          if (b.optional && !seenOptional[b.optional]) { seenOptional[b.optional] = true; optIntro = b.optional + '. Tap skip if you want to finish now. '; lastSection = b.optional; }
          phases = [
            { type: 'ready', dur: optIntro ? 8 : 5, label: 'Get into position', say: optIntro + sectionIntro(b) + b.name + '. Left side.' },
            { type: 'work', dur: b.perSide, label: 'Hold · left side', side: 'left', tone: 'start', ticks: true },
            { type: 'switch', dur: 5, label: 'Switch sides', say: 'Switch sides', tone: 'switch', interrupt: true },
            { type: 'work', dur: b.perSide, label: 'Hold · right side', side: 'right', tone: 'start', ticks: true }
          ];
          add({ kind: 'timed', name: b.name, anim: 'figure', figure: b.figure, instruction: b.instruction, phases: phases }, b);
          header(b);
          overview.push({ title: b.name, detail: b.perSide + ' s per side', from: first, optional: b.optional });
          break;
        }
        case 'timed': {
          phases = [];
          var introT = sectionIntro(b) + b.name;
          if (ready) phases.push({ type: 'ready', dur: ready, label: 'Get ready', say: introT });
          phases.push({ type: 'work', dur: b.seconds, label: 'Keep going', say: ready ? null : introT, tone: 'start', ticks: true, cues: b.cues });
          add({ kind: 'timed', name: b.name, anim: b.anim || 'figure', figure: b.figure, instruction: b.instruction, phases: phases }, b);
          header(b);
          overview.push({ title: b.name, detail: b.seconds + ' s', from: first, optional: b.optional });
          break;
        }
        case 'reflect': {
          var rc = rctx || recallContext();
          var text = b.settle ? b.instruction : pickPrompt(b, rc);
          if (!b.settle) promptNo++;
          phases = [{ type: b.settle ? 'settle' : 'reflect', dur: b.seconds, label: b.label || 'Recall', tone: 'chime', interrupt: true,
            say: b.settle ? b.name + '. ' + b.instruction : text }];
          add({ kind: 'timed', name: b.name, anim: 'glow', instruction: text, settle: !!b.settle,
            prompt: b.settle ? null : promptNo, prompts: nPrompts, phases: phases }, b);
          header(b);
          // prompts stay hidden on the overview so they feel fresh during the session
          overview.push({ title: b.name, detail: b.settle ? 'Slow breathing, eyes off the screen' : b.label || '', from: first, optional: b.optional });
          break;
        }
        case 'circuit': {
          var RW = b.roundWord || 'Round'; // e.g. 'Set' for a single-exercise block done as straight sets
          header(b, b.section + ' · ' + b.rounds + ' ' + RW.toLowerCase() + 's');
          for (r = 1; r <= b.rounds; r++) {
            b.exercises.forEach(function (ex, xi) {
              var pre = (xi === 0 ? sectionIntro(b) + RW + ' ' + r + ' of ' + b.rounds + '. ' : '');
              var base = { name: ex.name, figure: ex.figure, anim: 'figure', instruction: ex.instruction, round: r, rounds: b.rounds, roundWord: RW, logKey: 'r' + r + ':' + ex.name };
              if (ex.reps) {
                base.kind = 'reps'; base.target = ex.reps; base.est = ex.est || 40; base.log = 'reps';
                base.say = pre + ex.name + '. ' + spoken(ex.reps) + ' reps. ' + (ex.say && r === 1 ? ex.say + ' ' : '') + 'Tap done when finished.';
              } else {
                base.kind = 'timed'; base.log = ex.log || null;
                base.phases = [
                  { type: 'ready', dur: 4, label: 'Get into position', say: pre + ex.name + '. Get into position.' },
                  { type: 'work', dur: ex.seconds, label: 'Hold it', say: 'Go', tone: 'start', ticks: true }
                ];
              }
              add(base, b);
              var lastEx = xi === b.exercises.length - 1;
              if (!lastEx) add(restStep(b.restBetweenExercises, 'Rest ' + b.restBetweenExercises + ' seconds.', { round: r, rounds: b.rounds, roundWord: RW }), b);
              else if (r < b.rounds) add(restStep(b.restBetweenRounds, RW + ' ' + r + ' complete. Rest ' + b.restBetweenRounds + ' seconds.', { round: r, rounds: b.rounds, roundWord: RW, name: RW + ' rest' }), b);
            });
          }
          b.exercises.forEach(function (ex) {
            overview.push({ title: ex.name, detail: ex.reps ? ex.reps + ' reps' : ex.seconds + ' s hold' });
          });
          overview.push({ title: 'Rests', detail: (b.exercises.length > 1 ? b.restBetweenExercises + ' s between moves · ' : '') + b.restBetweenRounds + ' s between ' + RW.toLowerCase() + 's', muted: true });
          break;
        }
        case 'interval': {
          header(b, b.section + ' · ' + b.rounds + ' rounds');
          for (r = 1; r <= b.rounds; r++) {
            b.exercises.forEach(function (ex, xi) {
              var isFirst = r === 1 && xi === 0 && b.setup;
              add({
                kind: 'timed', name: isFirst ? b.setup.label : 'Transition', anim: 'rest', isRest: true, isTransition: true,
                round: r, rounds: b.rounds, instruction: isFirst ? 'Place it on a non-slip surface or against a wall.' : 'Get set for the next move.',
                phases: [{ type: 'rest', dur: isFirst ? b.setup.seconds : b.transition, label: 'Get ready', tone: 'relax', ticks: true,
                  say: (isFirst ? sectionIntro(b) + b.setup.label + '. ' : '') + 'Next: ' + ex.name }]
              }, b);
              add({
                kind: 'timed', name: ex.name, anim: 'figure', figure: ex.figure, mirror: ex.side === 'right', instruction: ex.instruction,
                round: r, rounds: b.rounds, interval: true,
                phases: [{ type: 'work', dur: b.work, label: 'Keep going', say: 'Go', tone: 'start', ticks: true }]
              }, b);
            });
          }
          b.exercises.forEach(function (ex) { overview.push({ title: ex.name, detail: b.work + ' s × ' + b.rounds + ' rounds' }); });
          overview.push({ title: 'Transitions', detail: b.transition + ' s between moves', muted: true });
          break;
        }
      }
    });

    // durations + "Next: ..." speech for rest steps
    steps.forEach(function (step, i) {
      step.index = i;
      step.dur = step.kind === 'reps' ? step.est : step.phases.reduce(function (a, p) { return a + p.dur; }, 0);
    });
    steps.forEach(function (step, i) {
      var nx = steps[i + 1];
      if (step.sayNext && nx) step.phases[0].say += ' Next: ' + spokenStep(nx) + '.';
    });
    // section totals for overview headers / rows
    overview.forEach(function (o, idx) {
      if (o.header) o.seconds = steps.filter(function (s) { return s.sectionKey === o.key; }).reduce(function (a, s) { return a + s.dur; }, 0);
      else if (o.from !== undefined) {
        var nextFrom = steps.length;
        for (var j = idx + 1; j < overview.length; j++) if (overview[j].from !== undefined) { nextFrom = overview[j].from; break; }
        o.seconds = steps.slice(o.from, nextFrom).reduce(function (a, s) { return a + s.dur; }, 0);
      }
    });
    var total = steps.reduce(function (a, s) { return a + s.dur; }, 0);
    var cue = cueText(S, total);
    if (cue && steps.length && steps[0].phases[0] && steps[0].phases[0].say) steps[0].phases[0].say = cue + '. ' + steps[0].phases[0].say;
    return { steps: steps, overview: overview, total: total, cue: cue };
  }
  function spokenStep(s) {
    return s.name + (s.sets > 1 ? ', set ' + s.set + ' of ' + s.sets : '');
  }
  function stepLabel(s) {
    if (!s) return 'Finish';
    var bits = [s.name];
    if (s.sets > 1) bits.push('Set ' + s.set + ' of ' + s.sets);
    if (s.kind === 'reps') bits.push(s.target + ' reps');
    else bits.push(fmt(s.dur));
    return bits.join(' · ');
  }

  /* ---------- state ---------- */
  var st = {
    key: null, week: 1, plan: null, steps: [], i: 0, p: 0, pt: 0, se: 0,
    running: false, started: false, finished: false, last: 0, realSec: 0,
    logs: {}, completed: {}
  };
  function cur() { return st.steps[st.i]; }
  function curPhase() { var s = cur(); return s && s.kind === 'timed' ? s.phases[st.p] : null; }

  /* ---------- engine ---------- */
  function frame(now) {
    if (!st.running) return;
    now = now || performance.now();
    var dt = (now - st.last) / 1000;
    st.last = now;
    if (!(dt > 0)) dt = 0;
    if (dt > 2) dt = 2; // phone was locked/suspended: don't fast-forward
    st.realSec += dt;
    advance(dt * SPEED);
  }
  function advance(dt) {
    var step = cur();
    if (!step) return;
    st.se += dt;
    if (step.kind === 'reps') return;
    var remaining = dt, guard = 0;
    while (remaining > 0 && st.running && guard++ < 500) {
      var ph = step.phases[st.p];
      var use = Math.min(ph.dur - st.pt, remaining);
      var before = st.pt, after = st.pt + use;
      if (ph.ticks && ph.dur >= 4) {
        for (var k = 3; k >= 1; k--) { var tt = ph.dur - k; if (before < tt && after >= tt) Sound.play('tick'); }
      }
      if (ph.cues) ph.cues.forEach(function (c) { if (before < c.at && after >= c.at) { Sound.play('switch'); Voice.say(c.say, true); } });
      st.pt = after; remaining -= use;
      if (st.pt >= ph.dur - 1e-9) {
        st.p++; st.pt = 0;
        if (st.p >= step.phases.length) { completeStep(); return; }
        enterPhase();
      }
    }
  }
  function enterPhase() {
    var ph = curPhase();
    if (!ph) return;
    if (ph.tone) Sound.play(ph.tone);
    if (ph.say) Voice.say(ph.say, ph.interrupt);
  }
  function enterStep() {
    var step = cur();
    st.p = 0; st.pt = 0; st.se = 0;
    if (step.kind === 'reps') {
      Sound.play('start');
      Voice.say(step.say, true);
      var lg = st.logs[step.logKey];
      $('repsInput').value = lg && lg.value !== '' && lg.value != null ? lg.value : '';
    } else enterPhase();
  }
  function goTo(i) {
    st.i = Math.max(0, Math.min(st.steps.length - 1, i));
    enterStep();
    render();
  }
  function recordLeaving(natural) {
    var step = cur();
    if (!step) return;
    if (step.kind === 'reps') saveReps(step);
    if (step.log === 'time') {
      var secs = 0, ph = curPhase();
      if (natural) secs = step.phases[step.phases.length - 1].dur;
      else if (ph && ph.type === 'work') secs = Math.round(st.pt);
      if (natural || secs > 0) st.logs[step.logKey] = { name: step.name, round: step.round, value: secs, unit: 's' };
    }
    if (natural) st.completed[step.index] = true;
  }
  function saveReps(step) {
    var v = $('repsInput').value.trim();
    var prev = st.logs[step.logKey];
    if (v !== '' || !prev) st.logs[step.logKey] = { name: step.name, round: step.round, value: v === '' ? '' : Math.max(0, parseInt(v, 10) || 0), unit: 'reps' };
  }
  function completeStep() {
    var step = cur();
    recordLeaving(true);
    if (step.endTone) Sound.play(step.endTone);
    if (st.i + 1 >= st.steps.length) finish(); else goTo(st.i + 1);
  }

  function resume() {
    Sound.unlock();
    st.running = true;
    st.last = performance.now();
    lockOn();
    render();
  }
  function pause() {
    st.running = false;
    Voice.stop();
    lockOff();
    render();
  }
  function startSession(fresh) {
    Sound.unlock();
    Voice.unlock();
    var sameRun = st.started && !st.finished && st.plan && st.plan.key === st.key && st.plan.week === st.week;
    showScreen('player');
    if (fresh || !sameRun) {
      var plan = build(st.key, st.week);
      plan.key = st.key; plan.week = st.week;
      st.plan = plan; st.steps = plan.steps;
      st.logs = {}; st.completed = {}; st.realSec = 0;
      st.started = true; st.finished = false;
      setText($('pTitle'), SESSIONS[st.key].short || SESSIONS[st.key].title);
      var tip = SESSIONS[st.key].tip;
      $('pTip').hidden = !tip; if (tip) $('pTip').textContent = tip;
      $('player').classList.toggle('calm', !!SESSIONS[st.key].quiet);
      $('player').classList.toggle('tips', !!SESSIONS[st.key].phaseTips);
      st.running = true; st.last = performance.now();
      goTo(0);
    }
    placeNotes('player');
    resume();
  }
  function finish() {
    st.running = false; st.finished = true;
    lockOff();
    var S = SESSIONS[st.key];
    Sound.play(S.quiet ? 'chime' : 'done');
    Voice.say(S.doneSay || 'Session complete. Nice work.', false);
    if (S.blocks.some(function (b) { return b.type === 'reflect'; })) {
      LS.set('recallLast', new Date().toISOString());     // next afternoon run asks "since your last break (hh:mm)"
      LS.set('recallRot', (LS.get('recallRot', 0) | 0) + 1); // rotate prompt variants
    }
    st.streakRes = S.streak ? streakBump(new Date()) : null;
    renderDone();
    placeNotes('done');
    showScreen('done');
  }

  /* ---------- player rendering ---------- */
  var COLORS = {
    squeeze: '--warm', hold: '--hold', flick: '--warm', switch: '--warm', relax: '--cool', flickrel: '--cool', restRep: '--cool',
    rest: '--cool', exhale: '--cool', release: '--soft', settle: '--cool', reflect: '--soft', inhale: '--accent', work: '--accent', ready: '--text', reps: '--go'
  };
  var lastColor = null;
  function setPhaseColor(type) {
    var c = COLORS[type] || '--accent';
    if (c !== lastColor) { lastColor = c; document.documentElement.style.setProperty('--phase', 'var(' + c + ')'); }
  }
  function remainingSec() {
    var step = cur(); if (!step) return 0;
    var r;
    if (step.kind === 'reps') r = Math.max(0, step.est - st.se);
    else {
      var done = 0;
      for (var i = 0; i < st.p; i++) done += step.phases[i].dur;
      r = step.dur - done - st.pt;
    }
    for (var j = st.i + 1; j < st.steps.length; j++) r += st.steps[j].dur;
    return Math.max(0, r);
  }
  function metaFor(step, ph) {
    var bits = [];
    if (step.round && !step.isRest) bits.push((step.roundWord || 'Round') + ' ' + step.round + ' of ' + step.rounds);
    if (step.sets > 1 || step.showSets) bits.push('Set ' + step.set + ' of ' + step.sets);
    if (ph && ph.reps) bits.push((ph.repWord || 'Rep') + ' ' + ph.rep + ' of ' + ph.reps);
    else if (step.sets && ph && ph.type === 'ready') { var rr = step.phases[1] && step.phases[1].reps; if (rr) bits.push(rr + ' reps'); }
    if (ph && ph.side) bits.push(ph.side === 'left' ? 'Left side' : 'Right side');
    if (step.kind === 'reps') bits.push('Target ' + step.target);
    if (step.prompt) bits.push('Prompt ' + step.prompt + ' of ' + step.prompts);
    if (step.settle) bits.push('Eyes off the screen');
    if (step.isRest && !step.isTransition && step.round) bits.push((step.roundWord || 'Round') + ' ' + step.round + ' of ' + step.rounds);
    return bits.join(' · ');
  }
  var PLAY = 'M8 5v14l11-7z', PAUSE = 'M6 5h4v14H6zM14 5h4v14h-4z';
  function effPhase(ph) { // a phase may switch label/colour/tip part-way (squeeze & lift -> hold)
    return ph && ph.then && st.pt >= ph.then.at ? ph.then : ph;
  }
  function render() {
    var step = cur();
    if (!step || $('player').hidden) return;
    var ph = curPhase(), ep = effPhase(ph);
    setText($('pSection'), step.section || '');
    setText($('pName'), step.name);
    setText($('pMeta'), metaFor(step, ph));
    var clock = $('pClock'), isReps = step.kind === 'reps';
    clock.classList.toggle('target', isReps);
    if (isReps) {
      setText(clock, step.target);
      setText($('pPhase'), st.running ? 'reps · ' + fmt(st.se) : 'Paused');
      setPhaseColor('reps');
    } else {
      var left = Math.ceil(ph.dur - st.pt - 1e-6);
      if (step.clockMode === 'step' && ph.type !== 'ready') { // very short reps (quick flicks): count down the whole set
        var spent = st.pt; for (var q = 0; q < st.p; q++) spent += step.phases[q].dur;
        left = Math.ceil(step.dur - spent - 1e-6);
      }
      setText(clock, left >= 60 ? fmt(left) : String(Math.max(0, left)));
      setText($('pPhase'), st.running ? ep.label : 'Paused');
      setPhaseColor(ep.type);
    }
    setText($('pInstr'), (!isReps && ep && ep.tip) || step.instruction || '');
    $('repsPanel').hidden = !isReps;
    var sk = $('btnSkipGroup');
    sk.hidden = !step.optional;
    if (step.optional) setText(sk, 'Skip ' + step.optional.replace(/^optional\s+/i, '') + ' →');
    setText($('pNext'), stepLabel(st.steps[st.i + 1]));
    var total = st.plan.total, rem = remainingSec();
    $('pBar').style.width = (100 * (1 - rem / total)).toFixed(1) + '%';
    setText($('pCount'), 'Step ' + (st.i + 1) + ' of ' + st.steps.length + (SESSIONS[st.key].usesWeek ? ' · Week ' + st.week : ''));
    setText($('pEta'), fmt(rem) + ' left');
    var icon = st.running ? PAUSE : PLAY;
    var path = $('playIcon').firstChild;
    if (path.getAttribute('d') !== icon) path.setAttribute('d', icon);
    drawCue(step, ph);
  }

  /* ---------- cue animations (SVG, driven by the timer) ---------- */
  var NS = 'http://www.w3.org/2000/svg', C = 2 * Math.PI * 80, CG = 2 * Math.PI * 84, cue = {};
  var reduceMotion = false;
  try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  function mk(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    parent.appendChild(e); return e;
  }
  function mountCues() {
    var svg = $('cueSvg');
    var defs = mk('defs', {}, svg);
    var gr = mk('radialGradient', { id: 'gBreath' }, defs);
    mk('stop', { offset: '0%', 'stop-color': '#5eead4', 'stop-opacity': '0.95' }, gr);
    mk('stop', { offset: '100%', 'stop-color': '#0ea5e9', 'stop-opacity': '0.35' }, gr);
    // ring (squeeze/relax + rest countdown)
    cue.ring = mk('g', {}, svg);
    mk('circle', { cx: 100, cy: 100, r: 80, class: 'cue-track' }, cue.ring);
    cue.arc = mk('circle', { cx: 100, cy: 100, r: 80, class: 'cue-ring', transform: 'rotate(-90 100 100)', 'stroke-dasharray': C.toFixed(1), 'stroke-dashoffset': C.toFixed(1) }, cue.ring);
    cue.ringText = mk('text', { x: 100, y: 96, class: 'cue-text' }, cue.ring);
    cue.ringSub = mk('text', { x: 100, y: 122, class: 'cue-sub' }, cue.ring);
    // breathing circle
    cue.breath = mk('g', {}, svg);
    mk('circle', { cx: 100, cy: 100, r: 90, class: 'breath-guide' }, cue.breath);
    cue.breathCore = mk('circle', { cx: 100, cy: 100, r: 40, class: 'breath-core' }, cue.breath);
    cue.breathText = mk('text', { x: 100, y: 101, class: 'cue-text' }, cue.breath);
    // quick-flick pulse
    cue.pulse = mk('g', {}, svg);
    cue.pulseRing = mk('circle', { cx: 100, cy: 100, r: 45, class: 'ripple-ring', style: 'stroke: var(--warm)' }, cue.pulse);
    cue.pulseCore = mk('circle', { cx: 100, cy: 100, r: 40, class: 'pulse-core' }, cue.pulse);
    // release ripple
    cue.ripple = mk('g', {}, svg);
    cue.ripples = [0, 1, 2].map(function () { return mk('circle', { cx: 100, cy: 100, r: 30, class: 'ripple-ring' }, cue.ripple); });
    cue.rippleCore = mk('circle', { cx: 100, cy: 100, r: 28, class: 'ripple-core' }, cue.ripple);
    // pelvic floor lift / drop: a circle that shrinks + rises on a squeeze, expands + sinks on a release, with a level bar
    cue.floor = mk('g', {}, svg);
    mk('circle', { cx: 100, cy: 100, r: 88, class: 'breath-guide' }, cue.floor);
    mk('line', { x1: 8, y1: 100, x2: 172, y2: 100, class: 'floor-mid' }, cue.floor);
    mk('rect', { x: 182, y: 22, width: 12, height: 156, rx: 6, class: 'cue-track', 'stroke-width': 0 }, cue.floor);
    cue.floorFill = mk('rect', { x: 182, y: 100, width: 12, height: 0, rx: 6, class: 'floor-fill' }, cue.floor);
    setText(mk('text', { x: 188, y: 14, class: 'cue-sub' }, cue.floor), 'UP');
    setText(mk('text', { x: 188, y: 194, class: 'cue-sub' }, cue.floor), 'DOWN');
    cue.floorCore = mk('circle', { cx: 100, cy: 100, r: 52, class: 'floor-core' }, cue.floor);
    cue.floorIcon = mk('g', {}, cue.floor);
    cue.fUp = mk('polygon', { points: '100,-20 122,6 108,6 108,22 92,22 92,6 78,6', class: 'floor-arrow' }, cue.floorIcon);
    cue.fDown = mk('polygon', { points: '100,22 122,-4 108,-4 108,-20 92,-20 92,-4 78,-4', class: 'floor-arrow' }, cue.floorIcon);
    cue.fHold = mk('g', {}, cue.floorIcon);
    mk('rect', { x: 84, y: -16, width: 12, height: 32, rx: 3, class: 'floor-arrow' }, cue.fHold);
    mk('rect', { x: 104, y: -16, width: 12, height: 32, rx: 3, class: 'floor-arrow' }, cue.fHold);
    // eyes far away
    cue.eyes = mk('g', {}, svg);
    mk('path', { d: 'M18 62 L52 34 L74 50 L108 20 L140 52 L160 40 L184 62', class: 'horizon' }, cue.eyes);
    mk('path', { d: 'M36 120 Q100 66 164 120 Q100 174 36 120 Z', class: 'eye-white' }, cue.eyes);
    cue.iris = mk('circle', { cx: 100, cy: 120, r: 22, class: 'eye-iris' }, cue.eyes);
    cue.pupil = mk('circle', { cx: 100, cy: 120, r: 9, class: 'eye-pupil' }, cue.eyes);
    // calm glow (recall): slow breathing core + thin step-progress ring
    var gg = mk('radialGradient', { id: 'gGlow' }, defs);
    mk('stop', { offset: '0%', 'stop-color': '#c4b5fd', 'stop-opacity': '0.6' }, gg);
    mk('stop', { offset: '100%', 'stop-color': '#6366f1', 'stop-opacity': '0.06' }, gg);
    cue.glow = mk('g', {}, svg);
    mk('circle', { cx: 100, cy: 100, r: 84, class: 'glow-track' }, cue.glow);
    cue.glowArc = mk('circle', { cx: 100, cy: 100, r: 84, class: 'glow-arc', transform: 'rotate(-90 100 100)', 'stroke-dasharray': CG.toFixed(1), 'stroke-dashoffset': CG.toFixed(1) }, cue.glow);
    cue.glowCore = mk('circle', { cx: 100, cy: 100, r: 50, class: 'glow-core' }, cue.glow);
    cue.glowText = mk('text', { x: 100, y: 97, class: 'cue-text' }, cue.glow);
    cue.glowSub = mk('text', { x: 100, y: 121, class: 'cue-sub' }, cue.glow);
    Figures.mount($('figSvg'));
  }
  var shownCue = null;
  function showCue(name) {
    if (shownCue === name) return;
    shownCue = name;
    var isFig = name === 'figure';
    $('stage').classList.toggle('fig', isFig);
    $('cueSvg').style.display = isFig ? 'none' : '';
    $('figSvg').style.display = isFig ? '' : 'none';
    ['ring', 'breath', 'pulse', 'ripple', 'floor', 'eyes', 'glow'].forEach(function (k) {
      cue[k].style.display = (k === name || (k === 'ring' && name === 'rest')) ? '' : 'none';
    });
  }
  function drawCue(step, ph) {
    var anim = step.anim === 'rest' ? 'rest' : step.anim === 'breathe' ? 'breath' : (step.anim === 'lift' || step.anim === 'drop') ? 'floor' : step.anim;
    showCue(anim);
    var t = ph ? clamp01(st.pt / ph.dur) : 0, svg = $('cueSvg');
    svg.classList.toggle('glow', anim === 'ring' && ph && ph.type === 'squeeze');
    if (anim === 'figure') {
      Figures.draw(step.figure, st.se, step.mirror || (ph && ph.side === 'right'));
    } else if (anim === 'ring') {
      var fill = 0, label = 'Ready';
      if (ph.type === 'squeeze') { fill = ease(t); label = t < 0.3 ? 'Squeeze' : 'Hold'; }
      else if (ph.type === 'relax') { fill = 1 - ease(t); label = 'Relax'; }
      cue.arc.setAttribute('stroke-dashoffset', (C * (1 - fill)).toFixed(1));
      setText(cue.ringText, label);
      setText(cue.ringSub, ph.reps ? 'REP ' + ph.rep + ' / ' + ph.reps : '');
    } else if (anim === 'floor') {
      // L: -1 (fully dropped / reverse) ... 0 (normal) ... +1 (fully lifted)
      var L = 0, icon = null, ty = ph.type;
      if (ty === 'squeeze') { L = ease(clamp01(st.pt / (ph.then ? ph.then.at : ph.dur * 0.3))); icon = st.pt < (ph.then ? ph.then.at : 0) || !ph.then ? 'up' : 'hold'; }
      else if (ty === 'relax') { L = 1 - ease(clamp01(st.pt / Math.min(ph.dur, 2))); icon = 'down'; }
      else if (ty === 'release') { L = -ease(t); icon = 'down'; }
      else if (ty === 'restRep') { L = -(1 - ease(clamp01(st.pt / Math.min(ph.dur, 2)))); icon = 'up'; }
      if (reduceMotion) L = L > 0 ? 1 : L < 0 ? -1 : 0;
      cue.floorCore.setAttribute('r', (52 - 20 * L).toFixed(1));
      cue.floorCore.setAttribute('cy', (100 - 22 * L).toFixed(1));
      var lvl = (L + 1) / 2, bh = 156 * lvl;
      cue.floorFill.setAttribute('height', bh.toFixed(1)); cue.floorFill.setAttribute('y', (178 - bh).toFixed(1));
      cue.floorIcon.setAttribute('transform', 'translate(0 ' + (100 - 22 * L).toFixed(1) + ')');
      cue.fUp.style.display = icon === 'up' ? '' : 'none';
      cue.fDown.style.display = icon === 'down' ? '' : 'none';
      cue.fHold.style.display = icon === 'hold' ? '' : 'none';
      cue.fUp.setAttribute('transform', 'translate(0 0)');
    } else if (anim === 'rest') {
      var prog = clamp01(st.pt / ph.dur);
      cue.arc.setAttribute('stroke-dashoffset', (C * prog).toFixed(1));
      setText(cue.ringText, step.isTransition ? 'Next up' : 'Rest');
      setText(cue.ringSub, step.isTransition ? '' : 'BREATHE');
    } else if (anim === 'breath') {
      var r = 38;
      if (ph.type === 'inhale') r = 38 + 50 * ease(t);
      else if (ph.type === 'exhale') r = 88 - 50 * ease(t);
      cue.breathCore.setAttribute('r', r.toFixed(1));
      setText(cue.breathText, ph.type === 'inhale' ? 'Breathe in' : ph.type === 'exhale' ? 'Breathe out' : 'Relax');
    } else if (anim === 'pulse') {
      var pr = 40, rr = 45, ro = 0;
      if (ph.type === 'flick') { pr = 40 + 22 * Math.sin(Math.PI * Math.min(1, t * 1.6)); rr = 45 + 50 * t; ro = 1 - t; }
      cue.pulseCore.setAttribute('r', pr.toFixed(1));
      cue.pulseRing.setAttribute('r', rr.toFixed(1));
      cue.pulseRing.style.opacity = ro.toFixed(2);
    } else if (anim === 'ripple') {
      var releasing = ph.type === 'release';
      cue.ripples.forEach(function (c, k) {
        var q = releasing ? t * 1.5 - k * 0.25 : -1;
        if (q >= 0 && q <= 1) { c.setAttribute('r', (30 + 62 * ease(q)).toFixed(1)); c.style.opacity = (1 - q).toFixed(2); }
        else c.style.opacity = '0';
      });
      cue.rippleCore.setAttribute('r', (releasing ? 28 + 8 * ease(t) : ph.type === 'restRep' ? 36 - 8 * ease(t) : 28).toFixed(1));
    } else if (anim === 'glow') {
      var cyc = (st.se % 10) / 10;                              // 4 s in, 6 s out
      var k = cyc < 0.4 ? ease(cyc / 0.4) : 1 - ease((cyc - 0.4) / 0.6);
      cue.glowCore.setAttribute('r', (reduceMotion ? 52 : 40 + 22 * k).toFixed(1));
      cue.glowArc.setAttribute('stroke-dashoffset', (CG * (1 - t)).toFixed(1));
      setText(cue.glowText, step.settle ? (cyc < 0.4 ? 'Breathe in' : 'Breathe out') : 'Recall');
      setText(cue.glowSub, step.prompt ? step.prompt + ' / ' + step.prompts : '');
    } else if (anim === 'eyes') {
      var x = 100 + 16 * Math.sin(2 * Math.PI * st.se / 7);
      cue.iris.setAttribute('cx', x.toFixed(1)); cue.pupil.setAttribute('cx', x.toFixed(1));
    }
  }

  /* ---------- loop ---------- */
  function rafLoop(now) { frame(now); if (st.running) render(); requestAnimationFrame(rafLoop); }
  requestAnimationFrame(rafLoop);
  setInterval(function () { if (st.running) { frame(performance.now()); if (document.hidden) render(); } }, 250); // keeps time when rAF is throttled

  /* ---------- screens ---------- */
  function showScreen(name) {
    ['home', 'player', 'done'].forEach(function (s) { $(s).hidden = s !== name; });
    window.scrollTo(0, 0);
    if (name === 'player') { shownCue = null; render(); }
    if (name === 'home') renderHome();
  }
  function setUrl() {
    var p = new URLSearchParams(location.search);
    p.set('s', st.key);
    if (SESSIONS[st.key].usesWeek) p.set('w', st.week); else p.delete('w');
    try { history.replaceState(null, '', location.pathname + '?' + p.toString()); } catch (e) {}
  }
  function renderHome() {
    var S = SESSIONS[st.key], plan = build(st.key, st.week);
    document.title = S.title + ' · Home Coach';
    var picker = $('picker');
    picker.innerHTML = '';
    Object.keys(SESSIONS).forEach(function (k) {
      var b = document.createElement('button');
      b.className = 'pick'; b.type = 'button';
      b.setAttribute('aria-pressed', String(k === st.key));
      var tot = build(k, k === st.key ? st.week : 1).total;
      b.innerHTML = '<span></span><small></small>';
      b.firstChild.textContent = SESSIONS[k].title;
      b.lastChild.textContent = fmtMin(tot);
      b.addEventListener('click', function () { st.key = k; setUrl(); renderHome(); });
      picker.appendChild(b);
    });
    $('ovTitle').textContent = S.title;
    var sk = S.streak ? streakNow(new Date()) : 0;
    $('ovSub').textContent = (plan.cue || S.subtitle || '') + (sk ? ' · 🔥 ' + sk + '-day streak' : '');
    $('ovTotal').textContent = fmtMin(plan.total);
    $('weekRow').hidden = !S.usesWeek;
    if (S.usesWeek) {
      var ht = holdTimes(S, st.week);
      $('weekVal').textContent = st.week;
      $('weekHold').textContent = ht.hold + ' s hold / ' + ht.relax + ' s relax';
    }
    var list = $('ovList');
    list.innerHTML = '';
    plan.overview.forEach(function (o) {
      var li = document.createElement('li');
      if (o.header) {
        li.className = 'sec';
        li.textContent = o.title + (o.seconds ? ' · ' + fmtMin(o.seconds) : '');
      } else {
        var left = document.createElement('div');
        var t = document.createElement('div'); t.className = 't'; t.textContent = o.title;
        if (o.optional) { var tag = document.createElement('span'); tag.className = 'opt'; tag.textContent = 'optional'; t.appendChild(tag); }
        var d = document.createElement('div'); d.className = 'd'; d.textContent = o.detail;
        left.appendChild(t); left.appendChild(d); li.appendChild(left);
        if (o.seconds) { var sp = document.createElement('span'); sp.className = 's'; sp.textContent = fmtMin(o.seconds); li.appendChild(sp); }
        if (o.muted) t.style.color = 'var(--muted)';
      }
      list.appendChild(li);
    });
    $('ovTip').hidden = !S.tip;
    if (S.tip) $('ovTip').textContent = S.tip;
    var canResume = st.started && !st.finished && st.plan && st.plan.key === st.key && st.plan.week === st.week;
    $('btnStartLabel').textContent = canResume ? 'Resume' : 'Play';
    $('btnStartOver').hidden = !canResume;
    syncToggles();
    $('homeFoot').textContent = S.foot || DEFAULT_FOOT;
    placeNotes('home');
    var last = LS.get('lastSummary', null);
    $('lastBox').hidden = !(S.logReps && last && last.text);
    if (S.logReps && last && last.text) {
      $('lastText').textContent = last.text;
      $('lastDate').textContent = new Date(last.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    }
  }

  var DEFAULT_FOOT = $('homeFoot').textContent;

  /* ---------- notes (on-device only: localStorage 'coach.recallNotes') ---------- */
  function notesAll() { var a = LS.get('recallNotes', []); return Array.isArray(a) ? a : []; }
  function notesToday() {
    var k = dayKey(new Date());
    return notesAll().filter(function (n) { return n && n.t && dayKey(new Date(n.t)) === k; });
  }
  function addNote(text) {
    text = String(text || '').trim();
    if (!text) return false;
    var a = notesAll();
    a.push({ t: new Date().toISOString(), text: text.slice(0, 500), s: st.key });
    if (a.length > 1000) a = a.slice(-1000);
    LS.set('recallNotes', a);
    renderNotes();
    return true;
  }
  function deleteNote(t) { LS.set('recallNotes', notesAll().filter(function (n) { return n.t !== t; })); renderNotes(); }
  function notesText() {
    var date = new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    return ['Recall notes · ' + date].concat(notesToday().map(function (n) { return hhmm(new Date(n.t)) + '  ' + n.text; })).join('\n');
  }
  function renderNotes() {
    var today = notesToday(), list = $('notesList');
    list.innerHTML = '';
    today.forEach(function (n) {
      var li = document.createElement('li');
      var tm = document.createElement('span'); tm.className = 'nt'; tm.textContent = hhmm(new Date(n.t));
      var tx = document.createElement('span'); tx.className = 'nx'; tx.textContent = n.text;
      var del = document.createElement('button'); del.type = 'button'; del.className = 'nd'; del.textContent = '×';
      del.setAttribute('aria-label', 'Delete note'); del.dataset.t = n.t;
      li.appendChild(tm); li.appendChild(tx); li.appendChild(del); list.appendChild(li);
    });
    $('notesEmpty').hidden = today.length > 0;
    $('notesCopy').disabled = !today.length;
    setText($('notesCount'), today.length ? today.length + ' saved today · last: ' + today[today.length - 1].text : 'Saved on this device only · shown at the end');
  }
  function placeNotes(where) { // 'home' | 'player' | 'done'
    var box = $('notesBox'), S = SESSIONS[st.key];
    if (!S || !S.notes) { box.hidden = true; return; }
    $({ home: 'notesHome', player: 'notesPlayer', done: 'notesDone' }[where]).appendChild(box);
    box.classList.toggle('compact', where === 'player');
    $('notesMsg').textContent = '';
    box.hidden = false;
    renderNotes();
  }

  /* ---------- summary ---------- */
  function summaryText() {
    var S = SESSIONS[st.key];
    var date = new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    var lines = [S.title + (S.subtitle ? ' (' + S.subtitle.split(' · ')[0] + ')' : '') + ' · ' + date, 'Time: ' + fmt(st.realSec), ''];
    var rounds = {};
    st.steps.forEach(function (s) {
      if (!s.log) return;
      (rounds[s.round] = rounds[s.round] || []).push(s);
    });
    Object.keys(rounds).forEach(function (r) {
      var parts = rounds[r].map(function (s) {
        var lg = st.logs[s.logKey], v = lg && lg.value !== '' && lg.value != null ? lg.value : '–';
        return s.name + ' ' + v + (s.log === 'time' && v !== '–' ? ' s' : '');
      });
      lines.push('Round ' + r + ': ' + parts.join(', '));
    });
    // completion of non-logged sections
    var secs = {};
    st.steps.forEach(function (s) {
      if (s.log || s.isRest) return;
      var k = s.sectionKey;
      secs[k] = secs[k] || { done: 0, total: 0 };
      secs[k].total++; if (st.completed[s.index]) secs[k].done++;
    });
    var extra = Object.keys(secs).filter(function (k) { return !rounds[k]; }).map(function (k) { return k + ': ' + secs[k].done + '/' + secs[k].total + ' done'; });
    if (extra.length) { lines.push(''); extra.forEach(function (e) { lines.push(e); }); }
    return lines.join('\n');
  }
  function renderDone() {
    var S = SESSIONS[st.key];
    var sr = S.streak ? st.streakRes : null;
    $('dTitle').textContent = (S.doneTitle || 'Session complete') + (sr ? (sr.added ? ' Streak +1' : ' Streak ' + sr.count + ' (already counted today)') : '');
    $('dTime').textContent = S.title + ' · ' + fmt(st.realSec) + ' total' + (sr ? ' · 🔥 ' + sr.count + '-day streak' : '');
    $('dLogBox').hidden = !S.logReps;
    $('copyMsg').textContent = '';
    if (!S.logReps) return;
    var box = $('dLog');
    box.innerHTML = '';
    var byRound = {};
    st.steps.forEach(function (s) { if (s.log) (byRound[s.round] = byRound[s.round] || []).push(s); });
    Object.keys(byRound).forEach(function (r) {
      var wrap = document.createElement('div'); wrap.className = 'log-round';
      var h = document.createElement('h4'); h.textContent = 'Round ' + r; wrap.appendChild(h);
      byRound[r].forEach(function (s) {
        var row = document.createElement('label'); row.className = 'log-row';
        var name = document.createElement('span'); name.textContent = s.name;
        var right = document.createElement('span');
        var inp = document.createElement('input');
        inp.type = 'number'; inp.inputMode = 'numeric'; inp.min = '0'; inp.placeholder = '–';
        var lg = st.logs[s.logKey];
        inp.value = lg && lg.value !== '' && lg.value != null ? lg.value : '';
        inp.addEventListener('input', function () {
          var v = inp.value.trim();
          st.logs[s.logKey] = { name: s.name, round: s.round, value: v === '' ? '' : Math.max(0, parseInt(v, 10) || 0), unit: s.log === 'time' ? 's' : 'reps' };
          updateSummary();
        });
        var unit = document.createElement('span'); unit.className = 'unit'; unit.textContent = s.log === 'time' ? 'sec' : 'reps';
        right.appendChild(inp); right.appendChild(unit);
        row.appendChild(name); row.appendChild(right);
        wrap.appendChild(row);
      });
      box.appendChild(wrap);
    });
    updateSummary();
  }
  function updateSummary() {
    var text = summaryText();
    $('dText').textContent = text;
    LS.set('lastSummary', { text: text, date: new Date().toISOString(), session: st.key });
  }
  function copyText(text, msgEl, okMsg) {
    okMsg = okMsg || 'Copied! Paste it to your coach.';
    function ok() { if (msgEl) { msgEl.textContent = okMsg; } }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
      var done = false; try { done = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      if (msgEl) msgEl.textContent = done ? okMsg : 'Copy blocked – select the text above and copy it manually.';
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(ok, fallback);
    else fallback();
  }

  /* ---------- toggles ---------- */
  var ICONS = {
    soundOn: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 010 6M18.5 6.5a7.5 7.5 0 010 11"/></svg>',
    soundOff: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
    voiceOn: '<svg viewBox="0 0 24 24"><path d="M4 5h16v10H9l-5 4z"/><path d="M8 10h8"/></svg>',
    voiceOff: '<svg viewBox="0 0 24 24"><path d="M4 5h16v10H9l-5 4z"/><path d="M3 3l18 18"/></svg>'
  };
  function syncToggles() {
    var s = $('pSound'), v = $('pVoice'), vo = voiceOn();
    s.innerHTML = prefs.sound ? ICONS.soundOn : ICONS.soundOff;
    v.innerHTML = vo ? ICONS.voiceOn : ICONS.voiceOff;
    s.classList.toggle('off', !prefs.sound); v.classList.toggle('off', !vo);
    s.setAttribute('aria-pressed', String(prefs.sound)); v.setAttribute('aria-pressed', String(vo));
    s.title = 'Sound ' + (prefs.sound ? 'on' : 'off'); v.title = 'Voice ' + (vo ? 'on' : 'off') + (isQuiet() ? ' (quiet session)' : voiceOptIn() ? ' (off by default for this session)' : '');
    $('optSound').checked = prefs.sound; $('optVoice').checked = vo;
    $('optVoiceLabel').textContent = isQuiet() ? 'Voice (quiet)' : voiceOptIn() ? 'Voice cues (off by default here)' : 'Voice cues';
  }
  function setPref(k, val) {
    if (k === 'voice' && voiceOptIn()) { // quiet session: its own switch; turning it on also enables voice globally
      prefs.voiceQuiet = val; LS.set('voiceQuiet', val);
      if (val && !prefs.voice) { prefs.voice = true; LS.set('voice', true); }
    } else { prefs[k] = val; LS.set(k, val); }
    if (k === 'voice' && !val) Voice.stop();
    if (k === 'sound' && val) Sound.unlock();
    syncToggles();
  }

  /* ---------- events ---------- */
  function on(id, ev, fn) { $(id).addEventListener(ev, fn); }
  on('btnStart', 'click', function () { startSession(false); });
  on('btnStartOver', 'click', function () { startSession(true); });
  on('btnPlay', 'click', function () { if (st.running) pause(); else resume(); });
  on('btnBack', 'click', function () { Voice.stop(); goTo(st.i - 1); });
  on('btnFwd', 'click', function () {
    Voice.stop(); recordLeaving(false);
    if (st.i + 1 >= st.steps.length) finish(); else goTo(st.i + 1);
  });
  on('btnDone', 'click', function () {
    var step = cur(); if (!step || step.kind !== 'reps') return;
    saveReps(step); st.completed[step.index] = true;
    $('repsInput').blur();
    Sound.play('set');
    if (!st.running) resume();
    if (st.i + 1 >= st.steps.length) finish(); else goTo(st.i + 1);
  });
  on('repsInput', 'keydown', function (e) { if (e.key === 'Enter') $('btnDone').click(); });
  on('btnSkipGroup', 'click', function () {
    var g = cur().optional, j = st.i;
    while (j < st.steps.length && st.steps[j].optional === g) j++;
    Voice.stop();
    if (j >= st.steps.length) finish(); else goTo(j);
  });
  on('btnRestart', 'click', function () {
    if (!confirm('Restart this session from the beginning?')) return;
    Voice.stop(); startSession(true);
  });
  on('btnHome', 'click', function () { pause(); showScreen('home'); });
  on('btnAgain', 'click', function () { showScreen('home'); });
  on('btnCopy', 'click', function () { copyText($('dText').textContent, $('copyMsg')); });
  on('btnCopyLast', 'click', function () {
    var b = $('btnCopyLast'); copyText($('lastText').textContent, null);
    b.textContent = 'Copied!'; setTimeout(function () { b.textContent = 'Copy summary'; }, 1800);
  });
  on('noteForm', 'submit', function (e) {
    e.preventDefault();
    var inp = $('noteInput');
    if (addNote(inp.value)) { inp.value = ''; $('notesMsg').textContent = ''; }
  });
  on('notesList', 'click', function (e) {
    var b = e.target.closest && e.target.closest('.nd');
    if (b && confirm('Delete this note?')) deleteNote(b.dataset.t);
  });
  on('notesCopy', 'click', function () { copyText(notesText(), $('notesMsg'), 'Copied today\'s notes.'); });
  on('pSound', 'click', function () { setPref('sound', !prefs.sound); });
  on('pVoice', 'click', function () { setPref('voice', !prefs.voice); });
  on('optSound', 'change', function (e) { setPref('sound', e.target.checked); });
  on('optVoice', 'change', function (e) { setPref('voice', e.target.checked); });
  on('weekMinus', 'click', function () { st.week = Math.max(1, st.week - 1); setUrl(); renderHome(); });
  on('weekPlus', 'click', function () { st.week = Math.min(12, st.week + 1); setUrl(); renderHome(); });
  document.addEventListener('keydown', function (e) {
    if ($('player').hidden || /INPUT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName)) return;
    if (e.key === ' ') { e.preventDefault(); $('btnPlay').click(); }
    else if (e.key === 'ArrowRight') $('btnFwd').click();
    else if (e.key === 'ArrowLeft') $('btnBack').click();
  });

  /* ---------- init ---------- */
  var sParam = qs.get('s');
  st.key = SESSIONS[sParam] ? sParam : Object.keys(SESSIONS)[0];
  st.week = Math.min(12, Math.max(1, parseInt(qs.get('w'), 10) || 1));
  mountCues();
  syncToggles();
  showScreen('home');

  // debug/test hook
  window.__coach = { st: st, build: build, speed: SPEED, summary: summaryText, recallContext: recallContext, streakBump: streakBump, streakNow: streakNow, notesText: notesText, voiceOn: voiceOn };
})();
