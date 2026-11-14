/**
 * with-live-activity-widget — 本地 config plugin（路线图 P2：ActivityKit 灵动岛进度环）
 *
 * 在 `npx expo prebuild -p ios` 时注入 Widget Extension（Live Activity 渲染端）：
 *  1. 拷贝扩展 Swift 源码与 Info.plist 到 ios/LiveActivityWidget/（withDangerousMod）
 *  2. 向 Xcode 工程注入 app extension target（withXcodeProject）：
 *     - PBXNativeTarget，productType = com.apple.product-type.app-extension（传统 app-extension，
 *       配合 Info.plist NSExtensionPointIdentifier=com.apple.widgetkit-extension，比 extensionKit 更简单）
 *     - PRODUCT_BUNDLE_IDENTIFIER = <主 App bundle id> + ".widget"
 *     - PBXSourcesBuildPhase 编译扩展源码；LiveActivityAttributes.swift 以相对路径引用
 *       modules/live-activity/ios/ 下同一份定义（主 App pod 与扩展共享，单一事实来源）
 *     - "Embed App Extensions" copy phase 把 .appex 嵌入主 App + PBXTargetDependency
 *     - 签名：自动签名（Personal Team 可用），DEVELOPMENT_TEAM 等跟随主 target 现值
 *  3. 配置层（mod 外）确保 ios.infoPlist.NSSupportsLiveActivities = true
 *
 * 幂等：target 已存在时跳过工程改动；文件拷贝为覆盖式，重复 prebuild 安全。
 * 设计说明：刻意不使用 App Groups（Live Activity 主 App 进程内 update 即可），
 * 因为免费 Apple 账号（Personal Team）无法创建 App Groups，会卡签名。
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins');

const EXTENSION_NAME = 'LiveActivityWidget';
const MODULE_DIR = ['modules', 'live-activity'];
// 随 prebuild 拷入 ios/<EXTENSION_NAME>/ 的扩展源码（共享的 Attributes 定义除外，见下）
const EXTENSION_SOURCE_FILES = ['LiveActivityWidgetBundle.swift', 'LiveActivityWidget.swift'];
// 扩展 target 内置资源：[{ src: 主工程相对路径, dst: 扩展目录内文件名 }]（Swift 里 Image("DefaultCover") 引用）
const EXTENSION_RESOURCES = [{ src: ['assets', 'icon.png'], dst: 'DefaultCover.png' }];
// 主 App（LiveActivity pod）与扩展共享的 ActivityAttributes，扩展以相对路径引用，不拷贝
const SHARED_ATTRIBUTES_REL_PATH = ['..', 'modules', 'live-activity', 'ios', 'LiveActivityAttributes.swift'];

function extensionInfoPlistXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDevelopmentRegion</key>
	<string>$(DEVELOPMENT_LANGUAGE)</string>
	<key>CFBundleDisplayName</key>
	<string>英语学习</string>
	<key>CFBundleExecutable</key>
	<string>$(EXECUTABLE_NAME)</string>
	<key>CFBundleIdentifier</key>
	<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
	<key>CFBundleInfoDictionaryVersion</key>
	<string>6.0</string>
	<key>CFBundleName</key>
	<string>$(PRODUCT_NAME)</string>
	<key>CFBundlePackageType</key>
	<string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
	<key>CFBundleShortVersionString</key>
	<string>$(MARKETING_VERSION)</string>
	<key>CFBundleVersion</key>
	<string>$(CURRENT_PROJECT_VERSION)</string>
	<key>NSExtension</key>
	<dict>
		<key>NSExtensionPointIdentifier</key>
		<string>com.apple.widgetkit-extension</string>
	</dict>
	<key>NSSupportsLiveActivities</key>
	<true/>
</dict>
</plist>
`;
}

/** 拷贝扩展源码 + 写 Info.plist（dangerous mod 在所有 iOS mod 之前执行，先于工程注入） */
function withExtensionSources(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const srcDir = path.join(projectRoot, ...MODULE_DIR, 'extension');
      const dstDir = path.join(projectRoot, 'ios', EXTENSION_NAME);

      if (!fs.existsSync(srcDir)) {
        console.warn(
          `[with-live-activity-widget] 缺少扩展源码目录 ${srcDir}，跳过拷贝（extension 将无法编译）`
        );
        return config;
      }
      fs.mkdirSync(dstDir, { recursive: true });
      for (const file of EXTENSION_SOURCE_FILES) {
        fs.copyFileSync(path.join(srcDir, file), path.join(dstDir, file));
      }
      for (const res of EXTENSION_RESOURCES) {
        const resSrc = path.join(projectRoot, ...res.src);
        if (fs.existsSync(resSrc)) {
          fs.copyFileSync(resSrc, path.join(dstDir, res.dst));
        } else {
          console.warn(`[with-live-activity-widget] 缺少扩展资源 ${resSrc}，跳过拷贝`);
        }
      }
      fs.writeFileSync(path.join(dstDir, 'Info.plist'), extensionInfoPlistXml(), 'utf8');
      return config;
    }
  ]);
}

