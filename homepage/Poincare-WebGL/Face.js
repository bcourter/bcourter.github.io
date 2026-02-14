function Region(p, q) {
    this.p = p;
    this.q = q;
    var sinP2 = Math.pow(Math.sin(Math.PI / p), 2);
    var cosQ2 = Math.pow(Math.cos(Math.PI / q), 2);
    this.r = Math.sqrt(sinP2 / (cosQ2 - sinP2));
    this.d = Math.sqrt(cosQ2 / (cosQ2 - sinP2));
    this.phi = Math.PI * (0.5 - (1.0 / p + 1.0 / q));

    this.l1 = Line.createTwoPoint(Complex.zero, Complex.one);
    this.l2 = Line.createPointAngle(Complex.zero, Math.PI / p);
    this.c = Circle.prototype.create(new Complex([this.d, 0]), this.r);
    var center = this.c.center();

    var polar = Complex.createPolar(this.r, Math.PI - this.phi);
    this.p0 = Complex.zero;
    this.p1 = Complex.add(new Complex([this.d, 0]), polar);
    this.p2 = new Complex([this.d - this.r, 0]);

    /*         08
    *       09  07
    *     10  14  06
    *   11  12  13  05
    * 00  01  02  03  04
    * */
    this.points = [15];
    var count = 4;
    for (var i = 0; i < count; i++) {
        var t = i / count;

        this.points[i] = this.p2.scale(t);
        this.points[i + count] = Complex.add(new Complex([this.d, 0]), Complex.createPolar(this.r, Math.PI - this.phi * t));
        this.points[i + 2 * count] = this.p1.scale(1 - t);
    }

    this.points[12] = Complex.add(this.p0, Complex.add(this.p1, this.p2).scale(1 / 2)).scale(1 / 2);
    this.points[13] = Complex.add(this.p2, Complex.add(this.p0, this.p1).scale(1 / 2)).scale(1 / 2);
    this.points[14] = Complex.add(this.p1, Complex.add(this.p2, this.p0).scale(1 / 2)).scale(1 / 2);
}


function Face(region, center, vertices, edgeCenters, halfEdges, spines, dualEdges, interiors, isFlipped) {
    this.region = region;
    this.center = center;
    this.vertices = vertices;
    this.edgeCenters = edgeCenters;
    this.halfEdges = halfEdges;
    this.spines = spines;
    this.dualEdges = dualEdges;
    this.interiors = interiors;
    this.isFlipped = isFlipped;
}

Face.create = function (region) {
    var center = Complex.zero;
    var p = region.p;
    var isFlipped = false;

    var increment = Mobius.createRotation(tau / p);
    var midvertex = region.p1;

    var mesh = region.points;
    var meshConjugate = Complex.conjugateArray(mesh);
    var meshCount = 3;
    var vertices = [p];
    var edgeCenters = [p];
    var halfEdgePoints = [2 * p];
    var spinePoints = [p];
    var dualEdgePoints = [p];
    var interiorPoints = [2 * p];

    var rotation = Mobius.identity;
    for (var i = 0; i < p; i++) {
        dualEdgePoints[i] = [meshCount];
        dualEdgePoints[i][0] = mesh[1].transform(rotation);
        dualEdgePoints[i][1] = mesh[2].transform(rotation);
        dualEdgePoints[i][2] = mesh[3].transform(rotation);

        edgeCenters[i] = mesh[4].transform(rotation);

        halfEdgePoints[i] = [meshCount];
        halfEdgePoints[i][0] = mesh[5].transform(rotation);
        halfEdgePoints[i][1] = mesh[6].transform(rotation);
        halfEdgePoints[i][2] = mesh[7].transform(rotation);

        halfEdgePoints[i + p] = [meshCount];
        halfEdgePoints[i + p][0] = mesh[5].conjugate().transform(rotation);
        halfEdgePoints[i + p][1] = mesh[6].conjugate().transform(rotation);
        halfEdgePoints[i + p][2] = mesh[7].conjugate().transform(rotation);

        vertices[i] = mesh[8].transform(rotation);

        spinePoints[i] = [meshCount];
        spinePoints[i][0] = mesh[9].transform(rotation);
        spinePoints[i][1] = mesh[10].transform(rotation);
        spinePoints[i][2] = mesh[11].transform(rotation);

        interiorPoints[i] = [meshCount];
        interiorPoints[i][0] = mesh[12].transform(rotation);
        interiorPoints[i][1] = mesh[13].transform(rotation);
        interiorPoints[i][2] = mesh[14].transform(rotation);

        interiorPoints[i + p] = [meshCount];
        interiorPoints[i + p][0] = mesh[12].conjugate().transform(rotation);
        interiorPoints[i + p][1] = mesh[13].conjugate().transform(rotation);
        interiorPoints[i + p][2] = mesh[14].conjugate().transform(rotation);

        rotation = Mobius.multiply(rotation, increment);
    }

    var face = new Face(region, center, vertices, edgeCenters, halfEdgePoints, spinePoints, dualEdgePoints, interiorPoints, isFlipped);

    var edge = new Edge(this, region.c, midvertex, midvertex.transform(increment.inverse()));

    face.edges = [p];
    for (var i = 0; i < p; i++) {
        face.edges[i] = edge.transform(rotation);
        rotation = Mobius.multiply(rotation, increment);
    }

    face.initBuffers(null);
    return face;
};

