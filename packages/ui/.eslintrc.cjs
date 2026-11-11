const { join } = require('path');
module.exports = {
  root: true,
  extends: [join(__dirname, '../../packages/config/eslint-base.cjs')]
};
