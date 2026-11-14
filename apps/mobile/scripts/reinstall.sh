#!/bin/bash
# 一键：增量构建 → 重装到 iPhone → 启动 → 打包 ipa 到桌面
# 用途：免费签名 7 天到期续期、代码更新后重装（USB 连接手机后运行）
#
# 设备 ID 与私有部署地址属于隐私不入库：本地在同目录建 .env.device（已被 .gitignore 忽略）：
#   export ELP_DEVICE_UDID=<你的设备UDID>       # xcrun devicectl list devices 查看
#   export ELP_COREDEVICE_ID=<CoreDeviceID>
#   export ELP_TUNNEL_URL=https://your-tunnel-domain.example   # 外网隧道地址（可选）
#   export ELP_LAN_URL=http://192.168.1.100:3001               # 局域网地址（可选）
# 打包时自动把源码占位符（your-tunnel-domain.example / 192.168.1.100:3001）
# 替换为上面的真实地址，构建完成后再还原源码（保持仓库干净）。
set -eo pipefail
cd "$(dirname "$0")"
[ -f .env.device ] && source .env.device
cd ..

DEVICE_ID="${ELP_DEVICE_UDID:?缺少 ELP_DEVICE_UDID —— 见 scripts/.env.device 模板或 xcrun devicectl list devices}"
CORE_ID="${ELP_COREDEVICE_ID:?缺少 ELP_COREDEVICE_ID}"
BUNDLE_ID="com.zubulun.englishhub"

APP="$HOME/Library/Developer/Xcode/DerivedData/app-bfdirhjmtwbgpgdegukgxbftyrwc/Build/Products/Release-iphoneos/app.app"
BUILD_LOG="/tmp/elp-xcodebuild.log"

# ── 私有部署地址注入：占位符 ↔ 真实地址（源码不入库） ──
MOBILE_ROOT="$(pwd)"
INJECT_FILES=("$MOBILE_ROOT/App.tsx" "$MOBILE_ROOT/modules/live-activity/extension/LiveActivityWidget.swift")
restore_placeholder() {
  [ -n "${ELP_TUNNEL_URL:-}" ] && sed -i '' "s|$ELP_TUNNEL_URL|https://your-tunnel-domain.example|g" "${INJECT_FILES[@]}" 2>/dev/null || true
  [ -n "${ELP_LAN_URL:-}" ] && sed -i '' "s|$ELP_LAN_URL|http://192.168.1.100:3001|g" "${INJECT_FILES[@]}" 2>/dev/null || true
}
if [ -n "${ELP_TUNNEL_URL:-}" ]; then
  echo "==> 注入私有部署地址（隧道）到源码占位符"
  sed -i '' "s|https://your-tunnel-domain.example|$ELP_TUNNEL_URL|g" "${INJECT_FILES[@]}"
fi
if [ -n "${ELP_LAN_URL:-}" ]; then
  echo "==> 注入私有部署地址（局域网）到源码占位符"
  sed -i '' "s|http://192.168.1.100:3001|$ELP_LAN_URL|g" "${INJECT_FILES[@]}"
fi
trap restore_placeholder EXIT

echo "==> 清理旧产物标记，确保不使用失效旧包"
rm -rf "$APP"

echo "==> 构建 Release（日志实时记录在 $BUILD_LOG）..."
cd ios
if ! xcodebuild -workspace app.xcworkspace -scheme app -configuration Release \
  -destination "platform=iOS,id=$DEVICE_ID" -allowProvisioningUpdates build > "$BUILD_LOG" 2>&1; then
  echo "❌ xcodebuild 构建失败！最后 30 行错误详情："
  tail -n 30 "$BUILD_LOG"
  exit 1
fi

if [ ! -d "$APP" ]; then
  echo "❌ 构建未生成预期的 app 目录: $APP"
  tail -n 30 "$BUILD_LOG"
  exit 1
fi

echo "✅ 构建成功"

echo "==> 安装到 iPhone"
xcrun devicectl device install app --device "$CORE_ID" "$APP" 2>&1 | grep -E "App installed|ERROR" || true

echo "==> 打包 ipa 到桌面"
rm -rf /tmp/elp-ipa && mkdir -p /tmp/elp-ipa/Payload
cp -R "$APP" /tmp/elp-ipa/Payload/
(cd /tmp/elp-ipa && zip -qry "$HOME/Desktop/英语学习.ipa" Payload)
echo "    ~/Desktop/英语学习.ipa"

echo "==> 启动（手机需解锁）"
xcrun devicectl device process launch --device "$CORE_ID" "$BUNDLE_ID" 2>&1 | tail -1

echo "==> 完成。签名 7 天有效，到期后重跑本脚本即可。"
