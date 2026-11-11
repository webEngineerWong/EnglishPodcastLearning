/** afterPack：关闭 asar 完整性校验（与 ad-hoc 重签兼容），自动重置签名 */
const { flipFuses, FuseV1Options } = require('@electron/fuses');
const path = require('path');

exports.default = async function afterPack(context) {
  const appDir =
    context.electronPlatformName === 'darwin'
      ? path.join(context.appOutDir, `${context.packager.appInfo.productName}.app`)
      : context.appOutDir;
  await flipFuses(appDir, {
    version: '1',
    resetAdHocDarwinSignature: true,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false
  });
  console.log(`[fuses] asar integrity disabled for ${appDir}`);
};
