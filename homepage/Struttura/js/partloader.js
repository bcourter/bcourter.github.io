function loadpart(url, callback) {
	var xhr = new XMLHttpRequest();
	var length = 0;

	xhr.onreadystatechange = function () {
		if ( xhr.readyState === xhr.DONE ) {
			if ( xhr.status === 200 || xhr.status === 0 ) {
				if ( xhr.responseText ) {
					var json = JSON.parse( xhr.responseText );
					
					var lines = [];
					var curves = [];
					var meshes = [];

					if (json.lines != undefined) {
						for ( i = 0; i < json.lines.length; i++ ) {
							var loader = new THREE.JSONLoader();
							var result = loader.parse(json.lines[i], url);
							if (json.lines[i].metadata.formatVersion > 0)
								lines.push(result.geometry);
							else
								curves.push(result.geometry);
						}
					}
					
					if (json.meshes != undefined) {
						for ( i = 0; i < json.meshes.length; i++ ) {
							var loader = new THREE.JSONLoader();
							var result = loader.parse(json.meshes[i], url);
							meshes.push(result.geometry);
						}
					}

					callback(meshes, lines, curves);
				} else {
					console.error( 'THREE.JSONLoader: "' + url + '" seems to be unreachable or the file is empty.' );
				}
				// in context of more complex asset initialization
				// do not block on single failed file
				// maybe should go even one more level up
				//context.onLoadComplete();//WTF?
			} else {
				console.error( 'THREE.JSONLoader: Couldn\'t load "' + url + '" (' + xhr.status + ')' );
			}
		} 
	};

	xhr.open( "GET", url, true );
	xhr.withCredentials = this.withCredentials;
	xhr.send( null );
};