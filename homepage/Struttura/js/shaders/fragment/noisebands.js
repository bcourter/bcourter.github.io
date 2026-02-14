define({
	name: "NoiseBands",
	author: "bcourter",
	uniforms: {
        Color0:               { type: "v3", value: new THREE.Vector3(0.0, 1.0, 1.0) },
		Color1:               { type: "v3", value: new THREE.Vector3(1.0, 0.0, 0.0) },
        Color2:               { type: "v3", value: new THREE.Vector3(0.0, 0.0, 1.0) },
        Color3:               { type: "v3", value: new THREE.Vector3(0.0, 1.0, 0.0) },
        scale:           { type: "f", min:   0, max:   100, value:  33 },
        p0:          { type: "f", min:   0, max:   1, value:  0.0 },
        p1:         { type: "f", min:   0, max:   1, value:  0.3 },
        p2:      { type: "f", min:   0, max:   1, value:  0.7 },
        p3:      { type: "f", min: 0, max:  1, value:  1.0 },

    }
});
