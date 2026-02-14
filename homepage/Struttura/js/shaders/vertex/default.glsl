varying vec3 vVertexPosition;
attribute vec3 position3d;
uniform float flatPattern;

void main()
{
    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    gl_Position = projectionMatrix * mvPosition;
	vVertexPosition = position3d;
}