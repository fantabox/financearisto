import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

// --- KATEGORİ VE AÇIKLAMA DÜZELTİCİ (GÜNCELLENDİ) ---
function fixCategory(aiCategory, desc) {
    const cat = (aiCategory || "").toLowerCase();
    const description = (desc || "").toLowerCase();

    // 1. EĞLENCE & SOSYAL (Sushiro buraya girer)
    if (description.includes("sushiro") || description.includes("restoran") || description.includes("sinema") || description.includes("bar") || description.includes("oyun") || description.includes("netflix") || description.includes("spotify")) {
        return "🎉 Eğlence/Sosyal";
    }

    // 2. YEME - İÇME (İÇECEK, KAHVE, SU BURAYA EKLENDİ)
    // Hem market isimleri HEM DE ürün isimleri burada
    if (description.includes("market") || description.includes("bakkal") || description.includes("konbini") || description.includes("7-eleven") || description.includes("lawson") || description.includes("aeon") || 
        description.includes("içecek") || description.includes("kahve") || description.includes("çay") || description.includes("su ") || description === "su" || description.includes("ekmek") || description.includes("yemek") || description.includes("gıda")) {
        return "🍔 Yeme-İçme";
    }

    // 3. ULAŞIM
    if (description.includes("tren") || description.includes("otobüs") || description.includes("metro") || description.includes("suica") || description.includes("pasmo") || description.includes("taksi") || description.includes("benzin")) {
        return "🚌 Ulaşım";
    }

    // 4. EV & FATURA
    if (description.includes("kira") || description.includes("elektrik") || description.includes("internet") || description.includes("telefon") || description.includes("fatura")) {
        return "🏠 Ev/Yaşam";
    }

    // 5. YEDEK KONTROLLER (Kategori İsmine Göre)
    if (cat.includes("eğlence") ||  cat.includes("sosyal") || cat.includes("restoran")) return "🎉 Eğlence/Sosyal";
    if (cat.includes("yeme") || cat.includes("içme") ||  cat.includes("gıda") || cat.includes("market")) return "🍔 Yeme-İçme";
    if (cat.includes("ev") || cat.includes("yaşam") || cat.includes("kira") || cat.includes("fatura")) return "🏠 Ev/Yaşam";
    if (cat.includes("ulaşım") || cat.includes("benzin") || cat.includes("seyahat")) return "🚌 Ulaşım";
    if (cat.includes("alışveriş") || cat.includes("giyim") || cat.includes("teknoloji")) return "🛍️ Alışveriş";
    if (cat.includes("sağlık") || cat.includes("doktor") || cat.includes("eczane")) return "🏥 Sağlık";
    
    return "📦 Diğer";
}

export async function POST(req) {
  // Güvenlik...
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const allowedOrigins = ["http://localhost:3000", "https://finansasistan.vercel.app", "https://finansasistan.vercel.app/"];
  const isOriginAllowed = allowedOrigins.some(domain => (origin && origin.includes(domain)) || (referer && referer.includes(domain)));
  if (!isOriginAllowed) return NextResponse.json({ error: "Yetkisiz Giriş! 🚫" }, { status: 401 });

  try {
    const { message, userName } = await req.json();
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const now = new Date();
    const isoDate = now.toISOString().split('T')[0];

    // --- PROMPT (DÜZELTİLMİŞ) ---
    const prompt = `
    Sen ${userName || "Kullanıcı"} adlı kişinin finans asistanısın.
    Bugün: ${isoDate}. Para Birimi: JPY.
    Mesaj: "${message}"

    GÖREVİN: Mesajı analiz et.
    
    KURAL 1 (AÇIKLAMA AYIKLAMA): 
    - "desc" (Açıklama) kısmına SAKIN "Genel", "Harcama", "Diğer" yazma.
    - Mesajın içindeki NESNEYİ veya MEKANI cımbızla çek.
    - "İçecek aldım" -> desc: "İçecek"
    - "Sushiro restorantta yedim" -> desc: "Sushiro"
    - "Markete gittim" -> desc: "Market"

    KURAL 2 (MODLAR):
    
    --- DURUM A: SOHBET (Rakam Yok) ---
    "Naber", "Sushiro'ya gittim", "İçecek aldım" (Fiyat yok):
    - "transactions": []
    - "reply": Cevap ver veya fiyat sor.

    --- DURUM B: İŞLEM (Rakam Var) ---
    "Sushiro 3000", "İçecek 150", "Market 5000":
    - "transactions": [{ "amount": -150, "desc": "İçecek", "category": "🍔 Yeme-İçme" }] (Negatif yap)
    - "reply": "İşlemi kaydettim."

    JSON DÖNDÜR:
    { "reply": "...", "transactions": [...] }
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    try {
        const jsonResponse = JSON.parse(text);
        
        if (!jsonResponse.transactions) jsonResponse.transactions = [];
        if (jsonResponse.transaction && !Array.isArray(jsonResponse.transactions)) jsonResponse.transactions = [jsonResponse.transaction];

        // Kategorileri düzelt
        jsonResponse.transactions = jsonResponse.transactions.map(t => ({
            ...t,
            category: fixCategory(t.category, t.desc) 
        }));

        return NextResponse.json(jsonResponse);

    } catch (e) {
        return NextResponse.json({ reply: "Anlaşılamadı.", transactions: [] });
    }

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}