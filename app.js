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
  var prefs = { sound: LS.get('sound', true), voice: LS.get('voice', true) };

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
      if (!this.ok || !prefs.voice || !text) return;
      try {
        if (interrupt) speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(text);
        if (!this.voice) this.pick();
        if (this.voice) { u.voice = this.voice; u.lang = this.voice.lang; } else u.lang = 'en-US';
        u.rate = 1; u.pitch = 1; u.volume = 1;
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
  function restStep(seconds, say, extra) {
    var s = {
      kind: 'timed', name: 'Rest', anim: 'rest', isRest: true, sayNext: true,
      instruction: 'Shake it out and breathe easy.',
      phases: [{ type: 'rest', dur: seconds, label: 'Rest', say: say, tone: 'relax', ticks: true }]
    };
    for (var k in extra) s[k] = extra[k];
    return s;
  }

  function build(key, week) {
    var S = SESSIONS[key], steps = [], overview = [];
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
          var n = Math.max(1, Math.round(b.seconds / (b.inhale + b.exhale)));
          phases = [{ type: 'ready', dur: 6, label: 'Get comfortable', say: sectionIntro(b) + b.name + '. ' + b.instruction }];
          for (i = 1; i <= n; i++) {
            phases.push({ type: 'inhale', dur: b.inhale, label: 'Breathe in', say: 'Breathe in', tone: 'in', rep: i, reps: n, repWord: 'Breath' });
            phases.push({ type: 'exhale', dur: b.exhale, label: 'Breathe out', say: 'Breathe out', tone: 'out', rep: i, reps: n, repWord: 'Breath' });
          }
          add({ kind: 'timed', name: b.name, anim: 'breathe', instruction: b.instruction, phases: phases }, b);
          header(b);
          overview.push({ title: b.name, detail: n + ' slow breaths · in ' + b.inhale + ' s, out ' + b.exhale + ' s', from: first, optional: b.optional });
          break;
        }
        case 'holds': {
          var ht = holdTimes(S, week);
          var hold = b.hold === 'week' ? ht.hold : b.hold, relax = b.relax === 'week' ? ht.relax : b.relax;
          var flick = b.anim === 'pulse', rel = b.anim === 'ripple', voiced = b.perRepVoice !== false;
          for (s = 1; s <= b.sets; s++) {
            var intro = (s === 1 ? sectionIntro(b) + (b.introSay || b.name + '.') + ' ' : '') +
              (b.sets > 1 ? 'Set ' + s + ' of ' + b.sets + '. ' : '') + 'Get ready.';
            phases = [{ type: 'ready', dur: s === 1 && b.introSay ? 6 : 4, label: 'Get ready', say: intro }];
            for (r = 1; r <= b.reps; r++) {
              phases.push({
                type: flick ? 'flick' : rel ? 'release' : 'squeeze', dur: hold, label: b.squeezeLabel, rep: r, reps: b.reps,
                tone: flick ? 'flick' : 'start', interrupt: true,
                say: voiced ? (r === b.reps && b.reps > 1 ? 'Last one. ' : '') + b.squeezeSay : null
              });
              phases.push({
                type: flick ? 'flickrel' : rel ? 'restRep' : 'relax', dur: relax, label: b.relaxLabel, rep: r, reps: b.reps,
                tone: flick ? null : 'relax', interrupt: true, say: voiced ? b.relaxSay : null
              });
            }
            add({ kind: 'timed', name: b.name, set: s, sets: b.sets, anim: b.anim, instruction: b.instruction, phases: phases, endTone: 'set', spokenName: b.name, clockMode: hold <= 2 ? 'step' : null }, b);
            if (s < b.sets && b.restBetweenSets) add(restStep(b.restBetweenSets, 'Set complete. Rest ' + b.restBetweenSets + ' seconds.'), b);
          }
          header(b);
          overview.push({
            title: b.name, from: first, optional: b.optional,
            detail: (b.sets > 1 ? b.sets + ' sets × ' : '') + b.reps + ' reps · ' + hold + ' s ' + b.squeezeLabel.toLowerCase() + ' / ' + relax + ' s ' + b.relaxLabel.toLowerCase()
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
        case 'circuit': {
          header(b, b.section + ' · ' + b.rounds + ' rounds');
          for (r = 1; r <= b.rounds; r++) {
            b.exercises.forEach(function (ex, xi) {
              var pre = (xi === 0 ? sectionIntro(b) + 'Round ' + r + ' of ' + b.rounds + '. ' : '');
              var base = { name: ex.name, figure: ex.figure, anim: 'figure', instruction: ex.instruction, round: r, rounds: b.rounds, logKey: 'r' + r + ':' + ex.name };
              if (ex.reps) {
                base.kind = 'reps'; base.target = ex.reps; base.est = ex.est || 40; base.log = 'reps';
                base.say = pre + ex.name + '. ' + spoken(ex.reps) + ' reps. Tap done when finished.';
              } else {
                base.kind = 'timed'; base.log = ex.log || null;
                base.phases = [
                  { type: 'ready', dur: 4, label: 'Get into position', say: pre + ex.name + '. Get into position.' },
                  { type: 'work', dur: ex.seconds, label: 'Hold it', say: 'Go', tone: 'start', ticks: true }
                ];
              }
              add(base, b);
              var lastEx = xi === b.exercises.length - 1;
              if (!lastEx) add(restStep(b.restBetweenExercises, 'Rest ' + b.restBetweenExercises + ' seconds.', { round: r, rounds: b.rounds }), b);
              else if (r < b.rounds) add(restStep(b.restBetweenRounds, 'Round ' + r + ' complete. Rest ' + b.restBetweenRounds + ' seconds.', { round: r, rounds: b.rounds, name: 'Round rest' }), b);
            });
          }
          b.exercises.forEach(function (ex) {
            overview.push({ title: ex.name, detail: ex.reps ? ex.reps + ' reps' : ex.seconds + ' s hold' });
          });
          overview.push({ title: 'Rests', detail: b.restBetweenExercises + ' s between moves · ' + b.restBetweenRounds + ' s between rounds', muted: true });
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
    return { steps: steps, overview: overview, total: total };
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
      st.running = true; st.last = performance.now();
      goTo(0);
    }
    resume();
  }
  function finish() {
    st.running = false; st.finished = true;
    lockOff();
    Sound.play('done');
    Voice.say('Session complete. Nice work.', false);
    renderDone();
    showScreen('done');
  }

  /* ---------- player rendering ---------- */
  var COLORS = {
    squeeze: '--warm', flick: '--warm', switch: '--warm', relax: '--cool', flickrel: '--cool', restRep: '--cool',
    rest: '--cool', exhale: '--cool', release: '--soft', inhale: '--accent', work: '--accent', ready: '--text', reps: '--go'
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
    if (step.round && !step.isRest) bits.push('Round ' + step.round + ' of ' + step.rounds);
    if (step.sets > 1) bits.push('Set ' + step.set + ' of ' + step.sets);
    if (ph && ph.reps) bits.push((ph.repWord || 'Rep') + ' ' + ph.rep + ' of ' + ph.reps);
    else if (step.sets && ph && ph.type === 'ready') { var rr = step.phases[1] && step.phases[1].reps; if (rr) bits.push(rr + ' reps'); }
    if (ph && ph.side) bits.push(ph.side === 'left' ? 'Left side' : 'Right side');
    if (step.kind === 'reps') bits.push('Target ' + step.target);
    if (step.isRest && !step.isTransition && step.round) bits.push('Round ' + step.round + ' of ' + step.rounds);
    return bits.join(' · ');
  }
  var PLAY = 'M8 5v14l11-7z', PAUSE = 'M6 5h4v14H6zM14 5h4v14h-4z';
  function render() {
    var step = cur();
    if (!step || $('player').hidden) return;
    var ph = curPhase();
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
      setText($('pPhase'), st.running ? ph.label : 'Paused');
      setPhaseColor(ph.type);
    }
    setText($('pInstr'), step.instruction || '');
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
  var NS = 'http://www.w3.org/2000/svg', C = 2 * Math.PI * 80, cue = {};
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
    // eyes far away
    cue.eyes = mk('g', {}, svg);
    mk('path', { d: 'M18 62 L52 34 L74 50 L108 20 L140 52 L160 40 L184 62', class: 'horizon' }, cue.eyes);
    mk('path', { d: 'M36 120 Q100 66 164 120 Q100 174 36 120 Z', class: 'eye-white' }, cue.eyes);
    cue.iris = mk('circle', { cx: 100, cy: 120, r: 22, class: 'eye-iris' }, cue.eyes);
    cue.pupil = mk('circle', { cx: 100, cy: 120, r: 9, class: 'eye-pupil' }, cue.eyes);
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
    ['ring', 'breath', 'pulse', 'ripple', 'eyes'].forEach(function (k) {
      cue[k].style.display = (k === name || (k === 'ring' && name === 'rest')) ? '' : 'none';
    });
  }
  function drawCue(step, ph) {
    var anim = step.anim === 'rest' ? 'rest' : step.anim === 'breathe' ? 'breath' : step.anim;
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
    $('ovSub').textContent = S.subtitle || '';
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
    $('optSound').checked = prefs.sound;
    $('optVoice').checked = prefs.voice;
    var last = LS.get('lastSummary', null);
    $('lastBox').hidden = !(S.logReps && last && last.text);
    if (S.logReps && last && last.text) {
      $('lastText').textContent = last.text;
      $('lastDate').textContent = new Date(last.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    }
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
    $('dTime').textContent = S.title + ' · ' + fmt(st.realSec) + ' total';
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
  function copyText(text, msgEl) {
    function ok() { if (msgEl) { msgEl.textContent = 'Copied! Paste it to your coach.'; } }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
      var done = false; try { done = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      if (msgEl) msgEl.textContent = done ? 'Copied! Paste it to your coach.' : 'Copy blocked – select the text above and copy it manually.';
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
    var s = $('pSound'), v = $('pVoice');
    s.innerHTML = prefs.sound ? ICONS.soundOn : ICONS.soundOff;
    v.innerHTML = prefs.voice ? ICONS.voiceOn : ICONS.voiceOff;
    s.classList.toggle('off', !prefs.sound); v.classList.toggle('off', !prefs.voice);
    s.setAttribute('aria-pressed', String(prefs.sound)); v.setAttribute('aria-pressed', String(prefs.voice));
    s.title = 'Sound ' + (prefs.sound ? 'on' : 'off'); v.title = 'Voice ' + (prefs.voice ? 'on' : 'off');
    $('optSound').checked = prefs.sound; $('optVoice').checked = prefs.voice;
  }
  function setPref(k, val) {
    prefs[k] = val; LS.set(k, val);
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
  window.__coach = { st: st, build: build, speed: SPEED, summary: summaryText };
})();
