varying vec3 vVertexPosition;
uniform float zoom;
uniform float scaleX;
uniform float scaleY;
uniform float shiftX;
uniform float shiftY;
uniform float C;
uniform float HueLimit;
uniform float HueShift;
uniform float Saturation;

float PI = 3.141592;

float eggholder(float x, float y, float c) {
	return -(y + c) * sin(sqrt(abs(y + 0.5 * x + c))) - x * sin(sqrt(abs(x - (y + c))));	
}

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main( void ) {
    float x = zoom * (vVertexPosition.x * scaleX + shiftX);
    float y = zoom * (vVertexPosition.y * scaleY + shiftY);

    float hue = mod(mod(eggholder(x, y, C), 1.0) * HueLimit + HueShift, 1.0);

    gl_FragColor.rgb = hsv2rgb(vec3(hue, Saturation, 1.0));
}
