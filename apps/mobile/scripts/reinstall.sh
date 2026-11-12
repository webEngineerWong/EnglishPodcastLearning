#!/bin/bash
# 一键：增量构建 → 重装到 iPhone → 启动 → 打包 ipa 到桌面
# 用途：免费签名 7 天到期续期、代码更新后重装（USB 连接手机后运行）
#
# 设备 ID 属于隐私不入库：本地在同目录建 .env.device（已被 .gitignore 忽略）：
#   export ELP_DEVICE_UDID=<你的设备UDID>       # xcrun devicectl list devices 查看
#   export ELP_COREDEVICE_ID=<CoreDeviceID>
set -e
cd "$(dirname "$0")"
[ -f .env.device ] && source .env.device
cd ios

DEVICE_ID="${ELP_DEVICE_UDID:?缺少 ELP_DEVICE_UDID —— 见 scripts/.env.device 模板或 xcrun devicectl list devices}"
CORE_ID="${ELP_COREDEVICE_ID:?缺少 ELP_COREDEVICE_ID}"
BUNDLE_ID="com.myenglishlearning.app"

echo "==> 构建 Release（增量，约 1-3 分钟）"
xcodebuild -workspace app.xcworkspace -scheme app -configuration Release \
  -destination "platform=iOS,id=$DEVICE_ID" -allowProvisioningUpdates build \
  2>&1 | grep -E "BUILD|error:" | tail -3

APP="$HOME/Library/Developer/Xcode/DerivedData/app-bfdirhjmtwbgpgdegukgxbftyrwc/Build/Products/Release-iphoneos/app.app"

echo "==> 安装到 iPhone"
xcrun devicectl device install app --device "$CORE_ID" "$APP" 2>&1 | grep -E "App installed|ERROR"

echo "==> 打包 ipa 到桌面"
rm -rf /tmp/elp-ipa && mkdir -p /tmp/elp-ipa/Payload
cp -R "$APP" /tmp/elp-ipa/Payload/
(cd /tmp/elp-ipa && zip -qry "$HOME/Desktop/英语学习.ipa" Payload)
echo "    ~/Desktop/英语学习.ipa"

echo "==> 启动（手机需解锁）"
xcrun devicectl device process launch --device "$CORE_ID" "$BUNDLE_ID" 2>&1 | tail -1

echo "==> 完成。签名 7 天有效，到期后重跑本脚本即可。"
