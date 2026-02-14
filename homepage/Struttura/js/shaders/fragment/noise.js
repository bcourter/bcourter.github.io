define({
	name: "Noise",
	author: "bcourter",
	uniforms: {
        Color0:               { type: "v3", value: new THREE.Vector3(0.0, 0.0, 0.0) },
		Color1:               { type: "v3", value: new THREE.Vector3(1.0, 0.0, 0.0) },
        Color2:               { type: "v3", value: new THREE.Vector3(0.0, 0.0, 1.0) },
        Color3:               { type: "v3", value: new THREE.Vector3(0.0, 1.0, 0.0) },
        scale0:           { type: "f", min:   0, max:   100, value:  33 },
        scale1:           { type: "f", min:   0, max:   100, value:  33 },
        scale2:           { type: "f", min:   0, max:   100, value:  33 },
        scale3:           { type: "f", min:   0, max:   100, value:  33 },
        p0:          { type: "f", min:   0, max:   2, value:  1.0 },
        p1:         { type: "f", min:   0, max:   2, value:  1.0 },
        p2:      { type: "f", min:   0, max:   2, value:  1.0 },
        p3:      { type: "f", min: 0, max:  2, value:  1.0 },

    }
});
