// src/data/skills.js
import { UI } from "../ui.js";

// === 共用工具：取得技能等級描述 ===
// 這份邏輯原本在 skill_system.js，現在統一放在這裡供各處呼叫
export function getSkillLevelDesc(level) {
    if (level >= 200) return UI.txt("返璞歸真", "#ff00ff", true);
    if (level >= 181) return UI.txt("深不可測", "#ff4500");
    if (level >= 161) return UI.txt("神乎其技", "#ff8800");
    if (level >= 141) return UI.txt("出神入化", "#ffd700");
    if (level >= 121) return UI.txt("登峰造極", "#ffff00");
    if (level >= 101) return UI.txt("一代宗師", "#adff2f");
    if (level >= 81)  return UI.txt("出類拔萃", "#00ff00");
    if (level >= 61)  return UI.txt("融會貫通", "#00ffff");
    if (level >= 41)  return UI.txt("駕輕就熟", "#00bfff");
    if (level >= 21)  return UI.txt("粗通皮毛", "#8888ff");
    return UI.txt("初學乍練", "#cccccc");
}

export const SkillDB = {
    // ================== 基礎武學 (Basic) Rating: 1.0 ==================
    "unarmed": {
        name: "基本拳腳", type: "martial", rating: 1.0, desc: "世間所有拳腳功夫的根基。",
        actions: [
            { msg: "$P揮出一拳，擊向$N的胸口。", damage: 10 },
            { msg: "$P飛起一腳，踢向$N的腰間。", damage: 15 },
            { msg: "$P雙掌一推，拍向$N的面門。", damage: 12 }
        ]
    },
    "sword": {
        name: "基本劍術", type: "martial", rating: 1.0, desc: "使用劍類兵器的基礎法門。",
        actions: [
            { msg: "$P手中的$w一抖，刺向$N。", damage: 15 },
            { msg: "$P向前一衝，手中$w砍向$N。", damage: 20 },
            { msg: "$P將$w橫掃，劃向$N的咽喉。", damage: 18 }
        ]
    },
    "blade": {
        name: "基本刀法", type: "martial", rating: 1.0, desc: "大開大闔的刀法基礎。",
        actions: [
            { msg: "$P大喝一聲，手中$w當頭劈向$N！", damage: 20 },
            { msg: "$P反手一撩，$w由下而上劃向$N的小腹。", damage: 18 },
            { msg: "$P刀勢如虹，$w橫削$N的肩膀。", damage: 15 }
        ]
    },
    "stick": {
        name: "基本棍法", type: "martial", rating: 1.0, desc: "以橫掃、劈打為主的棍法。",
        actions: [
            { msg: "$P掄起$w，呼的一聲砸向$N的腦袋。", damage: 18 },
            { msg: "$P手中$w橫掃千軍，掃向$N的下盤。", damage: 15 },
            { msg: "$P雙手持$w，直捅$N的胸口。", damage: 12 }
        ]
    },
    "dagger": {
        name: "基本短兵", type: "martial", rating: 1.0, desc: "短小精悍，貼身肉搏的技巧。",
        actions: [
            { msg: "$P欺身而上，手中$w刺向$N的心窩。", damage: 15 },
            { msg: "$P身形一矮，$w無聲無息地劃向$N的大腿。", damage: 12 },
            { msg: "$P反握$w，反手刺向$N的背心。", damage: 18 }
        ]
    },
    "whip": {
        name: "基本鞭法", type: "martial", rating: 1.0, desc: "長鞭揮舞，控制距離的武學。",
        actions: [
            { msg: "$P手腕一抖，$w如靈蛇般捲向$N的脖子。", damage: 15 },
            { msg: "$P用力一甩，$w啪的一聲抽在$N的臉上。", damage: 12 },
            { msg: "$P手中$w畫了個圈，套向$N的兵器。", damage: 10 }
        ]
    },
    "throwing": {
        name: "基本暗器", type: "martial", rating: 1.0, desc: "投擲暗器的基礎準頭練習。",
        actions: [
            { msg: "$P手一揚，一道寒光射向$N。", damage: 15 },
            { msg: "$P手指輕彈，暗器直奔$N的雙眼。", damage: 20 },
            { msg: "$P發出暗器，封住了$N的退路。", damage: 10 }
        ]
    },
    "lance": {
        name: "基本槍法", type: "martial", rating: 1.0, desc: "百兵之王，長槍的運用法門。",
        actions: [
            { msg: "$P抖動槍花，$w如毒龍出洞般刺向$N。", damage: 20 },
            { msg: "$P大喝一聲，手中$w猛地橫掃$N。", damage: 22 },
            { msg: "$P長槍一挺，$w直取$N的咽喉。", damage: 25 }
        ]
    },
    
    "force": { name: "基本內功", type: "force", rating: 1.0, desc: "修練內息的入門功夫。" },
    "dodge": { name: "基本閃躲", type: "dodge", rating: 1.0, desc: "閃避敵人攻擊的基礎身法。" },

    // ================== 進階武學 (Advanced) ==================


    "iron-palm": {
        name: "鐵砂掌", id: "iron-palm", base: "unarmed", type: "martial", rating: 1.4,
        desc: "剛猛無比的掌法，掌力如鐵。",
        actions: [
            { msg: "$P雙掌漆黑，運氣大喝，一記<span style='color:#ff4500; text-shadow:0 0 5px #ff0000; font-weight:bold;'>「鐵沙排空」</span>帶著腥風擊向$N！", damage: 40 },
            { msg: "$P內息運轉，掌心隱現紅光，一招<span style='color:#ff0000; text-shadow:0 0 5px #ffaaaa; font-weight:bold;'>「掌心雷」</span>拍向$N的天靈蓋！", damage: 50 },
            { msg: "$P雙掌連環拍出，漫天掌影如<span style='color:#550000; text-shadow:0 0 5px #880000; font-weight:bold;'>「黑風煞煞」</span>，徹底封死了$N的退路！", damage: 45 }
        ]
    },
    "swift-sword": {
        name: "疾風劍法", id: "swift-sword", base: "sword", type: "martial", rating: 1.2,
        desc: "出劍如風，快如閃電。",
        actions: [
            { msg: "$P身形化作殘影，手中$w一閃，一招<span style='color:#00ffff; text-shadow:0 0 5px #ffffff; font-weight:bold;'>「風馳電掣」</span>瞬間刺向$N咽喉！", damage: 45 },
            { msg: "$P手腕疾抖，劍光如網，這招<span style='color:#87ceeb; text-shadow:0 0 5px #0000ff; font-weight:bold;'>「狂風暴雨」</span>水洩不通地罩向$N全身！", damage: 55 },
            { msg: "$P劍鋒一轉，寒光乍現，好一招<span style='color:#e0ffff; text-shadow:0 0 8px #ffffff; font-weight:bold;'>「電光火石」</span>，直取$N眉心！", damage: 50 }
        ]
    },
    "eight-trigram-blade": {
        name: "八卦刀", id: "eight-trigram-blade", base: "blade", type: "martial", rating: 1.3,
        desc: "配合八卦方位的刀法，攻守兼備。",
        actions: [
            { msg: "$P腳踏先天方位，手中$w使出一招<span style='color:#ffff00; text-shadow:0 0 5px #ffaa00; font-weight:bold;'>「乾三連」</span>，三刀連環劈向$N！", damage: 45 },
            { msg: "$P刀勢厚重如山，一招<span style='color:#deb887; text-shadow:0 0 5px #8b4513; font-weight:bold;'>「坤六斷」</span>將$N的攻勢化解，順勢反撩！", damage: 40 },
            { msg: "$P身形如風般旋轉，手中$w捲起氣流，這招<span style='color:#98fb98; text-shadow:0 0 5px #00ff00; font-weight:bold;'>「巽下斷」</span>直取$N下盤！", damage: 50 }
        ]
    },
    "arhat-stick": {
        name: "羅漢棍", id: "arhat-stick", base: "stick", type: "martial", rating: 1.3,
        desc: "佛門入門棍法，招式平正，威力不俗。",
        actions: [
            { msg: "$P口宣佛號，手中$w夾帶勁風，一招<span style='color:#ffd700; text-shadow:0 0 8px #ffff00; font-weight:bold;'>「羅漢撞鐘」</span>直撞$N胸口！", damage: 42 },
            { msg: "$P舞動$w，渾身金光隱現，一招<span style='color:#daa520; text-shadow:0 0 5px #b8860b; font-weight:bold;'>「金剛護體」</span>震開了$N！", damage: 35 },
            { msg: "$P躍起半空，手中$w如擎天之柱當頭砸下，好一招<span style='color:#ffffed; text-shadow:0 0 10px #ffd700; font-weight:bold;'>「佛光普照」</span>！", damage: 55 }
        ]
    },
    "shadow-dagger": {
        name: "如影隨形刺", id: "shadow-dagger", base: "dagger", type: "martial", rating: 1.3,
        desc: "如影子般貼身纏鬥，招招陰毒。",
        actions: [
            { msg: "$P身形忽左忽右，手中$w如鬼魅般刺出，這招<span style='color:#9370db; text-shadow:0 0 5px #4b0082; font-weight:bold;'>「如影隨形」</span>讓人防不勝防！", damage: 45 },
            { msg: "$P突然繞到$N身後，手中$w無聲無息刺出，一招<span style='color:#708090; text-shadow:0 0 5px #000000; font-weight:bold;'>「背刺」</span>直取要害！", damage: 60 },
            { msg: "$P手中$w在掌心飛速旋轉，化作一片死亡光影，<span style='color:#483d8b; text-shadow:0 0 5px #000080; font-weight:bold;'>「鬼影幢幢」</span>切向$N的咽喉！", damage: 48 }
        ]
    },
    "cloud-whip": {
        name: "流雲鞭", id: "cloud-whip", base: "whip", type: "martial", rating: 1.2,
        desc: "鞭法行雲流水，變幻莫測。",
        actions: [
            { msg: "$P手中$w抖動，如天邊流雲變幻，一招<span style='color:#f0ffff; text-shadow:0 0 5px #87ceeb; font-weight:bold;'>「白雲出岫」</span>輕輕捲住$N！", damage: 40 },
            { msg: "$P手腕輕抖，$w在空中炸響，一招<span style='color:#778899; text-shadow:0 0 5px #2f4f4f; font-weight:bold;'>「烏雲蓋頂」</span>劈頭蓋臉抽向$N！", damage: 45 },
            { msg: "$P長鞭揮舞成圈，如雲霧繚繞，這招<span style='color:#e6e6fa; text-shadow:0 0 5px #da70d6; font-weight:bold;'>「雲霧鎖身」</span>困住了$N！", damage: 38 }
        ]
    },
    "golden-dart": {
        name: "金錢鏢", id: "golden-dart", base: "throwing", type: "martial", rating: 1.3,
        desc: "使用銅錢作為暗器的獨門手法。",
        actions: [
            { msg: "$P手指連彈，數枚銅錢帶著破空之聲，一招<span style='color:#ffdf00; text-shadow:0 0 5px #ffa500; font-weight:bold;'>「滿天花雨」</span>射向$N！", damage: 40 },
            { msg: "$P看似隨意一揮，一枚銅錢劃出一道詭異弧線，<span style='color:#cd7f32; text-shadow:0 0 5px #8b4513; font-weight:bold;'>「落葉歸根」</span>直擊$N死穴！", damage: 50 },
            { msg: "$P雙手齊出，銅錢如連珠砲般射出，這招<span style='color:#ffff00; text-shadow:0 0 5px #ffffaa; font-weight:bold;'>「連珠鏢」</span>逼得$N手忙腳亂！", damage: 45 }
        ]
    },
    "yang-spear": {
        name: "楊家槍", id: "yang-spear", base: "lance", type: "martial", rating: 1.5,
        desc: "戰場殺伐之術，氣勢磅礴。",
        actions: [
            { msg: "$P大喝一聲<span style='color:#ff0000; text-shadow:0 0 5px #800000; font-weight:bold;'>「回馬槍」</span>，佯裝敗退，突然回身一槍刺穿$N！", damage: 65 },
            { msg: "$P手中$w抖出朵朵槍花，寒星點點，一招<span style='color:#c0c0c0; text-shadow:0 0 5px #ffffff; font-weight:bold;'>「梨花帶雨」</span>罩向$N全身！", damage: 50 },
            { msg: "$P長槍如龍，殺氣沖天，這招<span style='color:#dc143c; text-shadow:0 0 10px #ff4500; font-weight:bold;'>「直搗黃龍」</span>勢不可擋！", damage: 55 }
        ]
    },
    "turtle-force": { name: "龜息功", id: "turtle-force", base: "force", type: "force", rating: 1.1, desc: "模仿神龜呼吸的內功。" },
    "leaf-steps": { 
        name: "隨風步", id: "leaf-steps", base: "dodge", type: "dodge", rating: 1.3,
        desc: "身形飄忽不定，如落葉隨風。",
        dodge_actions: [
            "$N身形如一片<span style='color:#90ee90'>落葉</span>般隨風飄起，輕輕巧巧地避開了這一擊。",
            "$N腳步虛浮，看似要跌倒，卻在<span style='color:#00ff7f'>間不容髮</span>之際閃過了$P的攻擊。",
            "$N身體隨著對方的拳風擺動，<span style='color:#adff2f'>如影隨形</span>，毫髮無傷地躲開了招式。"
        ]
    }
};