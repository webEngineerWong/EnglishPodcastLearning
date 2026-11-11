const preset = require('@elp/config/tailwind-preset.cjs');

module.exports = {
  presets: [preset],
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}', '../../packages/player/src/**/*.{ts,tsx}']
};
