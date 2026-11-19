# 成熟女性卡通造型参考和iOS音量修复

## 造型参考

本轮参考Lorry Creative公开展示的[Cartoon Base Mesh Old Female Free 3D model](https://sketchfab.com/3d-models/cartoon-base-mesh-old-female-free-3d-model-b75f48a4163942188e09311a1ccec0ad)，重点观察连续面部体积、眼窝、鼻梁及面部集中布局。另核查Ezz-Eldeen的middle aged woman rigged and animated，其公开元数据显示不可下载，没有提取其模型。

采用独立的程序化几何重建，没有导入上述作者的网格或图片。造型保持深色长发、蓝色上衣、项链和裙装；调整头身比，重做连贯衣身、手指及深色腿部。面部不再依赖照片深度插值形成的平板效果。仅为造型参考和本地重建，不能声称已经实现本人一比一还原。

## 评弹音量根因

之前网页读取`volume:0.05`，但`pingtan.json`的`url`仍然指向原始录音。苹果的Safari HTML5音视频文档指出，iOS媒体元素的`volume`属性不能可靠地用脚本调节。因此仅检查JavaScript数值不足以证明听感已降低。

现在发布配置直接指向`-gain5.m4a`，其波形振幅在转码时已乘0.05。即使浏览器完全忽略`audio.volume`，也只能播放已经压低的录音。配置记录`renderedVolume:0.05`，运行时不会重复压低至0.25%。教师实际开口时，通过Web Audio GainNode再乘0.3，得到原始录音的1.5%；停讲后平滑恢复到5%。不支持Web Audio时，预压低文件依然保证基础音量低于原文件。

后续上传评弹时，服务端也发布已经处理过音量的文件，不再重新指回原始录音。

验证脚本`check-mentor-ios-volume126.cjs`解码原始及处理后的前12秒PCM，比较RMS振幅约为0.05（-26dB）；在浏览器中模拟音量属性写入被忽略，确认仍加载处理后文件，并检查实际GainNode为0.3。该测试不是实体iPhone测试，不能代替用户设备听感确认。
