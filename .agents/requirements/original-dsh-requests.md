# 原始 DSH 用户需求

来源为恢复的 DSH 原始会话，共 32 条用户消息。以下保留原文；后续变更以 [当前 TODO](../TODO.md) 为准。图片哈希用于定位原始附件，不包含图片原始数据或本机会话资料。

## O01 / Session seq 11

- Image: `sha256:b6416a1f7ad602eb36179706a844f8b8643893bf1e467152d7725bff5e173241` (444 x 71)

- Image: `sha256:431620a976a2cb4eae1b44873998b0bf4e8bcb2972f9d20205ca40004359a625` (64 x 73)

> 明确程序地位: 这是开箱即用的DSH破甲版本.
> 1. 名称加上一个Uncensored. 包括在标题(图1)右边加一个UNCENSORED. 黄底, HARNESS旁边.
> 2. 内置(而不是插件)我的dsh purge fork
> 3. Logo反色, 体现"黑化版". 白底黑鲸改成黑底白鲸
> 4. 确保和普通版本的DSH可以共存, 独立化
> 先完成这些基础内容, 深入修改我之后说明.

## O02 / Session seq 642

- Image: `sha256:36cff209f9e9a6f6fbc4ca94d2faf08c4b544ce31720d9a7f01cba9fa82a5a1b` (1695 x 1706)

- Image: `sha256:8a12a56fd67642412eb3597e851031e48bb4b5aa9ace874c5f30ab931e6202d1` (1688 x 1671)

> 1. 工作区增加"不在工作区工作"
> 2. 发送默认是直接插入, 而不是排队
> 3. 除了余额功能外 还增加余额曲线的显示等统计信息
> 4. 增加"中国大陆域名保护"功能, 类似dsh purge原版的那个, 默认开启

## O03 / Session seq 643

- Image: `sha256:09f4924577949ed7a7d4da0fb42a566921865fde17b06637e29e4e1bfaf0bae3` (407 x 349)

- Image: `sha256:93fda41cb63391df2307ce20a6795215b9b0c91667d5a44869a9265567939984` (521 x 93)

- Image: `sha256:e19f12e073dc69c31e578757cc16d6d153cc5ea015dbaf9b5a7d3f35b5c1ead3` (222 x 80)

> 1. 意见反馈->提交Issue, 对应我的GitHub Issue区
> 2. 内置(不是插件)余额显示. 包括悬浮效果优化. 普通并排显示赠金和余额, 以及梁文峰/梁文谷(背景时段). 悬浮效果也优化, 契合一下.
> 设置中可以设置开关, 和刷新率.
> 3. 版本显示Unsensored版本, DSH原版本和打包的我的Fork分支的Commit时间和节点
> 4. 模型默认只保留V4.1Flash 1017
> 5. 默认完全权限
> 6. 顶部的dsh purge不用了, 直接最大自由度的全破甲

## O04 / Session seq 644

- Image: `sha256:5ea22f1d24998968b6aa6d59675a0d18df629fb68daaf71cf621945853717dd0` (1845 x 1707)

- Image: `sha256:acb316ba3625fa9eeab2d0c4802d94f2012a0ff3f541f63f04d95188a55fbe9e` (460 x 433)

- Image: `sha256:54b949f23a980e0b677f40a00105a734b1544ceacf17619a649412dd0a369145` (1238 x 675)

- Image: `sha256:4f017bde66c566ae7a83173df27491a07183c4d4eb2231a51b5cf24ffdc596c4` (394 x 377)

- Image: `sha256:6633f3471c6a5385835049d3abdc96a2a8df6ddd04eb92a5841a5601caa4ce4c` (388 x 272)

- Image: `sha256:9a8b91d5e0b73d1b9b0c58d05c930155ee92fdf4da7450f118cde5ab7baea783` (467 x 258)

> 1. 系统基本就没啥动画. 补全各种动画效果, 用起来更丝滑
> 2. 改名"模式". 只需要保留三个: 缺省, 写作和网安. 每个占据一行, 从上到下排布. 探讨如何实现.
> 3. 更新改走GitHub Release.
> 4. 关于显示各种版本, 仓库, 以及协议说明等
> 5. 增加GitHub. GitHub图标
> 6. 反馈也改为提交Issue
> 7. 扩展项目, 包括直接切换到某个进行中的对话

## O05 / Session seq 645

> 另外, 不要两万多个commit, 分支改成main, 直接第一个

## O06 / Session seq 677

- Image: `sha256:816b3e20899ceb81876cb8b18ba01eaf59425c471b432af56870d5afe2f5d461` (2462 x 1702)

