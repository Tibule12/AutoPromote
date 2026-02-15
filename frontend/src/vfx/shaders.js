// Green Screen Shader (Chroma Key)
// Removes specific green/blue range and allows alpha transparency
export const greenScreenFrag = `
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform float threshold;
uniform float smoothing;
uniform vec3 keyColor; // RGB of the green screen (usually 0.0, 1.0, 0.0)

void main(void) {
    vec2 uv = vTextureCoord;
    vec4 color = texture2D(uSampler, uv);
    
    // Calculate difference between current pixel and key color
    // Using YUV/YCbCr distance is better, but RGB distance is cheaper and works for bright green
    float diff = length(color.rgb - keyColor);
    
    // Create alpha mask
    // If diff < threshold, it's green (alpha 0)
    // Smoothstep creates soft edges to avoid jagged lines
    float edge = smoothstep(threshold, threshold + smoothing, diff);
    
    // Apply mask to alpha channel
    color.a *= edge;

    // Spill suppression: Desaturate green edges slightly to remove green halo
    if (color.g > color.r && color.g > color.b) {
       color.g = (color.r + color.b) / 2.0; 
    }

    gl_FragColor = color;
}
`;
