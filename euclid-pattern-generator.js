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

var wasPlaying = false;
var nextStep = 0;
var schedule = true;

var nextBeat = -1;

var NeedsTimingInfo = true; /* needed for GetTimingInfo to work */

var PATTERN_BASE = 4;
var PARAMETER_STEPS = 2;
var PARAMETER_NOTES = 3;

function ProcessMIDI() {
  // Get timing information from the host application
  var musicInfo = GetTimingInfo();

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

  if (activeNotes.length != 0 && wasPlaying) {
    // get parameters
    var division = getTime(GetParameter("Time"));
    var noteLength = getTime(GetParameter("Note Length"));

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

    // Trace( `Next beat: ${nextBeat} > Start beat: ${musicInfo.blockStartBeat} < lookAheadEnd: ${lookAheadEnd}` );

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

      // Trace( `Next beat: ${nextBeat}` );
      // play this step?
      if (rhythm[nextStep] && schedule) {
        activeNotes.forEach(note => {
          var noteOn = new NoteOn(note);
          noteOn.sendAtBeat(nextBeat);
          var noteOff = new NoteOff(noteOn);
          noteOff.sendAtBeat(nextBeat + noteLength);
          schedule = false;
          Trace(noteOn);
        });
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
  if (param == PARAMETER_STEPS || param == PARAMETER_NOTES) {
    const pattern = [];
    const remainder = [];
    const steps = GetParameter("Steps");
    const notes = GetParameter("Notes");
    const remainderFill = steps - notes;

    if ((steps == lastSteps && notes == lastNotes) || notes > steps) return;

    lastSteps = steps;
    lastNotes = notes;

    for (var i = 0; i < remainderFill; i++) {
      remainder[i] = "0";
    }

    for (var i = 0; i < notes; i++) {
      pattern[i] = "1";
    }

    rhythm = this.euclid(pattern, remainder);

    Trace(rhythm);
    var patternCounter = 0;

    const patternParameters = rhythm.map(val => ({
      name: `Step ${patternCounter++}`,
      defaultValue: val,
      type: "checkbox"
    }));

    PluginParameters = PluginParameters.slice(0, PATTERN_BASE);
    patternParameters.forEach(par => PluginParameters.push(par));
    UpdatePluginParameters();

    rhythm.forEach((val, index) => {
      SetParameter(`Step ${index}`, val);
    });
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
    name: "Steps",
    defaultValue: 16,
    minValue: 1,
    maxValue: 32,
    numberOfSteps: 31,
    type: "linear"
  },
  {
    name: "Notes",
    defaultValue: 2,
    minValue: 1,
    maxValue: 32,
    numberOfSteps: 31,
    type: "linear"
  },
  { name: "--------- Pattern --------", type: "text" }
];