> 原有挤压的PR 机器人之类的, 也处理干净上阵

## O07 / Session seq 1096

> 余额曲线的数据源: 可设置源: 本机/API
> 网安模式按最强的能力实现. 写作模式则参考开源项目, 在破甲完全自由写作的基础上进行优化.

## O08 / Session seq 1168

> 完成后这个版本也安装到我的系统中

## O09 / Session seq 1565

> 你安装了吗, 我好像没看到. 另外, host可以用6666, 如果没有知名的话, 或者2333或23333

## O10 / Session seq 1664

- Image: `sha256:4fffe610b91b614f7a68cbdc66d5148c2ff6dec91348c15ee696d35f4687f45d` (231 x 427)

> Logo有问题哈 记得处理

## O11 / Session seq 1681

> 另外启动就闪退了

## O12 / Session seq 1692

> 我要的是Desktop版本

## O13 / Session seq 1713

> 中间的鲸鱼直接用纯白色

## O14 / Session seq 1837

- Image: `sha256:3517a20dd84596ed34f78f962ab95faaf8ab3fb8474e880ad15f611183dd7025` (2371 x 1564)

> 原来这些沉重的流程也去掉哈, 一直给我发消息

## O15 / Session seq 1911

> 图标错误你看看鲸鱼和方块的大小就知道了, 留白明显太少, 鲸鱼太大

## O16 / Session seq 2313

- Image: `sha256:f4409606dfb1f062dc86f09360587f8af17753aea1488ea3bbf1b237f4b78a48` (152 x 418)

> 那整个图标又都太小了...你就不能调整到一样?模型默认 V4.1Flash Max

## O17 / Session seq 2662

- Image: `sha256:a86d8b70874b348c74ca5c990dc98267eeb79a24c0ac9775b8811fdcbde1c5f0` (511 x 74)

> 优化UNCENSORED的样式. 字体间距更大更良好. 底色:
> - 缺省 蓝色
> - 写作 黄色
> - 网安 红色
> - (其它) 绿色

## O18 / Session seq 2663

- Image: `sha256:ca17de14527239e863ab6335fabb7963079c986c32af38de7d1e99228706974c` (1462 x 504)

> 自定义的红队模式要清理好

## O19 / Session seq 2664

- Image: `sha256:23add00b3633dc9b534007b3a22970579280307449903e3e5dc33fb42211ca8b` (438 x 309)

> dsh purge的选择也不要了

## O20 / Session seq 2665

- Image: `sha256:ffa3c6c7f27bf4e252e8ec1eda73fc4f8451a374e85c276804220c38ff519cc5` (303 x 144)

> 另外图标确保完全, 比如, 托盘的就遗漏了修改

## O21 / Session seq 2721

> 继续

## O22 / Session seq 2839

- Image: `sha256:29e751050e2bcfb39881f93a4dfef4df5bd94312789581d7cae589f656bfb4b6` (412 x 286)

> 还有名称哈 显然这些展示场景的名称也要改变

## O23 / Session seq 2908

- Image: `sha256:7cdb788dd500efd5cede0bbdb0ea74d656e72ce4c0f1feef7c6ef24e9c2578f5` (1022 x 216)

> 你没有改错到主版本把, 我看到顶部的dsh purge没了

## O24 / Session seq 2909

> 注意两个版本要独立开, 我现在看登录信息什么的都是复用的

## O25 / Session seq 2917

> 继续

## O26 / Session seq 2978

> 先恢复主版本的插件正常哈

## O27 / Session seq 3053

- Image: `sha256:a09ec184146046a50b9425606f08f23a2ac40ec5cc0f74b65678798e803746dd` (1293 x 778)

> 你看吧, 又有遗漏
> 顶上的UNCENSORED的Slogan呢?

## O28 / Session seq 3118

- Image: `sha256:c599ae5e6657ebc1dd2278b8eecf4205fa384dd7a59515785b4d6726aaee7b5f` (534 x 72)

> 另外模式切换顶部颜色变化还没应用哈

## O29 / Session seq 3119

> 顺序改为缺省, 网安, 写作

## O30 / Session seq 3232

> 完整的复盘上下文, 对于样式等各种细节, 我交给CodeX审查处理, 对于需要破甲才能做的安全审计部分, 由你来.

## O31 / Session seq 3242

> 从我最开始的截图开始, 完整的整理成文档.

## O32 / Session seq 3266

> 回到主版本, 是否修复了已经? 顶上的dsh purge
