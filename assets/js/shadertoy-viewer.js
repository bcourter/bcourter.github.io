/**
 * Custom Shadertoy Viewer
 * A standalone shader viewer compatible with Shadertoy shaders
 * Uses Three.js for rendering and lil-gui for controls
 */

class ShadertoyViewer {
    constructor(containerId, shaderId, options = {}) {
        this.containerId = containerId;
        this.shaderId = shaderId;
        this.shaderFilename = shaderId; // Use shader ID directly as filename

        this.container = document.getElementById(containerId);

        if (!this.container) {
            console.error(`Container ${containerId} not found`);
            return;
        }

        this.options = {
            width: options.width || this.container.clientWidth || 800,
            height: options.height || this.container.clientHeight || 450,
            autoplay: options.autoplay !== false,
            showGui: options.showGui !== false,
            ...options
        };

        this.uniforms = {
            iTime: { value: 0 },
            iResolution: { value: new THREE.Vector3() },
            iMouse: { value: new THREE.Vector4() },
            iFrame: { value: 0 },
            iTimeDelta: { value: 0 },
            iFrameRate: { value: 60 },
            iChannelResolution: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
            // Custom uniforms for shader parameters
            iParam1: { value: 0.0 },
            iParam2: { value: 0.0 },
            iParam3: { value: 0.0 },
            iParam4: { value: 1.0 },
        };

        this.parameters = {
            visualizationMode: 'Two-body field',  // For dropdowns
            wiggle: 0.2,         // For apollonian-circles
            wobble: 0.5,         // For rotational-derivative
            angle: 0.75,         // For rhombus-gradient
            shapeMode: 'Rectangle',  // For rotational-derivative dropdown
            paused: !this.options.autoplay
        };

        this.mousePressed = false;
        this.mouseEverClicked = false;
        this.lastTime = 0;
        this.frameCount = 0;

        this.init();
    }

    async init() {
        await this.loadShader();
        this.setupRenderer();
        this.setupScene();
        this.setupEventListeners();
        if (this.options.showGui) {
            this.setupGUI();
        }
        this.animate();
    }

    async loadShader() {
        const filename = this.shaderFilename;

        try {
            // Load the main shader
            const response = await fetch(`/assets/shaders/${filename}.glsl`);
            if (!response.ok) {
                throw new Error(`Failed to load shader: ${filename}`);
            }
            const shaderCode = await response.text();

            // Process #include directives
            this.fragmentShader = await this.preprocessIncludes(shaderCode, `/assets/shaders/${filename}.glsl`);
        } catch (error) {
            console.error(error);
            // Fallback to a simple shader
            this.fragmentShader = this.getDefaultShader();
        }
    }

    async preprocessIncludes(source, currentPath) {
        // Cache to prevent loading the same file multiple times
        if (!this.includeCache) {
            this.includeCache = new Map();
        }

        // Regular expression to match #include directives
        const includeRegex = /#include\s+["<]([^">]+)[">]/g;

        let result = source;
        let match;

        // Find all includes
        const includes = [];
        while ((match = includeRegex.exec(source)) !== null) {
            includes.push({
                fullMatch: match[0],
                path: match[1],
                index: match.index
            });
        }

        // Process includes in reverse order to maintain correct positions
        for (let i = includes.length - 1; i >= 0; i--) {
            const include = includes[i];

            // Resolve relative path
            const includePath = this.resolveIncludePath(currentPath, include.path);

            // Check cache first
            let includeContent;
            if (this.includeCache.has(includePath)) {
                includeContent = this.includeCache.get(includePath);
            } else {
                // Load the include file
                try {
                    const response = await fetch(includePath);
                    if (!response.ok) {
                        console.warn(`Failed to load include: ${includePath}`);
                        continue;
                    }
                    includeContent = await response.text();

                    // Recursively process nested includes
                    includeContent = await this.preprocessIncludes(includeContent, includePath);

                    // Cache the processed content
                    this.includeCache.set(includePath, includeContent);
                } catch (error) {
                    console.warn(`Error loading include ${includePath}:`, error);
                    continue;
                }
            }

            // Replace the #include directive with the file content
            result = result.substring(0, include.index) +
                     `\n// BEGIN INCLUDE: ${include.path}\n` +
                     includeContent +
                     `\n// END INCLUDE: ${include.path}\n` +
                     result.substring(include.index + include.fullMatch.length);
        }

        return result;
    }

