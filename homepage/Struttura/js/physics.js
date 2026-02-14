//Inspired by http://andrew-hoyer.com/experiments/cloth/, but written from scratch to be 3D and to use real physical units (MKS)
//And http://web.archive.org/web/20070610223835/http://www.teknikus.dk/tj/gdc2001.htm

var Physics = function () {
    this.points = []; 
    this.constraints = []; 

    this.time = 0;
//   this.gravity = new THREE.Vector3(0, -1E-1, 0);
    this.gravity = new THREE.Vector3(0, 0, 0);
    this.dampening = 0.9;
    this.anisotropy = new THREE.Vector3(1, 0.9, 1).multiplyScalar(0.5);
    this.center = new THREE.Vector3();
    this.lastCenter = new THREE.Vector3();
    this.centerShift = new THREE.Vector3();
    this.noise = 0;//1E-3;
};

Physics.prototype.update = function (timeDelta) {
	this.time += timeDelta;

	var i = this.constraints.length;
	while (i--)	
		this.constraints[i].computeForces(this.time);

	var center = new THREE.Vector3();
	var i = this.points.length;
	while (i--)	
		center.add(this.points[i].position);

    var cg  = new THREE.Vector3();
	i = this.points.length;
	while (i--)	{
		var p = this.points[i];

		this.points[i].update(timeDelta);
		cg.add(p.position);
	}

	this.lastCenter = this.center;
	this.center = cg.divideScalar(this.points.length);
}

var Point = function (position, mass) {
    this.position = position || new THREE.Vector3(); 
    this.mass = mass || 1;
    this.oldPosition = position.clone();
    this.multiplier = new THREE.Vector3(1, 1, 1);
    this.neighbors = [];
    this.neighborDists = [];
    this.neighborsSq = [];
    this.sumForces = new THREE.Vector3(); 
};

Point.prototype.update = function (timeDelta) {
	var phys = new Physics();
	this.sumForces.add(phys.gravity.clone().multiplyScalar(this.mass));
	this.sumForces.add(new THREE.Vector3(Math.random(), Math.random(), Math.random()).sub(phys.anisotropy).multiplyScalar(phys.noise));
	
	var temp = this.position.clone();
	this.position.multiplyScalar(1 + phys.dampening)
		.sub(this.oldPosition.multiplyScalar(phys.dampening))
		.add(this.sumForces.multiply(phys.anisotropy).multiplyScalar(timeDelta * timeDelta / this.mass).multiply(this.multiplier))
	;
	this.oldPosition = temp;

	temp = this.sumForces;
	this.sumForces = new THREE.Vector3();
	return temp;
};

var Spring = function (a, b, k) {
    this.a = a; 
    this.b = b; 
    this.k = k || 1;

    this.distance = a.position.distanceTo(b.position);
    this.max = 1E-3;
    this.startTime = 0;
};

Spring.prototype.computeForces = function(time) {
	if (this.startTime > time)
		return;

	var separation = this.a.position.clone().sub(this.b.position);
	var dist = this.distance;
	var delta = dist - separation.length();
	delta = Math.min(Math.abs(delta), this.max) * ((delta > 0) ? 1 : -1);

	separation.setLength(this.k * delta / 2);
	this.a.sumForces.add(separation);
	this.b.sumForces.sub(separation);
}
