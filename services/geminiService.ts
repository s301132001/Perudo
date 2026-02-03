import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Bid, Player, AiMove } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const MODEL_NAME = 'gemini-3-flash-preview';

const moveSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    action: {
      type: Type.STRING,
      enum: ['BID', 'CHALLENGE'],
      description: "採取的行動。覺得上家在說謊請選 'CHALLENGE' (抓)，要加注請選 'BID'。",
    },
    quantity: {
      type: Type.INTEGER,
      description: "喊叫的骰子數量。如果行動是 BID 則為必填。",
    },
    face: {
      type: Type.INTEGER,
      description: "喊叫的骰子點數 (1-6)。如果行動是 BID 則為必填。",
    },
    reasoning: {
      type: Type.STRING,
      description: "簡短的內部思考過程，解釋為什麼這樣出牌 (請使用繁體中文)。",
    },
  },
  required: ['action', 'reasoning'],
};

export const getAiMove = async (
  activePlayer: Player,
  currentBid: Bid | null,
  totalDiceInGame: number,
  bidHistory: Bid[],
  difficulty: 'easy' | 'hard'
): Promise<AiMove> => {
  
  const handDescription = activePlayer.dice.join(', ');
  const historyDescription = bidHistory.map(b => `${b.quantity}個${b.face}`).join(' -> ');
  const currentBidDesc = currentBid ? `${currentBid.quantity} 個 ${currentBid.face}` : "無 (新回合開始)";

  const systemPrompt = `
    你正在玩吹牛骰子 (Liar's Dice / Perudo)。
    目前的遊戲狀態：
    - 場上骰子總數 (未知分佈)：${totalDiceInGame}
    - 你的手牌 (骰子點數)：[${handDescription}]
    - 目前叫價 (上家)：${currentBidDesc}
    - 本回合喊叫歷史：${historyDescription}
    
    規則：
    1. '1' 點 (Aces) 是萬能牌 (Wild)，可以當作任何點數，除非現在叫的是 1 點。
    2. 加注 (BID)：必須喊出比上家「更多」的數量，或是「相同數量」但「更大」的點數。
    3. 抓 (CHALLENGE)：如果你認為上家在說謊 (場上實際數量 < 喊叫數量)，就選擇抓。
    
    策略 (${difficulty === 'hard' ? '困難' : '簡單'})： 
    ${difficulty === 'hard' ? '採取積極策略，運用機率計算。偶爾進行虛張聲勢 (Bluff)。' : '採取保守策略。主要根據自己的手牌來喊。'}
    
    請決定你的行動。回傳 JSON 格式。
    **重要：reasoning 欄位必須使用繁體中文 (Traditional Chinese) 回答，風格要像真人在玩遊戲。**
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: "請出牌。",
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: moveSchema,
        temperature: difficulty === 'hard' ? 0.9 : 0.5,
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    return JSON.parse(text) as AiMove;
  } catch (error) {
    console.error("Gemini AI Error:", error);
    // Fallback logic if AI fails
    if (!currentBid) {
      return { action: 'BID', quantity: 1, face: 2, reasoning: '系統錯誤，隨便喊個起始。' };
    }
    return { action: 'CHALLENGE', reasoning: '系統錯誤，直接抓了！' };
  }
};