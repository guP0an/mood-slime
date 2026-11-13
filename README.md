# 心晴 · 桌面心情史莱姆

在 macOS 桌面陪伴你的 3D 心情小球。支持按分钟记录心情、查看日历和每日回顾，数据保存在本机。

当前版本：0.13.0。

## 功能

- 十种心情及独立表情：平静、开心、难过、焦虑、烦躁、疲惫、无奈、无语、要死了、好困。
- 好困采用雾蓝色、柔和黑眼圈、沉眼皮和小哈欠，慢眨眼时上下眼睑自然合拢。
- 平静戴大黑框眼镜；七种新神态支持独立眼睑和瞳孔裁切，焦虑扫视带停顿并响应鼠标。开心弯眼露齿笑、愤怒及“要死了”的悬挂吐舌造型沿用原版。
- 透明置顶桌面小窗，默认 170 × 150，可缩放、移动或开启鼠标跟随。
- 按住压扁、拖动拉伸、松手回弹，支持减少动态效果。
- 心情时间轴、区间留言、日历、每日回顾和 JSON 导出。
- 导入 PNG、JPEG、WebP、GIF、APNG 作为可变形皮肤。
- 可选的 Codex 消息提醒，相关代码位于 `scripts/`；构建与心情记录不依赖通知安装。
- 完成提醒会按本机 Codex 的逐会话、逐回合已读回执清除；待批准/待回答保留，纸条右下角“都看过了”可清理旧提醒。已读同步依赖客户端内部回执格式，格式不可用或事件缺少回合标识时保留提醒，不猜测已读；不修改 Codex 数据库，也不代替审批。
- 桌面消息气泡与小球之间预留顶部间距；开启“跟随鼠标”才会把小球带到鼠标所在显示器；关闭后留在手动放置的屏幕，显示器断开时自动找回。

## 构建和启动

需要 macOS 13 或更高版本及 Xcode Command Line Tools。应用使用 AppKit、WKWebView 和仓库内的 Three.js，不需要安装 npm 依赖。

```sh
bash build.sh
open 'dist/心晴.app'
```

构建产生本机临时签名的应用，尚未进行 Apple 公证；此仓库不包含构建产物。

## 使用

选择心情后，点击“记下此刻”保存。只切换表情不生成记录。

点击“放到桌面”切换为透明小窗。右键打开菜单，可换心情、调整大小、移动、回到日历或退出。普通按住小球进行揉捏；按住 Option 拖动移动窗口，滚轮或触控板捏合缩放。

应用中的“换个模样”支持图片和动图皮肤；导入皮肤不会自动生成新的三维模型。

## 数据与隐私

存档位于 `~/Library/Application Support/MoodSlime/`，包括 `moods.json`、备份和皮肤图集。备份时请保存整个目录；不要通过删除存档来修复界面问题。

本仓库不包含心情记录、聊天交接、个人截图、认证凭据或运行日志。通知集成仅处理生命周期标识和本地聊天标题，不存储消息正文；安装通知脚本会修改用户级 hook 配置，应先审阅脚本。

## 验证

模型与物理检查需要 Node.js，通知脚本检查需要 Python 3。

```sh
node tests/model.cjs
node tests/physics.cjs
node tests/expression.cjs
node tests/expression-mesh.cjs
python3 tests/codex-hook.py
bash build.sh
'dist/心晴.app/Contents/MacOS/MoodSlime' --storage-test
open -n -W 'dist/心晴.app' --args --self-test --artifacts "$PWD/outputs/self-test"
codesign --verify --deep --strict 'dist/心晴.app'
```

原生界面检查需在解锁且可见的 macOS 桌面运行，使用临时合成存档。检查完成后查看 `outputs/self-test/integration.json` 的实际结果。长时能耗、其他系统版本和最终视觉偏好需分别验收。

## 结构

- `App.m`：原生窗口、菜单、WebKit 桥接及通知界面。
- `Store.m`：存档校验、原子保存、备份及图片解码。
- `CodexAlerts.m`：本地通知事件读取与去重。
- `web/`：日历、心情模型、Three.js 角色和形变逻辑。
- `scripts/`：可选通知桥接与安装工具。
- `tests/`：模型、物理、通知及原生回归检查。

Three.js 的版本和来源见 `web/vendor/PROVENANCE.json`，第三方许可证见 `web/vendor/THREE-LICENSE.txt`。
