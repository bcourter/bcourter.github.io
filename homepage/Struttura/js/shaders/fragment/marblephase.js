define({
	name: "Marblephase",
	author: "Dewb",
	uniforms: {
        Zoom:            { type: "f", min: 0, max: 1, value: 0.5 },
        Direction:       { type: "f", min: 0, max: 2 * Math.PI, value: 0 },
        Imprecision:     { type: "f", min: 0, max: 1, value: 0 }, 
        Rotation:        { type: "f", min: 0, max: 2 * Math.PI, value: 0 }, 
        ShiftX:      { type: "f", min:   0, max: 1, value:  0.5 },
        ShiftY:      { type: "f", min:   0, max: 1, value:  0.5 },
        Degree:          { folder: "Equation", type: "f", min: 2, max: 16, value: 16 },
        Morph1:          { folder: "Equation", type: "f", min: 0, max: 1, value: 0 }, 
        Morph2:          { folder: "Equation", type: "f", min: 0, max: 1, value: 0 }, 
        Stripes:         { folder: "Stripes", type: "f", min: 0, max: 0.5, value:  0.0 },
        StripePeriod:    { folder: "Stripes", type: "f", min: -1.5, max: 1.5, value:  0.0 },
        ColorMode:       { folder: "Color",  type: "f", min:   0, max:   1, value:  0.0 },
        HueLimit:        { folder: "Color",  type: "f", min:   0, max:   1, value:  1.0 },
        HueShift:        { folder: "Color",  type: "f", min:   0, max:   1, value:  0.0 },
        Saturation:      { folder: "Color",  type: "f", min:   0, max:   1, value:  1.0 },
        Overexpose:      { folder: "Color",  type: "f", min:   0, max:   5, value:  0.0 },
        K: { type: "fv1", hide: true, value: [    
          -7.0, 0.0, 1.0, -21.0, 35.0, 0.0, 0.0, 0.0,
          -6.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0,
          -7.0, 1.0, 35.0, -21.0, 0.0, 0.0, 0.0, 0.0,
          4.0, -4.0, 0.0, 0.0, 0.0, 0.0, 2.0, 0.0
        ]}
  }
});

