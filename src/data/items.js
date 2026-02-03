// src/data/items.js

export const ItemDB = {
    // --- 食物與飲水 (價格大幅調降) ---
    "rice": { name: "白米飯", type: "food", value: 10, desc: "一碗熱騰騰的白米飯。" },
    "dumpling": { name: "肉包子", type: "food", value: 15, desc: "皮薄餡多的大肉包。" },
    "bread": { name: "乾糧", type: "food", value: 5, desc: "硬硬的大餅，雖然不好吃但能填飽肚子。" },
    "roast_chicken": { name: "烤雞", type: "food", value: 50, desc: "香噴噴的烤雞，油光發亮。" },
    "waterskin": { name: "牛皮水袋", type: "drink", value: 20, desc: "裝滿清水的水袋。" },
    "tea": { name: "烏龍茶", type: "drink", value: 10, desc: "一杯清茶，生津止渴。" },
    "wine": { name: "女兒紅", type: "drink", value: 80, desc: "一罈陳年好酒。" },

    // --- 素材與戰利品 ---
    "rabbit_meat": { name: "兔肉", type: "food", value: 15, desc: "一塊鮮紅的生兔肉，烤過應該不錯吃。" },
    "rabbit_skin": { name: "兔皮", type: "misc", value: 20, desc: "柔軟的兔毛皮，可以拿去賣錢。" },
    "boar_meat": { name: "野豬肉", type: "food", value: 40, desc: "一塊肥嫩的野豬肉。" },
    "boar_tooth": { name: "野豬獠牙", type: "misc", value: 80, desc: "尖銳的獠牙，是勇氣的象徵。" },
    "wolf_skin": { name: "狼皮", type: "misc", value: 150, desc: "一張完整的狼皮，價值不菲。" },
    "bear_paw": { name: "熊掌", type: "food", value: 400, desc: "極為珍貴的食材，大補！" },
    "bear_skin": { name: "黑熊皮", type: "misc", value: 500, desc: "厚實的黑熊皮，做成大衣一定很保暖。" },
    "pheasant_meat": { name: "野雞肉", type: "food", value: 20, desc: "稍微有點柴的雞肉。" },
    "pheasant_feather": { name: "野雞翎", type: "misc", value: 25, desc: "五彩斑斕的羽毛，很漂亮。" },
    "wild_fruit": { name: "野果", type: "food", value: 5, desc: "酸酸甜甜的紅色野果，猴子最愛。" },
    "snake_gall": { name: "蛇膽", type: "medicine", value: 150, desc: "深紫色的蛇膽，據說能明目解毒，極具價值。" },
    "snake_skin": { name: "蛇皮", type: "misc", value: 60, desc: "冰涼滑膩的蛇皮。" },
    "bobcat_skin": { name: "山貓皮", type: "misc", value: 100, desc: "花紋獨特的山貓皮毛。" },

    // --- 武器 (新手價格調降) ---
    "wooden_staff": { name: "木棍", type: "stick", damage: 8, hit: 10, value: 50, desc: "一根堅硬的橡木棍，便宜又好用。" },
    "iron_sword": { name: "鐵劍", type: "sword", damage: 15, hit: 5, value: 150, desc: "一把普通的鐵劍，適合新手使用。" },
    "dagger": { name: "匕首", type: "dagger", damage: 12, hit: 15, value: 100, desc: "藏在袖中的短匕首，偷襲利器。" },
    "stone": { name: "飛蝗石", type: "throwing", damage: 10, hit: 5, value: 10, desc: "隨處可見的鵝卵石，適合當作暗器練習。" },
    "bamboo_spear": { name: "竹槍", type: "lance", damage: 14, hit: 0, value: 80, desc: "削尖的竹子製成的長槍。" },
    "leather_whip": { name: "皮鞭", type: "whip", damage: 14, hit: 8, value: 120, desc: "牛皮編織的長鞭。" },
    
    // --- 進階武器 ---
    "steel_blade": { name: "鋼刀", type: "blade", damage: 25, hit: 2, value: 400, desc: "精鋼打造的鋼刀，背厚刃薄，劈砍有力。" },
    "iron_staff": { name: "熟鐵棍", type: "stick", damage: 30, hit: 5, value: 500, desc: "沉重的鐵棍，一棒下去能敲碎石頭。" },
    "throwing_knife": { name: "柳葉飛刀", type: "throwing", damage: 25, hit: 20, value: 300, desc: "薄如柳葉的飛刀，例無虛發。" },
    "iron_spear": { name: "點鋼槍", type: "lance", damage: 35, hit: -5, value: 600, desc: "軍中常用的長槍，威力巨大但較為笨重。" },

    // --- 防具 (Armor) ---
    "cloth_armor": { name: "布衣", type: "armor", defense: 5, value: 50, desc: "普通的粗布衣服，防禦力有限。" },
    "leather_armor": { name: "皮甲", type: "armor", defense: 12, value: 300, desc: "用硬皮製成的盔甲，能提供不錯的防護。" },

    // --- [新增] 頭部 (Head) ---
    "cloth_cap": { name: "布帽", type: "head", defense: 2, value: 20, desc: "一頂普通的布帽子，能遮風擋雨。" },
    "leather_helm": { name: "皮帽", type: "head", defense: 5, value: 150, desc: "硬皮製成的帽子，保護頭部。" },

    // --- [新增] 護腕 (Wrists) ---
    "cloth_wrists": { name: "布護腕", type: "wrists", defense: 1, value: 15, desc: "纏在手腕上的布條，減少扭傷。" },
    "leather_wrists": { name: "皮護腕", type: "wrists", defense: 3, value: 100, desc: "鑲有銅釘的皮護腕。" },

    // --- [新增] 披風 (Cloak) ---
    "old_cloak": { name: "破舊披風", type: "cloak", defense: 1, value: 30, desc: "一件打滿補丁的舊披風。" },
    "canvas_cloak": { name: "粗布披風", type: "cloak", defense: 3, value: 100, desc: "厚實的帆布披風，適合旅行。" },

    // --- [新增] 褲子 (Pants) ---
    "cloth_trousers": { name: "粗布長褲", type: "pants", defense: 2, value: 20, desc: "耐磨的粗布褲子。" },
    "leather_pants": { name: "皮褲", type: "pants", defense: 6, value: 200, desc: "野獸皮縫製的褲子，防護力不錯。" },

    // --- [新增] 靴子 (Boots) ---
    "straw_sandals": { name: "草鞋", type: "boots", defense: 1, value: 10, desc: "乾草編織的鞋子，便宜但易壞。" },
    "cloth_boots": { name: "布靴", type: "boots", defense: 3, value: 80, desc: "厚底的布靴，穿起來很舒適。" },
    "leather_boots": { name: "皮靴", type: "boots", defense: 5, value: 250, desc: "結實的皮靴，適合長途跋涉。" },

    // --- [新增] 腰帶 (Belt) ---
    "rope_belt": { name: "草繩腰帶", type: "belt", defense: 0, value: 5, desc: "一條簡單的草繩，用來繫褲子。" },
    "leather_belt": { name: "皮帶", type: "belt", defense: 2, value: 100, desc: "寬大的牛皮腰帶。" },

    // --- [新增] 項鍊/飾品 (Necklace) - 帶屬性 ---
    "copper_amulet": { 
        name: "護身符", type: "necklace", value: 50, 
        desc: "廟裡求來的平安符，戴在身上求個心安。",
        props: { kar: 1 } // 福緣 +1
    },
    "copper_necklace": { 
        name: "銅項鍊", type: "necklace", value: 200, 
        desc: "一條粗糙的銅項鍊，似乎有點重量。",
        props: { str: 1 } // 膂力 +1
    },
    "jade_pendant": { 
        name: "玉佩", type: "necklace", value: 800, 
        desc: "一塊溫潤的玉佩，通體透亮。",
        props: { int: 1, per: 1 } // 悟性+1, 定力+1
    }
};