define({
	name: "Spiral",
	author: "bcourter",
	uniforms: {
        time:           { type: "f", min:   0, max:   100, value:  33 },
        scaleX:           { type: "f", min:   0, max:   33, value:  11 },
        scaleY:           { type: "f", min:   0, max:   33, value:  11 },
        scaleZ:           { type: "f", min:   0, max:   33, value:  11 },
        shiftX:           { type: "f", min:   -1, max:   1, value:  0 },
        shiftY:           { type: "f", min:   -1, max:   1, value:  0 },
        shiftZ:           { type: "f", min:   -1, max:   1, value:  0 },
        exposure:           { type: "f", min:   0, max:   8, value:  4 },

    }
});
