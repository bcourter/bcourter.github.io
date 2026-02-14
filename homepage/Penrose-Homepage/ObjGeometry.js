/**
 * @author mrdoob / http://mrdoob.com/
 * based on http://papervision3d.googlecode.com/svn/trunk/as3/trunk/src/org/papervision3d/objects/primitives/Cube.as
 * http://en.wikipedia.org/wiki/Clifford_torus
 */

THREE.ObjGeometry = function ( path, scale ) {
	this.scale = scale || 1;

	THREE.Geometry.call( this );
	var scope = this;
	
	var loader = new THREE.OBJLoader();
	loader.addEventListener( 'load', function ( event ) {
		content = event.content;
		var meshes = [];
		
		var box = new THREE.Box3();
		content.traverse( function ( child ) {
			if ( child instanceof THREE.Mesh ) {
				child.geometry.computeBoundingBox();
				box.union(child.geometry.boundingBox);
				meshes.push(child);
			}
		} );
		
		if ( meshes.length == 0 ) 
			console.warn( "no mesh found" );

		center = box.center();
		scale /= box.size().length() * 0.5;
		
		var offset = 0;
		var mesh;
		while ((mesh = meshes.pop()) != null) {
		
			var vertices = mesh.geometry.vertices;
			for ( var i = 0; i < vertices.length; i++ ) {
				scope.vertices.push( vertices[i] );
			}
			
			var faces = mesh.geometry.faces;
			for ( var i = 0; i < faces.length; i++ ) {
				var face;	
				if (  instanceof THREE.Face3 ) { 
					face = new THREE.Face3( faces[i].a + offset, faces[i].b + offset, faces[i].c + offset );
				} else if ( faces[i] instanceof THREE.Face4 ) {
					face = new THREE.Face4( faces[i].a + offset, faces[i].b + offset, faces[i].c + offset, faces[i].d + offset );
				} else {
					console.warn( "unhandled face" );
				}
				
				face.materialIndex = 0; //TBD
				scope.faces.push(face);
			}
			
			offset = scope.vertices.length;
		}
		
	});
	
    loader.load( path );
	
	this.computeCentroids();
	//this.mergeVertices();
};

THREE.ObjGeometry.prototype = Object.create( THREE.Geometry.prototype );
