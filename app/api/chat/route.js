import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

// --- KATEGORİ STANDARTLAŞTIRMA ---
function fixCategory(aiCategory) {
    if (!aiCategory) return "📦 Diğer";
    const cat = aiCategory.toLowerCase();
    
    // (Aynı kategori kodları korunuyor)
    if (cat.includes("eğlence") || cat.includes("sosyal") || cat.includes("tatil") || cat.includes("sinema") || cat.includes("entertainment") || cat.includes("social") || cat.includes("vacation") || cat.includes("sushiro") || cat.includes("izakaya") || cat.includes("restoran") || cat.includes("restaurant") || cat.includes("kafe") || cat.includes("cafe")) return "🎉 Eğlence/Sosyal";
    if (cat.includes("yeme") || cat.includes("içme") || cat.includes("gıda") || cat.includes("market") || cat.includes("bakkal") || cat.includes("food") || cat.includes("drink") || cat.includes("grocery") || cat.includes("supermarket") || cat.includes("kitchen")) return "🍔 Yeme-İçme";
    if (cat.includes("ev") || cat.includes("yaşam") || cat.includes("kira") || cat.includes("aidat") || cat.includes("mobilya") || cat.includes("home") || cat.includes("living") || cat.includes("rent") || cat.includes("furniture")) return "🏠 Ev/Yaşam";
    if (cat.includes("ulaşım") || cat.includes("benzin") || cat.includes("taksi") || cat.includes("otobüs") || cat.includes("tren") || cat.includes("transport") || cat.includes("fuel") || cat.includes("gas") || cat.includes("taxi") || cat.includes("bus") || cat.includes("train") || cat.includes("car") || cat.includes("araba") || cat.includes("suica") || cat.includes("pasmo")) return "🚌 Ulaşım";
    if (cat.includes("fatura") || cat.includes("elektrik") || cat.includes("su") || cat.includes("internet") || cat.includes("telefon") || cat.includes("bill") || cat.includes("utility") || cat.includes("electricity") || cat.includes("water") || cat.includes("phone")) return "💡 Faturalar";
    if (cat.includes("alışveriş") || cat.includes("giyim") || cat.includes("kıyafet") || cat.includes("teknoloji") || cat.includes("kozmetik") || cat.includes("shopping") || cat.includes("clothing") || cat.includes("wear") || cat.includes("tech") || cat.includes("cosmetic")) return "🛍️ Alışveriş";
    if (cat.includes("sağlık") || cat.includes("doktor") || cat.includes("eczane") || cat.includes("hastane") || cat.includes("spor") || cat.includes("health") || cat.includes("doctor") || cat.includes("pharmacy") || cat.includes("hospital") || cat.includes("gym") || cat.includes("sport")) return "🏥 Sağlık";
    if (cat.includes("gelir") || cat.includes("maaş") || cat.includes("yatırım") || cat.includes("borç") || cat.includes("alacak") || cat.includes("income") || cat.includes("salary") || cat.includes("invest") || cat.includes("debt")) return "💰 Gelir/Yatırım";

    return "📦 Diğer";
}

export async function POST(req) {
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const allowedOrigins = ["http://localhost:3000", "https://finansasistan.vercel.app", "https://finansasistan.vercel.app/"];
  const isOriginAllowed = allowedOrigins.some(domain => (origin && origin.includes(domain)) || (referer && referer.includes(domain)));
  const appSecret = req.headers.get('x-app-key');
  
  if (!isOriginAllowed || appSecret !== process.env.APP_SECRET_KEY) {
    return NextResponse.json({ error: "Yetkisiz Giriş! 🚫" }, { status: 401 });
  }

  try {
    const { message, currency = 'JPY', language = 'tr' } = await req.json();
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // JSON Mode Açık
    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.0-flash",
        generationConfig: { responseMimeType: "application/json" } 
    });

    const now = new Date();
    // Tarih formatı locale göre kalsın
    const locale = language === 'tr' ? 'tr-TR' : 'en-US';
    const today = now.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    const isoDate = now.toISOString().split('T')[0];

    // --- DEĞİŞİKLİK BURADA: Adaptive Language Logic ---
    let roleDefinition = "";
    let currencyRule = "";
    let languageRule = "";

    // Para birimi kuralı sabit kalsın
    if (currency === 'JPY') {
        currencyRule = "Para Birimi: JPY (Yen). Tam sayıdır, kuruş yok.";
    } else {
        currencyRule = `Para Birimi: ${currency}. Kuruş/cent olabilir.`;
    }

    // Dil Kuralını Esnetiyoruz: "Kullanıcıya ayak uydur"
    roleDefinition = "Sen zeki bir finans asistanısın.";
    languageRule = `
    ÖNEMLİ DİL KURALI:
    1. Kullanıcının mesajı hangi dildeyse (Türkçe veya İngilizce), "reply" o dilde olmalı.
    2. Eğer mesajın dili anlaşılamıyorsa, varsayılan olarak ${language === 'tr' ? 'Türkçe' : 'İngilizce'} cevap ver.
    `;

    const prompt = `
    ${roleDefinition}
    Bugün: ${today} (${isoDate}).
    ${currencyRule}
    ${languageRule}
    
    Kullanıcı Mesajı: "${message}"

    GÖREV:
    Mesajı analiz et. Finansal işlem veya sohbet olup olmadığına bak.

    SENARYO 1: SOHBET (Finansal İşlem Yok)
    - "transactions": []
    - "reply": Kullanıcının dilinde samimi cevap.

    SENARYO 2: İŞLEM
    - "transactions": İşlem detayları.
    - "reply": Kullanıcının dilinde onay mesajı.

    KURALLAR:
    - SADECE JSON FORMATI.
    - "Buffet" özel isimse yemek değildir.

    ÖRNEK ÇIKTILAR (Dil değişken olabilir):
    Input: "Hello, how are you?"
    Output: { "reply": "I'm great! How is your budget doing?", "transactions": [] }

    Input: "Marketten 500 yen harcadım"
    Output: { "reply": "Tamam, market harcamanı kaydettim.", "transactions": [{ "amount": -500, "category": "🍔 Yeme-İçme", "desc": "Market", "date": "${isoDate}" }] }
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();
    
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    // Temizlik
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
        text = text.substring(firstBrace, lastBrace + 1);
    }
    
    try {
        const jsonResponse = JSON.parse(text);
        if (!jsonResponse.transactions) jsonResponse.transactions = [];
        if (jsonResponse.transaction && !Array.isArray(jsonResponse.transactions)) jsonResponse.transactions = [jsonResponse.transaction];

        jsonResponse.transactions = jsonResponse.transactions.map(t => ({
            ...t,
            category: fixCategory(t.category)
        }));

        return NextResponse.json(jsonResponse);

    } catch (e) {
        return NextResponse.json({ 
            reply: language === 'tr' ? "Hata oluştu." : "Error occurred.", 
            transactions: [] 
        });
    }

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}