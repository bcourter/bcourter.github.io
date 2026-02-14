define({
	name: "Cortex",
	author: "morphogen",
	uniforms: {
		Color1:          { type: "v3", value: new THREE.Vector3(1.0, 0.0, 0.0) },
        Color2:          { type: "v3", value: new THREE.Vector3(0.0, 0.0, 1.0) },
        Shift:           { type: "f", min:  -1, max:   1, value:  0.0 },
        Time:            { type: "f", min:   0, max:  25, value:  0.5 },
        sVert:           { folder: "Lines",  type: "f", min:   0, max:   1, value:  0.7 },
        sHorizon:        { folder: "Lines",  type: "f", min:   0, max:   1, value:  0.0 },
        sDiag:           { folder: "Lines",  type: "f", min:   0, max:   1, value:  0.0 },
        sDiagAlt:        { folder: "Lines",  type: "f", min:   0, max:   1, value:  0.0 },
        sArms:           { folder: "Curves", type: "f", min:   0, max:   1, value:  0.0 },
        sRings:          { folder: "Curves", type: "f", min:   0, max:   1, value:  0.7 },
        sSpiral:         { folder: "Curves", type: "f", min:   0, max:   1, value:  0.7 },
        sSpiralAlt:      { folder: "Curves", type: "f", min:   0, max:   1, value:  0.7 },
        vertPeriod:      { folder: "Lines",  type: "f", min: -20, max:  10, value:  4.0 },
        horizonPeriod:   { folder: "Lines",  type: "f", min: -20, max:  20, value:  4.0 },
        diagPeriod:      { folder: "Lines",  type: "f", min: -20, max:  20, value:  4.0 },
        diagAltPeriod:   { folder: "Lines",  type: "f", min: -20, max:  20, value:  4.0 },
        armPeriod:       { folder: "Curves", type: "f", min: -20, max:  20, value:  4.0 },
        ringPeriod:      { folder: "Curves", type: "f", min: -20, max:  20, value: 20.0 },
        spiralPeriod:    { folder: "Curves", type: "f", min: -20, max:  20, value:  4.0 },
        spiralAltPeriod: { folder: "Curves", type: "f", min: -20, max:  20, value:  4.0 },
        numVert:         { folder: "Lines",  type: "f", min:   0, max:  20, value: 10.0 },
        numHorizon:      { folder: "Lines",  type: "f", min:   0, max:  20, value:  2.0 },
        numDiag:         { folder: "Lines",  type: "f", min:   0, max:  20, value:  2.0 },
        numDiagAlt:      { folder: "Lines",  type: "f", min:   0, max:  20, value:  2.0 },
        numArms:         { folder: "Curves", type: "f", min:   0, max:  24, value:  2.0 },
        numRings:        { folder: "Curves", type: "f", min:   0, max:  24, value:  4.0 },
        numSpiral:       { folder: "Curves", type: "f", min:   0, max:  24, value: 24.0, step: 1 },
        numSpiralAlt:    { folder: "Curves", type: "f", min:   0, max:  24, value:  7.0, step: 1 }
    },
    presets: 
{
  "preset": "Default",
  "remembered": {
    "Gray": {
      "0": {
        "Color1": [
          255,
          0,
          0
        ],
        "Color2": [
          20,
          16,
          16
        ],
        "Shift": -0.0895850973751059,
        "Time": 0.5,
        "sVert": 0.7,
        "sHorizon": 0,
        "sDiag": 0.26469067723591244,
        "sDiagAlt": 0,
        "vertPeriod": 4,
        "horizonPeriod": 4,
        "diagPeriod": 4,
        "diagAltPeriod": 4,
        "numVert": 10,
        "numHorizon": 2,
        "numDiag": 16.102016198518008,
        "numDiagAlt": 2,
        "sArms": 0.2316043425814234,
        "sRings": 0.7,
        "sSpiral": 0.7,
        "sSpiralAlt": 0.7,
        "armPeriod": 4,
        "ringPeriod": 20,
        "spiralPeriod": -1.0305014647596096,
        "spiralAltPeriod": 4,
        "numArms": 2,
        "numRings": 4,
        "numSpiral": 24,
        "numSpiralAlt": 7
      }
    },
    "Default": {
      "0": {
        "Color1": [
          255,
          0,
          0
        ],
        "Color2": [
          0,
          0,
          255
        ],
        "Shift": -0.0895850973751059,
        "Time": 0.5,
        "sVert": 0.7,
        "sHorizon": 0,
        "sDiag": 0,
        "sDiagAlt": 0,
        "vertPeriod": 4,
        "horizonPeriod": 4,
        "diagPeriod": 4,
        "diagAltPeriod": 4,
        "numVert": 10,
        "numHorizon": 2,
        "numDiag": 2,
        "numDiagAlt": 2,
        "sArms": 0,
        "sRings": 0.7,
        "sSpiral": 0.7,
        "sSpiralAlt": 0.7,
        "armPeriod": 4,
        "ringPeriod": 20,
        "spiralPeriod": 4,
        "spiralAltPeriod": 4,
        "numArms": 2,
        "numRings": 4,
        "numSpiral": 24,
        "numSpiralAlt": 7
      }
    }
  },
  "closed": false,
  "folders": {
    "Lines": {
      "preset": "Default",
      "closed": true,
      "folders": {}
    },
    "Curves": {
      "preset": "Default",
      "closed": true,
      "folders": {}
    }
  }
}
});

