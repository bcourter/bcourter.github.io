import * as THREE from 'three';
import { Controls } from '@/features/shader-editor/types/types';

// Uniform types
interface BaseUniforms {
    [key: string]: THREE.IUniform<any>;
    u_time: THREE.IUniform<number>;
    u_mode: THREE.IUniform<number>;
}

interface MeshUniforms {
    [key: string]: THREE.IUniform<any>;
    u_effectType: THREE.IUniform<number>;
    u_sdfType: THREE.IUniform<number>;
    u_scale: THREE.IUniform<number>;
    u_posX: THREE.IUniform<number>;
    u_posY: THREE.IUniform<number>;
    u_posZ: THREE.IUniform<number>;
    u_color: THREE.IUniform<THREE.Color>;
    u_thickness: THREE.IUniform<number>;
    u_effectStrength: THREE.IUniform<number>;
    u_contrast: THREE.IUniform<number>;
}

interface RaymarchUniforms {
    [key: string]: THREE.IUniform<any>;
    u_resolution: THREE.IUniform<THREE.Vector2>;
    u_cameraPos: THREE.IUniform<THREE.Vector3>;
    u_mouse_X: THREE.IUniform<number>;
    u_mouse_Y: THREE.IUniform<number>;
    u_raymarchSteps: THREE.IUniform<number>;
    u_raymarchEpsilon: THREE.IUniform<number>;
}

export interface ShaderUniforms extends BaseUniforms, MeshUniforms, RaymarchUniforms {
    [key: string]: THREE.IUniform<any>;
}

export const createUniforms = (controls: Controls, size: { width: number, height: number }, camera: THREE.Camera): ShaderUniforms => ({
    // Base uniforms
    u_time: { value: 0 },
    u_mode: { value: controls.mode === 'Raymarching' ? 0 : 1 },

    // Mesh uniforms
    u_effectType: { value: controls.effectType === 'Bump' ? 0 : 1 },
    u_sdfType: { value: ['Gyroid', 'Sphere', 'Box', 'Torus', 'Waves'].indexOf(controls.sdfType) },
    u_scale: { value: controls.scale },
    u_posX: { value: controls.posX },
    u_posY: { value: controls.posY },
    u_posZ: { value: controls.posZ },
    u_color: { value: new THREE.Color(controls.color) },
    u_thickness: { value: controls.thickness },
    u_effectStrength: { value: controls.effectStrength },
    u_contrast: { value: controls.contrast },

    // Raymarching uniforms
    u_resolution: { value: new THREE.Vector2(size.width, size.height) },
    u_cameraPos: { value: camera.position },
    u_mouse_X: { value: 0 },
    u_mouse_Y: { value: 0 },
    u_raymarchSteps: { value: controls.raymarchSteps },
    u_raymarchEpsilon: { value: controls.raymarchEpsilon },
});