# terics 用户指南（v0.6.0-rc.1）

本指南覆盖 URL-first 流程、扩展安装、文件回退、课程删除、Google Calendar 同步和隐私操作。

## 1. 拖入教务系统网址

1. 打开 <https://styayur.github.io/terics/>。
2. 将教务系统地址拖到 **Drop your university portal URL** 区域。
3. 也可以粘贴或手动输入地址，然后点击“识别学校”。

Resolver 只在浏览器本地检查 URL。它不会把网址发送到 terics 服务器，也不会由 GitHub Pages 代理抓取其他网站。

支持的结果：

- `VERIFIED`：有精确学校/Connector 证据，例如 WHUT 的有限验证范围。
- `EXPERIMENTAL`：仅识别到系统供应商特征，不能保证该学校字段兼容。
- `UNKNOWN`：没有可信指纹；使用 Generic DOM 或文件回退。

## 2. 安装 Chrome / Edge 扩展

1. 下载 Release 中的 `terics-extension-v0.6.0-rc.1.zip` 并解压。
2. 打开 Edge 的 `edge://extensions` 或 Chrome 的 `chrome://extensions`。
3. 开启“开发人员模式”。
4. 选择“加载解压缩的扩展”，指向解压目录。
5. 扩展只应显示 `activeTab`、`scripting`、`storage` 权限。

扩展没有 `<all_urls>`、固定 host permissions，也不会读取 Cookie 数据库。

## 3. 登录学校教务系统

1. 点击 Resolver 结果中的“打开教务系统”。
2. 在正常学校页面完成登录、MFA 或 CAPTCHA。
3. 进入学生课表页面。
4. 如果登录过期，重新手动登录；terics 不会绕过学校认证。

不要把密码、验证码、Cookie 或 Token 发给任何人，包括助手。

## 4. 从扩展提取课表

1. 确认当前标签页是已登录的课表页面。
2. 点击 terics 扩展。
3. 检查“当前学校 / Connector / 页面匹配”状态。
4. 确认第 1 周周一、教学周数、学期名称和节次。
5. 点击“检测并提取当前课表”。
6. 核对课程数、上课实例数、事件数、冲突数和验证状态。
7. 点击“在 Web 中打开（一次性 handoff）”。

扩展会把标准化数据写入本地扩展存储。Web URL 只包含 `requestId`、`nonce`、扩展 ID、目标来源和过期时间，不含课表内容。Web 领取成功后立即消费记录并清除 fragment。

## 5. 检查课表

重点检查：

- 学校与学期是否为当前学期
- 第 1 周周一是否正确
- 每个节次开始/结束时间
- 单双周和不连续周次
- 停课、补课、调课和教室变化
- 课程冲突
- 教师/教室缺失提示

发现异常时，先在“确认学期与节次”修正时间，再重新预览。

## 6. 导出 ICS

1. 检查右侧事件数量和日期范围。
2. 若存在冲突，勾选“我已检查冲突，仍要导出全部事件”。
3. 点击“下载 .ics 文件”。
4. 在 Google Calendar 中打开“设置 → 导入和导出”。
5. 上传 ICS，选择目标日历。

也可以下载 `.terics.json` 保存可编辑的 Schema 2.0 数据。

## 7. 使用 JSON

`.terics.json` 是 Web、扩展和 Python 之间的交换格式。它可用于：

- 重新导入 Web
- 在 Python Desktop 打开
- 保留学期、节次、课程身份和调课记录
- 迁移或自动测试

不要手工加入密码、Cookie、Token、Session 或 CSRF 字段；Schema 校验会拒绝认证字段。

## 8. 处理不支持的学校

1. 如果 Resolver 显示 `UNKNOWN`，terics 不会猜测 API。
2. 可在已登录课表页面尝试 Generic DOM。
3. 如果 DOM 无法解析，请使用学校官方 CSV/XLSX/HTML 导出，再拖入文件区域。
4. 不要向项目提交真实课表、账号或认证信息。

新增学校需要学校域名、页面结构、脱敏 fixture、Connector 和真实环境验收证据。

## 9. 登录过期

常见表现：

- HTTP 401/403
- 返回统一认证页面而不是课表
- 页面显示“登录超时”
- 提取结果为空但浏览器仍显示页面框架

处理：

1. 回到学校网页重新登录。
2. 刷新并确认已进入学生课表。
3. 再次点击扩展提取。
4. 若仍失败，下载学校官方导出文件并使用文件回退。

## 10. 整门课程删除

1. 点击课程块打开详情。
2. 选择 `Remove this course for the semester`。
3. 核对课程、学期、教师、教室、周次、实例数和精确 `courseId`。
4. 选择范围：仅文件、仅 Google Calendar、或两者。
5. 勾选不可恢复确认。
6. 点击“确认移除课程”。

本地操作默认下载新 `.terics.json`，不覆盖原文件。Google Calendar 删除只匹配指定 `calendarId` 中 `tericsManaged=true` 且 `tericsCourseId` 精确一致的事件。同名但缺少可信身份的事件会跳过。

## 11. 保护个人课表数据

- 优先使用独立 terics Calendar，而不是私人主日历。
- 删除 Calendar 事件前下载 ICS 备份。
- 不在 Issue、PR、聊天或截图中提交真实课表。
- Web 关闭页面时撤销 Google access token。
- Python refresh token 保存在系统 keyring；可随时清除。
- 扩展本地数据可在 popup 底部清除。

## 12. Google Calendar 状态

如果 GitHub Pages 构建没有配置 `VITE_GOOGLE_CLIENT_ID`：

- 直接同步面板会显示不可用
- ICS 导出仍然完整可用
- 不会通过代理或 Client Secret 绕过 OAuth

如果已经配置：

- 先选择或输入目标 calendarId
- 预览 Create / Update / Skip / Conflict / Delete
- 空课表或验证失败时禁止删除
- 检测到事件被手动修改时跳过覆盖
- 删除候选需要额外确认

真实账号授权与 Calendar 网页端验收不能由 mock 替代。正式使用前请按 `docs/google-calendar.md` 完成你自己的独立测试日历验收。
