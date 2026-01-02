import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

// Kategori Standartlaştırma Fonksiyonu
function fixCategory(aiCategory) {
    if (!aiCategory) return "📦 Diğer";
    
    const cat = aiCategory.toLowerCase();

    // Anahtar kelimelere göre doğru formatı zorla
    if (cat.includes("eğlence") ||  cat.includes("sosyal") || cat.includes("market") || cat.includes("restoran") || cat.includes("sinema") || cat.includes("tatil") || cat.includes("kafe")) {
        return "🎉 Eğlence/Sosyal";
    }
    if (cat.includes("yeme") || cat.includes("içme") ||  cat.includes("bakkal") || cat.includes("gıda")) {
        return "🍔 Yeme-İçme";
    }
    if (cat.includes("ev") || cat.includes("yaşam") || cat.includes("kira") || cat.includes("aidat") || cat.includes("mobilya")) {
        return "🏠 Ev/Yaşam";
    }
    if (cat.includes("ulaşım") || cat.includes("benzin") || cat.includes("taksi") || cat.includes("otobüs") || cat.includes("araba") || cat.includes("tren") || cat.includes("suica")) {
        return "🚌 Ulaşım";
    }
    if (cat.includes("fatura") || cat.includes("elektrik") || cat.includes("su") || cat.includes("internet") || cat.includes("telefon")) {
        return "💡 Faturalar";
    }
    if (cat.includes("alışveriş") || cat.includes("giyim") || cat.includes("kıyafet") || cat.includes("teknoloji") || cat.includes("kozmetik")) {
        return "🛍️ Alışveriş";
    }
    if (cat.includes("sağlık") || cat.includes("doktor") || cat.includes("eczane") || cat.includes("spor")) {
        return "🏥 Sağlık";
    }
    if (cat.includes("gelir") || cat.includes("maaş") || cat.includes("yatırım") || cat.includes("borç") || cat.includes("alacak")) {
        return "💰 Gelir/Yatırım";
    }

    // Hiçbirine uymuyorsa
    return "📦 Diğer";
}

export async function POST(req) {
  // 1. ADIM: Origin Kontrolü (Tarayıcı güvenliği için kalsın)
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const allowedOrigins = ["http://localhost:3000", "https://finansasistan.vercel.app", "https://finansasistan.vercel.app/"];
  
  const isOriginAllowed = allowedOrigins.some(domain => 
    (origin && origin.includes(domain)) || (referer && referer.includes(domain))
  );

  // 2. ADIM: Gizli Anahtar Kontrolü (Kesin Çözüm)
  // Frontend'den 'x-app-key' adında bir header bekleyeceğiz.
  const appSecret = req.headers.get('x-app-key');
  
  // Eğer Origin yasaklıysa VEYA Şifre yanlışsa reddet
  if (!isOriginAllowed || appSecret !== process.env.APP_SECRET_KEY) {
    return NextResponse.json({ error: "Yetkisiz Giriş! 🚫" }, { status: 401 });
  }
  // --- GÜVENLİK DUVARI BİTİŞ ---

  try {
    const { message } = await req.json();
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // Modeli değiştirmene gerek yoksa 'flash' hızlıdır, istersen 'pro' yapabilirsin
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    // TARİH BİLGİSİ
    const now = new Date();
    const today = now.toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    const isoDate = now.toISOString().split('T')[0];

    const prompt = `
    Sen Japonya'da yaşayan bir Türk için muhasebe asistanısın.
    Bugün: ${today} (${isoDate}).
    Para Birimi: JPY (Yen).
    
    Kullanıcı Mesajı: "${message}"

    GÖREV:
    İşlemleri analiz et ve JSON döndür.

    KATEGORİ SEÇİMİ (Buna uymaya çalış ama hata yaparsan kod düzeltecek):
    1. 🏠 Ev/Yaşam
    2. 🍔 Yeme-İçme (Haftalık alışveriş vb.)
    3. 🎉 Eğlence/Sosyal (Restoran, Sushiro, Kafe, Market vb.)
    4. 🚌 Ulaşım
    5. 💡 Faturalar
    6. 🛍️ Alışveriş
    7. 🏥 Sağlık
    8. 💰 Gelir/Yatırım
    9. 📦 Diğer

    KURALLAR:
    - Restoran, Sushiro, Dışarıda yemek -> "🎉 Eğlence/Sosyal" olsun.
    - Harcama negatif (-), Gelir pozitif (+).
    - Japon Yeni tam sayıdır (Kuruş yok).

    JSON:
    {
      "reply": "Kısa cevap.",
      "transactions": [
         { "amount": -5300, "category": "🎉 Eğlence/Sosyal", "desc": "Sushiro", "date": "${isoDate}" }
      ]
    }
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();
    
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    try {
        const jsonResponse = JSON.parse(text);
        
        if (!jsonResponse.transactions) jsonResponse.transactions = [];
        if (jsonResponse.transaction && !Array.isArray(jsonResponse.transactions)) jsonResponse.transactions = [jsonResponse.transaction];

        // BURADA KATEGORİLERİ ZORLA DÜZELTİYORUZ
        jsonResponse.transactions = jsonResponse.transactions.map(t => ({
            ...t,
            category: fixCategory(t.category) // Bekçi fonksiyon devrede
        }));

        return NextResponse.json(jsonResponse);

    } catch (e) {
        console.error("JSON Parse Hatası:", text);
        return NextResponse.json({ 
            reply: "İşlemi tam anlayamadım, tekrar yazar mısın?", 
            transactions: [] 
        });
    }

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}