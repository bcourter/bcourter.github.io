# Custom Shadertoy Viewer - Shader Files

This directory contains GLSL shader files for the custom Shadertoy viewer implementation.

## Background

Shadertoy recently added CAPTCHA protection, which broke the iframe embeds used throughout the blog. This custom viewer provides a local alternative using Three.js and lil-gui.

## File Structure

Each shader is stored as a `.glsl` file with the Shadertoy shader ID as the filename:
- `DssczX.glsl` - Two-Body Field visualization
- `dd2cWy.glsl` - Rhombus Gradient Field
- `cs2cW3.glsl` - Apollonian Circles / Conic Sections
- `clV3Rz.glsl` - UGF Field Notation - Plane Intersection
- `dtVGRd.glsl` - Boolean Operations Comparison
- `4f2XzW.glsl` - Rectangle SDF with Derivatives
- `mtKfWz.glsl` - Rotational Derivative Visualization
- `MdXSWn.glsl` - Fractal Tufted Furniture

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

The current shader files are **placeholder implementations** that demonstrate the mathematical concepts but are not the original Shadertoy code. To get the full, original visualizations:

1. Visit each Shadertoy link in the shader file header
2. Copy the actual shader code
3. Replace the placeholder content

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
