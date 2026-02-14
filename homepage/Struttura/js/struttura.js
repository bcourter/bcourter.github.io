// require.config({
//     urlArgs: "bust=" + (new Date()).getTime()
// });

requirejs(["./shaders"], function(shaderLib) { 

var renderer, camera, settings, container3D, panels, scene, lights
var material, geometry, physics, flatGeometry, mesh;
var geometryMirror, flatGeometryMirror, meshMirror;
var lines, curves, isMirror;
var vertexGeometry, vertexMesh;
var trans2D, trans2Dinverse;
var objModel = [];
var objModelCount = 3;
var lastTime = 0, lastAnimation = 0, lastRotation = 0;
var intersectedObjects, targetList = [];

var pointmass = 0.001;  //kg
var springiness = 10;

var accuracy = 1E-3;
var accuracySquared = accuracy * accuracy;

var flatScene, flatMesh, flatMeshMirror, flatCamera;

var shaderName;

// var spoonflowerwidth = 8100;
// var spoonflowerheight = 18100;
// var spoonflowerwidth = 10000;
// var spoonflowerheight = 22000;

init();
animate();

function init() {
    renderer = new THREE.WebGLRenderer({
        preserveDrawingBuffer: true     // to save canvas see http://stackoverflow.com/questions/15558418/how-do-you-save-an-image-from-a-three-js-canvas
    });
    renderer.autoClear = false;
    var context = renderer.domElement.getContext("experimental-webgl", { preserveDrawingBuffer: true });


    container3D = document.getElementById('3d');

    var width = container3D.offsetWidth;
    var height = window.innerHeight;
    renderer.setSize(width, height);
    container3D.appendChild(renderer.domElement);

    container3D.addEventListener( 'mousemove', mousemove3D, false );

    var aspectRatio = width / height;
    camera = new THREE.PerspectiveCamera(10, aspectRatio, 1, 1000);
    camera.position.y = 5;
    camera.position.z = 10;

    flatCamera = new THREE.OrthographicCamera(-aspectRatio, aspectRatio, 1, -1, 1, 10);
    flatCamera.position.z = 1;

    var cookie = getCookie("view");
    if (cookie !== undefined   ) {
        var viewdata = cookie.split(',');

        for (var i = 0; i < 16; i++)
            camera.projectionMatrix[i] = viewdata[i];


    }

	controls = new THREE.OrbitControls(camera, container3D);

	controls.rotateSpeed = 2.0;
	controls.zoomSpeed = 2.0;
	controls.panSpeed = 0.2;

	controls.noZoom = false;
	controls.noPan = false;

	controls.staticMoving = true;
	controls.dynamicDampingFactor = 0.3;

	controls.keys = [ 65, 83, 68 ];

	controls.addEventListener( 'change', render3D );

    window.addEventListener('resize', onWindowResize, false);

   // var patternFile = 'resources/json3D/cylinder2.js';
    var patternFile = getGetValue("pattern");
    if (patternFile == null)
        patternFile = 'tshirt-44.js';

    patternPath = 'resources/json3D/' + patternFile;


    isMirror = !(getGetValue("mirror") == "0");
    if (patternFile == null)
        isMirror = true;

    shaderName = getGetValue("gfx") || "NoiseGradient";

    var shaderMenu = document.getElementById("shaderMenu");
    shaderLib.getShaderNames().forEach(function(name) {
        var option = document.createElement("option");
        var urlStart = [location.protocol, '//', location.host, location.pathname].join('');
        var href = urlStart + "?pattern=" + patternFile + "&mirror=" + getGetValue("mirror") + "&gfx=" + name;
        option.innerHTML = name;
        if (name == shaderName) {
            option.selected = true;
        }
        option.value = href;
        shaderMenu.appendChild(option);
    });
    shaderMenu.onchange = function () {
       var href = document.getElementById("shaderMenu").value;
       window.location = href;
    }

    loadpart(patternPath, function (geometries, lines, curves) { loadGeometry(geometries, lines, curves); });

    var gui = shaderLib.createShaderControls(shaderName);
    document.getElementById("control-container").appendChild(gui.domElement);

    // Work around issue with dat.GUI color controls going black when losing keyboard focus
    var colorControls = document.getElementsByClassName("cr object color");
    for (var c = 0; c < colorControls.length; c++) {
        var inputs = colorControls[c].getElementsByTagName("input");
        for (var i = 0; i < inputs.length; i++) {
            inputs[i].setAttribute("readonly", true);
            inputs[i].setAttribute("disabled", true);
        }
    }

    document.getElementById("SaveObj").onclick = saveObj;
    document.getElementById("SaveImage").onclick = saveImage;
}

function loadGeometry(geometries, lines, curves) {
    var g = geometries.shift();
    while (geometries.length > 0)
        THREE.GeometryUtils.merge(g, geometries.shift());

    this.lines = lines;
    this.curves = curves;

    g.mergeVertices();
    geometry = g;
    geometry.points = [];

    physics = new Physics();

    for (var k = 0; k < geometry.vertices.length; k++) {
        geometry.points[k] = new Point(geometry.vertices[k], pointmass);
        physics.points.push(geometry.points[k]);
    }   

    var curveBox = new THREE.Box3();
    for (var i = 0; i < curves.length; i++) {
        var vertexIndices = curves[i].vertexIndices = [];
        for (var j = 0; j < curves[i].vertices.length; j++) {
            curveBox.expandByPoint(curves[i].vertices[j]);
            for (var k = 0; k < geometry.vertices.length; k++) {
                if ((new THREE.Vector3()).subVectors(curves[i].vertices[j], geometry.vertices[k]).length() < accuracy) {
                    vertexIndices[j] = k;
                    break;
                }
            }

            if (k == geometry.vertices.length) 
                console.log('no point found');
        }

        var a = geometry.points[vertexIndices[0]];
        var b = geometry.points[vertexIndices[curves[i].vertices.length - 1]];

        if (a === undefined || b === undefined)
            continue;

        a.neighbors = b.neighbors;
        a.neighborDists = b.neighborDists;
    }

    geometry.computeBoundingBox();
    flatGeometry = geometry.clone();
    var skewZfactor = -2;
    var skewZ = new THREE.Matrix4();
    skewZ.elements[9] = skewZfactor;
    flatGeometry.applyMatrix(skewZ);
    // for (var i = 0; i < flatGeometry.vertices.length; i++) {
    //     flatGeometry.vertices[i].;
    // }
    flatGeometry.computeBoundingBox();

    createSprings(lines);
    createSprings(curves, 0, springiness * 10);

    var box = geometry.boundingBox.clone().union(curveBox);

    if (isMirror)
        box.union

    var xOffset = box.min.x;
    var xDist = box.size().x + xOffset;
    var thetaOffset = Math.PI * (xOffset / xDist + 1 / 2); 
    var r = xDist / Math.PI / 2;
    var span = 2 * Math.PI;
    var elliptical = 1.4;

    if (isMirror) {
        r *= 2;
        span /= 2; 
        thetaOffset -= Math.PI / 2;
    }

    for (var k = 0; k < geometry.vertices.length; k++) {
        var theta = geometry.vertices[k].x / xDist * span - thetaOffset;
        var z = -geometry.vertices[k].z;
        geometry.vertices[k].set(
            (r + z) * Math.sin(theta) * elliptical, 
            geometry.vertices[k].y, 
            (r + z) * Math.cos(theta) / elliptical);
        physics.points[k].position = geometry.vertices[k];
        physics.points[k].oldPosition = geometry.vertices[k].clone();

        if (isMirror && numbersAreEqual(geometry.vertices[k].x, 0))
            physics.points[k].multiplier = new THREE.Vector3(0, 1, 1);

        if (numbersAreEqual(geometry.vertices[k].y, 0))
            physics.points[k].multiplier = new THREE.Vector3(1, 0, 1);

    }


    if (isMirror) {
        geometryMirror = geometry.clone();
        flatGeometryMirror = flatGeometry.clone();
        flatGeometryMirror.computeBoundingBox();

        for (var i = 0; i < geometry.vertices.length; i++) {
            geometryMirror.vertices[i].x *= -1;
        }

    }

    createScene();
}

function createSprings(lines, distance, springK) {
    springK = springK || springiness;
    var springKFirst = springK * 1E-3;
    var springKSecond = springKFirst * 1E-1;

    for (var i = 0; i < lines.length; i++) {
        var vertexIndices = lines[i].vertexIndices = [];
        for (var j = 0; j < lines[i].vertices.length; j++) {
            for (var k = 0; k < geometry.vertices.length; k++) {
                if ((new THREE.Vector3()).subVectors(lines[i].vertices[j], geometry.vertices[k]).length() < accuracy) {
                    vertexIndices[j] = k;
                    break;
                }
            }

            if (k == geometry.vertices.length) {
                geometry.vertices.push(lines[i].vertices[j].clone());
                geometry.points.push(new Point(geometry.vertices[k], pointmass));
                geometry.points[k].multiplier = new THREE.Vector3(0, 1, 1);
                physics.points.push(geometry.points[k]);

                vertexIndices[j] = k;
               // console.log('no point found');
            }
        }

        var a = geometry.points[vertexIndices[0]];
        var b = geometry.points[vertexIndices[lines[i].vertices.length - 1]];
        a.neighbors.push(b);
        b.neighbors.push(a);

        var dist = a.position.distanceTo(b.position);
        a.neighborDists.push(dist);
        b.neighborDists.push(dist);
    }

    for (var i = 0; i < lines.length; i++) {
        var a = geometry.points[lines[i].vertexIndices[0]];
        var b = geometry.points[lines[i].vertexIndices[lines[i].vertexIndices.length - 1]];

        if (lines[i].colors[0] == 0xFF0000) {
            var noZ =  new THREE.Vector3(1, 0, 1);
            a.multiplier = noZ;
            b.multiplier = noZ;
            continue;
        }

        var spring = new Spring(a, b, springK);

        if (distance == 0)
            spring.max = 3E-4;

        // if (a.position.clone().sub(b.position).y > accuracy)
        //     spring.startTime = 3;
            spring.startTime = a.position.y;


        if (distance !== undefined) {
            spring.distance = distance;
        }

        physics.constraints.push(spring);
    }

    for (var i = 0; i < physics.points.length; i++) {
        var center = physics.points[i];
        for (var j = 0; j < center.neighbors.length; j++) {
            var first = center.neighbors[j];
            var firstDist = center.neighborDists[j];

            for (var k = 0; k < j; k++) {
                var other = center.neighbors[k];
                var otherDist = center.neighborDists[k];

                if (first.neighbors.indexOf(other) != -1) continue;

                var isSeam = false;
                for (var l = 0; l < physics.constraints.length; l++) {
                    var cons = physics.constraints[l];
                    if ((cons.a == first && cons.b == other) || (cons.a == other && cons.b == first)) {
                        isSeam = true;
                        break;
                    }
                }
                if (isSeam) continue;

            
                var spring = new Spring(
                    first,
                    other,
                    springKFirst);

                spring.distance = (firstDist + otherDist) * 3;
                spring.max = 1E-3;

                physics.constraints.push(spring);
            }
          
            // for (var k = 0; k < first.neighbors.length; k++) {
            //     var second = first.neighbors[k];
            //     if (second != center && -1 != first.neighborsSq.indexOf(second)) {
            //         first.neighborsSq.push(second);
            //         second.neighborsSq.push(first);
            //     }
            // }
            
        }
    }
}

function mousemove3D (e) {
    /*
    var rect = canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;

    var vector = new THREE.Vector3( x, y, 1 );
    var projector = new THREE.Projector();
    projector.unprojectVector( vector, camera );
    var ray = new THREE.Raycaster( camera.position, vector.sub( camera.position ).normalize() );

    var intersects = ray.intersectObjects( targetList );

    if (intersects.length == 0)
        return;
    */

    // TBD
};

function pointsAreEqual(a, b) {
    return a.distanceToSquared(b) < accuracySquared;
}

function numbersAreEqual(a, b) {
    return Math.abs(a, b) < accuracy ;
}

function createScene() {
    var multiMaterial = function() { return [
            shaderLib.createShaderMaterial(shaderName),
            new THREE.MeshPhongMaterial( { 
                color: 0x000000,
                ambient: 0x000000,
                specular: 0xffffff,
                shading: THREE.FlatShading, 
                combine: THREE.MultiplyOperation,
                blending: THREE.NormalBlending,
                opacity: 0.1,
                transparent: true,
                side: THREE.DoubleSide,
                wireframe: false
            } ),
            new THREE.MeshBasicMaterial( { 
                color: 0xEEEEEE,
                shading: THREE.FlatShading, 
                opacity: 0.2,
                transparent: true,
                wireframe: true,
                wireframeLinewidth: 2
            } ) 
    ] };

    scene = new THREE.Scene();
    mesh = THREE.SceneUtils.createMultiMaterialObject(geometry, multiMaterial());

    var offset = geometry.boundingBox.center().y;
    mesh.position.y -= offset;   
    scene.add(mesh);

    if (isMirror) {
        meshMirror = THREE.SceneUtils.createMultiMaterialObject(geometryMirror, multiMaterial());
        meshMirror.position.y -= offset;
        scene.add(meshMirror);
    }

    var ambientLight = new THREE.AmbientLight(0x666666);
    scene.add(ambientLight);

    scene.fog = new THREE.Fog(0x333333, 1500, 2100);

    lights = [new THREE.DirectionalLight(0x8888aa), new THREE.DirectionalLight(0x8888aa)];
    lights[0].position.set(1, 1, 1).normalize();
    lights[1].position.set(-1, 1, 1).normalize();
    camera.add(lights[0]);
    camera.add(lights[1]);
    scene.add(camera);
    vertexGeometry = new THREE.SphereGeometry(0.01, 16, 16);
    vertexMesh = new THREE.Mesh(vertexGeometry, new THREE.MeshBasicMaterial({ color:0x770000}));
    scene.add(vertexMesh);
    
    flatScene = new THREE.Scene();
    var flatSceneScale = 0.5;

    var xOffset = .7;
    flatMesh = new THREE.Mesh(flatGeometry, shaderLib.createShaderMaterial(shaderName));
    flatMesh.position.x = xOffset;
    flatMesh.position.y = offset;
    flatMesh.scale = new THREE.Vector3(flatSceneScale, flatSceneScale, flatSceneScale);
    flatScene.add(flatMesh);

    if (isMirror) {
        flatMeshMirror = new THREE.Mesh(flatGeometryMirror, shaderLib.createShaderMaterial(shaderName));
        flatMeshMirror.position.x = xOffset;
        flatMeshMirror.position.y = offset;
        flatMeshMirror.scale = new THREE.Vector3(-flatSceneScale, flatSceneScale, flatSceneScale);
        flatScene.add(flatMeshMirror);
    }

    flatCamera.lookAt(flatScene.position);
}

function onWindowResize() {
    var width = container3D.offsetWidth;
    var height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    flatCamera.aspect = width / height;
    flatCamera.updateProjectionMatrix();

    renderer.setSize(width, height);
}


function animate() {
    requestAnimationFrame(animate, renderer.domElement);

    render3D();
    controls.update();
    shaderLib.updateShader(shaderName);
    //stats.update();
}

var frame = 0;
function render3D() {
    frame++;
    var time = new Date().getTime() / 1000;

    if (geometry === undefined) {
        animGeometry = geometry;
        return;
    }

  //  lights[0].position.set(1, 1, 1).normalize().applyMatrix4(camera.matrixWorldInverse);
  //  lights[1].position.set(-1, 1, 1).normalize().applyMatrix4(camera.matrixWorldInverse);
    
  //  lights[0].position.set(1, 0, 1).normalize();
  //  lights[1].position.set(-1, 0, 1).normalize();

    geometry.computeFaceNormals();
    geometry.computeVertexNormals();
    geometry.normalsNeedUpdate = true;
    geometry.verticesNeedUpdate = true;

    mesh.children[0].material.attributes.position3d.value = geometry.vertices;
    mesh.children[0].material.attributes.position3d.needsUpdate = true;

    flatMesh.material.attributes.position3d.value = geometry.vertices;
    flatMesh.material.attributes.position3d.needsUpdate = true;

    if (isMirror) {
        geometryMirror.computeFaceNormals();
        geometryMirror.computeVertexNormals();
        geometryMirror.normalsNeedUpdate = true;
        geometryMirror.verticesNeedUpdate = true;

        for (var i = 0; i < geometry.vertices.length; i++) {
            var v = geometry.vertices[i];
         //   var vm = geometryMirror.vertices[i];

            geometryMirror.vertices[i].x = -v.x;
            geometryMirror.vertices[i].y = v.y;
            geometryMirror.vertices[i].z = v.z;
        }

        meshMirror.children[0].material.attributes.position3d.value = geometryMirror.vertices;
        meshMirror.children[0].material.attributes.position3d.needsUpdate = true;

        flatMeshMirror.material.attributes.position3d.value = geometryMirror.vertices;
        flatMeshMirror.material.attributes.position3d.needsUpdate = true;   
    }

    renderer.clear();
    renderer.render(scene, camera);
    renderer.clearDepth();
    renderer.render(flatScene, flatCamera);

    // if (frame % 100 == 0) {
    //     var viewdata = [16];

    //     for (var i = 0; i < 16; i++)
    //         viewdata[i] = camera.projectionMatrix[i];

    //     setCookie("view", viewdata.join()); 
    // }

    physics.update(0.006);

  //  physics.update(time - lastTime);
    lastTime = time;
}

function saveImage() {
    var width = renderer.width
    var height = renderer.height

    var oldLeft = flatCamera.left;
    var oldRight = flatCamera.right;
    var oldTop = flatCamera.top;
    var oldBottom = flatCamera.bottom;

    var oldPosition = flatMesh.position;
    var oldScale = flatMesh.scale;

    var box = flatGeometry.boundingBox.clone();

    if (isMirror) {
        var shiftX = box.size().x;
        box.min.x -= shiftX;
        var oldPositionMirror = flatMeshMirror.position;
        var oldScaleMirror = flatMeshMirror.scale;
    }

    var size = box.size();

    var res = document.getElementById("reduction").value;

    flatMesh.position = new THREE.Vector3();
    flatMesh.scale = new THREE.Vector3(1, 1, 1);

    if (isMirror) {
        flatMeshMirror.position = new THREE.Vector3();
        flatMeshMirror.scale = new THREE.Vector3(-1, 1, 1);
    }

    var scale = 1 / 0.0254 * 150 / res;
    var boxPixels = box.clone().applyMatrix4(new THREE.Matrix4().makeScale(scale, scale, scale))
    var sizePixels = boxPixels.size();

    var maxDim = 1024;
    var xCount = Math.ceil(sizePixels.x / maxDim);
    var yCount = Math.ceil(sizePixels.y / maxDim);
    var xFrame = Math.ceil(sizePixels.x / xCount);
    var yFrame = Math.ceil(sizePixels.y / yCount);

    renderer.setSize(xFrame, yFrame);
    var xStep = size.x / xCount;
    var yStep = size.y / yCount;

    var newWindow = window.open(dataUrl, "Image");
    var canvas = newWindow.document.createElement('canvas');
    canvas.width = sizePixels.x;
    canvas.height = sizePixels.y;
    newWindow.document.body.appendChild(canvas);

    var ctx = canvas.getContext('2d');

    ctx.fillStyle = "rgb(200,0,0)";
    ctx.fillRect (10, 10, 55, 50);

    ctx.fillStyle = "rgba(0, 0, 200, 0.5)";
    ctx.fillRect (30, 30, 55, 50);

    for (var i = 0; i < xCount; i++) {
        var left = box.min.x + xStep * i;
        var right = left + xStep;
        
        for (var j = 0; j < yCount; j++) {
            var top = box.min.y + yStep * j;
            var bottom = top + yStep;

            flatCamera.left = left;
            flatCamera.right = right;
            flatCamera.bottom = bottom;
            flatCamera.top = top;
            flatCamera.updateProjectionMatrix();

            renderer.clear();
            renderer.render(flatScene, flatCamera);

            var dataUrl = renderer.domElement.toDataURL();
            var img = new Image;
            img.src = dataUrl;
            ctx.drawImage(img, xFrame * i, yFrame * j);
        }

    }

    flatCamera.left = oldLeft;
    flatCamera.right = oldRight;     
    flatCamera.top = oldTop;
    flatCamera.bottom = oldBottom; 
    flatMesh.position = oldPosition;
    flatMesh.scale = oldScale;

    if (isMirror) {
        flatMeshMirror.position = oldPositionMirror;
        flatMeshMirror.scale = oldScaleMirror;
    }

    

    onWindowResize();

    return false;
}

function saveObj() {
    var op = THREE.saveToObj(new THREE.Mesh(geometry, new THREE.MeshLambertMaterial()));

    var newWindow = window.open("");
    newWindow.document.write(op);
    return false;
}

THREE.saveToObj = function (object3d) {
    var s = '';
	var offset = 1;

    object3d.traverse(function (child) {
        if (child instanceof THREE.Mesh) {
            var mesh = child;

			var geometry = mesh.geometry;
			mesh.updateMatrixWorld();

			for (i = 0; i < geometry.vertices.length; i++) {
				var vector = new THREE.Vector3(geometry.vertices[i].x, geometry.vertices[i].y, geometry.vertices[i].z);
				vector.applyMatrix4(mesh.matrixWorld);

				s += 'v ' + (vector.x) + ' ' +
				vector.y + ' ' +
				vector.z + '<br />';
			}

			for (i = 0; i < geometry.faces.length; i++) {
				s += 'f ' +
				    (geometry.faces[i].a + offset) + ' ' +
				    (geometry.faces[i].b + offset) + ' ' +
				    (geometry.faces[i].c + offset)
				;

				if (geometry.faces[i].d !== undefined) {
				    s += ' ' + (geometry.faces[i].d + offset);
				}
				s += '<br />';
			}

			offset += geometry.vertices.length;
		}
	});

    return s;
}


function mergeAllVertices(object3D) {
    var offset = 0;
    var geometry = new THREE.Geometry();
    object3D.traverse(function (child) {
        if (child instanceof THREE.Mesh) {
            if (geometry.vertices.length == 0) {
                geometry = child.geometry.clone();
                return;
            }

            THREE.GeometryUtils.merge(geometry, child.geometry);
        }
    });

    geometry.mergeVertices();
    return geometry;
}


    // from http://stackoverflow.com/questions/4825683/how-do-i-create-and-read-a-value-from-cookie
function setCookie(c_name,value,exdays) {
    var exdate=new Date();
    exdate.setDate(exdate.getDate() + exdays);
    var c_value=escape(value) + 
    ((exdays==null) ? "" : ("; expires="+exdate.toUTCString()));
    document.cookie=c_name + "=" + c_value;
}

function getCookie(c_name) {
    var i,x,y,ARRcookies=document.cookie.split(";");
    for (i=0;i<ARRcookies.length;i++) {
        x=ARRcookies[i].substr(0,ARRcookies[i].indexOf("="));
        y=ARRcookies[i].substr(ARRcookies[i].indexOf("=")+1);
        x=x.replace(/^\s+|\s+$/g,"");
        if (x==c_name) {
            return unescape(y);
        }
    }
}

function getGetValue(key){
    var location = window.location.search;
    if (location.length < 2)
        return null;

    var res = location.match(new RegExp("[?&]" + key + "=([^&/]*)", "i"));
    if (res == null)
        return null;

    return res[1];
}

}); // end require.js wrapper 