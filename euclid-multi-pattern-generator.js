/*
Euclid Multi Pattern Generator
Jordan L. Chilcott

A MIDI JavaScript for Logic Pro X based on a Euclidean algorithm to evenly distribute rhythmic
pattern, given a total pattern length and the number of notes within that pattern.

This script is useful for drum and percussion libraries.

This is a work in progress and will be updated as time goes by. Have fun.
*/

var rhythm = [];
var parameterSet = [];

var wasPlaying = false;
var nextStep = 0;
var schedule = true;

var nextBeat = -1;

var NeedsTimingInfo = true; /* needed for GetTimingInfo to work */

const PATTERN_START = 3;
const PARAMETER_STEPS = 2;
const PARAMETER_NOTES = 3;
const NOTES = MIDI._noteNames; //array of MIDI note names for menu items
const MAX_NOTES = 8;
const OBJ_NUM_PARAMS = 7;

function ProcessMIDI() {
  // Get timing information from the host application
  var musicInfo = GetTimingInfo();
  const activeNotes = parameterSet.filter(
    param => GetParameter(param.play.name) == 1
  );

  // clear activeNotes[] when the transport stops and send any remaining note off events
  if (wasPlaying && !musicInfo.playing) {
    activeNotes.forEach(activeNote => {
      var theNote = GetParameter(activeNote.noteSelection.name);
      var off = new NoteOff();
      off.pitch = theNote;
      off.send();

      activeNote.schedule = true;
      activeNote.nextStep = 0;
    });

    nextBeat = -1;
  }

  wasPlaying = musicInfo.playing;

  if (activeNotes.length && wasPlaying) {
    // get parameters
    const division = getTime(GetParameter("Time"));
    const noteLength = getTime(GetParameter("Note Length"));
    const humanize = GetParameter("Humanize");

    // calculate beat to schedule
    var lookAheadEnd = musicInfo.blockEndBeat;

    // when cycling, find the beats that wrap around the last buffer
    if (musicInfo.cycling && lookAheadEnd >= musicInfo.rightCycleBeat) {
      if (lookAheadEnd >= musicInfo.rightCycleBeat) {
        var cycleBeats = musicInfo.rightCycleBeat - musicInfo.leftCycleBeat;
        var cycleEnd = lookAheadEnd - cycleBeats;
      }
    }

    if (nextBeat < musicInfo.blockStartBeat) {
      nextBeat = musicInfo.blockStartBeat;
    }

    // loop through the beats that fall within this buffer
    if (
      (nextBeat >= musicInfo.blockStartBeat &&
        nextBeat <= lookAheadEnd &&
        wasPlaying) ||
      // including beats that wrap around the cycle point
      (musicInfo.cycling && nextBeat < cycleEnd)
    ) {
      // adjust for cycle
      if (musicInfo.cycling && nextBeat >= musicInfo.rightCycleBeat)
        nextBeat -= cycleBeats;

      activeNotes.forEach(activeNote => {
        // play this step?
        const humanizeVel = (Math.round(Math.random() * (humanize * 2)) - humanize) / 100;
        const humanizeBeat = ((Math.random() * (humanize * 2) - humanize) / 100) * division;

        if (activeNote.rhythm[activeNote.nextStep] && activeNote.schedule) {
          var theNote = GetParameter(activeNote.noteSelection.name);
          var velocity = GetParameter(activeNote.velocity.name);

          velocity += (velocity * humanizeVel);

          var noteOn = new NoteOn(theNote);
          noteOn.pitch = theNote;
          noteOn.velocity = velocity > 127 ? 127 : velocity ;

          noteOn.sendAtBeat(nextBeat + humanizeBeat);
          var noteOff = new NoteOff(noteOn);
          noteOff.sendAtBeat(nextBeat + noteLength);
          activeNote.schedule = false;
        }

      });

      nextBeat += division;

      // Housekeeper
      parameterSet.forEach( param => {
        // advance to next beat
        param.nextStep += 1;
        if (param.nextStep >= param.rhythm.length) {
          param.nextStep = 0;
        }

        param.schedule = true;
      });
    }
  }
}

function HandleMIDI(event) {
  var info = GetTimingInfo();
  if (event instanceof NoteOn) {
    // add note to array
    //activeNotes.push(event);
  } else if (event instanceof NoteOff) {
    //activeNotes = activeNotes.filter(note => note.pitch != event.pitch);
  } else {
    event.send();
  }
}

function euclid(pattern, remainder) {
  var newPattern = pattern;
  while (remainder.length) {
    newPattern = newPattern.map(subPattern => {
      if (remainder.length) {
        subPattern += remainder.shift();
      }

      return subPattern;
    });
  }

  const basePatternLength = newPattern[0].length;
  const newRemainder = newPattern.filter(
    subPattern => subPattern.length !== basePatternLength
  );
  newPattern = newPattern.filter(
    subPattern => subPattern.length === basePatternLength
  );

  if (newRemainder.length > 1) {
    return this.euclid(newPattern, newRemainder);
  } else {
    return (newPattern.reduce((x, y) => (x += y), "") + newRemainder)
      .split("")
      .map(val => parseInt(val));
  }
}

