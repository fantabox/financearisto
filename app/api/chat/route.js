import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { message } = await req.json();
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    // TARİH BİLGİSİ (AI'ya bugünü öğretiyoruz)
    const now = new Date();
    const today = now.toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    const isoDate = now.toISOString().split('T')[0]; // 2026-01-01 formatı için

    const prompt = `
    Sen uzman bir muhasebe asistanısın. 
    Bugünün Tarihi: ${today} (${isoDate}).
    Kullanıcı Mesajı: "${message}"

    GÖREVLER:
    1. Mesajda tarihle ilgili bir ifade var mı? (Örn: "Dün", "Geçen hafta", "25 Aralık", "Cuma günü")
    2. Varsa, bugünün tarihini referans alarak o günün tarihini "YYYY-MM-DD" formatında hesapla.
    3. Yoksa, bugünün tarihini kullan (${isoDate}).
    4. "Aldım", "Ödedim", "Harcadım" gibi kelimeler giderdir (amount negatif), "Yattı", "Geldi" gelir dir (amount pozitif).

    JSON FORMATI (Sadece bunu döndür):
    {
      "reply": "Kullanıcıya cevap (Tarih belirttiyse onu da vurgula. Örn: Dün yaptığın market harcamasını ekledim.)",
      "transaction": { 
         "amount": -500, 
         "category": "Yemek", 
         "desc": "Akşam Yemeği",
         "date": "2025-12-31" 
      }
    }
    
    NOT: Eğer işlem yoksa "transaction": null döndür.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    try {
        const jsonResponse = JSON.parse(text);
        if (jsonResponse.transaction && !jsonResponse.transaction.amount) {
            jsonResponse.transaction = null;
        }
        return NextResponse.json(jsonResponse);
    } catch (e) {
        return NextResponse.json({ 
            reply: "Tarihi veya tutarı tam anlayamadım.", 
            transaction: null 
        });
    }

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}