define({
	name: "Grainmarch",
	author: "Dewb, based on shadertoy work from Syntopia and Kali",
	uniforms: {
        Time:                 { type: "f", min:   0, max:  10, value:  0.0 },
        Color1:               { type: "v3", value: new THREE.Vector3(1.0, 0.0, 0.0) },
        Color2:               { type: "v3", value: new THREE.Vector3(0.0, 0.0, 1.0) },
        SymmetryMode:         { type: "f", min:   0, max:   1, value:  0.0 },
        FieldOfView:          { type: "f", min: 0.1, max:  10, value:  1.0 },
        Iterations:           { type: "f", min:   2, max:  20, value:  5.0 },
        Scale:                { type: "f", min:   1, max:  10, value:  3.0 },
        ZoomSpeed:            { type: "f", min:  -2, max:   2, value:  0.5 },
        NonLinearPerspective: { type: "f", min: -10, max:  10, value:  2.0 },
        NLPOnly:              { type: "f", min:   0, max:   1, value:  0.5 },
        OffsetX:              { type: "f", min:   0, max:   1, value:  0.5 },
        OffsetY:              { type: "f", min:   0, max:   1, value:  0.5 },
        OffsetZ:              { type: "f", min:   0, max:   1, value:  0.5 },
        Ambient:              { type: "f", min:   0, max:   1, value:  0.2 },
        Diffuse:              { type: "f", min:   0, max:   1, value:  0.8 },
        Jitter:               { type: "f", min:   0, max:   2, value:  0.05 },
        IterationRotation:    { type: "f", min: -10, max:  10, value:  4.0 },
        IterationRotationLFO: { type: "f", min:  -1, max:   1, value:  0.125 },
        IterationRotationLFOIntensity: { type: "f", min:   0, max: 10, value:  2.0 },
        NLPRotationLFO:       { type: "f", min:  -1, max:   1, value:  0.25 }
    }
});
