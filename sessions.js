/*
 * Session definitions. Edit this file to change the routines.
 *
 * Block types (expanded into player steps by app.js):
 *   breathing : { name, seconds, inhale, exhale, instruction }
 *   holds     : { name, sets, reps, hold, relax, restBetweenSets, anim: 'lift'|'drop'|'ring'|'pulse'|'ripple',
 *                 showSets, weekKeys, thenLabel+thenAt (2nd half of the squeeze phase relabelled, e.g. Hold), tips: {ready, squeeze, then, relax},
 *                 squeezeLabel, relaxLabel, squeezeSay, relaxSay, perRepVoice, instruction }
 *               hold/relax may be 'week' to use the session's holdByWeek table (?w= URL param).
 *   stretch   : { name, perSide, figure, optional, instruction }   (left side, switch, right side)
 *   timed     : { name, seconds, figure | anim, instruction, cues: [{ at, say }] }
 *   circuit   : { rounds, restBetweenExercises, restBetweenRounds, exercises: [
 *                 roundWord: 'Set' (optional; says 'Set 1 of 3' instead of 'Round 1 of 3', e.g. single-exercise straight sets)
 *                 { name, reps: '15–20', est, figure, instruction, say }  -> rep-based, tap Done (say: extra spoken cue, round 1 only)
 *                 { name, seconds, figure, log: 'time', instruction } ] } -> timed
 *   interval  : { rounds, work, transition, setup: { seconds, label }, exercises: [{ name, figure, side, instruction }] }
 *   reflect   : { name, seconds, label, settle, instruction, prompts }   (calm 'glow' ring, soft chime, no ticks)
 *               prompts: [variants...] or { morning: [...], afternoon: [...] } (device clock: before 12:00 = morning).
 *               One variant is used per run and rotates each time the session is finished.
 *               '{since}' becomes 'lunch' or 'your last break (14:05)' (time of the last recall finished today).
 *
 * Session flags: voiceDefaultOff (voice silent until switched on), phaseTips (roomier tip line under the timer), cue ('{min}' = rounded minutes; shown on home, spoken first), streak (finish screen + localStorage
 *   streak counter), quiet (soft chime instead of beeps, voice off unless turned on for quiet sessions, quiet speech),
 *   notes (shows the on-device notes box), doneTitle, doneSay, foot.
 *
 * Any breathing/holds block may set weekKeys: { seconds|sets|reps: '<key in the holdByWeek row>' } to take that value from the
 *   week row instead of the block (see pelvic).
 *
 * Common optional block fields: section (group heading), optional (group name; adds a Skip button).
 * Figures available: march, armcircles, squat, pushup, row, pike, bridge, plank, crunch, kneetuck,
 *   legraise, sidecrunch, rollout (kneeling ab wheel), neckroll, shoulderroll, chestopener, hamstring, calfraise, lunge, glute.
 */
