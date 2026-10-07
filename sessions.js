/*
 * Session definitions. Edit this file to change the routines.
 *
 * Block types (expanded into player steps by app.js):
 *   breathing : { name, seconds, inhale, exhale, instruction }
 *   holds     : { name, sets, reps, hold, relax, restBetweenSets, anim: 'ring'|'pulse'|'ripple',
 *                 squeezeLabel, relaxLabel, squeezeSay, relaxSay, perRepVoice, instruction }
 *               hold/relax may be 'week' to use the session's holdByWeek table (?w= URL param).
 *   stretch   : { name, perSide, figure, optional, instruction }   (left side, switch, right side)
 *   timed     : { name, seconds, figure | anim, instruction, cues: [{ at, say }] }
 *   circuit   : { rounds, restBetweenExercises, restBetweenRounds, exercises: [
 *                 { name, reps: '15–20', est, figure, instruction }      -> rep-based, tap Done
 *                 { name, seconds, figure, log: 'time', instruction } ] } -> timed
 *   interval  : { rounds, work, transition, setup: { seconds, label }, exercises: [{ name, figure, side, instruction }] }
 *
 * Common optional block fields: section (group heading), optional (group name; adds a Skip button).
 * Figures available: march, armcircles, squat, pushup, row, pike, bridge, plank, crunch, kneetuck,
 *   legraise, sidecrunch, neckroll, shoulderroll, chestopener, hamstring, calfraise, lunge, glute.
 */
window.COACH_SESSIONS = {
  pelvic: {
    title: 'Core & pelvic floor',
    short: 'Pelvic floor',
    subtitle: 'Evening routine · optional stretches at the end',
    tip: 'Breathe normally. Keep stomach, glutes and thighs relaxed.',
    usesWeek: true,
    // Week param (?w=) controls slow-hold timing.
    holdByWeek: [
      { maxWeek: 2, hold: 5, relax: 5 },
      { maxWeek: 4, hold: 8, relax: 8 },
      { maxWeek: Infinity, hold: 10, relax: 10 },
    ],
    blocks: [
      {
        type: 'breathing', name: 'Belly breathing', seconds: 60, inhale: 4, exhale: 6,
        instruction: 'Let the pelvic floor soften and drop as you breathe in.',
      },
      {
        type: 'holds', name: 'Slow holds', sets: 3, reps: 10, hold: 'week', relax: 'week',
        restBetweenSets: 30, anim: 'ring',
        squeezeLabel: 'Squeeze & hold', relaxLabel: 'Relax fully',
        squeezeSay: 'Squeeze... hold', relaxSay: 'and relax',
        instruction: 'Lift and squeeze gently, hold, then let go completely.',
      },
      {
        type: 'holds', name: 'Quick flicks', sets: 2, reps: 15, hold: 1, relax: 1,
        restBetweenSets: 20, anim: 'pulse', perRepVoice: false,
        squeezeLabel: 'Flick', relaxLabel: 'Release',
        introSay: 'Quick flicks. Squeeze and release with each beep.',
        instruction: 'Quick squeeze, then let go straight away. About one per second.',
      },
      {
        type: 'holds', name: 'Reverse kegels', sets: 1, reps: 10, hold: 5, relax: 5,
        restBetweenSets: 0, anim: 'ripple',
        squeezeLabel: 'Release & lengthen', relaxLabel: 'Rest',
        squeezeSay: 'Gently release', relaxSay: 'Rest',
        introSay: "Reverse kegels. Gently, don't push hard.",
        instruction: "Gently relax and lengthen outward. Gently, don't push hard.",
      },
      {
        type: 'stretch', name: 'Lunge hip-flexor stretch', perSide: 30, figure: 'lunge',
        optional: 'Optional hip stretches',
        instruction: 'Half-kneel in a lunge, tuck the pelvis slightly and ease the hips forward.',
      },
      {
        type: 'stretch', name: 'Deep glute stretch', perSide: 30, figure: 'glute',
        optional: 'Optional hip stretches',
        instruction: 'On your back, cross one ankle over the other knee and draw the legs in.',
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
            instruction: 'Straight line from head to heels. Drop to the knees if needed.' },
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
        type: 'interval', section: 'Chair core finisher', rounds: 2, work: 30, transition: 10,
        setup: { seconds: 20, label: 'Grab a sturdy chair' },
        exercises: [
          { name: 'Chair-supported crunch', figure: 'crunch',
            instruction: 'Lie back with calves on the seat. Curl the shoulders up, then lower.' },
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
};
