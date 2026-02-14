
var circleToStrip = function(vertex) {             
    var z = new Complex(vertex.x, vertex.y);
    z = Complex.atanh(z).scale(4 / Math.PI);  // butulov says 2 * pi, my old notes this.  what up?  Doesn't seem to matter yet...

    vertex.x = z.re;
    vertex.y = z.im;
    return vertex;
};

// http://bulatov.org/math/1001/
// w=(12)(-alog(1-az)-log(1-z))
var circleToHeartStrip = function(vertex) {             
    var z = new Complex(vertex.x, vertex.y);
    var a = Complex.createPolar(1, Math.PI / 8);
    // z = Complex.add(
    //         Complex.multiply(
    //             a,
    //             Complex.atanh(
    //                 Complex.multiply(a,z)
    //             )
    //         ),
    //         Complex.atanh(z)
    //     );

    //z = Complex.add(z, Complex.i);

    var cutoff = 0.99996
    z = Complex.subtract(
        Complex.multiply(a, Complex.log(Complex.add(Complex.one, Complex.multiply(a.conjugate().scale(cutoff), z)))),  
        Complex.multiply(a.conjugate(), Complex.log(Complex.subtract(Complex.one, Complex.multiply(a.scale(cutoff), z))))
        ).scale(0.5);

    vertex.x = z.re;
    vertex.y = z.im;
    return vertex;
};

// http://bulatov.org/math/1003/index_ring.html
// w=exp(za)
var stripToAnnulus = function(vertex) {             
    var z = new Complex(vertex.x, vertex.y);

    var a =  Math.PI / 2.2788701240774127 / 2
    z = Complex.exp(z.scale(a));

    vertex.x = z.re;
    vertex.y = z.im;
 //   vertex.z = vertex.z + Complex.exp(z.scale(a * 2)).re;
    return vertex;
};

var stripToAnnulusZ = function(vertex) {             
    var z = new Complex(vertex.x, vertex.y);

    var a =  Math.PI / 2.2788701240774127 / 2.5;
    z = Complex.exp(z.scale(a));

    vertex.x = z.re;
    vertex.y = z.im;
    var s = Math.cos(z.argument() * 2.5 ) * 0.2;
    vertex.z += s * z.modulus() * 2.5/2;
//    vertex.z += );
   // vertex.z += (Math.atan2(z.im, z.re));
 //   vertex.z = vertex.z + Complex.exp(z.scale(a * 2)).re;
    return vertex;
};



var rotate = function(vertex, angle) {             
    var z = new Complex(vertex.x, vertex.y);

    var rotation = Mobius.createRotation(angle);
    z = z.transform(rotation);

    vertex.x = z.re;
    vertex.y = z.im;
    return vertex;
};

var squarify = function(vertex) {             
    var z = new Complex(vertex.x, vertex.y);

    z = Complex.sqrt(Complex.divide(
            Complex.multiply(
                Complex.i,
                Complex.subtract(Complex.one, z)
            ),
            Complex.add(z, Complex.one)
        ));

    vertex.x = z.re;
    vertex.y = z.im;
    return vertex;
};



var halfplane = function(vertex) {             
    var z = new Complex(vertex.x, vertex.y);

    z = Complex.divide(
            Complex.multiply(
                Complex.i,
                Complex.subtract(Complex.one, z)
            ),
            Complex.add(z, Complex.one)
        );

    vertex.x = z.re;
    vertex.y = z.im;
    return vertex;
};

var halfstrip = function(vertex) {             
    var z = new Complex(vertex.x, vertex.y);

    z = Complex.acosh(z);

    vertex.x = z.re;
    vertex.y = z.im;
    return vertex;
};

var translate = function(vertex, point, angle) {             
    var z = new Complex(vertex.x, vertex.y);
    var a = new Complex(point.x, point.y);

    var translation = Mobius.createDiscAutomorphism(a, angle);
    z = z.transform(translation).conjugate();

    vertex.x = z.re;
    vertex.y = z.im;
    return vertex;
};

var offset = 0.25 / 25.4 / 0.13;
var offsetZOnly = 0.5;
var roll = function(vertex, n) {         
    var sign = vertex.z > 0 ? 1 : -1;
    if (vertex.z * sign < 0.01)
        sign = 0;

    var period = 1.1394350620387064 * 4;
    var radius = n * period / 2 / Math.PI;

    var thickness = offset * offsetZOnly ;  //tiara

    var phi = vertex.x / radius;
    var dist = radius + offset/3*0 + vertex.z / 2;
    vertex.z = dist * Math.cos(phi);
    vertex.x = dist * Math.sin(phi);

 //   vertex.z = vertex.x * 1/Math.tan(Math.asin(vertex.x / radius));
    return vertex;
};


var rollRing = function(vertex, n, sign, scale) {         
    var period = 1.1394350620387064 * 4;
    var radius = n * period / 2 / Math.PI;

    var thickness = offset * offsetZOnly * 2.5; // ring
 //   var thickness = offset * offsetZOnly ;  //tiara

    var bottomScale = 0.2;
    var radiusOffset = 0;
    if (sign == -1) {
        if (vertex.z < -0.02) {
            radiusOffset = thickness;
        } else {
            radiusOffset = 0;
        }
    }

    if (sign == 1) {
        if (vertex.z < -0.02) {
            radiusOffset = -thickness;
        } else {
            radiusOffset = bottomScale * thickness;
        }

        radiusOffset += thickness;
    }

    var depth = vertex.z * Math.cos(vertex.y * Math.PI / 2) * scale;
    var phi = vertex.x / radius;
    var dist = radius + sign * depth * 2 + radiusOffset;
    vertex.z = dist * Math.cos(phi);
    vertex.x = dist * Math.sin(phi);

 //   vertex.z = vertex.x * 1/Math.tan(Math.asin(vertex.x / radius));
    return vertex;
};


var scale = function(vertex) {         
    vertex.multiplyScalar(0.13);
    return vertex;
};

function linearToHyperbolic(x) {
    x++;  // to scale...
    return Math.log(x + Math.sqrt(x * x - 1)); // arcosh(x)
}
