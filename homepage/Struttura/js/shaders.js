var shaderNames = [
	//"test"
	"cortex"
	, "eggholder"
    , "noise"
    , "noisebands"
    , "noisegradient"
    , "wood"
 //  , "mandelbrot"
    , "marblephase"
    , "mhoonbeam"
    //"spiral",
    //"cocoon",
	//"grainmarch"
];

var dependencies = [ "text!shaders/vertex/default.glsl" ];
shaderNames.forEach(function (name) { 
	dependencies.push("js/shaders/fragment/" + name + ".js");
	dependencies.push("text!shaders/fragment/" + name + ".glsl");
});

define(dependencies, function(defaultVertexShader) { 

	var shaders = {};
    window.shaders = shaders;

	for (var ii = 1; ii < arguments.length; ii += 2) {
		var shader = arguments[ii];
		shader.fragment = arguments[ii+1];
		shaders[shader.name] = shader;
	}

    function getShaderNames()
    {
    	var names = [];
    	for (key in shaders) {
    		names.push(key);
    	}
    	return names;
    }

    function createShaderMaterial(name) {
    	if (!(name in shaders)) {
    		return null; 
    	}
    	var mat = new THREE.ShaderMaterial({
        	uniforms: shaders[name].uniforms,
	        attributes: {
                    position3d: { type: 'v3', value: [] }
    		},
    	    vertexShader: defaultVertexShader,
        	fragmentShader: shaders[name].fragment,
        	side: THREE.DoubleSide
    	});
        if ("init" in shaders[name]) {
            shaders[name].init(mat);
        }
        if (!("materials" in shaders[name])) {
            shaders[name].materials = [];
        }
        shaders[name].materials.push(mat);
        return mat;
    }

    function updateShader(name) {
        if (!(name in shaders)) {
            return;
        }
        var s = shaders[name];
        if ("update" in s && "materials" in s) {
            for (m in s.materials) {
                s.update(s.materials[m]);
            }
        }
    }

    function getQueryStringParameters() {
        var match,
            pl     = /\+/g,  // Regex for replacing addition symbol with a space
            search = /([^&=]+)=?([^&]*)/g,
            decode = function (s) { return decodeURIComponent(s.replace(pl, " ")); },
            query  = window.location.search.substring(1);

        urlParams = {};
        while (match = search.exec(query)) {
            urlParams[decode(match[1])] = decode(match[2]);
        }
        return urlParams;
    }

    function updateQueryStringParameter(uri, key, value) {
        var re = new RegExp("([?&])" + key + "=.*?(&|$)", "i");
        var separator = uri.indexOf('?') !== -1 ? "&" : "?";
        if (uri.match(re)) {
            return uri.replace(re, '$1' + key + "=" + value + '$2');
        }
        else {
            return uri + separator + key + "=" + value;
        }
    }

    function updateUniformParamInQueryString(uniformName, newValue) {
        //console.log(uniform);
        var newQueryString = updateQueryStringParameter(window.location.href, uniformName, newValue);
        window.history.replaceState({}, "Struttura", newQueryString)
    }

    function decodeUniformFromQueryParam(uniform, queryParams) {
        var value = undefined;
        var queryVal = queryParams[uniform.name];
        if (queryVal != undefined) {
            if (uniform.type == "v3") {
                var triplet = queryVal.split(",")
                value = [
                    parseInt(triplet[0]),
                    parseInt(triplet[1]),
                    parseInt(triplet[2])
                ];
            } else if (uniform.type == "i") {
                value = parseInt(queryVal);
            } else if (uniform.type == "f") {
                value = parseFloat(queryVal);
            }
       }
       return value;
    }

    function objectsDiffer(a, b) {
        if (a instanceof Object) {
            if (b instanceof Object) {
                for (prop in a) {
                    if (objectsDiffer(a[prop], b[prop])) {
                        return true;
                    }
                }
                for (prop in b) {
                    if (!(prop in a)) {
                        return true;
                    }
                }
            } else {
                return true;
            }

            return false;
        } else {
            return a != b;
        }
    }

    function doPresetsMatch(preset1, preset2) {
        return !objectsDiffer(preset1["0"], preset2["0"]);
    }

    function createShaderControls(name) {
		if (!(name in shaders)) {
    		return null;
    	}
    	var uniforms = shaders[name].uniforms;

        var restoreParamsFromQuery = false;
        urlQueryParams = getQueryStringParameters();
        for (param in urlQueryParams) {
            if (param in uniforms) {
                restoreParamsFromQuery = true;
            }
        }

        var options = { autoPlace: false };
        if ("presets" in shaders[name]) {
            options.load = shaders[name].presets;
        } else {
            options.load = { "preset" : "", "remembered" : {} };
            var defaultPreset = { "0" : {} };
            for (uniformName in uniforms) {
                var uniform = uniforms[uniformName]
                if (uniform.type == "v3") {
                    defaultPreset["0"][uniformName] = [
                        Math.round(uniform.value.x * 255), 
                        Math.round(uniform.value.y * 255), 
                        Math.round(uniform.value.z * 255)
                    ];
                } else {
                    defaultPreset["0"][uniformName] = uniform.value;
                }
            }
            var defaultPresetName = "Default";
            options.load.preset = defaultPresetName;
            options.load.remembered[defaultPresetName] = defaultPreset;
        }

        if (restoreParamsFromQuery) {
            var newPreset = { "0" : {} };
            for (uniformName in uniforms) {
                var uniform = uniforms[uniformName];
                uniform.name = uniformName;
                var val = decodeUniformFromQueryParam(uniform, urlQueryParams, true);
                if (val == undefined) {
                    val = uniform.value;
                }
                newPreset["0"][uniformName] = val;
            }

            var matchedPreset = undefined;

            for (var presetName in options.load.remembered) {
                var preset = options.load.remembered[presetName];
                if (doPresetsMatch(preset, newPreset)) {
                    matchedPreset = presetName;
                }
            }

            if (matchedPreset != undefined) {
                options.load.preset = matchedPreset;
            } else {
                var newPresetName = "(new)";
                options.load.preset = newPresetName;
                options.load.remembered[newPresetName] = newPreset;
            }
        }

    	var gui = new dat.GUI(options);

    	var adapter = {};
        var folders = {};

        window.gui = gui;
        //gui.useLocalStorage = true;
        gui.remember(adapter);

    	for (uniformName in uniforms) {
    		var uniform = uniforms[uniformName];
            uniform.name = uniformName;
    		var param = null;
            var guiContainer = gui;

            if (uniform.hide) {
                continue;
            }

            if ("folder" in uniform) {
                if (!(uniform.folder in folders)) {
                    folders[uniform.folder] = gui.addFolder(uniform.folder);
                }
                guiContainer = folders[uniform.folder];
            }

    		if (uniform.type == "v3") {
    			// color picker, convert from GLSL rep
    			Object.defineProperty(adapter, uniformName, {
		    		get: (function(u) { return function() { 
		    			return u.value.toArray().map(function (e) { return e*255; }); 
		    		}})(uniform),
		    		set: (function(u) { return function(newValue) { 
		    			u.value.set(newValue[0]/255, newValue[1]/255, newValue[2]/255);
                        updateUniformParamInQueryString(u.name, newValue);
		    		}})(uniform)
		    	});
		    	param = guiContainer.addColor(adapter, uniformName);
    		} else if (uniform.type == "t") {
                continue;
            } else {
		    	Object.defineProperty(adapter, uniformName, {
		    		get: (function(u) { return function() { return u.value; }})(uniform),
		    		set: (function(u) { 
                        return function(newValue) { 
                            u.value = newValue;
                            updateUniformParamInQueryString(u.name, newValue); 
                        }
                    })(uniform)
		    	});
		    	param = guiContainer.add(adapter, uniformName);
		    }

            if (uniform.type == "i") {
                param.step(1.0);
            }

	    	if ("min" in uniform && "min" in param) {
	    		param.min(uniform.min);
	    	}
	    	if ("max" in uniform && "max" in param) {
	    		param.max(uniform.max);
	    	}
	    	if ("step" in uniform && "step" in param) {
	    		param.step(uniform.step);
	    	}
	    }

	    return gui;
    }

    return {
    	getShaderNames: getShaderNames,
    	createShaderMaterial: createShaderMaterial,
    	createShaderControls: createShaderControls,
        updateShader: updateShader
    };
});
