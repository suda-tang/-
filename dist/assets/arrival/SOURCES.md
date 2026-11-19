# Arrival scene references and attribution

- North gate photograph: 云在动, 2021. CC BY-SA 4.0. https://commons.wikimedia.org/wiki/File:东吴大学校门在苏州旧址（东吴大学牌坊）（北面）.jpg
- South gate photograph: Nikopoley, 2009. CC BY-SA 3.0. https://commons.wikimedia.org/wiki/File:Old_SooChow_Univ_Gate_in_Suzhou.JPG
- Photograph-derived gate material and foliage projections: modified through texture projection and colour-key masking. These adaptations are available under CC BY-SA 4.0 (north) / 3.0 (south reference as applicable). Source photographs retained here.
- Suzhou aerial: Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community. https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer
- Earth surface: Three.js example Earth atmosphere texture, https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg
- Architectural corroboration: https://math.suda.edu.cn/3c/92/c18166a408722/page.htm

The gate is a photograph-referenced reconstruction, not a surveyed scan. The aerial plane and near-ground architecture are composited at different scales; this is a cinematic route, not geographical navigation. Side and rear surfaces are approximations.

## Clock-tower vector revision
The runtime no longer displays the photographic/aerial assets above. They remain historical references. Current coastline data: Natural Earth ne_110m_land, public domain. Building geometry is a stylized reconstruction referenced to the Soochow University article “114岁钟楼” and site photographs; it is not a measured survey.


## 七处苏州展景（2026-10-18）
本项目的程序化低多边形展景：东方之门、拙政园、留园、虎丘塔、北寺塔、山塘街、盘门。围绕校园布置是虚拟导览布局，不代表真实地理位置或测绘复原。
地标身份参考苏州市政府：https://www.suzhou.gov.cn/gzdmksz/hdjs/202312/52f0a745f9694a8aa053474b5eba1baa.shtml
园林及古街参考苏州文旅：https://visitsz.wglj.suzhou.com.cn/scenic-spot.aspx?districtid=1

## 古城底图
河道、水面及建筑轮廓：© OpenStreetMap contributors，ODbL，https://www.openstreetmap.org/copyright 。通过 Overpass 获取，2026-10-19。建筑高度在标签缺失时为示意值，地标锚点为近似经纬度，不是测绘级复原。


## 水乡街巷及背立面细化（2026-10-19）
苏州市水务局“第四站：平江路”：https://water.suzhou.gov.cn/slj/gsq/202512/f62cb034b64749a780f78ca7a50f824a.shtml 。参考河街相邻、水陆并行的空间关系；沿现有中心线补驳岸、石径、踏步和示意桥船。新增桥船未经过测绘，不对应指定真实古桥。
林堂外形参考苏大“114岁钟楼”：https://www.suda.edu.cn/suda_news/sdsy/201707/bf1cd4ce-7a92-4dd3-bece-02368a2ede36.html 。背立面窗格、石材线脚及门廊为程序建模细化，不是实景扫描。

## 平江水乡布局校对（2026-10-20）
参考苏州市地方志《平江历史街区概况》：https://dfzb.suzhou.gov.cn/dfzb/szdq/201606/ebcb2291909b45a09e0e1142af036d31.shtml
参考苏州市政府《平江路上古桥趣闻知多少》：https://dfzb.suzhou.gov.cn/dfzb/fzxh/200912/172b306a013345eda47bec40af6fd85b.shtml
已取消随机散布住宅，沿既有地理建筑轮廓布置园林化建筑；保留原有水系。当前输入数据没有逐株树木、花草、完整巷道或实测屋顶资料，因此植被、庭院内部及桥梁仍有推定内容，不能标为一比一复制平江街区。校园净空与地标压缩属于导览布景调整。

## 实景园林模型接入（2026-10-20）
怡园、拙政园：F. L.，3D Warehouse。用户已确认取得学术研究使用授权。原始资源信息及修改记录分别保存于 assets/gardens/yiyuan/SOURCE.json、assets/gardens/zhuozhengyuan/SOURCE.json。修复异常法线、合并独立网格、重复构件GPU实例化、拆分36个流式区域。展示位置和缩尺属于导览布景调整，模型为作者的建筑重建，并非本项目实地扫描。


## 游船（2026-10-20）
Chinese sampan，作者 Zeta。来源：https://3dwarehouse.sketchup.com/model/4c40b568-48fb-46c7-9c39-67f29372bedb/Chinese-sampan 。保留原始 GLB；运行时隐藏高桅帆装、统一尺寸并添加摇橹动画。此资产为中式舢板，不等同于山塘街实测模型。
