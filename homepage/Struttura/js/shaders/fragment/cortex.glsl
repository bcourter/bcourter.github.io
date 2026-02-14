// Cortex by morphogen / Nathan Lachenmeyer
// Adapted from https://github.com/scottnla/grainmarch/blob/master/plugins/cortex.glsl

uniform float Time, Shift;
uniform float sVert, sHorizon, sDiag, sDiagAlt, sArms, sRings, sSpiral, sSpiralAlt;
uniform float vertPeriod, horizonPeriod, diagPeriod, diagAltPeriod, armPeriod, ringPeriod, spiralPeriod, spiralAltPeriod;
uniform float numVert, numHorizon, numDiag, numDiagAlt, numRings, numArms, numSpiral, numSpiralAlt;

uniform vec3 Color1;
uniform vec3 Color2;

const float PI = 3.1415926535;
const float spiralAngle = PI/3.0;
const float spiralAngleAlt = 2.0*PI - PI/3.0;

varying vec3 vVertexPosition;

void main( void ) {
    vec2 resolution = vec2(100.2, 80.2);
    vec2 position = (vVertexPosition.xy * resolution.xy);

    float cX = position.x - 0.0;
    float cY = position.y + 40.0 * Shift - 30.0;
    
    float newX = log(sqrt(cX*cX + cY*cY));
    float newY = atan(cX, cY);
    
    float color = 0.0;
    
    //Vertical Bands
        color += sVert * cos(numVert*cY + vertPeriod*Time);
    //Horizontal Bands
        color += sHorizon * cos(numHorizon*cX + horizonPeriod*Time);
    //Diagonal Bands
        color += sDiag * (cos(2.0*numDiag*(cX*sin(spiralAngle) + cY*cos(spiralAngle)) + diagPeriod*Time));
    //Perpendicular Diagonal bands
        color += sDiagAlt * (cos(2.0*numDiagAlt*(cX*sin(spiralAngleAlt) + cY*cos(spiralAngleAlt)) + diagAltPeriod*Time));
    //Arms
        color += sArms * cos(numArms*newY + armPeriod*Time);
    //Rings
        color += sRings * cos(numRings*newX + ringPeriod*Time);
    //Spirals
        color += sSpiral * (cos(2.0*numSpiral*(newX*sin(spiralAngle) + newY*cos(spiralAngle)) + spiralPeriod*Time));
    //Alt Spirals
        color += sSpiralAlt * (cos(2.0*numSpiralAlt*(newX*sin(spiralAngleAlt) + newY*cos(spiralAngleAlt)) + spiralAltPeriod*Time));
    //overall brightness/color
    //color *= cos(Time/10.0);
    gl_FragColor.rgb = Color1 * color + Color2 * (1.0 - color);
    //gl_FragColor = vec4( vec3( sin( color + Time / 3.0 ) * 0.75, color, sin( color + Time / 3.0 ) * 0.75 ), 1.0 );
    //gl_FragColor = vec4(cX, cY, 0.0, 0.0);
}