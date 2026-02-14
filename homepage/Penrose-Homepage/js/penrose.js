$(function() {

var renderer, camera, settings, bodyGeometry, lightGeometry, dudesGeometry, triangle, scene, globe;
var lightHue = 0.6;
var triangleColor = 0x333333;
var ambientColor = 0x222222;
var floorHeight = -3;

initUI();
initRenderer();
animate();

document.onselectstart = function() {
  return false;
};

function initUI() {
	if (Detector.webgl) {
		$("#isRotating").button();
		$("#isAnimating").button();
		$("#showPeople").button().click(function() {
			if (dudesGeometry === undefined) {
				loadDudes();
			} else {
				dudesGeometry.traverse( function ( child ) {
					if ( child instanceof THREE.Mesh ) {			
						child.visible = settings.showPeopleCheckbox.checked;
					}
				});
			}
		});
	} else {
		$("#isRotating").hide();
		$("#isAnimating").hide();
		$("#showPeople").hide();
		$("label").hide();
		$("#helptext").hide();

		Detector.addGetWebGLMessage({ parent: $("noWebGLMessage")[0] });
	}
}

function initRenderer() {
	var panorama = getGetValue("panorama");
	if (panorama != null) {
		triangleColor = 0xffffff;
		ambientColor = 0x777777;
	}

	camera = new THREE.PerspectiveCamera(4, window.innerWidth / window.innerHeight, 1, 1000);
	camera.position.z = 90;
	camera.position.x = 50;

	renderer = new THREE.WebGLRenderer({
		antialias: true,
	});
	renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMapEnabled = true;
    renderer.shadowMapType = THREE.PCFShadowMap;
//    renderer.shadowMapSoft = true;
    // renderer.shadowCameraNear = 5;
    // renderer.shadowCameraFar = 100;
    // renderer.shadowCameraFov = 20;

	document.body.appendChild(renderer.domElement);

	controls = new THREE.OrbitControls( camera );
  	controls.addEventListener( 'change', render );
  	controls.minDistance = 20;
  	controls.maxDistance = 200;
  	controls.zoomSpeed = 0.2;
  	controls.target = new THREE.Vector3(0, -0.2, 0);


	controls.rotateUp(0.1);

	window.addEventListener( 'resize', onWindowResize, false );

	var Settings = function () {
		this.isRotatingCheckbox = document.getElementById("isRotating");
		this.isAnimatingCheckbox = document.getElementById("isAnimating");
		this.showPeopleCheckbox = document.getElementById("showPeople");
	};
	settings = new Settings();	
	
	triangle = new THREE.Object3D();

	var base = new THREE.Mesh( 
		new THREE.CircleGeometry(200, 36),
		new THREE.MeshLambertMaterial( { color: 0x111111 } ) 
	);

	base.receiveShadow = true;

	base.applyMatrix(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
	base.position.y = -0.6;
	//triangle.add(base);

	scene = new THREE.Scene();
	globe = new THREE.Scene();
	scene.add(globe);

	var loader = new THREE.OBJLoader();

	loader.load( "resources/obj/penrose-body.obj", function ( event ) {
		bodyGeometry = event.clone();			
		triangle.add(bodyGeometry);

		bodyGeometry.traverse( function ( child ) {
			if ( child instanceof THREE.Mesh ) {			
				child.material = new THREE.MeshPhongMaterial( { 
					color: triangleColor, 
					emissive: 0x333333, 
					shading: THREE.SmoothShading,
					specular: triangleColor,
					shininess: 20
				} );

				child.castShadow = true;
	    		child.receiveShadow = true;
			}
		});

		bodyGeometry.applyMatrix(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
	});
	
	var lightLoader = new THREE.OBJLoader();
	lightLoader.load( "resources/obj/penrose-lights.obj", function ( event ) {
		lightGeometry = event.clone();
		triangle.add(lightGeometry);

		lightGeometry.traverse( function ( child ) {
			if ( child instanceof THREE.Mesh ) 		
				child.material = new THREE.MeshBasicMaterial( { color: 0xffffff, shading: THREE.FlatShading } );
		});

		lightGeometry.applyMatrix(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
	});

	
	var scale = 1;
	triangle.scale.set(scale, scale, scale);
	triangle.position.y = floorHeight;
	
	globe.add(triangle);

	// panorama
	if (panorama != null) {
	    panomap = THREE.ImageUtils.loadTexture("resources/panoramas/" + panorama);

	    var radius = 7;
	    var sphere = new THREE.SphereGeometry( radius, 64, 48 );
	    sphere.applyMatrix( new THREE.Matrix4().makeScale( -1, 1, 1 ) );

	    if (panorama == "catalyst.jpg")
	  	  	sphere.applyMatrix( new THREE.Matrix4().makeRotationY(0.53));
	    if (panorama == "fortpoint.jpg")
	  	  	sphere.applyMatrix( new THREE.Matrix4().makeRotationY(2.2));
	  	else
	  	  	sphere.applyMatrix( new THREE.Matrix4().makeRotationY(1.75));

	    var sphereFloor = 0.1
	    var sphereCap = radius * 3 / 4;
	    for (var i = 0; i < sphere.vertices.length; i++) {
	    	var vertex = sphere.vertices[i];
	    	vertex.y = Math.max(vertex.y + sphereFloor, 0);

	    	var r = Math.sqrt(vertex.x * vertex.x + vertex.z * vertex.z);
	    	if (vertex.y == 0) {
	    		var expand = Math.asin(r / radius) / Math.PI * 2;
	    		vertex.x *= expand;
	    		vertex.z *= expand;
	    	}

	    	if (vertex.y > sphereFloor) {
	    		var factor = 0;
	    		if (vertex.y > sphereCap) {
	    			factor = (vertex.y - sphereCap) / (radius - sphereCap);
	    			vertex.y += factor * (vertex.y - sphereCap);
	    		}

	    		if (r > 0.001) {
		    		vertex.x *= (1-factor) * radius / r + factor;
		    		vertex.z *= (1-factor) * radius / r + factor;
	    		}
	    	}
	    }

	    var sphereMaterial = new THREE.MeshLambertMaterial( {
	    	color: 0xdddddd,
	    	emissive: 0xaaaaaa,
	        map: panomap,
	    } );

	    skybox = new THREE.Mesh( sphere, sphereMaterial );
	    skybox.receiveShadow = true;
	    triangle.add(skybox);

	    light = new THREE.SpotLight( 0x222222, 1, 0, Math.PI / 2, 1 );
		light.position.set( -24, 30, 40 );
		light.target.position.set( 0, -2, 0 );

	//light.shadowCameraVisible = true;

	    light.castShadow = true;
	//    light.onlyShadow = true;

	    var size = 10;
	    light.shadowCameraLeft = -size;
	    light.shadowCameraTop = -size;
	    light.shadowCameraRight = size;
	    light.shadowCameraBottom = size;
	    light.shadowCameraNear = 30;
	    light.shadowCameraFar = 80;
	    light.shadowCameraFov = 5.4
	    light.shadowBias = 0.01
	    light.shadowMapWidth = light.shadowMapHeight = 128;
	    light.shadowDarkness = 0.3;  


		triangle.add(light);
	}

	// add subtle ambient lighting
	var ambientLight = new THREE.AmbientLight(ambientColor);
	scene.add(ambientLight);
	
    scene.fog = new THREE.Fog( 0x000000, 0, 1000 );

	// add directional light source
	var directionalLight = new THREE.DirectionalLight(0x404040);
	directionalLight.position.set(1, 1, 1).normalize();
//	scene.add(directionalLight);

 	loadOtherObj("penrose-base.obj", 0x000000);
 	loadOtherObj("penrose-flanges.obj", 0xffffff);
 	loadOtherObj("penrose-hardware.obj", 0x111111);
 }

function getGetValue(key){
	var location = window.location.search;
	if (location.length < 2)
		return null;

	var res = location.match(new RegExp("[?&]" + key + "=([^&/]*)", "i"));
	return res[1];
}	

function loadDudes() {
	var dudeLoader = new THREE.OBJLoader();
	dudeLoader.load( "resources/obj/dude.obj", function ( event ) {
		dudesGeometry = event.clone();
		dudesGeometry.applyMatrix(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
		dudesGeometry.traverse( function ( child ) {
			if ( child instanceof THREE.Mesh ) {			
				child.material = new THREE.MeshPhongMaterial( { 
					color: 0x0, 
					emissive: 0x0, 
					shading: THREE.SmoothShading,
					specular: 0x442211,
					shininess: 15
				 } );
			}

			child.castShadow = true;
		});
		
		triangle.add(dudesGeometry);
	});
}

function loadOtherObj(name, color) {
	var loader = new THREE.OBJLoader();
	loader.load( "resources/obj/" + name, function ( event ) {
		var obj = event.clone();
		obj.applyMatrix(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
		obj.traverse( function ( child ) {
			if ( child instanceof THREE.Mesh ) {			
				child.material = new THREE.MeshPhongMaterial( { 
					color: color, 
		//			emissive: color,	
					emissive: new THREE.Color(color).lerp(new THREE.Color(0x0), 0.8).getHex(),	
					shading: THREE.SmoothShading,
					specular: color,
					shininess: 5
				 } );
			}

			if (name == "penrose-flanges.obj")
				child.castShadow = true;
		});
		
		triangle.add(obj);
	});
}

function onWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );
}

var FPS = 30.0;
var msPerTick = 1000 / FPS;
var nextTick = Date.now();

function animate() {
	var currentTime, ticks = 0;

	requestAnimationFrame( animate, renderer.domElement );

    currentTime = Date.now();
    if (currentTime - nextTick > 60 * msPerTick) {
      	nextTick = currentTime - msPerTick;
    }
    while (currentTime > nextTick) {
      	updateModel();
      	nextTick += msPerTick;
      	ticks++;
    }
    if (ticks) {
      	render();
    }

	controls.update();
}

function updateModel() {
	var rotationFactor = 0.001
	if (settings.isRotatingCheckbox.checked) {
		triangle.rotation.y += rotationFactor;
	}

	if (settings.isAnimatingCheckbox.checked) {
		lightHue = (lightHue + 0.001) % 1.0;
	}
}

function render() {
	if (settings.isAnimatingCheckbox.checked && lightGeometry !== undefined) {
		lightGeometry.traverse( function ( child ) {
			if ( child instanceof THREE.Mesh ) {
				child.material.color.setHSL(lightHue, 1.0, 0.6);
			}
		});
	}

	renderer.render( scene, camera );
}

}); // jQuery function wrapper

