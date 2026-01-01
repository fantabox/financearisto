import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { message } = await req.json();
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    // TARİH BİLGİSİ
    const now = new Date();
    const today = now.toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    const isoDate = now.toISOString().split('T')[0];

    const prompt = `
    Sen uzman bir muhasebe asistanısın. 
    Bugünün Tarihi: ${today} (${isoDate}).
    Kullanıcı Mesajı: "${message}"

    GÖREVİN:
    Mesajı analiz et ve geçen tüm finansal işlemleri tespit et.

    KURALLAR:
    1. Birden fazla harcama varsa hepsini ayrı ayrı listele. (Örn: "Market 100, Benzin 500" -> 2 ayrı işlem).
    2. Tarih belirtildiyse (dün, geçen cuma vb.) hesapla, yoksa bugünün tarihini (${isoDate}) kullan.
    3. Harcamalar NEGATİF (-), Gelirler POZİTİF (+) olmalı.
    4. ASLA hayali işlem uydurma.

    JSON FORMATI (Sadece bunu döndür):
    {
      "reply": "Kullanıcıya özet cevap (Örn: Yılbaşı ve Benzin harcamalarını kaydettim.)",
      "transactions": [
         { 
           "amount": -500, 
           "category": "Eğlence", 
           "desc": "Yılbaşı Harcaması",
           "date": "2025-12-31" 
         },
         { 
           "amount": -1200, 
           "category": "Ulaşım", 
           "desc": "Benzin",
           "date": "2025-12-31" 
         }
      ]
    }
    
    Eğer hiç işlem yoksa "transactions": [] (boş liste) döndür.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();
    
    // Temizlik
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    try {
        const jsonResponse = JSON.parse(text);
        
        // Garanti: transactions her zaman bir dizi (array) olsun
        if (!jsonResponse.transactions) {
            jsonResponse.transactions = [];
        }
        
        // Eğer AI yanlışlıkla tek obje (transaction) döndürdüyse onu diziye çevir
        if (jsonResponse.transaction && !Array.isArray(jsonResponse.transactions)) {
            jsonResponse.transactions = [jsonResponse.transaction];
        }

        return NextResponse.json(jsonResponse);

    } catch (e) {
        console.error("JSON Parse Hatası:", text);
        return NextResponse.json({ 
            reply: "İşlemleri tam anlayamadım, tekrar eder misin?", 
            transactions: [] 
        });
    }

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}