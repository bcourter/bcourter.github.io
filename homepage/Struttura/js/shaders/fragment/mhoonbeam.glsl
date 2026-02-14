varying vec3 vVertexPosition;
uniform vec3 Background;
uniform float scaleX;
uniform float scaleY;
uniform float shiftX;
uniform float shiftY;
uniform float LineWidth;

uniform sampler2D DataTexture;
uniform int NumPoints;

float expScaleX = exp(scaleX);
float expScaleY = exp(scaleY);

float DOUBLE_EPS = 0.00000001;

float sqr(float x) { return x * x; }
float dist2(vec2 v, vec2 w) { return sqr(v.x - w.x) + sqr(v.y - w.y); }
float distToSegmentSquared(vec2 v, vec2 w, vec2 p) {
  float l2 = dist2(v, w);
  if (l2 < DOUBLE_EPS) { return dist2(p, v); }
  float t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  if (t < 0.0) return dist2(p, v);
  if (t > 1.0) return dist2(p, w);
  return dist2(p, vec2(v.x + t * (w.x - v.x),
                       v.y + t * (w.y - v.y)));
}

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float illuminationFromLine(vec2 p1, vec2 p2, vec2 p, float thickness) {
	return sqrt(thickness/distToSegmentSquared(p1, p2, p));
}

void main(void)
{
    vec2 p = vVertexPosition.xy * vec2(expScaleX, expScaleY) + vec2(shiftX, shiftY);
	p -= vec2(0.0, 0.40);
	
	vec3 dist = vec3(0.0, 0.0, 0.0);
	for (int i = 0; i < 256; i += 2) {
		if (i >= NumPoints) {
			break;
		}
		vec4 pt1 = texture2D(DataTexture, vec2(float(i)/256.0, 0));
		vec4 pt2 = texture2D(DataTexture, vec2(float(i+1)/256.0, 0));
		dist += illuminationFromLine(
			pt1.xy,
			pt2.xy,
			p,
			LineWidth * 0.0001) * hsv2rgb(vec3(pt1.z, pt1.w, 0.5));
	}
	gl_FragColor = vec4(dist * 0.5 + Background, 1.0);	
}

