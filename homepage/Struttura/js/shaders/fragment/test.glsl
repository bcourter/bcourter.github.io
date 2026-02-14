varying vec3 vVertexPosition;
uniform float repeat;
uniform float scaleX;
uniform float scaleY;

void main( void ) {
    
    gl_FragColor = vec4(1.0, mod(1.0 - vVertexPosition.y, repeat)/scaleY, vVertexPosition.x * scaleX, 1.0);
}
