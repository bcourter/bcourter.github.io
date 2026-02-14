var PALE_BLUE = new THREE.Vector3(0.25, 0.25, 0.35).multiplyScalar(255).toArray();
var MEDIUM_BLUE = new THREE.Vector3(0.10, 0.10, 0.30).multiplyScalar(255).toArray();
var DARK_BLUE = new THREE.Vector3(0.05, 0.05, 0.26).multiplyScalar(255).toArray();
var DARKER_BLUE = new THREE.Vector3(0.03, 0.03, 0.20).multiplyScalar(255).toArray();

define({
	name: "NoiseGradient",
	author: "bcourter",
	uniforms: {

        c0:            { type: "v3", value: new THREE.Vector3(0.25, 0.25, 0.35) },
        c1:            { type: "v3", value: new THREE.Vector3(0.45, 0.25, 0.35) },
        c2:            { type: "v3", value: new THREE.Vector3(0.25, 0.25, 0.35) },
        c3:            { type: "v3", value: new THREE.Vector3(1, 1, 1) },
        c4:            { type: "v3", value: new THREE.Vector3(0.75, 0.25, 0.35) },
        c5:            { type: "v3", value: new THREE.Vector3(1, 1, 1) },
        c6:            { type: "v3", value: new THREE.Vector3(0.65, 0.25, 0.35) },
        c7:            { type: "v3", value: new THREE.Vector3(0.35, 0.25, 0.35) },
        c8:            { type: "v3", value: new THREE.Vector3(0.80, 0.80, 0.35) },
        c9:            { type: "v3", value: new THREE.Vector3(0.45, 0.25, 0.35) },
        c10:           { type: "v3", value: new THREE.Vector3(1, 1, 1) },
        c11:           { type: "v3", value: new THREE.Vector3(0.75, 0.25, 0.35) },
        c12:           { type: "v3", value: new THREE.Vector3(0.85, 0.25, 0.35) },


        scale:              { type: "f", min:   1, max:   200, value:  50 },
        scaleZ:              { type: "f", min:   -2, max:  2, value:  0 },
        texture:            { type: "f", min:   0, max:  10, value:  2.17 },
        ramp:               { type: "f", min:   0, max:   5, value:  2 },
        brightness:         { type: "f", min:   0, max:   5, value:  1 },

    },
    presets: {

  "preset": "Earth",
  "remembered": {
    "Earth": {
      "0": {
        "c0": [250, 250, 255],
        "c1": [220, 215, 111],
        "c2": [199, 184, 143],
        "c3": [167, 140, 53],
        "c4": [130, 154, 60],
        "c5": [102, 134, 49],
        "c6": [63, 108, 52],
        "c7": [46, 86, 42],
        "c8": [200, 200, 222],
        "c9": [132, 159, 230],
        "c10": [75, 86, 213],
        "c11": [69, 65, 211],
        "c12": [45, 45, 165],
        "scale": 25,
        "scaleZ": 0,
        "texture": 1.4,
        "ramp": 1.2,
        "brightness": 1
      }
    },
    "Sky": {
      "0": {
        "c0": [0, 67, 182],
        "c1": [4, 77, 190],
        "c2": [3, 100, 209],
        "c3": [41, 144, 224],
        "c4": [174, 207, 245],
        "c5": [234, 241, 248],
        "c6": [155, 184, 216],
        "c7": [84, 143, 196],
        "c8": [140, 168, 205],
        "c9": [234, 241, 248],
        "c10": [155, 184, 216],
        "c11": [84, 143, 196],
        "c12": [140, 168, 205],
        "scale": 50,
        "scaleZ": -1/3,
        "texture": 2.4,
        "ramp": 0.4,
        "brightness": 1
      }
    },
    "Marble": {
      "0": {
        "c0": PALE_BLUE,
        "c1": PALE_BLUE,
        "c2": MEDIUM_BLUE,
        "c3": MEDIUM_BLUE,
        "c4": MEDIUM_BLUE,
        "c5": PALE_BLUE,
        "c6": PALE_BLUE,
        "c7": DARK_BLUE,
        "c8": DARK_BLUE,
        "c9": DARKER_BLUE,
        "c10": DARKER_BLUE,
        "c11": PALE_BLUE,
        "c12": DARKER_BLUE,
        "scale": 50,
        "scaleZ": 0,
        "texture": 2.17,
        "ramp": 2.3,
        "brightness": 2.85
      }
    },

  }
}
});


