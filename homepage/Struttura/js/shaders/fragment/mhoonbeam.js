
function createFloatDataTexture(size) {
	var data = new Float32Array(size * size * 4);
	var texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
	texture.minFilter = THREE.NearestFilter;
	texture.magFilter = THREE.NearestFilter;
	texture.needsUpdate = true;
	texture.flipY = false;
	return texture;
}

function storePolyPoint(data, index, pt, hue, sat) {
	data[index * 4 + 0] = pt[0];
	data[index * 4 + 1] = pt[1];
	data[index * 4 + 2] = hue;
	data[index * 4 + 3] = sat;
}

function lerpVec(a, b, s) {
	return new THREE.Vector3(
		a.x + (b.x - a.x) * s,
		a.y + (b.y - a.y) * s,
		a.z + (b.z - b.z) * s
	);
}

function rgb2hsl(r, g, b){
    r /= 255, g /= 255, b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;

    if(max == min){
        h = s = 0; // achromatic
    }else{
        var d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch(max){
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return [h, s, l];
}

function addPolyPoints(data, lastIndex, sides, radius, rotation, centerx, centery, color) {
	var firstPt = [centerx + radius * Math.cos(rotation), centery + radius * Math.sin(rotation)];
	var prevPt = firstPt.slice(0);
	var currPt = null;

	var hsl = rgb2hsl(color.x, color.y, color.z);
	var hue = hsl[0];
	var sat = hsl[1];

	for (var i = 1; i < sides; i++) {
  		currPt = [
  			centerx + radius * Math.cos(2.0 * Math.PI * i / sides + rotation), 
  			centery + radius * Math.sin(2.0 * Math.PI * i / sides + rotation)
  		];
  		var ptIndex = lastIndex + 2 * (i - 1);
  		storePolyPoint(data, ptIndex, prevPt, hue, sat);
  		storePolyPoint(data, ptIndex + 1, currPt, hue, sat);
  		prevPt = currPt;
	}

	var closeIndex = lastIndex + 2 * (sides - 1);
	storePolyPoint(data, closeIndex, currPt, hue, sat); 
	storePolyPoint(data, closeIndex + 1, firstPt, hue, sat);
	lastIndex += 2 * sides;
	return lastIndex;
}

define({
	name: "Mhoonbeam",
	author: "Dewb",
	uniforms: {
		Background: { type: "v3", value: new THREE.Vector3(0.4, 0.1, 0.7) },
		InnerColor: { type: "v3", value: new THREE.Vector3(1.0, 0.2, 0.3) },
		OuterColor: { type: "v3", value: new THREE.Vector3(0.0, 0.4, 0.9) },
		LineWidth: { type: 'f', min: 0.01, max: 2.5, value: 0.5 },
		NumPolys: { type: 'i', min: 1, value: 6 },
		PolySides: { type: 'i', min: 3, value: 5 },
		Spacing: { type: 'f', min: 0, max: 0.125, value: 0.035 },
		Rotation: { type: 'f', min: 0, max: Math.PI, value: 1 },
		SpacingAmp: { type: 'f', min: -1, max: 1, value: 0.5 },
		SpacingFreq: { type: 'f', min: 0, max: 60, value: 0 },
		RotationAmp: { type: 'f', min: -1, max: 1, value: 0.5 },
		RotationFreq: { type: 'f', min: 0, max: 60, value: 0 },
		scaleX: { folder: "Position", type: 'f', min:  -4, max: 4,  value: 0  },
		scaleY: { folder: "Position", type: 'f', min:  -4, max: 4,  value: 0  },
		shiftX: { folder: "Position", type: 'f', min:  -2, max: 2,  value: 0  },
		shiftY: { folder: "Position", type: 'f', min:  -2, max: 2,  value: 0  },
		DataTexture: { type: 't', value: createFloatDataTexture(256) },
		NumPoints: { type: 'i', hide: true, value: 0 }
    },
    init: function(shaderMaterial) {
    },
    update: function(shaderMaterial) {
    	var u = shaderMaterial.uniforms;

    	// integer max workaround
    	if (u.NumPolys.value > 24) { u.NumPolys.value = 24; }
    	if (u.PolySides.value > 12) { u.PolySides.value = 12; }

    	var tex = u.DataTexture.value;
		
		var lastIndex = 0;
    	var radius = 0.1;
    	var rotation = 0;
    	for (var poly = 0; poly < u.NumPolys.value; poly++) {
    		var t = poly / u.NumPolys.value;
    		var color = lerpVec(u.InnerColor.value, u.OuterColor.value, t);
	    	lastIndex = addPolyPoints(tex.image.data, lastIndex, u.PolySides.value, radius, rotation, 0, 0, color);
	    	radius += u.Spacing.value + 0.25 * u.SpacingAmp.value * Math.sin(t * u.SpacingFreq.value);
	    	rotation += u.Rotation.value + Math.PI/4 * u.RotationAmp.value * Math.sin(t * u.RotationFreq.value);
	    }

    	tex.needsUpdate = true;
    	shaderMaterial.uniforms.NumPoints.value = lastIndex;
    }
});