# LiveActivity — 本地 Expo 模块 podspec（expo-modules-autolinking 会扫描 modules/<name>/ios/*.podspec）
# 注意：podspec 目录即 Pod 根目录，source_files 相对本文件所在目录（ios/）。
Pod::Spec.new do |s|
  s.name           = 'LiveActivity'
  s.version        = '1.0.0'
  s.summary        = 'ActivityKit Live Activity bridge for the English Learning Platform'
  s.description    = 'Expo Modules API 桥接：向 JS 暴露 Live Activity 的 start/update/stop 与 areActivitiesEnabled。'
  s.license        = { :type => 'MIT' }
  s.author         = { 'english-learning-platform' => 'dev@example.com' }
  s.homepage       = 'https://example.com/english-learning-platform'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.0'
  s.source         = { :path => '.' }
  s.source_files   = '**/*.{h,m,mm,swift}'
  s.frameworks     = 'ActivityKit'
  s.dependency 'ExpoModulesCore'
end
