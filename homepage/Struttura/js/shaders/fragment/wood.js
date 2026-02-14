define({
	name: "Wood",
	author: "bcourter",
	uniforms: {
        LightWood:          { type: "v3", value: new THREE.Vector3(0.6, 0.3, 0.1) },
  //      LightWood:          { type: "v3", value: new THREE.Vector3(0.235, 0.051, 0.016) },
		DarkWood:           { type: "v3", value: new THREE.Vector3(0.4, 0.2, 0.07) },
        scale:              { type: "f", min:   0, max:   200, value:  33 },
        noiseX:             { type: "f", min:   0, max:   3, value:  0.5 },
        noiseY:             { type: "f", min:   0, max:   3, value:  0.1 },
        noiseZ:             { type: "f", min:   0, max:   3, value:  0.1 },
        RingFreq:           { type: "f", min:   0, max:   10, value:  2 },
        LightGrains:        { type: "f", min:   0, max:   2, value:  1 },
        DarkGrains:         { type: "f", min:   0, max:   2, value:  0 },
        GrainThreshold:     { type: "f", min: 0, max:  2, value:  0.8 },
        Noisiness:          { type: "f", min: 0, max:  20, value:  3 },
        GrainScale:         { type: "f", min: 0, max:  50, value:  17 },

    //vec3 LightWood = vec3(0.46, 0.35, 0.19);
    //vec3 DarkWood = vec3(0.29, 0.27, 0.06);
    //float RingFreq = 0.30;

    }
});
