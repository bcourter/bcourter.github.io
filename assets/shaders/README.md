# Custom Shadertoy Viewer - Shader Files

This directory contains GLSL shader files for the custom Shadertoy viewer implementation.

## Background

Shadertoy recently added CAPTCHA protection, which broke the iframe embeds used throughout the blog. This custom viewer provides a local alternative using Three.js and lil-gui.

## File Structure

Each shader is stored as a `.glsl` file with the Shadertoy shader ID as the filename:

### Real Shaders (from shaders_public.json)
- `DssczX.glsl` ✓ Two-Body Field visualization - REAL CODE
- `dd2cWy.glsl` ✓ Rhombus Gradient Field - REAL CODE
- `cs2cW3.glsl` ✓ Apollonian Circles / Conic Sections - REAL CODE
- `mtKfWz.glsl` ✓ Rotational Derivative Visualization - REAL CODE

### Placeholder Shaders (need original code)
- `clV3Rz.glsl` ⚠ UGF Field Notation - Plane Intersection - PLACEHOLDER
- `dtVGRd.glsl` ⚠ Boolean Operations Comparison - PLACEHOLDER
- `4f2XzW.glsl` ⚠ Rectangle SDF with Derivatives - PLACEHOLDER
- `MdXSWn.glsl` ⚠ Fractal Tufted Furniture - PLACEHOLDER

## Shader Format

Each shader file should contain a `mainImage` function compatible with Shadertoy's format:

```glsl
void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    // Your shader code here
    // Available uniforms:
    // - iTime (float)
    // - iResolution (vec3)
    // - iMouse (vec4)
    // - iFrame (int)
    // - iTimeDelta (float)
    // - iFrameRate (float)
    // - iParam1, iParam2, iParam3, iParam4 (float) - for GUI controls
}
```

## How to Add/Replace Shader Code

### Option 1: Manual Copy from Shadertoy

1. Visit the Shadertoy page (e.g., https://www.shadertoy.com/view/DssczX)
2. Click "View Shader" or inspect the page source
3. Copy the `mainImage` function and any helper functions
4. Paste into the corresponding `.glsl` file
5. Test locally

### Option 2: Using Shadertoy API (requires API key)

If you have a Shadertoy API key:

```bash
curl "https://www.shadertoy.com/api/v1/shaders/DssczX?key=YOUR_KEY" | jq -r '.Shader.renderpass[0].code' > DssczX.glsl
```

## Current Status

### Real Shaders - All Complete! ✅ (Dec 24, 2024)
All eight blog shaders have been updated with **real code**:

**From original JSON dump:**
- `DssczX.glsl` - Two-Body Field (dropdown: 5 visualization modes)
- `dd2cWy.glsl` - Rhombus Gradient Field (slider: angle)
- `cs2cW3.glsl` - Apollonian Circles (slider: wiggle + dropdown: circles/lines)
- `mtKfWz.glsl` - Rotational Derivative (slider: wobble + dropdown: 3 shapes)

**From updated JSON dump:**
- `clV3Rz.glsl` - UGF Intersection (slider: offset + toggle: SDF mode + slider: angle)
- `dtVGRd.glsl` - UGF and Traditional Blends (slider: offset + dropdown: 7 blend modes + slider: angle)
- `4f2XzW.glsl` - Derivatives of Rectangle (slider: wobble + dropdown: 4 derivative modes)

**From user:**
- `MdXSWn.glsl` - Mandelbulb Fractal by evilryu (pure animation, no controls)

All shaders feature:
- ✓ Full Common code with Implicit struct and UGF operations
- ✓ Adapted Image code using `iParam1-4` uniforms instead of Buffer A sliders
- ✓ Shadertoy-accurate mouse behavior (iMouse.xy=position, iMouse.zw=click with sign for button state)
- ✓ Auto-sizing, transparent GUI panel in lower left
- ✓ Proper high-DPI/4K support with devicePixelRatio
- ✓ Appropriate controls (dropdowns for modes, sliders for continuous values, toggles for booleans)

## Adding New Shaders

To add a new shader to a blog post:

1. Create a new `.glsl` file in this directory with the shader ID as the filename
2. Add the shader code with the `mainImage` function
3. In your blog post, use: `{%- include extensions/shadertoy.html id='YOUR_SHADER_ID' -%}`
4. Optionally customize GUI controls in `/assets/js/shadertoy-viewer.js` by adding a case in `addShaderSpecificControls()`

## Technical Details

- **Renderer**: Three.js r160
- **GUI**: lil-gui v0.19
- **Viewer**: `/assets/js/shadertoy-viewer.js`
- **Include**: `/_includes/extensions/shadertoy.html`

## Shader-Specific GUI Controls

The viewer automatically provides appropriate controls based on the shader ID. To customize:

Edit `/assets/js/shadertoy-viewer.js` and modify the `addShaderSpecificControls()` method to add controls for your shader.

## Troubleshooting

If a shader doesn't appear:
1. Check browser console for errors
2. Verify the `.glsl` file exists and is valid GLSL
3. Ensure the shader ID matches the filename
4. Check that Three.js and lil-gui loaded successfully

## License

Original Shadertoy shaders are © their respective authors. The custom viewer implementation is part of this blog's codebase.
