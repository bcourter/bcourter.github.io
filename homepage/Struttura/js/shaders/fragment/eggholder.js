define({
	name: "Eggholder",
	author: "Dewb",
	uniforms: {
		zoom:   { type: 'f', min:  0.1, max: 100, value:  4.35 },
		scaleX: { type: 'f', min:  -10, max: 10,  value: -4.4  },
		scaleY: { type: 'f', min:  -10, max: 10,  value: -1.8  },
		shiftX: { type: 'f', min:  -10, max: 10,  value:  2.0  },
		shiftY: { type: 'f', min:  -10, max: 10,  value:  5.7  },
		C:      { type: 'f', min: -100, max: 100, value: 46.0  },
	    HueLimit:        { type: "f", min:   0, max:   1, value:  1.0 },
        HueShift:        { type: "f", min:   0, max:   1, value:  0.0 },
        Saturation:      { type: "f", min:   0.5, max:   1, value:  1.0 },

    }
});