/** 已存在 target 时定位其扩展组与 target uuid（幂等重跑用） */
function findExtensionTargetAndGroup(proj) {
  const target = proj.pbxTargetByName(EXTENSION_NAME);
  if (!target) return null;
  const groups = proj.hash.project.objects.PBXGroup ?? {};
  for (const [uuid, group] of Object.entries(groups)) {
    if (uuid.endsWith('_comment') || group.name !== EXTENSION_NAME) continue;
    return { targetUuid: target.uuid, groupUuid: uuid };
  }
  return { targetUuid: target.uuid, groupUuid: undefined };
}

/** 注册扩展资源到 target 的 Resources phase（hasFile 判重，幂等） */
function ensureExtensionResources(proj, targetUuid, groupUuid) {
  const resolved = targetUuid ? { targetUuid, groupUuid } : findExtensionTargetAndGroup(proj);
  if (!resolved) return;
  for (const res of EXTENSION_RESOURCES) {
    if (proj.hasFile(res.dst)) continue;
    proj.addResourceFile(res.dst, { target: resolved.targetUuid }, resolved.groupUuid);
  }
}

/** 读取主 target（第一个）某配置项现值；找不到返回 undefined */
function getMainTargetSetting(proj, name) {
  try {
    const mainTarget = proj.getFirstTarget();
    const configs = proj.pbxXCBuildConfigurationSection();
    const listUuid = mainTarget.pbxNativeTarget.buildConfigurationList;
    const configList = proj.hash.project.objects.XCConfigurationList[listUuid];
    for (const bc of configList.buildConfigurations) {
      const value = configs[bc.value]?.buildSettings?.[name];
      if (value != null) return value;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

/** 向 Xcode 工程注入 extension target（幂等） */
function addExtensionTarget(config, proj) {
  if (proj.pbxTargetByName(EXTENSION_NAME)) {
    // 已注入（prebuild 多次同步）：仅确保资源文件已注册（addResourceFile 幂等，重复调用会重复挂 BuildFile）
    ensureExtensionResources(proj);
    return;
  }

  const bundleId = `${config.ios?.bundleIdentifier ?? 'app'}.widget`;
  const target = proj.addTarget(EXTENSION_NAME, 'app_extension', EXTENSION_NAME, bundleId);

  // ---- Sources / Resources 编译阶段 ----
  // Resources phase 必须先建：addResourceFile 挂 BuildFile 时依赖 target 已有 Resources phase，
  // 否则 xcode 库会把资源兜底挂到第一个 target（主 App）
  proj.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', target.uuid);
  proj.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid);

  // ---- 文件组（Xcode 导航器展示） ----
  const group = proj.addPbxGroup([], EXTENSION_NAME, EXTENSION_NAME);
  const mainGroupUuid = proj.getFirstProject().firstProject.mainGroup;
  const mainGroup = proj.hash.project.objects.PBXGroup[mainGroupUuid];
  if (mainGroup && !mainGroup.children.some((c) => c.value === group.uuid)) {
    mainGroup.children.push({ value: group.uuid, comment: EXTENSION_NAME });
  }

  // 扩展自身源码（相对组路径 = ios/<EXTENSION_NAME>/）
  for (const file of EXTENSION_SOURCE_FILES) {
    proj.addSourceFile(file, { target: target.uuid }, group.uuid);
  }
  // 共享 ActivityAttributes（相对组路径 ../modules/...，与主 App pod 编译同一份定义）
  proj.addSourceFile(path.posix.join(...SHARED_ATTRIBUTES_REL_PATH), { target: target.uuid }, group.uuid);
  // Info.plist 仅作导航展示，构建走 INFOPLIST_FILE
  proj.addFile('Info.plist', group.uuid);

  ensureExtensionResources(proj, target.uuid, group.uuid);

  // ---- 构建配置：跟随主 target 的签名/版本/deployment target，覆盖 plist 路径 ----
  const configs = proj.pbxXCBuildConfigurationSection();
  const configList = proj.hash.project.objects.XCConfigurationList[target.pbxNativeTarget.buildConfigurationList];
  const mainTeam = getMainTargetSetting(proj, 'DEVELOPMENT_TEAM');
  const inheritedSettings = {
    DEVELOPMENT_TEAM: mainTeam,
    MARKETING_VERSION: getMainTargetSetting(proj, 'MARKETING_VERSION') ?? '1.0',
    CURRENT_PROJECT_VERSION: getMainTargetSetting(proj, 'CURRENT_PROJECT_VERSION') ?? '1',
    SWIFT_VERSION: getMainTargetSetting(proj, 'SWIFT_VERSION') ?? '5.0',
    TARGETED_DEVICE_FAMILY: getMainTargetSetting(proj, 'TARGETED_DEVICE_FAMILY') ?? '"1,2"',
    IPHONEOS_DEPLOYMENT_TARGET: getMainTargetSetting(proj, 'IPHONEOS_DEPLOYMENT_TARGET') ?? '16.4'
  };
  for (const bc of configList.buildConfigurations) {
    const buildSettings = configs[bc.value].buildSettings;
    Object.assign(buildSettings, {
      PRODUCT_BUNDLE_IDENTIFIER: `"${bundleId}"`,
      INFOPLIST_FILE: `"${EXTENSION_NAME}/Info.plist"`,
      // 自动签名：Personal Team 用 -allowProvisioningUpdates 即可生成扩展的 profile
      CODE_SIGN_STYLE: 'Automatic',
      SWIFT_EMIT_LOC_STRINGS: 'YES',
      ...inheritedSettings
    });
    if (bc.comment === 'Debug') {
      buildSettings.SWIFT_ACTIVE_COMPILATION_CONDITIONS = 'DEBUG';
    }
  }

  // ---- 把 xcode 库默认创建的 "Copy Files" 嵌入阶段改名为 "Embed App Extensions"（仅展示名）----
  // 仅当工程此前不存在任何 CopyFiles 阶段时改名，避免误改其他插件创建的阶段
  const copyFilesSection = proj.hash.project.objects.PBXCopyFilesBuildPhase ?? {};
  const existingCopyPhases = Object.keys(copyFilesSection).filter((k) => !k.endsWith('_comment'));
  if (existingCopyPhases.length === 1) {
    for (const key of Object.keys(copyFilesSection)) {
      if (key.endsWith('_comment') && copyFilesSection[key] === 'Copy Files') {
        copyFilesSection[key] = 'Embed App Extensions';
      }
    }
    const appTarget = proj.getFirstTarget();
    for (const phase of appTarget.pbxNativeTarget.buildPhases) {
      if (phase.comment === 'Copy Files') phase.comment = 'Embed App Extensions';
    }
  }
}

function withExtensionTarget(config) {
  return withXcodeProject(config, (config) => {
    addExtensionTarget(config, config.modResults);
    return config;
  });
}

/** 配置层改动放 mod 外（对所有 config 场景生效），确保灵动岛开关打开 */
function withLiveActivitiesPlist(config) {
  if (!config.ios) config.ios = {};
  if (!config.ios.infoPlist) config.ios.infoPlist = {};
  config.ios.infoPlist.NSSupportsLiveActivities = true;
  return config;
}

const withLiveActivityWidget = (config) => {
  config = withLiveActivitiesPlist(config);
  config = withExtensionTarget(config);
  config = withExtensionSources(config);
  return config;
};

module.exports = withLiveActivityWidget;