//get the division for the associated menu index
function getTime(index) {
  var convertedValue = 1;

  switch (index) {
    case 0:
      convertedValue = 0.166; //1/16T
      break;
    case 1:
      convertedValue = 0.25; //1/16
      break;
    case 2:
      convertedValue = 0.375; //1/16.
      break;
    case 3:
      convertedValue = 0.333; //1/8T
      break;
    case 4:
      convertedValue = 0.5; //1/8
      break;
    case 5:
      convertedValue = 0.75; //1/8.
      break;
    case 6:
      convertedValue = 0.666; //1/4T
      break;
    case 7:
      convertedValue = 1; //1/4
      break;
    case 8:
      convertedValue = 1.5; //1/4.
      break;
    case 9:
      convertedValue = 1.333; //1/2T
      break;
    case 10:
      convertedValue = 2; //1/2
      break;
    case 11:
      convertedValue = 3; //1/2.
      break;
    default:
      Trace("error in getTime()");
  }

  return convertedValue;
}

function ParameterChanged(param, value) {
  if (param >= PATTERN_START) {
    const patternObjectIndex = Math.floor(
      (param - PATTERN_START) / OBJ_NUM_PARAMS
    );
    const patternObject = parameterSet[patternObjectIndex];

    const pattern = [];
    const remainder = [];
    const steps = GetParameter(patternObject.steps.name);
    const notes = GetParameter(patternObject.notes.name);
    const shiftNotes = GetParameter(patternObject.shiftNotes.name);

    if (notes > steps) {
      notes = steps;
    }

    SetParameter(patternObject.notes.name, notes);

    const remainderFill = steps - notes;

    if (steps == patternObject.lastSteps && notes == patternObject.lastNotes && shiftNotes == patternObject.lastShift) return;

    patternObject.lastSteps = steps;
    patternObject.lastNotes = notes;
    patternObject.lastShift = shiftNotes;

    for (var i = 0; i < remainderFill; i++) {
      remainder[i] = "0";
    }

    for (var i = 0; i < notes; i++) {
      pattern[i] = "1";
    }

    patternObject.rhythm = this.euclid(pattern, remainder);

    if(shiftNotes) {
      const patternToShift = shiftNotes < steps ? shiftNotes : steps - 1;
      const shiftPattern = patternObject.rhythm.slice(0, patternToShift);

      patternObject.rhythm = patternObject.rhythm.slice(patternToShift).concat(shiftPattern);
    }

    Trace(
      `Rhythm #${patternObjectIndex + 1}: ${patternObject.rhythm.join(",")}`
    );

    // patternObject.pattern.name = `--- Pattern ${patternObjectIndex}: ${patternObject.rhythm.join("")} ---`;
    // UpdatePluginParameters();
  }
}

// define inital UI parameters
var PluginParameters = [
  {
    name: "Time",
    type: "menu",
    valueStrings: [
      "1/16 T",
      "1/16",
      "1/16 .",
      "1/8 T",
      "1/8",
      "1/8 .",
      "1/4 T",
      "1/4",
      "1/4 .",
      "1/2 T",
      "1/2",
      "1/2 ."
    ],
    defaultValue: 7,
    numberOfSteps: 11
  },
  {
    name: "Note Length",
    type: "menu",
    valueStrings: [
      "1/16 T",
      "1/16",
      "1/16 .",
      "1/8 T",
      "1/8",
      "1/8 .",
      "1/4 T",
      "1/4",
      "1/4 .",
      "1/2 T",
      "1/2",
      "1/2 ."
    ],
    defaultValue: 4,
    numberOfSteps: 11
  },
  {
    name: `Humanize`,
    defaultValue: 0,
    minValue: 0,
    maxValue: 25,
    numberOfSteps: 250,
    type: "linear",
    unit: "%",
  },
];

for (var set = 0; set < MAX_NOTES; set++) {
  const notesParameter = {
    name: `Notes ${set + 1}`,
    defaultValue: 2,
    minValue: 1,
    maxValue: 32,
    numberOfSteps: 31,
    type: "linear"
  };

  const stepsParameter = {
    name: `Steps ${set + 1}`,
    defaultValue: 16,
    minValue: 1,
    maxValue: 32,
    numberOfSteps: 31,
    type: "linear"
  };

  const shiftParameter = {
    name: `Shift ${set + 1}`,
    defaultValue: 0,
    minValue: 0,
    maxValue: 8,
    numberOfSteps: 8,
    type: "linear"
  };

  const playNote = {
    name: `Play Note ${set + 1}`,
    type: "checkbox",
    defaultValue: 0
  };

  const noteSelectionParam = {
    name: `Note ${set + 1}`,
    type: "menu",
    valueStrings: NOTES,
    defaultValue: 36 + set,
    numberOfSteps: 11
  };

  const velocityParameter = {
    name: `Velocity ${set + 1}`,
    defaultValue: 127,
    minValue: 0,
    maxValue: 127,
    numberOfSteps: 127,
    type: "linear"
  };

  const patternMarker = {
    name: `------------ Pattern ${set +1} ------------`,
    type: "text"
  }

  127;
  const param = {
    set: set,
    base: OBJ_NUM_PARAMS * set + PATTERN_START,
    rhythm: [],
    lastNotes: -1,
    lastSteps: -1,
    lastShift: -1,
    schedule: true,
    nextStep: 0,
    notes: notesParameter,
    steps: stepsParameter,
    shiftNotes: shiftParameter,
    play: playNote,
    noteSelection: noteSelectionParam,
    velocity: velocityParameter,
    marker: patternMarker,
  };

  parameterSet.push(param);
}

parameterSet.forEach(theParam => {
  PluginParameters.push(theParam.marker);
  PluginParameters.push(theParam.steps);
  PluginParameters.push(theParam.notes);
  PluginParameters.push(theParam.shiftNotes);
  PluginParameters.push(theParam.play);
  PluginParameters.push(theParam.noteSelection);
  PluginParameters.push(theParam.velocity);
});
