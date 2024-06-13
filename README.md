# Hydro/XCPC-TOOLS

A tool for CN XCPC contests

- 代码打印和小票机打印（全平台支持）
- 支持封榜期间发放鼓励气球
- 支持连接 DOMjudge 与 Hydro 系统，同时亦可独立运行
- 选手机赛时数据监控与屏幕监控

TODO Features：

- [ ] 更好的选手机座位绑定
- [ ] 优化 UI 顺畅度
- [ ] 使用 WebSocket 返回指令执行情况
- [ ] 支持全考场监视
- [ ] 企业微信/钉钉/TG Webhook 气球机
- [ ] 滚榜

当前最新版本可直接在 [Releases](https://github.com/hydro-dev/xcpc-tools/releases/) 下载使用

### Server

Server 端分为 `Server Mode` 和 `Fetch Mode` ，在 `Fetch Mode` 下支持获取用户气球与连接小票机打印。各功能配置方法如下：

#### 安装

在 [Releases](https://github.com/hydro-dev/xcpc-tools/releases/) 下载已经封装好的 Windows、Linux、MacOS 二进制使用，如有未封装好的架构但 Node.js 支持的系统或系统内已有 Node.js 亦可下载 `xcpc-tools-bundle.js`使用。

下载后首次运行可见填写配置文件字样，打开 `config.server.yaml` ，如使用 `Fetch Mode` 请填写相关赛事系统配置，如使用 `Server Mode` 则无须填写配置可直接启动。

系统配置介绍如下：

```ts
const serverSchema = Schema.intersect([
    Schema.object({
        type: Schema.union([
            Schema.const('server'),
            Schema.const('domjudge'),
            Schema.const('hydro'),
        ] as const).description('server type').required(), // 服务类型
        port: Schema.number().default(5283), // 服务端口
        viewPass: Schema.string().default(String.random(8)), // UI登录密码，可通过 admin / {viewPass} 登录
        secretRoute: Schema.string().default(String.random(12)), // 打印路径，用于远程调用
        seatFile: Schema.string().default('/home/icpc/Desktop/seat.txt'), // 选手座位绑定文件
    }).description('Basic Config'),
    Schema.union([
        Schema.object({
            type: Schema.union([
                Schema.const('domjudge'),
                Schema.const('hydro'),
            ] as const).required(), // 赛事系统类型
            server: Schema.string().role('url').required(), // 赛事系统地址
            contestId: Schema.string(), // 赛事ID，如无则自动获取（DOMjudge），hydro 请使用 domainId/contestId 作为ID
            token: Schema.string(), // 赛事系统 Token 如无可使用用户名密码登录
            username: Schema.string(), // 赛事系统用户名
            password: Schema.string(), // 赛事系统密码
        }).description('Fetcher Config'), // token 与 username/password 二选一
        Schema.object({
            type: Schema.const('server').required(),
        }).description('Server Mode Config'),
    ]),
]);
```

填写好配置重启后即可使用，程序默认监听 0.0.0.0 ，可通过 `http://服务IP:5283` 访问 UI 界面。服务用户名为 `admin` ，密码为填写的 `viewPass` 。

#### Print

支持各类比赛系统推送打印信息，系统将自动调用 `typst` 为选手代码进行高亮并转换为 PDF 文件，由打印/气球客户端进行打印。 建议使用命令进行打印，避免服务交互数据泄漏，如需使用请从`https://github.com/hydro-dev/xcpc-tools/blob/main/scripts/print`下载脚本并提前将脚本放置在 `PATH` 中。

`print [file] [original] [language] [username] [teamname] [teamid] [location]` 为打印命令，其中 `file` 为代码文件路径，`original` 为原文件名，`language` 为语言，`username` 为用户名，`teamname` 为队伍名，`teamid` 为队伍ID，`location` 为选手位置。

#### Balloon
服务支持 `Fetch Mode` 下的气球推送，支持 `DOMjudge` 与 `Hydro` 系统，支持 `DOMjudge` 与 `Hydro` 系统的 `Balloon` 推送，同时若赛事在封榜后仍然推送气球，则支持自定义鼓励气球数，高于设定值则不推送，为所有队伍打造优质赛场体验。

#### Monitor
服务支持监控选手机情况和监控服务器桌面，如您需要选手机监控，可通过设置 Systemd 定时执行任务等多种方式定时执行 `monitor` 命令，如需监控服务器桌面，请在选手机上提前运行 `vlc-camera` 和 `vlc-desktop` 服务， CAICPC 镜像已经内置了这三两个服务，您只需在选手机上运行即可，如您为自己的镜像，可从 `https://github.com/hydro-dev/xcpc-tools/blob/main/scripts/monitor` 下载 `monitor` 服务。

当您的选手机启动了 `monitor` 服务后，服务会定时向服务器发送选手机状态，您可以在 `http://服务IP:5283/monitor` 查看选手机状态，如选手机掉线/未启动，系统会有明显提示协助找到对应机型。

由于 VLC 自带的服务不支持 CORS ， 因此产品内置了一个代理服务，代理服务会将请求转发到选手机上，您可以通过代理服务访问选手机上的 VLC 服务以实现监控。

请注意，默认上报的选手机是不支持查看屏幕的，需要在 UI 上配置选手机信息。点击选手机列表中的选手机的详情按钮，然后在弹出的对话框中即可修改选手机信息。字段含义如下：

- `Client Name` 选手机名称
- `Client group` 选手机组别
- `Camera Stream` 选手机摄像头地址（暂只支持 TS 流地址）
- `Desktop Stream` 选手机桌面地址（暂只支持 TS 流地址）

流地址可使用 `proxy://xxxx` 代理服务，`proxy://` 取代的是 `http://{ip}`， 如 `proxy://:9090/`, 此时代理服务会将请求转发到选手机 `http://{ip}:9090/` 上。

如您有可直接访问的 TS 流地址，可直接填写，您可通过 CDS 等服务获得此类流地址，注意流地址需要支持跨域访问，否则无法在 UI 上正常显示，如您的流地址不支持跨域访问，您可以使用代理服务进行转发，同时 CDS 服务提供的流在封榜后将无法观看，请自行取舍。如修改成功， Info 选项卡后便会多出桌面和摄像头的预览标签页，同时在选手机列表中也会支持直接查看选手机的摄像头和桌面。

#### Batch / Quick Operation
为了方便修改选手机信息，服务支持批量操作和根据选手机字段快速操作，如您需要批量修改选手机信息，可通过 `Batch Operation` 选项卡进行批量操作。

快速操作即你可以在对话框中填写 `[]` 指代已有的字段，如 `[hostname]`, `[ip]`, `[mac]` 等，系统会自动将对应字段填充到选手机信息中。

同时，组别名支持只取名字前缀，如 `[hostname:3]` 会取选手机名称的前三位，如您需要使用 hostname 为 AXX 的选手机 hostname 中的第一位作为组别名，您可以在快速操作中填写 `[hostname:1]`，系统会自动填充对应的选手机信息。

在字段中输入 `del` 可以删除对应字段的信息。

#### Commands
服务支持通过 `ssh` 执行命令，如您需要执行命令，内置的命令分别为 重启、根据 `config.seatFile` 选手座位绑定文件更新选手机机器名称、显示选手机座位信息。如您需要执行其他命令，请直接在 UI 界面中输入指令，系统会自动向所有选手机发送指令，并返回结果。
