// src/data/world.js
export const WorldMap = {
    // === 新手村區域 ===
    "inn_start": {
        title: "悅來客棧",
        description: "這是一間名震江湖的老字號客棧。牆上掛著『賓至如歸』的牌匾。角落裡幾個乞丐正在竊竊私語。\n【這裡可以休息，輸入 save 儲存進度】",
        allowSave: true, // <--- 新增這行：允許存檔
        exits: { "out": "yangzhou_square" }
    },
    "yangzhou_square": {
        title: "揚州廣場",
        description: "這裡是揚州城的中心廣場，人聲鼎沸，車水馬龍。正中央有一座巨大的石碑，上面刻著當今武林高手的排名。",
        exits: {
            "enter": "inn_start",
            "north": "road_north",
            "south": "road_south",
            "east": "road_east",
            "west": "road_west"
        }
    },

    // === 通往各門派的道路 ===
    "road_north": {
        title: "青石大道",
        description: "這是一條寬闊的青石大道，向北延伸。遠遠望去，似乎可以見到巍峨的高山。",
        exits: { 
            "south": "yangzhou_square",
            "north": "shaolin_gate" 
        }
    },
    "road_south": {
        title: "林間小徑",
        description: "路徑漸漸變得幽靜，兩旁是茂密的竹林，空氣中帶著一絲濕潤。",
        exits: { 
            "north": "yangzhou_square",
            "south": "wudang_foot" 
        }
    },
    "road_east": {
        title: "東門官道",
        description: "往東是一條筆直的官道，路上行人匆匆。",
        exits: { 
            "west": "yangzhou_square",
            "east": "huashan_path" 
        }
    },
    "road_west": {
        title: "西郊荒野",
        description: "出了西門，景色變得荒涼起來。遠處有一座陰氣森森的山頭，那裡似乎就是傳說中的茅山。",
        exits: { 
            "east": "yangzhou_square",
            "northwest": "maoshan_foot" 
        }
    },

    // === 茅山派入口 ===
    "maoshan_foot": {
        title: "茅山腳下",
        description: "你來到了茅山腳下，四周瀰漫著淡淡的霧氣。山道旁立著一塊石碑，上書『凡人止步』。",
        exits: {
            "southeast": "road_west",
            "up": "maoshan_gate"
        }
    },
    "maoshan_gate": {
        title: "茅山派山門",
        description: "一座古樸陰森的道觀矗立在眼前。門口掛著兩盞幽綠的燈籠。\n【此處乃修道之地，可以 save 儲存進度】",
        allowSave: true, // <--- 新增這行：門派大廳通常也可以存檔
        exits: {
            "down": "maoshan_foot"
        }
    }
};