Face.createFromExisting = function (previous, edges, center, vertices, edgeCenters, halfEdges, spines, dualEdges, interiors, isFlipped) {
    var face = new Face(previous.region, center, vertices, edgeCenters, halfEdges, spines, dualEdges, interiors, isFlipped);
    face.edges = edges;
    face.initBuffers(previous);
    return face;
};

Face.prototype.initBuffers = function (previous) {
    var p = this.region.p;

    var vertices = [];
    for (var i = 0; i < p; i++) {
        vertices = vertices.concat(
			this.dualEdges[i][0].data[0], this.dualEdges[i][0].data[1],
			this.dualEdges[i][1].data[0], this.dualEdges[i][1].data[1],
			this.dualEdges[i][2].data[0], this.dualEdges[i][2].data[1],
			this.edgeCenters[i].data[0], this.edgeCenters[i].data[1],
			this.halfEdges[i][0].data[0], this.halfEdges[i][0].data[1],
			this.halfEdges[i][1].data[0], this.halfEdges[i][1].data[1],
			this.halfEdges[i][2].data[0], this.halfEdges[i][2].data[1],
			this.halfEdges[i + p][0].data[0], this.halfEdges[i + p][0].data[1],
			this.halfEdges[i + p][1].data[0], this.halfEdges[i + p][1].data[1],
			this.halfEdges[i + p][2].data[0], this.halfEdges[i + p][2].data[1],
			this.vertices[i].data[0], this.vertices[i].data[1],
			this.spines[i][0].data[0], this.spines[i][0].data[1],
			this.spines[i][1].data[0], this.spines[i][1].data[1],
			this.spines[i][2].data[0], this.spines[i][2].data[1],
			this.interiors[i][0].data[0], this.interiors[i][0].data[1],
			this.interiors[i][1].data[0], this.interiors[i][1].data[1],
			this.interiors[i][2].data[0], this.interiors[i][2].data[1],
			this.interiors[i + p][0].data[0], this.interiors[i + p][0].data[1],
			this.interiors[i + p][1].data[0], this.interiors[i + p][1].data[1],
			this.interiors[i + p][2].data[0], this.interiors[i + p][2].data[1]
		);
    }

    vertices = vertices.concat(this.center.data[0], this.center.data[1]);
    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    this.vertexBuffer.itemSize = 2;
    this.vertexBuffer.numItems = vertices.length;

    if (previous !== null) {
        this.textureBuffer = previous.textureBuffer;
        this.indexBuffers = previous.indexBuffers;
    } else {
        var textureCoords = [];
        for (var i = 0; i < p; i++) {
            textureCoords = textureCoords.concat(
			this.dualEdges[0][0].data[0], this.dualEdges[0][0].data[1],
			this.dualEdges[0][1].data[0], this.dualEdges[0][1].data[1],
			this.dualEdges[0][2].data[0], this.dualEdges[0][2].data[1],
			this.edgeCenters[0].data[0], this.edgeCenters[0].data[1],
			this.halfEdges[0][0].data[0], this.halfEdges[0][0].data[1],
			this.halfEdges[0][1].data[0], this.halfEdges[0][1].data[1],
			this.halfEdges[0][2].data[0], this.halfEdges[0][2].data[1],
			this.halfEdges[0][0].data[0], this.halfEdges[0][0].data[1],
			this.halfEdges[0][1].data[0], this.halfEdges[0][1].data[1],
			this.halfEdges[0][2].data[0], this.halfEdges[0][2].data[1],
			this.vertices[0].data[0], this.vertices[0].data[1],
			this.spines[0][0].data[0], this.spines[0][0].data[1],
			this.spines[0][1].data[0], this.spines[0][1].data[1],
			this.spines[0][2].data[0], this.spines[0][2].data[1],
			this.interiors[0][0].data[0], this.interiors[0][0].data[1],
			this.interiors[0][1].data[0], this.interiors[0][1].data[1],
			this.interiors[0][2].data[0], this.interiors[0][2].data[1],
			this.interiors[0][0].data[0], this.interiors[0][0].data[1],
			this.interiors[0][1].data[0], this.interiors[0][1].data[1],
			this.interiors[0][2].data[0], this.interiors[0][2].data[1]
		);
        }

        textureCoords = textureCoords.concat(this.center.data[0], this.center.data[1]);
        this.textureBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.textureBuffer);

        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoords), gl.STATIC_DRAW);
        this.textureBuffer.itemSize = 2;
        this.textureBuffer.numItems = textureCoords.length;

        var centerI = vertices.length / 2 - 1;
        var dualEdgesI = [0, 1, 2];
        var edgeCentersI = 3;
        var halfEdgesI = [4, 5, 6, 7, 8, 9];
        var verticesI = 10;
        var spinesI = [11, 12, 13];
        var interiorsI = [14, 15, 16, 17, 18, 19];

        var size = 20;
        var cubeVertexIndices = [];

        for (n = 0; n < p; n++) {
            cubeVertexIndices.push([
	        centerI,
	        n * size + spinesI[2],
	        n * size + dualEdgesI[0],
	        n * size + interiorsI[0],
	        n * size + dualEdgesI[1],
	        n * size + interiorsI[1],
	        n * size + dualEdgesI[2],
	        n * size + halfEdgesI[0],
	        n * size + edgeCentersI
	    ]);

        cubeVertexIndices.push([
	        n * size + spinesI[2],
	        n * size + spinesI[1],
	        n * size + interiorsI[0],
	        n * size + interiorsI[2],
	        n * size + interiorsI[1],
	        n * size + halfEdgesI[1],
	        n * size + halfEdgesI[0]
	    ]);

            cubeVertexIndices.push([
	        n * size + spinesI[1],
	        n * size + spinesI[0],
	        n * size + interiorsI[2],
	        n * size + halfEdgesI[2],
	        n * size + halfEdgesI[1]
	    ]);

        cubeVertexIndices.push([
	        n * size + spinesI[0],
	        n * size + verticesI,
	        n * size + halfEdgesI[2]
	    ]);

        var nn = (n + p - 1) % p;

        cubeVertexIndices.push([
	        centerI,
	        nn * size + spinesI[2],
	        n * size + dualEdgesI[0],
	        n * size + interiorsI[3],
	        n * size + dualEdgesI[1],
	        n * size + interiorsI[4],
	        n * size + dualEdgesI[2],
	        n * size + halfEdgesI[3],
	        n * size + edgeCentersI
	    ]);

        cubeVertexIndices.push([
	        nn * size + spinesI[2],
	        nn * size + spinesI[1],
	        n * size + interiorsI[3],
	        n * size + interiorsI[5],
	        n * size + interiorsI[4],
	        n * size + halfEdgesI[4],
	        n * size + halfEdgesI[3]
	    ]);

        cubeVertexIndices.push([
	        nn * size + spinesI[1],
	        nn * size + spinesI[0],
	        n * size + interiorsI[5],
	        n * size + halfEdgesI[5],
	        n * size + halfEdgesI[4]
	    ]);

        cubeVertexIndices.push([
	        nn * size + spinesI[0],
	        nn * size + verticesI,
	        n * size + halfEdgesI[5]
	    ]);
        }

        this.indexBuffers = [];
        for (i = 0; i < cubeVertexIndices.length; i++) {
            this.indexBuffers[i] = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffers[i]);

            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(cubeVertexIndices[i]), gl.STATIC_DRAW);
            this.indexBuffers[i].itemSize = 1;
            this.indexBuffers[i].numItems = cubeVertexIndices[i].length;
        }
    }
};

