// src/data/items.js

export const ItemDB = {
    // --- 原有物品 ---
    "rice": { name: "白米飯", type: "food", value: 40, desc: "一碗熱騰騰的白米飯。" },
    "dumpling": { name: "肉包子", type: "food", value: 20, desc: "皮薄餡多的大肉包。" },
    "bread": { name: "乾糧", type: "food", value: 15, desc: "硬硬的大餅。" },
    "roast_chicken": { name: "烤雞", type: "food", value: 80, desc: "香噴噴的烤雞。" },
    "waterskin": { name: "牛皮水袋", type: "drink", value: 50, desc: "裝滿清水的水袋。" },
    "tea": { name: "烏龍茶", type: "drink", value: 30, desc: "一杯清茶。" },
    "wine": { name: "女兒紅", type: "drink", value: 20, desc: "一罈好酒。" },

    // --- 素材與戰利品 ---
    "rabbit_meat": { name: "兔肉", type: "food", value: 30, desc: "一塊鮮紅的生兔肉，烤過應該不錯吃。" },
    "rabbit_skin": { name: "兔皮", type: "misc", value: 0, desc: "柔軟的兔毛皮，可以拿去賣錢。" },
    "boar_meat": { name: "野豬肉", type: "food", value: 50, desc: "一塊肥嫩的野豬肉。" },
    "boar_tooth": { name: "野豬獠牙", type: "misc", value: 0, desc: "尖銳的獠牙，是勇氣的象徵。" },
    "wolf_skin": { name: "狼皮", type: "misc", value: 0, desc: "一張完整的狼皮，價值不菲。" },
    "bear_paw": { name: "熊掌", type: "food", value: 100, desc: "極為珍貴的食材，大補！" },
    "bear_skin": { name: "黑熊皮", type: "misc", value: 0, desc: "厚實的黑熊皮，做成大衣一定很保暖。" },

    // --- 武器 (Swords/Blades) ---
    "iron_sword": { name: "鐵劍", type: "sword", damage: 15, hit: 5, value: 500, desc: "一把普通的鐵劍，適合新手使用。" },
    "steel_blade": { name: "鋼刀", type: "blade", damage: 20, hit: 2, value: 600, desc: "精鋼打造的鋼刀，背厚刃薄，劈砍有力。" },
    
    // --- 新增武器 (Other Types) ---
    "wooden_staff": { name: "木棍", type: "stick", damage: 10, hit: 10, value: 200, desc: "一根堅硬的橡木棍，雖然殺傷力不大但很順手。" },
    "iron_staff": { name: "熟鐵棍", type: "stick", damage: 25, hit: 5, value: 800, desc: "沉重的鐵棍，一棒下去能敲碎石頭。" },
    
    "dagger": { name: "匕首", type: "dagger", damage: 12, hit: 15, value: 300, desc: "藏在袖中的短匕首，偷襲利器。" },
    
    "leather_whip": { name: "皮鞭", type: "whip", damage: 15, hit: 8, value: 400, desc: "牛皮編織的長鞭，揮舞起來啪啪作響。" },
    
    "stone": { name: "飛蝗石", type: "throwing", damage: 10, hit: 5, value: 50, desc: "隨處可見的鵝卵石，適合當作暗器練習。" },
    "throwing_knife": { name: "柳葉飛刀", type: "throwing", damage: 20, hit: 20, value: 500, desc: "薄如柳葉的飛刀，例無虛發。" },
    
    "bamboo_spear": { name: "竹槍", type: "lance", damage: 18, hit: 0, value: 300, desc: "削尖的竹子製成的長槍。" },
    "iron_spear": { name: "點鋼槍", type: "lance", damage: 30, hit: -5, value: 1000, desc: "軍中常用的長槍，威力巨大但較為笨重。" },

    // --- 防具 ---
    "cloth_armor": { name: "布衣", type: "armor", defense: 5, value: 200, desc: "普通的粗布衣服，防禦力有限。" },
    "leather_armor": { name: "皮甲", type: "armor", defense: 10, value: 500, desc: "用硬皮製成的盔甲，能提供不錯的防護。" }
};