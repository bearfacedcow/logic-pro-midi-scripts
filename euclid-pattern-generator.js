/*
Euclid Pattern Generator
Jordan L. Chilcott

A MIDI JavaScript for Logic Pro X based on a Euclidean algorithm to evenly distribute rhythmic
pattern, given a total pattern length and the number of notes within that pattern.

This is a work in progress and will be updated as time goes by. Have fun.
*/

var rhythm = [];
var activeNotes = [];

var lastSteps = -1;
var lastNotes = -1;
var lastShift = -1;

var wasPlaying = false;
var nextStep = 0;
var schedule = true;

var nextBeat = -1;

var NeedsTimingInfo = true; /* needed for GetTimingInfo to work */

const PATTERN_START = 6;
const PARAMETER_STEPS = 2;
const PARAMETER_NOTES = 3;
const PARAMETER_SHIFT = 4;
const NOTES = MIDI._noteNames; //array of MIDI note names for menu items

const notesParameter = {
  name: "Notes",
  defaultValue: 2,
  minValue: 1,
  maxValue: 32,
  numberOfSteps: 31,
  type: "linear"
};

const stepsParameter = {
  name: "Steps",
  defaultValue: 16,
  minValue: 1,
  maxValue: 32,
  numberOfSteps: 31,
  type: "linear"
};

const shiftParameter = {
  name: "Shift",
  defaultValue: 0,
  minValue: 0,
  maxValue: 8,
  numberOfSteps: 8,
  type: "linear"
};

const humanizeParameter = {
  name: `Humanize`,
  defaultValue: 0,
  minValue: 0,
  maxValue: 25,
  numberOfSteps: 250,
  type: "linear",
  unit: "%"
};

const patternParam = { name: "---Pattern: --", type: "text" };

function ProcessMIDI() {
  // Get timing information from the host application
  var musicInfo = GetTimingInfo();
  const selectNote = GetParameter("Select Note");

  // clear activeNotes[] when the transport stops and send any remaining note off events
  if (wasPlaying && !musicInfo.playing) {
    activeNotes.forEach(note => {
      var off = new NoteOff(note);
      off.send();
    });

    nextBeat = -1;
    schedule = true;
    nextStep = 0;
  }

  wasPlaying = musicInfo.playing;

  if ((activeNotes.length != 0 || selectNote) && wasPlaying) {
    // get parameters
    var division = getTime(GetParameter("Time"));
    var noteLength = getTime(GetParameter("Note Length"));
    var theNote = GetParameter("Note");
    var humanize = GetParameter("Humanize");

    // calculate beat to schedule
    var lookAheadEnd = musicInfo.blockEndBeat;

    if (nextBeat < musicInfo.blockStartBeat) {
      nextBeat = musicInfo.blockStartBeat;
    }

    // when cycling, find the beats that wrap around the last buffer
    if (musicInfo.cycling && lookAheadEnd >= musicInfo.rightCycleBeat) {
      if (lookAheadEnd >= musicInfo.rightCycleBeat) {
        var cycleBeats = musicInfo.rightCycleBeat - musicInfo.leftCycleBeat;
        var cycleEnd = lookAheadEnd - cycleBeats;
      }
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

      // play this step?
      if (rhythm[nextStep] && schedule) {
        if (selectNote) {
          const humanizeVel =
            (Math.round(Math.random() * (humanize * 2)) - humanize) / 100;
          const humanizeBeat =
            ((Math.random() * (humanize * 2) - humanize) / 100) * division;

          var noteOn = new NoteOn(theNote);
          noteOn.pitch = theNote;
          noteOn.velocity += noteOn.velocity * humanizeVel;
          if (noteOn.velocity > 127) noteOn.velocity = 127;

          noteOn.sendAtBeat(nextBeat + humanizeBeat);
          var noteOff = new NoteOff(noteOn);
          noteOff.sendAtBeat(nextBeat + noteLength);
          schedule = false;
        } else {
          activeNotes.forEach(note => {
            const humanizeVel =
              (Math.round(Math.random() * (humanize * 2)) - humanize) / 100;
            const humanizeBeat =
              ((Math.random() * (humanize * 2) - humanize) / 100) * division;

            var noteOn = new NoteOn(note);
            noteOn.velocity += noteOn.velocity * humanizeVel;
            if (noteOn.velocity > 127) noteOn.velocity = 127;

            noteOn.sendAtBeat(nextBeat + humanizeBeat);
            var noteOff = new NoteOff(noteOn);
            noteOff.sendAtBeat(nextBeat + noteLength);
            schedule = false;
          });
        }
      }

      // advance to next beat
      nextStep += 1;
      if (nextStep >= rhythm.length) {
        nextStep = 0;
      }
      nextBeat += division;
      schedule = true;
    }
  } else {
    nextStep = 0;
  }
}

function HandleMIDI(event) {
  var info = GetTimingInfo();
  if (event instanceof NoteOn) {
    // add note to array
    activeNotes.push(event);
  } else if (event instanceof NoteOff) {
    activeNotes = activeNotes.filter(note => note.pitch != event.pitch);
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
  if (
    param == PARAMETER_STEPS ||
    param == PARAMETER_NOTES ||
    param == PARAMETER_SHIFT
  ) {
    const pattern = [];
    const remainder = [];
    const steps = GetParameter("Steps");
    const notes = GetParameter("Notes");
    const shiftNotes = GetParameter("Shift");

    if (notes > steps) {
      notes = steps;
    }

    SetParameter("Notes", notes);

    const remainderFill = steps - notes;

    if (
      (steps == lastSteps && notes == lastNotes && shiftNotes == lastShift) ||
      notes > steps
    )
      return;

    lastSteps = steps;
    lastNotes = notes;
    lastShift = shiftNotes;

    for (var i = 0; i < remainderFill; i++) {
      remainder[i] = "0";
    }

    for (var i = 0; i < notes; i++) {
      pattern[i] = "1";
    }

    rhythm = this.euclid(pattern, remainder);

    if (shiftNotes) {
      const patternToShift = shiftNotes < steps ? shiftNotes : steps - 1;
      const shiftPattern = rhythm.slice(0, patternToShift);

      rhythm = rhythm.slice(patternToShift).concat(shiftPattern);
    }
    Trace(rhythm);

    patternParam.name = `--- Pattern: ${rhythm.join("")} ---`;
    UpdatePluginParameters();
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
  stepsParameter,
  notesParameter,
  shiftParameter,
  humanizeParameter,
  patternParam,
  {
    name: "Select Note",
    defaultValue: 0,
    type: "checkbox"
  },
  {
    name: "Note",
    type: "menu",
    valueStrings: NOTES,
    defaultValue: 36,
    numberOfSteps: 11
  }
];
