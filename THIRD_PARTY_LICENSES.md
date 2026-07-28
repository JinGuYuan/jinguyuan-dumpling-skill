# 第三方组件清单

本 Skill 发布包中的 scripts/jgy.cjs 为构建产物（esbuild bundle，明文未混淆），融合了以下上游依赖：

| 组件 | 版本 | 许可证 | 说明 |
|---|---|---|---|
| qrcode | 1.5.4 | MIT | 二维码 PNG 生成（含依赖 pngjs/MIT、dijkstrajs/MIT），bundle 进 jgy.cjs |
| @mtuser/pt-passport | 0.1.4 | 上游专有 | 美团 Passport 签名件，预构建混淆代码，原样外置于 scripts/vendor/pt-passport/，不参与 bundle；随包入口已移除后台守护/动态更新/http 全局拦截 |

金谷园自有代码以 MIT 许可发布（见 LICENSE）。上游完整性摘要见 scripts/vendor/manifest.json。
