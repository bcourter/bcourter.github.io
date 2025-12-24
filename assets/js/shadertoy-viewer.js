/**
 * Custom Shadertoy Viewer
 * A standalone shader viewer compatible with Shadertoy shaders
 * Uses Three.js for rendering and lil-gui for controls
 */

class ShadertoyViewer {
    constructor(containerId, shaderId, options = {}) {
        this.containerId = containerId;
        this.shaderId = shaderId;
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
            visualization: 0.8,  // Default for DssczX (4/5 = 0.8)
            wiggle: 0.2,         // For cs2cW3
            wobble: 0.5,         // For mtKfWz
            angle: 0.75,         // For dd2cWy
            shape: 0,            // For mtKfWz
            paused: !this.options.autoplay
        };

        this.mousePressed = false;
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
        try {
            const response = await fetch(`/assets/shaders/${this.shaderId}.glsl`);
            if (!response.ok) {
                throw new Error(`Failed to load shader: ${this.shaderId}`);
            }
            this.fragmentShader = await response.text();
        } catch (error) {
            console.error(error);
            // Fallback to a simple shader
            this.fragmentShader = this.getDefaultShader();
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
        // Don't use setPixelRatio - it causes coordinate scaling issues
        // this.renderer.setPixelRatio(window.devicePixelRatio);
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

        // Set resolution to match canvas size
        this.uniforms.iResolution.value.set(
            this.options.width,
            this.options.height,
            1
        );
    }

    setupEventListeners() {
        const canvas = this.renderer.domElement;

        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = this.options.height - (e.clientY - rect.top);

            if (this.mousePressed) {
                this.uniforms.iMouse.value.set(x, y, x, y);
            } else {
                this.uniforms.iMouse.value.set(x, y, this.uniforms.iMouse.value.z, this.uniforms.iMouse.value.w);
            }
        });

        canvas.addEventListener('mousedown', (e) => {
            this.mousePressed = true;
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = this.options.height - (e.clientY - rect.top);
            this.uniforms.iMouse.value.set(x, y, x, y);
        });

        canvas.addEventListener('mouseup', () => {
            this.mousePressed = false;
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

        this.gui = new lil.GUI({ container: this.container, autoPlace: false, width: 200 });

        // Position in lower left and make transparent
        this.gui.domElement.style.position = 'absolute';
        this.gui.domElement.style.bottom = '10px';
        this.gui.domElement.style.left = '10px';
        this.gui.domElement.style.top = 'auto';
        this.gui.domElement.style.right = 'auto';
        this.gui.domElement.style.zIndex = '1000';
        this.gui.domElement.style.opacity = '0.7';
        this.gui.domElement.style.fontSize = '11px';

        this.container.appendChild(this.gui.domElement);

        // Add parameter controls based on shader ID
        this.addShaderSpecificControls();

        // Add common controls
        this.gui.add(this.parameters, 'paused').name('Pause').onChange((value) => {
            if (!value) {
                this.lastTime = performance.now();
            }
        });
    }

    addShaderSpecificControls() {
        // Shader-specific controls based on original Shadertoy sliders
        // readFloat returns 0-1, so we map parameters accordingly
        switch(this.shaderId) {
            case 'DssczX': // Two-body field - viz = int(readFloat(1.) * 5.)
                this.parameters.visualization = 0.8; // 4/5
                this.uniforms.iParam1.value = this.parameters.visualization * 5.0;
                this.gui.add(this.parameters, 'visualization', 0, 1, 0.2)
                    .name('Visualization')
                    .onChange((value) => {
                        this.uniforms.iParam1.value = value * 5.0;
                    });
                break;

            case 'dd2cWy': // Rhombus gradient - angledot = readFloat(2.) - 0.5 + 0.1 * sin(iTime)
                this.parameters.angle = 0.75;
                this.uniforms.iParam1.value = this.parameters.angle;
                this.gui.add(this.parameters, 'angle', 0, 1, 0.01)
                    .name('Angle')
                    .onChange((value) => {
                        this.uniforms.iParam1.value = value;
                    });
                break;

            case 'cs2cW3': // Apollonian circles
                // offset = readFloat(0.)
                this.parameters.wiggle = 0.2;
                this.uniforms.iParam1.value = this.parameters.wiggle;

                // viz = int(readFloat(1.) * 2.)
                this.parameters.visualization = 0;
                this.uniforms.iParam2.value = this.parameters.visualization * 2.0;

                this.gui.add(this.parameters, 'wiggle', 0, 1, 0.01)
                    .name('Wiggle')
                    .onChange((value) => {
                        this.uniforms.iParam1.value = value;
                    });
                this.gui.add(this.parameters, 'visualization', 0, 1, 0.5)
                    .name('Visualization')
                    .onChange((value) => {
                        this.uniforms.iParam2.value = value * 2.0;
                    });
                break;

            case 'mtKfWz': // Rotational derivative
                // wobble = readFloat(0.)
                this.parameters.wobble = 0.5;
                this.uniforms.iParam1.value = this.parameters.wobble;

                // shapeIndex = int(readFloat(1.) * 3.)
                this.parameters.shape = 0;
                this.uniforms.iParam2.value = this.parameters.shape / 3.0;

                this.gui.add(this.parameters, 'wobble', 0, 1, 0.01)
                    .name('Wobble')
                    .onChange((value) => {
                        this.uniforms.iParam1.value = value;
                    });
                this.gui.add(this.parameters, 'shape', 0, 2, 1)
                    .name('Shape')
                    .onChange((value) => {
                        this.uniforms.iParam2.value = value / 3.0;
                    });
                break;

            case 'clV3Rz': // Field notation - placeholder
            case 'dtVGRd':
                this.gui.add(this.parameters, 'visualization', 0, 1, 0.2)
                    .name('Mode')
                    .onChange((value) => {
                        this.uniforms.iParam1.value = value * 5.0;
                    });
                break;

            case '4f2XzW': // Differential engineering - placeholder
                this.gui.add(this.parameters, 'visualization', 0, 1, 0.25)
                    .name('Mode')
                    .onChange((value) => {
                        this.uniforms.iParam1.value = value * 4.0;
                    });
                break;

            default:
                // Generic slider
                this.gui.add(this.parameters, 'visualization', 0, 1, 0.1)
                    .name('Parameter')
                    .onChange((value) => {
                        this.uniforms.iParam1.value = value;
                    });
        }
    }

    onResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight || 450;

        this.renderer.setSize(width, height);
        this.uniforms.iResolution.value.set(width, height, 1);
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
