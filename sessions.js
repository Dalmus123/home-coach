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
 *   tcircuit  : { exercises: [{ name, figure, minLevel, variants: [{ upTo, name, tip, cap }] }] }  timed circuit driven by the session's
 *               level row (rounds, work, rest, roundRest): 'Round X of Y · Exercise N of M', one tip per move (workout)
 *   interval  : { rounds, work, transition, setup: { seconds, label }, exercises: [{ name, figure, side, instruction }] }
 *   reflect   : { name, seconds, label, settle, instruction, prompts }   (calm 'glow' ring, soft chime, no ticks)
 *               prompts: [variants...] or { morning: [...], afternoon: [...] } (device clock: before 12:00 = morning).
 *               One variant is used per run and rotates each time the session is finished.
 *               '{since}' becomes 'lunch' or 'your last break (14:05)' (time of the last recall finished today).
 *
 * Session flags: levelByDone + levelEvery + maxLevel (level from completed sessions in localStorage; ?level= overrides), streakKey, minLevel on any block,
 *   voiceDefaultOff (voice silent until switched on), phaseTips (roomier tip line under the timer), cue ('{min}' = rounded minutes; shown on home, spoken first), streak (finish screen + localStorage
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
    subtitle: 'Beginner full-body · no equipment',
    // Habit loop: CUE (same time, same spot, N minutes) -> CRAVING (that strong, energised feeling) ->
    // REWARD ("Done ✅ Streak +1", a workout streak and a session count, kept in localStorage).
    cue: 'Same time, same spot, {min} minutes',
    streak: true,
    streakKey: 'streakWorkout',
    phaseTips: true,
    tip: 'Craving: feeling strong and energised afterwards. Reward: Done ✅ Streak +1.',
    doneTitle: 'Done ✅',
    doneSay: 'Done. Streak plus one. Nice work.',
    readySeconds: 0,
    usesWeek: true,
    // Progression is by COMPLETED workouts (localStorage 'coach.done.workout'), not by calendar week:
    // level = 1 + floor(completed / levelEvery), capped at maxLevel. ?level=N (or ?w=N) overrides it.
    levelByDone: true,
    levelEvery: 6,   // 6 sessions per level (about 2 weeks at 3 a week)
    maxLevel: 10,
    /*
     * Level table (each row: maxWeek = the level). Keys: warm / cool = seconds per warm-up / cool-down move,
     * rounds, work = seconds of work per exercise, rest = rest between exercises, roundRest = rest between rounds.
     * Exercises have minLevel (added at that level) and variants (harder versions: name/tip/cap change at `upTo`).
     * Approx. total time (warm-up + circuit + cool-down), the level table in README:
     *   L1 10 · L2 12.5 · L3 15 · L4 17.5 · L5 20 · L6 23 · L7 26 · L8 29 · L9 32 · L10 35 min
     * Each level adds a round, longer work, an extra exercise or a harder variation (about 2-3 minutes more).
     */
    holdByWeek: [
      { maxWeek: 1,  warm: 30, cool: 30, rounds: 2, work: 30, rest: 10, roundRest: 20 },
      { maxWeek: 2,  warm: 30, cool: 30, rounds: 2, work: 45, rest: 10, roundRest: 30 },
      { maxWeek: 3,  warm: 30, cool: 40, rounds: 3, work: 30, rest: 10, roundRest: 25 },
      { maxWeek: 4,  warm: 30, cool: 40, rounds: 3, work: 30, rest: 10, roundRest: 25 },
      { maxWeek: 5,  warm: 40, cool: 40, rounds: 3, work: 35, rest: 10, roundRest: 30 },
      { maxWeek: 6,  warm: 45, cool: 45, rounds: 3, work: 40, rest: 10, roundRest: 40 },
      { maxWeek: 7,  warm: 45, cool: 40, rounds: 3, work: 35, rest: 15, roundRest: 40 },
      { maxWeek: 8,  warm: 50, cool: 40, rounds: 3, work: 40, rest: 15, roundRest: 45 },
      { maxWeek: 9,  warm: 50, cool: 45, rounds: 4, work: 30, rest: 15, roundRest: 45 },
      { maxWeek: 99, warm: 50, cool: 45, rounds: 4, work: 35, rest: 15, roundRest: 60 },
    ],
    blocks: [
      { type: 'timed', section: 'Warm-up', name: 'March in place', seconds: 30, weekKeys: { seconds: 'warm' }, label: 'Warm up', figure: 'march',
        instruction: 'Lift the knees, swing the arms, breathe easy.' },
      { type: 'timed', section: 'Warm-up', name: 'Arm circles', seconds: 30, weekKeys: { seconds: 'warm' }, label: 'Warm up', figure: 'armcircles',
        instruction: 'Small circles growing bigger. Switch direction halfway.' },
      { type: 'timed', section: 'Warm-up', name: 'Easy squats', seconds: 30, weekKeys: { seconds: 'warm' }, label: 'Warm up', figure: 'squat', minLevel: 3,
        instruction: 'Slow and shallow: just wake the legs up.' },
      { type: 'timed', section: 'Warm-up', name: 'Calf raises', seconds: 30, weekKeys: { seconds: 'warm' }, label: 'Warm up', figure: 'calfraise', minLevel: 6,
        instruction: 'Up on your toes, down slowly. Hold a wall for balance.' },
      {
        type: 'tcircuit', section: 'Circuit',
        exercises: [
          { name: 'Push-ups', figure: 'pushup', variants: [
            { upTo: 2, name: 'Incline push-ups', tip: 'Hands on a sturdy chair or sofa edge, body straight, lower your chest slowly.' },
            { upTo: 5, name: 'Knee push-ups', tip: 'Knees down, a straight line from knees to head, elbows about 45° from your body.' },
            { upTo: 8, name: 'Push-ups', tip: 'One straight line from head to heels; drop to your knees if your form slips.' },
            { upTo: 99, name: 'Slow push-ups', tip: '3 seconds down, 1 second up. Keep your belly tight.' } ] },
          { name: 'Squats', figure: 'squat', variants: [
            { upTo: 3, name: 'Squats', tip: 'Feet shoulder-width, sit back and down, chest up, knees over your toes.' },
            { upTo: 6, name: 'Slow squats', tip: '3 seconds down, 1 second up. Heels stay flat.' },
            { upTo: 99, name: 'Squats with a pause', tip: 'Pause 2 seconds at the bottom, then stand up tall.' } ] },
          { name: 'Table rows', figure: 'row', variants: [
            { upTo: 4, name: 'Table rows (knees bent)', tip: 'Lie under a sturdy table, grip the edge, pull your chest up to it. Check it is stable first.' },
            { upTo: 99, name: 'Table rows', tip: 'Legs straight, body in a line: pull your chest to the edge, squeeze your shoulder blades.' } ] },
          { name: 'Glute bridges', figure: 'bridge', variants: [
            { upTo: 4, name: 'Glute bridges', tip: 'Heels down, lift your hips. Squeeze the pelvic floor gently at the top, as in a kegel, while keeping your breath flowing.' },
            { upTo: 7, name: 'Glute bridges (2 s squeeze)', tip: 'Lift and squeeze 2 seconds. Squeeze the pelvic floor gently at the top, as in a kegel, while keeping your breath flowing.' },
            { upTo: 99, name: 'Hip thrusts (shoulders on the sofa)', tip: 'Drive your hips up. Squeeze the pelvic floor gently at the top, as in a kegel, while keeping your breath flowing.' } ] },
          { name: 'Reverse lunges', figure: 'lunge', variants: [
            { upTo: 99, name: 'Reverse lunges', tip: 'Step back, lower the back knee toward the floor, front knee over the ankle. Alternate legs.' } ] },
          { name: 'Plank', figure: 'plank', variants: [
            { upTo: 4, name: 'Plank', cap: 25, tip: 'Forearms down, a straight line from head to heels. Drop to your knees if needed.' },
            { upTo: 7, name: 'Plank', cap: 30, tip: 'Forearms down, squeeze your glutes and belly, breathe steadily.' },
            { upTo: 99, name: 'Plank', tip: 'Forearms down, squeeze your glutes and belly, breathe steadily.' } ] },
          { name: 'Ab wheel rollouts', figure: 'rollout', minLevel: 4, variants: [
            { upTo: 99, name: 'Ab wheel rollouts (kneeling)', tip: 'Roll out only as far as your lower back stays flat, then pull back. Stop if it hurts.' } ] },
          { name: 'Dead bugs', figure: 'legraise', minLevel: 7, variants: [
            { upTo: 99, name: 'Dead bugs', tip: 'Back flat on the floor: lower the opposite arm and leg slowly, keep your lower back pressed down.' } ] },
        ],
      },
      { type: 'timed', section: 'Cool-down', name: 'Hamstring stretch', seconds: 30, weekKeys: { seconds: 'cool' }, label: 'Stretch', figure: 'hamstring',
        instruction: 'Easy and long: no bouncing. Switch legs halfway.' },
      { type: 'timed', section: 'Cool-down', name: 'Chest opener', seconds: 30, weekKeys: { seconds: 'cool' }, label: 'Stretch', figure: 'chestopener',
        instruction: 'Hands behind you, open the chest, breathe slowly.' },
      { type: 'timed', section: 'Cool-down', name: 'Glute stretch', seconds: 30, weekKeys: { seconds: 'cool' }, label: 'Stretch', figure: 'glute', minLevel: 4,
        instruction: 'Ankle over the opposite knee, ease the hip open. Switch halfway.' },
      { type: 'timed', section: 'Cool-down', name: 'Neck roll', seconds: 30, weekKeys: { seconds: 'cool' }, label: 'Stretch', figure: 'neckroll', minLevel: 7,
        instruction: 'Slow half-circles, shoulders down and relaxed.' },
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
