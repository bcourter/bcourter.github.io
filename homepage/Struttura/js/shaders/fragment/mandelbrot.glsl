varying vec3 vVertexPosition;
uniform float zoom;
uniform float shiftX;
uniform float shiftY;
uniform float shiftZ;
uniform float cW;
uniform float cX;
uniform float cY;
uniform float cZ;

float eggholder(float x, float y, float c) {
	return -(y + c) * sin(sqrt(abs(y + 0.5 * x + c))) - x * sin(sqrt(abs(x - (y + c))));	
}

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec3 qtransform( vec4 q, vec3 v ){ 
	return v + 2.0*cross(cross(v, q.xyz ) + q.w*v, q.xyz);
}

vec4 qmultiply (vec4 a, vec4 b) {
	return vec4(
		a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
		a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
		a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
		a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w
	);
}

void main( void ) {
	float zf = exp(zoom);
	vec4 shift = vec4(shiftX, shiftY, shiftZ, 0.0);
	vec4 c = vec4(cX, cY, cZ, cW);

    vec4 p = vec4(vVertexPosition, 0.0);
    p = p / zf - shift;

    vec4 pp = p;
    int iter;
    const int count = 50;
    for (int i = 0; i < count; i++) {
    	pp = qmultiply(pp, pp) + p;
    	if (length(pp) > 5.0) {
    		iter = i;
	    	break;
    	}
    }

	float v = log(float(iter) / float(count) + 1.0);

 //   float v = distance(p.xyz, pp.xyz);
   // float hue = clamp(v, 0, 1);

    gl_FragColor.rgb = hsv2rgb(vec3(v, 0.7, 0.9));
}
