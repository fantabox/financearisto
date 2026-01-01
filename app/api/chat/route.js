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
    Para Birimi: Japon Yeni (¥ / JPY).
    Kullanıcı Mesajı: "${message}"

    GÖREVİN:
    Mesajı analiz et ve geçen tüm finansal işlemleri tespit et.

    KURALLAR:
    1. Birden fazla harcama varsa hepsini ayrı ayrı listele.
    2. Tarih belirtildiyse hesapla, yoksa bugünün tarihini kullan.
    3. Harcamalar NEGATİF (-), Gelirler POZİTİF (+) olmalı.
    4. Tutarlar Japon Yeni (JPY) cinsindendir. (Örn: "Market 2000" -> 2000 Yen).
    5. Japonya'da kuruş kullanılmaz, tam sayı kullan.

    JSON FORMATI:
    {
      "reply": "Kullanıcıya Türkçe cevap ver. (Örn: 2000 Yen market harcamasını ekledim.)",
      "transactions": [
         { 
           "amount": -2000, 
           "category": "Market", 
           "desc": "Seiyu Alışverişi",
           "date": "2026-01-01" 
         }
      ]
    }
    Eğer işlem yoksa "transactions": [] döndür.
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