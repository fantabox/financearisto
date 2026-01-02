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
  // --- GEÇİCİ HATA AYIKLAMA ---
  // Gelen origin ve referer başlıklarını kontrol etmek için.
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  
  return NextResponse.json({
    message: "Hata ayıklama aktif. Bu origin/referer'ı kopyalayıp yapıştırın.",
    origin: origin,
    referer: referer
  }, { status: 200 });
  // --- GEÇİCİ HATA AYIKLAMA SONU ---
}