    resolveIncludePath(currentPath, includePath) {
        // Get directory of current file
        const currentDir = currentPath.substring(0, currentPath.lastIndexOf('/'));

        // Handle relative paths
        if (includePath.startsWith('./')) {
            return currentDir + '/' + includePath.substring(2);
        } else if (includePath.startsWith('../')) {
            const parts = currentDir.split('/');
            const includeParts = includePath.split('/');

            // Remove ../ and corresponding directory
            while (includeParts[0] === '..') {
                includeParts.shift();
                parts.pop();
            }

            return parts.join('/') + '/' + includeParts.join('/');
        } else {
            // Absolute path from shaders directory
            return '/assets/shaders/' + includePath;
        }
    }

    getDefaultShader() {
        return `
void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv = fragCoord/iResolution.xy;
    vec3 col = 0.5 + 0.5*cos(iTime+uv.xyx+vec3(0,2,4));
    fragColor = vec4(col,1.0);
}`;
    }

    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(this.options.width, this.options.height);
        // Use devicePixelRatio for high-DPI displays
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);
    }

    setupScene() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        // Wrap the shader in Shadertoy-compatible boilerplate
        const fullFragmentShader = `
uniform vec3 iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform int iFrame;
uniform float iFrameRate;
uniform vec4 iMouse;
uniform vec3 iChannelResolution[4];
uniform float iParam1;
uniform float iParam2;
uniform float iParam3;
uniform float iParam4;

${this.fragmentShader}

void main() {
    mainImage(gl_FragColor, gl_FragCoord.xy);
}`;

        const material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: `
                void main() {
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: fullFragmentShader
        });

        const geometry = new THREE.PlaneGeometry(2, 2);
        this.mesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.mesh);

        // Set resolution to actual render size (accounting for devicePixelRatio)
        const pixelRatio = this.renderer.getPixelRatio();
        this.uniforms.iResolution.value.set(
            this.options.width * pixelRatio,
            this.options.height * pixelRatio,
            1
        );
    }

    setupEventListeners() {
        const canvas = this.renderer.domElement;

        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();

            // Only update mouse position while button is pressed (Shadertoy behavior)
            if (!this.mousePressed) return;

            const pixelRatio = this.renderer.getPixelRatio();
            const x = (e.clientX - rect.left) * pixelRatio;
            const y = (this.options.height - (e.clientY - rect.top)) * pixelRatio;

            // Update current position while dragging
            this.uniforms.iMouse.value.x = x;
            this.uniforms.iMouse.value.y = y;
        });

        canvas.addEventListener('mouseleave', () => {
            if (this.mousePressed) {
                this.mousePressed = false;
                // Negate click position when mouse leaves while pressed
                this.uniforms.iMouse.value.z = -Math.abs(this.uniforms.iMouse.value.z);
                this.uniforms.iMouse.value.w = -Math.abs(this.uniforms.iMouse.value.w);
            }
        });

        canvas.addEventListener('mousedown', (e) => {
            this.mousePressed = true;
            this.mouseEverClicked = true;
            const rect = canvas.getBoundingClientRect();
            const pixelRatio = this.renderer.getPixelRatio();
            const x = (e.clientX - rect.left) * pixelRatio;
            const y = (this.options.height - (e.clientY - rect.top)) * pixelRatio;

            // Set both current position and click position (positive values when pressed)
            this.uniforms.iMouse.value.set(x, y, x, y);
        });

        canvas.addEventListener('mouseup', () => {
            this.mousePressed = false;

            // Negate click position (zw) when mouse is released (Shadertoy behavior)
            this.uniforms.iMouse.value.z = -Math.abs(this.uniforms.iMouse.value.z);
            this.uniforms.iMouse.value.w = -Math.abs(this.uniforms.iMouse.value.w);
        });

        window.addEventListener('resize', () => {
            this.onResize();
        });
    }

    setupGUI() {
        // Dynamically import lil-gui
        if (typeof lil === 'undefined') {
            // If lil-gui is not available, skip GUI setup
            console.warn('lil-gui not available, skipping GUI setup');
            return;
        }

        this.gui = new lil.GUI({
            container: this.container,
            autoPlace: false,
            width: 160  // Smaller width
        });

        // Position in lower left and make transparent and compact
        this.gui.domElement.style.position = 'absolute';
        this.gui.domElement.style.bottom = '10px';
        this.gui.domElement.style.left = '10px';
        this.gui.domElement.style.top = 'auto';
        this.gui.domElement.style.right = 'auto';
        this.gui.domElement.style.zIndex = '1000';
        this.gui.domElement.style.opacity = '0.8';
        this.gui.domElement.style.fontSize = '10px';
        this.gui.domElement.style.height = 'auto';  // Auto-size to content

        this.container.appendChild(this.gui.domElement);

        // Add parameter controls based on shader ID
        this.addShaderSpecificControls();

        // Add pause control
        this.gui.add(this.parameters, 'paused').name('⏸ Pause').onChange((value) => {
            if (!value) {
                this.lastTime = performance.now();
            }
        });
    }

    addShaderSpecificControls() {
        // Use controls configuration from options if provided
        if (this.options.controls !== undefined) {
            this.addControlsFromConfig(this.options.controls);
            return;
        }

        // Fallback: generic slider for shaders without explicit controls
        this.gui.add(this.parameters, 'wiggle', 0, 1, 0.1)
            .name('Parameter')
            .onChange((value) => {
                this.uniforms.iParam1.value = value;
            });
    }

    addControlsFromConfig(controls) {
        // Add controls from configuration array
        controls.forEach(control => {
            const paramName = control.param; // e.g., 'iParam1'
            const defaultValue = control.default;
            const name = control.name; // Display name

            // Set initial value
            this.uniforms[paramName].value = defaultValue;

            if (control.type === 'slider') {
                // Slider control
                const propName = control.property || name.toLowerCase();
                this.parameters[propName] = defaultValue;

                this.gui.add(this.parameters, propName, control.min, control.max, control.step || 0.01)
                    .name(name)
                    .onChange((value) => {
                        this.uniforms[paramName].value = value;
                    });
            } else if (control.type === 'dropdown') {
                // Dropdown control
                const propName = control.property || name.toLowerCase();
                const defaultOption = Object.keys(control.options).find(
                    key => control.options[key] === defaultValue
                ) || Object.keys(control.options)[0];
                this.parameters[propName] = defaultOption;

                this.gui.add(this.parameters, propName, control.options)
                    .name(name)
                    .onChange((value) => {
                        this.uniforms[paramName].value = parseFloat(value);
                    });
            } else if (control.type === 'checkbox') {
                // Checkbox control
                const propName = control.property || name.toLowerCase();
                this.parameters[propName] = defaultValue !== 0;

                this.gui.add(this.parameters, propName)
                    .name(name)
                    .onChange((value) => {
                        this.uniforms[paramName].value = value ? 1.0 : 0.0;
                    });
            }
        });
    }

    onResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight || 450;

        this.renderer.setSize(width, height);

        // Update resolution with devicePixelRatio
        const pixelRatio = this.renderer.getPixelRatio();
        this.uniforms.iResolution.value.set(
            width * pixelRatio,
            height * pixelRatio,
            1
        );
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        if (!this.parameters.paused) {
            const now = performance.now();
            const delta = (now - this.lastTime) / 1000;
            this.lastTime = now;

            this.uniforms.iTime.value += delta;
            this.uniforms.iTimeDelta.value = delta;
            this.uniforms.iFrame.value = this.frameCount++;
            this.uniforms.iFrameRate.value = delta > 0 ? 1 / delta : 60;
        }

        this.renderer.render(this.scene, this.camera);
    }

    destroy() {
        if (this.gui) {
            this.gui.destroy();
        }
        if (this.renderer) {
            this.renderer.dispose();
            this.container.removeChild(this.renderer.domElement);
        }
    }
}

// Make it globally available
window.ShadertoyViewer = ShadertoyViewer;