Face.prototype.transform = function (mobius) {
    var p = this.region.p;
    var edges = [p];

    var center = this.center.transform(mobius);
    var vertices = Complex.transformArray(this.vertices, mobius);
    var edgeCenters = Complex.transformArray(this.edgeCenters, mobius);

    var halfEdges = [2 * p];
    var spines = [p];
    var dualEdges = [p];
    var interiors = [2 * p];

    for (var i = 0; i < p; i++) {
        edges[i] = this.edges[i].transform(mobius);

        halfEdges[i] = Complex.transformArray(this.halfEdges[i], mobius);
        halfEdges[i + p] = Complex.transformArray(this.halfEdges[i + p], mobius);
        spines[i] = Complex.transformArray(this.spines[i], mobius);
        dualEdges[i] = Complex.transformArray(this.dualEdges[i], mobius);
        interiors[i] = Complex.transformArray(this.interiors[i], mobius);
        interiors[i + p] = Complex.transformArray(this.interiors[i + p], mobius);
    }

    return Face.createFromExisting(this, edges, center, vertices, edgeCenters, halfEdges, spines, dualEdges, interiors, this.isFlipped);
};

Face.prototype.conjugate = function () {
    var p = this.region.p;
    var edges = [p];

    var center = this.center.conjugate();
    var vertices = Complex.conjugateArray(this.vertices);
    var edgeCenters = Complex.conjugateArray(this.edgeCenters);

    var halfEdges = [2 * p];
    var spines = [p];
    var dualEdges = [p];
    var interiors = [2 * p];

    for (var i = 0; i < p; i++) {
        edges[i] = this.edges[i].conjugate();

        halfEdges[i] = Complex.conjugateArray(this.halfEdges[i]);
        halfEdges[i + p] = Complex.conjugateArray(this.halfEdges[i + p]);
        spines[i] = Complex.conjugateArray(this.spines[i]);
        dualEdges[i] = Complex.conjugateArray(this.dualEdges[i]);
        interiors[i] = Complex.conjugateArray(this.interiors[i]);
        interiors[i + p] = Complex.conjugateArray(this.interiors[i + p]);
    }

    return Face.createFromExisting(this, edges, center, vertices, edgeCenters, halfEdges, spines, dualEdges, interiors, !this.isFlipped);
};

