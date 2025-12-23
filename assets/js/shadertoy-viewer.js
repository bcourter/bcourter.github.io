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
            mode: 0,
            offset: 0.0,
            radius: 0.1,
            power: 1.0,
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

        this.uniforms.iResolution.value.set(this.options.width, this.options.height, 1);
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

        this.gui = new lil.GUI({ container: this.container, autoPlace: false });
        this.gui.domElement.style.position = 'absolute';
        this.gui.domElement.style.top = '10px';
        this.gui.domElement.style.right = '10px';
        this.gui.domElement.style.zIndex = '1000';
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
        // Shader-specific controls based on shader ID
        switch(this.shaderId) {
            case 'DssczX': // Two-body field viewer
            case 'dd2cWy':
            case 'cs2cW3':
                this.gui.add(this.parameters, 'mode', 0, 5, 1).name('Mode').onChange((value) => {
                    this.uniforms.iParam1.value = value;
                });
                break;

            case 'clV3Rz': // Field notation
            case 'dtVGRd':
                this.gui.add(this.parameters, 'offset', -2.0, 2.0, 0.01).name('Offset').onChange((value) => {
                    this.uniforms.iParam2.value = value;
                });
                break;

            case '4f2XzW': // Differential engineering rectangle
            case 'mtKfWz':
                this.gui.add(this.parameters, 'radius', 0.0, 1.0, 0.01).name('Parameter').onChange((value) => {
                    this.uniforms.iParam3.value = value;
                });
                break;

            default:
                // Generic slider
                this.gui.add(this.parameters, 'mode', 0, 10, 0.1).name('Parameter').onChange((value) => {
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
