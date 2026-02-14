function mousemove2D (e) {
    render2D();

    var rect = canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;

    var canvasScale = canvas.width / rect.width;
    x *= canvasScale;
    y *= canvasScale;  // intionally same aspect ratio

    var mouseVector = new THREE.Vector3(x, y, 0);
//    var flatVector = mouseVector.applyMatrix4(trans2Dinverse);
//    flatVector.applyMatrix4(new THREE.Matrix4().makeTranslation(transX, transY, 0))

    var closest;
    var closestDistance = Infinity;
    for (var i = 0; i < flatGeometry.vertices.length; i++) {
        var dist = flatGeometry.vertices[i].clone().applyMatrix4(trans2D).setZ(0).distanceTo(mouseVector);
        if (dist < closestDistance) {
            closest = i;
            closestDistance = dist;
        }
    }

    var p = flatGeometry.vertices[closest].clone().applyMatrix4(trans2D);
    ctx.fillStyle = '#700';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, 2 * Math.PI);
    ctx.fill();

 //   writeMessage (x + " " + y + " " + physics.points.length + " " + physics.constraints.length);

    e.preventDefault();

    function writeMessage(message) {
        ctx.clearRect(0, 0, 100, 40);
        ctx.font = '18pt Calibri';
        ctx.fillStyle = 'gray';
        ctx.fillText(message, 10, 25);
    }

    if (vertexMesh === undefined)
        return;

    vertexMesh.position = geometry.vertices[closest];
};

function render2D() {
    if (ctx === undefined)
        return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#aaa';

    ctx.beginPath();
    for (var i = 0; i < lines.length; i++) {
        var p = lines[i].vertices[0].clone().applyMatrix4(trans2D);

        ctx.moveTo(p.x , p.y);
        for (var j = 1; j < lines[i].vertices.length; j++) {
            p = lines[i].vertices[j].clone().applyMatrix4(trans2D);
            ctx.lineTo(p.x , p.y);
        }
    }
    ctx.stroke();

    ctx.strokeStyle = '#00b';

    ctx.beginPath();
    for (var i = 0; i < curves.length; i++) {
        var p = curves[i].vertices[0].clone().applyMatrix4(trans2D);

        ctx.moveTo(p.x , p.y);
        for (var j = 1; j < curves[i].vertices.length; j++) {
            p = curves[i].vertices[j].clone().applyMatrix4(trans2D);
            ctx.lineTo(p.x , p.y);
        }
    }
    ctx.stroke();
}

function create2D(box) {
    canvas = document.getElementById('c');
    ctx = canvas.getContext('2d');

    var spoonflowerwidth = 8100;
    var spoonflowerheight = 18100;
    var scale = 1/10;

    canvas.width = spoonflowerwidth * scale;
    canvas.height = spoonflowerheight * scale;

    var padding = 10;
    var scaleX = (canvas.width - 2 * padding) / (box.size().x + 2 * box.min.x);
    var scaleY = (canvas.height - 2 * padding) / (box.size().y);
    var scale = Math.min(scaleX, scaleY);
    var transX = padding / scale;
    var transY = box.size().y + box.min.y + padding / scale + box.min.z * skewZfactor / 1.8;
    var rotation = new THREE.Matrix4().makeRotationX(Math.PI);
    var skewZfactor = -2;
    var skewZ = new THREE.Matrix4();
    skewZ.elements[9] = skewZfactor;

    trans2D = new THREE.Matrix4()
        .multiply(skewZ)
        .multiplyScalar(scale)
        .multiply(new THREE.Matrix4().makeTranslation(transX, transY, 0))
        .multiply(rotation)
        ;

    trans2Dinverse = new THREE.Matrix4()
        .multiply(new THREE.Matrix4().getInverse(rotation))
        .multiplyScalar(1/scale)
        .multiply(new THREE.Matrix4().getInverse(skewZ));

    render2D();
};

function createScene() {

    var phongMaterial = new THREE.MeshPhongMaterial( { 
            color: 0x000000, 
            side: THREE.DoubleSide,
            shading: THREE.FlatShading, 
            specular: 0x999999,
            emissive: 0x000000,
            shininess: 10 
        } );

    var multiMaterial = [
        shaderLib.createShaderMaterial(shaderName),
        new THREE.MeshBasicMaterial( { 
            color: 0xEEEEEE,
            shading: THREE.FlatShading, 
            opacity: 0.2,
            transparent: true,
            wireframe: true,
            wireframeLinewidth: 2
        } )
    ];

    scene = new THREE.Scene();
    mesh = THREE.SceneUtils.createMultiMaterialObject(geometry, multiMaterial);

    var offset = geometry.boundingBox.center().y;
    mesh.position.y -= offset;   
    scene.add(mesh);

    if (isMirror) {
        var mirrorObj = mesh.clone();
        mirrorObj.applyMatrix(new THREE.Matrix4().makeScale(-1, 1, 1));
        mirrorObj.position.y -= offset;
        scene.add(mirrorObj);
    }

    var ambientLight = new THREE.AmbientLight(0x666666);
    scene.add(ambientLight);

    scene.fog = new THREE.Fog(0x333333, 1500, 2100);

    var directionalLight = new THREE.DirectionalLight(0x8888aa);
    directionalLight.position.set(1, 1, 1).normalize();
    scene.add(directionalLight);

    var directionalLight = new THREE.DirectionalLight(0x8888aa);
    directionalLight.position.set(-1, 1, 1).normalize();
    scene.add(directionalLight);

    vertexGeometry = new THREE.SphereGeometry(0.01, 16, 16);
    vertexMesh = new THREE.Mesh(vertexGeometry, new THREE.MeshBasicMaterial({ color:0x770000}));
    scene.add(vertexMesh);
    
    // flatScene = new THREE.Scene();
    // flatScene.add(directionalLight);

    // flatMesh = new THREE.Mesh(flatGeometry, shaderLib.createShaderMaterial(shaderName));
    // flatMesh.position.x = 0.6;
    // flatMesh.position.y = -offset;
  //  flatScene.add(flatMesh);

    flatCamera.lookAt(flatScene.position);
}