Face.prototype.draw = function (motionMobius, textureOffset, texture, shaderProgram, isInverting) {
    gl.useProgram(shaderProgram);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.vertexAttribPointer(shaderProgram.vertexPositionAttribute, this.vertexBuffer.itemSize, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.textureBuffer);
    gl.vertexAttribPointer(shaderProgram.textureCoordAttribute, this.textureBuffer.itemSize, gl.FLOAT, false, 0, 0);

    gl.uniform1i(shaderProgram.samplerUniform, 0);
 
	gl.uniform1f(shaderProgram.isInverted, isInverting * ((Math.floor(i/4) + (this.isFlipped ? 0 : 1)) % 2));
    for (i = 0; i < this.indexBuffers.length; i++) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffers[i]);

		gl.uniform1f(shaderProgram.isInverted, isInverting * ((Math.floor(i/4) + (this.isFlipped ? 0 : 1)) % 2));
        this.drawelementstest(i);
    }

};

Face.prototype.drawelementstest = function(i) {
        gl.drawElements(gl.TRIANGLE_STRIP, this.indexBuffers[i].numItems, gl.UNSIGNED_SHORT, 0);
}

function Edge(Face, Circline, start, end) {
    this.Face = Face;
    this.Circline = Circline;
    this.start = start;
    this.end = end;
}

Edge.prototype.transform = function (mobius) {
    return new Edge(this.Face, this.Circline.transform(mobius), this.start.transform(mobius), this.end.transform(mobius));
};

Edge.prototype.conjugate = function () {
    return new Edge(this.Face, this.Circline.conjugate(), this.end.conjugate(), this.start.conjugate());
};

Edge.prototype.isConvex = function () {
    if (this.Circline.constructor != Circle)
        return false;

    var a1 = Complex.subtract(this.end, this.start).argument();
    var a2 = Complex.subtract(this.Circline.center(), this.start).argument();
    return (a1 - a2 + 4 * Math.PI) % (2 * Math.PI) < Math.PI;
};

