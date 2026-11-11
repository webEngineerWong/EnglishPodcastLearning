/**
 * 修复 multer/busboy 把 UTF-8 文件名按 Latin-1 解码造成的乱码。
 * 中文文件名会变成 "ï¼è¯æ..." 形态；按 latin1 重编码回字节流再用 utf8 解码即恢复。
 * 纯 ASCII 名不受影响（latin1 与 utf8 同值）。
 */
export function fixFilename(name: string): string {
  if (!/[ÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/.test(name)) {
    return name;
  }
  try {
    const fixed = Buffer.from(name, 'latin1').toString('utf8');
    // 修复后不应再含 latin1 扩展字符（否则原字符串本来就是合法 utf8，不处理）
    if (!/[ÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/.test(fixed)) {
      return fixed;
    }
  } catch {
    /* 保持原名 */
  }
  return name;
}
