// Noise by Blake Courter 
// Adapted from https://www.shadertoy.com/view/Xdj3zV

varying vec3 vVertexPosition;

uniform float      resolutionX;           // viewport resolution (in pixels)
uniform float      resolutionY;           // viewport resolution (in pixels)
uniform float      time;           // shader playback time (in seconds)
uniform float      scaleX, scaleY, scaleZ;     

float de(vec3 p)
{
  return length(vec3(
    sin(p.x),
    //cos(p.y)+pow(sin(p.y), sin(2.0*time)*2.0+3.0),
    cos(p.y)+pow(abs(sin(p.y)), sin(2.0*time)*2.0+3.0),
    sin(p.z)  
  ));
}

float map(vec3 p)
{
  return de(p)-1.0;
}

vec3 render(vec3 ro, vec3 rd)
{
  vec3 col = vec3(0.7, 0.2, 0.1);
  float t = 0.0, d;
  vec3 pos = ro;
  for(int i = 0; i < 64; ++i)
  {
    d = map(pos);
    t += d;
    pos = ro+t*rd;
  }
  //return 0.005/d*col;
  //return 0.005/abs(d)*col;
  return 0.005/max(.001,sqrt(abs(d)))*col*exp(-.005*t*t);
}

vec4 quaternion(vec3 p, float a)
{
  return vec4(p*sin(a/2.0), cos(a/2.0));
}

vec3 qtransform(vec4 q, vec3 p)
{
  return p+2.0*cross(cross(p, q.xyz)-q.w*p, q.xyz);
}

void main(void)
{
  vec3 iResolution = vec3(resolutionX, resolutionY, 0);

  vec2 pos = gl_FragCoord.xy / vec2(scaleX, scaleY);

  vec2 p = (pos.xy * 2.0-iResolution.xy)/iResolution.y;
  vec3 rd = normalize(vec3(p, -1.5));
  vec3 ro = vec3(0.0, 0.0, 8.0);
  vec4 q = quaternion(normalize(vec3(0.0,1.0,0.1)), 0.1*time);
  rd = qtransform(q, rd);
  ro = qtransform(q, ro);
  gl_FragColor=vec4(render(ro, rd), 1.0);
}