window.COACH_SESSIONS = {
  pelvic: {
    title: 'Core & pelvic floor',
    short: 'Pelvic floor',
    // Habit loop for a beginner: CUE (same time, same spot, N minutes: shown on the home screen and spoken at
    // the start) -> CRAVING (the calm, relaxed feeling afterwards) -> REWARD (a "Done ✅ Streak +1" finish
    // screen; the streak is kept on-device in localStorage 'coach.streak'). {min} = this week's length.
    cue: 'Same time, same spot, {min} minutes',
    streak: true,
    voiceDefaultOff: true, // voice stays off until switched on (iPhone Safari needs a tap anyway)
    phaseTips: true,       // player shows a one-line plain-words tip for each phase
    tip: 'Craving: the calm afterwards. Reward: Done ✅ Streak +1.',
    doneTitle: 'Done ✅',
    doneSay: 'Done. Streak plus one. Nice work.',
    usesWeek: true,
    /*
     * Week param (?w=) controls hold timing AND the volume. The slow-hold lengths are unchanged
     * (weeks 1-2: 5 s, 3-4: 8 s, 5+: 10 s). Volume starts small and is built back up SLOWLY, roughly
     * 30-60 s more every 2 weeks, one small change per step (a bit more breathing, more reps, a second
     * set...), so the habit stays easy at the start:
     *   weeks 1-2  ~3:20   weeks 3-4  ~3:50   weeks 5-6  ~4:45
     *   weeks 7-8  ~5:20   weeks 9-10 ~6:20   weeks 11-12 ~7:20
     * The last row is the ceiling (weeks 11+; the week picker stops at 12). If you extend it, keep the
     * same pace and cap the whole session at about 8-10 minutes. Reverse kegels stay gentle (5 reps, 5 s).
     * Per-row keys: hold, relax (slow holds), breath (belly-breathing seconds), slowSets, slowReps,
     * flickSets, flickReps, kegelReps. Blocks pick them up through their `weekKeys` map.
     */
    holdByWeek: [
      { maxWeek: 2,        hold: 5,  relax: 5, breath: 30, slowSets: 1, slowReps: 8,  flickSets: 1, flickReps: 10, kegelReps: 5 },
      { maxWeek: 4,        hold: 8,  relax: 5, breath: 30, slowSets: 1, slowReps: 8,  flickSets: 1, flickReps: 12, kegelReps: 5 },
      { maxWeek: 6,        hold: 10, relax: 6, breath: 30, slowSets: 1, slowReps: 10, flickSets: 1, flickReps: 12, kegelReps: 5 },
      { maxWeek: 8,        hold: 10, relax: 6, breath: 60, slowSets: 1, slowReps: 10, flickSets: 1, flickReps: 15, kegelReps: 5 },
      { maxWeek: 10,       hold: 10, relax: 6, breath: 60, slowSets: 2, slowReps: 6,  flickSets: 1, flickReps: 15, kegelReps: 5 },
      { maxWeek: Infinity, hold: 10, relax: 6, breath: 60, slowSets: 2, slowReps: 8,  flickSets: 1, flickReps: 15, kegelReps: 5 },
    ],
    blocks: [
      {
        type: 'breathing', name: 'Belly breathing', seconds: 30, inhale: 4, exhale: 6,
        weekKeys: { seconds: 'breath' },
        instruction: 'Let the pelvic floor soften and drop as you breathe in.',
        tips: {
          ready: 'Sit or lie comfortably. One hand on your belly. Next: slow belly breaths.',
          inhale: 'Breathe in through your nose and let your belly rise. Let the area down below soften.',
          exhale: 'Breathe out slowly through your mouth. Belly falls, everything stays relaxed.',
        },
      },
      {
        type: 'holds', name: 'Slow holds', sets: 1, reps: 8, hold: 'week', relax: 'week',
        weekKeys: { sets: 'slowSets', reps: 'slowReps' },
        restBetweenSets: 20,
        anim: 'lift', showSets: true, thenLabel: 'Hold', thenAt: 2,
        squeezeLabel: 'Squeeze & lift', relaxLabel: 'Release',
        squeezeSay: 'Squeeze... hold', relaxSay: 'and release',
        instruction: 'Lift and squeeze gently, hold, then let go completely.',
        tips: {
          ready: 'Slow holds. Squeeze and lift, hold, then fully let go. Each squeeze is followed by a rest.',
          squeeze: 'Gently squeeze and lift, as if stopping a pee. Not your buttocks or thighs.',
          then: 'Keep it lifted and keep breathing. Belly, glutes and thighs stay soft.',
          relax: 'Let go completely and rest. Feel it sink back down.',
        },
      },
      {
        type: 'holds', name: 'Quick flicks', sets: 1, reps: 12, hold: 1, relax: 1,
        weekKeys: { sets: 'flickSets', reps: 'flickReps' },
        restBetweenSets: 20, anim: 'pulse', perRepVoice: false, showSets: true,
        squeezeLabel: 'Quick flick', relaxLabel: 'Release',
        tips: {
          ready: 'Quick flicks. Squeeze and let go fast, about one per second.',
          squeeze: 'Squeeze quickly and lift!',
          relax: 'Let go straight away. No holding.',
        },
        introSay: 'Quick flicks. Squeeze and release with each beep.',
        instruction: 'Quick squeeze, then let go straight away. About one per second.',
      },
      {
        type: 'holds', name: 'Reverse kegels', sets: 1, reps: 5, hold: 5, relax: 5,
        weekKeys: { reps: 'kegelReps' },
        restBetweenSets: 0, anim: 'drop', showSets: true,
        squeezeLabel: 'Reverse: let it drop', relaxLabel: 'Rest',
        tips: {
          ready: 'Reverse kegels. Gentle: this is relaxing, not pushing.',
          squeeze: 'Breathe into your belly and gently let the area between your balls and anus soften and drop, as if starting to pee. No pushing.',
          relax: 'Rest and breathe normally. Back to neutral.',
        },
        squeezeSay: 'Gently release', relaxSay: 'Rest',
        introSay: "Reverse kegels. Gently, don't push hard.",
        instruction: "Gently relax and lengthen outward (a gentle 5 s release). Don't push hard.",
      },
    ],
  },

  workout: {
    title: 'Home full-body',
    short: 'Full-body',
    subtitle: 'Week 1 · bodyweight + a backpack',
    logReps: true,
    readySeconds: 3,
    blocks: [
      { type: 'timed', section: 'Warm-up', name: 'March in place', seconds: 60, figure: 'march',
        instruction: 'Lift the knees, swing the arms, breathe easy.' },
      { type: 'timed', section: 'Warm-up', name: 'Arm circles', seconds: 60, figure: 'armcircles',
        instruction: 'Small circles growing bigger. Switch direction halfway.',
        cues: [{ at: 30, say: 'Switch direction' }] },
      { type: 'timed', section: 'Warm-up', name: 'Slow bodyweight squats', seconds: 60, figure: 'squat',
        instruction: 'Slow and controlled. Chest up, knees over toes.' },
      {
        type: 'circuit', section: 'Circuit', rounds: 3, restBetweenExercises: 20, restBetweenRounds: 90,
        exercises: [
          { name: 'Push-ups', reps: '8–12', est: 40, figure: 'pushup',
            say: 'Option: hands on the wheel handles. Keep the wheels still.',
            instruction: 'Option: hands on wheel handles; keep wheels still (against a wall, press straight down). Straight line head to heels; knees down if needed.' },
          { name: 'Squats', reps: '15–20', est: 50, figure: 'squat',
            instruction: 'Sit back and down, chest up, drive up through the heels.' },
          { name: 'Backpack rows', reps: '10–12', est: 40, figure: 'row',
            instruction: 'Hinge forward with a flat back and pull the bag to your ribs.' },
          { name: 'Pike push-ups', reps: '6–10', est: 35, figure: 'pike',
            instruction: 'Hips high, bend the elbows and lower your head toward the floor.' },
          { name: 'Glute bridges', reps: '15', est: 40, figure: 'bridge',
            instruction: 'Drive through the heels, squeeze the glutes at the top.' },
          { name: 'Plank', seconds: 30, figure: 'plank', log: 'time',
            instruction: 'Forearms down, body in one straight line, brace the core.' },
        ],
      },
      {
        type: 'circuit', section: 'Core finisher: ab wheel', roundWord: 'Set', rounds: 3,
        restBetweenExercises: 0, restBetweenRounds: 50,
        exercises: [
          { name: 'Ab wheel rollouts', reps: '6–8', est: 40, figure: 'rollout',
            say: 'Roll out only as far as your lower back stays flat. Stop if your lower back hurts.',
            instruction: 'Start on your knees (towel under them), brace. Roll out only as far as your lower back stays flat, then pull back with your abs. Stop if any lower-back pain.' },
        ],
      },
      {
        type: 'interval', section: 'Core finisher: chair', rounds: 2, work: 30, transition: 10,
        setup: { seconds: 20, label: 'Grab a sturdy chair' },
        exercises: [
          { name: 'Seated knee tucks', figure: 'kneetuck',
            instruction: 'Sit on the front edge, hold the seat, draw the knees in and extend.' },
          { name: 'Seated leg raises', figure: 'legraise',
            instruction: 'Lean back slightly, legs straight, lift and lower with control.' },
          { name: 'Side crunch (left)', figure: 'sidecrunch', side: 'left',
            instruction: 'Hands by your head, crunch down to the left side.' },
          { name: 'Side crunch (right)', figure: 'sidecrunch', side: 'right',
            instruction: 'Hands by your head, crunch down to the right side.' },
        ],
      },
    ],
  },

  breaks: {
    title: 'Desk reset',
    short: 'Desk reset',
    subtitle: 'Quick 3-minute break',
    readySeconds: 3,
    blocks: [
      { type: 'timed', name: 'Neck rolls', seconds: 30, figure: 'neckroll',
        instruction: 'Slow half-circles, ear toward shoulder. Never force it.' },
      { type: 'timed', name: 'Shoulder rolls', seconds: 30, figure: 'shoulderroll',
        instruction: 'Up, back and down in big slow circles.', cues: [{ at: 15, say: 'Reverse direction' }] },
      { type: 'timed', name: 'Standing chest opener', seconds: 30, figure: 'chestopener',
        instruction: 'Hands behind you, open the chest, look slightly up.' },
      { type: 'timed', name: 'Standing hamstring reach', seconds: 30, figure: 'hamstring',
        instruction: 'Soft knees, hinge at the hips and reach toward the toes.' },
      { type: 'timed', name: 'Calf raises', seconds: 30, figure: 'calfraise',
        instruction: 'Rise onto the toes, pause, lower slowly.' },
      { type: 'timed', name: 'Eyes far away', seconds: 20, anim: 'eyes',
        instruction: 'Look at something at least 6 m (20 ft) away. Blink slowly.' },
    ],
  },

  recall: {
    title: 'Recall & consolidate',
    short: 'Recall',
    subtitle: '2-minute zone-out · eyes off the screen',
    tip: 'Writing on paper is fine too. Notes stay on this device.',
    quiet: true,
    notes: true,
    doneTitle: 'Done. Back to work.',
    doneSay: 'Done. Back to work.',
    foot: 'Low-stimulation pause: soft chime at each prompt, voice off unless you turn it on.',
    blocks: [
      { type: 'reflect', name: 'Settle', seconds: 15, settle: true, label: 'Breathe slowly',
        instruction: 'Sit back at your desk and look away from the screen. Breathe in for 4, out for 6.' },
      { type: 'reflect', name: 'First things', seconds: 20, label: 'Replay', prompts: {
        morning: [
          'Since you woke up, what happened first?',
          'Rewind to waking up. What did you see, hear and do first?',
          'Replay the start of today, in order. How did the morning begin?',
        ],
        afternoon: [
          'Since {since}, what happened first?',
          'Rewind to {since}. Where were you and what came next?',
          'Replay the time since {since}, in order. What happened first?',
        ] } },
      { type: 'reflect', name: 'Food & people', seconds: 20, label: 'Replay', prompts: {
        morning: [
          'What did you eat for breakfast, and who did you talk to?',
          'Breakfast, the commute, arriving: what did you eat and who did you see?',
          'What did you eat or drink this morning? Who was the first person you spoke to?',
        ],
        afternoon: [
          'What did you eat or drink, and who did you talk to?',
          'Lunch and conversations: what did you eat, who did you speak with, what was said?',
          'Who have you talked to since {since}? What did they say?',
        ] } },
      { type: 'reflect', name: 'Work & learning', seconds: 20, label: 'Replay', prompts: {
        morning: [
          'What did you work on after that? What did you learn or decide?',
          'Walk through your tasks in order: which client, file or issue? Any decision made?',
          'What new fact, number or idea did you come across this morning?',
        ],
        afternoon: [
          'What have you worked on since {since}? What did you learn or decide?',
          'Walk through your tasks since {since}: which client, file or issue? Any decision made?',
          'What new fact, number or idea did you come across since {since}?',
        ] } },
      { type: 'reflect', name: 'What stood out', seconds: 20, label: 'Notice', prompts: [
        'What felt important or surprising?',
        'Was there a moment you felt stuck, pleased or annoyed? Why?',
        'What is still unfinished, and what is the next step?',
      ] },
      { type: 'reflect', name: 'Keep', seconds: 25, label: 'Write it down', prompts: [
        'Pick one or two things worth keeping and write them down.',
        'Which one or two things do you want to remember next month? Write them down.',
        'Choose the most useful thing so far today and note it in a few words.',
      ] },
    ],
  },
};
