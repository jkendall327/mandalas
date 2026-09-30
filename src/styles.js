// Visual styles. A style sets the palette family, how thin the lines are and
// how much light they throw. Structure comes from the seed and does not change
// with the style.
export const STYLES = {
  neon: {
    label: 'Neon',
    palettes: [
      { main: ['#f2c25e', '#f0563c', '#4f7dff', '#3fd6a6'], fine: '#fff0d2', frame: '#d9a94a' },
      { main: ['#ff7aa3', '#ffd07a', '#9a78ff', '#4fd8d0'], fine: '#fff0e6', frame: '#c9a5ff' },
      { main: ['#ffa640', '#ec3d55', '#ffdf8f', '#6f7bff'], fine: '#fff3dc', frame: '#e58a3a' },
      { main: ['#45e2cb', '#4a80ff', '#ffb6cc', '#f5cf78'], fine: '#eafcff', frame: '#6fb7e0' },
    ],
    lineW: 0.0013, glow: 0.22, bloom: [0.3, 0.16, 0.07, 0.04], exposure: 1.35, heat: 1.4, tip: 1.8,
    bg: '#070912', bgLift: 2.2, dust: 0.55,
  },
  gilt: {
    label: 'Gilt',
    palettes: [
      { main: ['#f2c96f', '#f8e8b8', '#d59d48', '#e0684c'], fine: '#fff3d4', frame: '#d9ac55' },
      { main: ['#f2c96f', '#f8e8b8', '#d59d48', '#8ea2ee'], fine: '#fff3d4', frame: '#d9ac55' },
      { main: ['#f5d078', '#dba650', '#fbeec6', '#b4c2f2'], fine: '#fff6dc', frame: '#cfa252' },
    ],
    lineW: 0.0013, glow: 0.2, bloom: [0.3, 0.15, 0.06, 0.03], exposure: 1.3, heat: 1.1, tip: 1.5,
    bg: '#070a20', bgLift: 1.5, dust: 0.55,
  },
  lacquer: {
    label: 'Lacquer',
    palettes: [
      { main: ['#e6442b', '#f2c25e', '#f6e8c8', '#b7301c'], fine: '#f9ecd0', frame: '#c98a3a' },
      { main: ['#dd3a3a', '#e9b25a', '#f4dfba', '#8f2a26'], fine: '#f9ecd0', frame: '#b9793a' },
    ],
    lineW: 0.0012, glow: 0.16, bloom: [0.24, 0.12, 0.05, 0.03], exposure: 1.15, heat: 1.0, tip: 1.4,
    bg: '#0d0706', bgLift: 1.8, dust: 0.5,
  },
  // dark pigment on warm paper: strokes absorb light instead of adding it
  ink: {
    label: 'Ink',
    ink: true,
    paper: '#eee4cd',
    absorb: 4.2,
    palettes: [
      { main: ['#1a191f', '#b23520', '#25437f', '#a8742b'], fine: '#3a3641', frame: '#2b2932' },
      { main: ['#1a191f', '#2e5f57', '#b23520', '#a8742b'], fine: '#3a3641', frame: '#2b2932' },
      { main: ['#1a191f', '#25437f', '#8a3b55', '#a8742b'], fine: '#3a3641', frame: '#2b2932' },
    ],
    lineW: 0.0016, glow: 0.1, bloom: [0.12, 0.06, 0.02, 0.01], exposure: 1, heat: 0.7, tip: 0.6,
    bg: '#000000', bgLift: 0, dust: 0.5, grain: 0,
  },
  // coloured grains poured onto dark stone
  sand: {
    label: 'Sand',
    palettes: [
      { main: ['#dba53f', '#c9533a', '#3f6bbd', '#e8e0cc'], fine: '#f0e7d0', frame: '#cf9c47' },
      { main: ['#55a172', '#dba53f', '#bd4630', '#e8e0cc'], fine: '#f0e7d0', frame: '#cf9c47' },
      { main: ['#e8e0cc', '#c9533a', '#dba53f', '#4d7fb8'], fine: '#f0e7d0', frame: '#cf9c47' },
    ],
    lineW: 0.0021, glow: 0.05, bloom: [0.07, 0.03, 0.01, 0.0], exposure: 1.7, heat: 0.4, tip: 0.7,
    bg: '#120e0b', bgLift: 0.8, dust: 0.6, grain: 0.85,
  },
};
export const STYLE_ORDER = ['neon', 'gilt', 'lacquer', 'ink', 'sand'];
